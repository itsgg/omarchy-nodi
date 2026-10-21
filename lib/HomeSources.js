.pragma library
.import "ExternalRows.js" as External

// Pure, bounded parsing for watched JSONL files. A malformed JSON line makes
// the whole snapshot unusable so a watcher can retain its last valid value.

var MAX_BYTES = 262144
var MAX_LINE = 131072
var MAX_ROWS_PER_SOURCE = 100
var MAX_ROWS_GLOBAL = 500
var MAX_DEPTH = 6
var MAX_ACTION_ARGS = 64
var MAX_ARG = 4096
var MAX = External.MAX
var READ_TRAILER = "\nNODI_HOME_END_V1\t"

var DANGEROUS = Object.create(null)
DANGEROUS["__proto__"] = true
DANGEROUS.prototype = true
DANGEROUS.constructor = true

function utf8Bytes(s) {
  var n = 0
  for (var i = 0; i < s.length; i++) {
    var c = s.charCodeAt(i)
    if (c < 0x80) n++
    else if (c < 0x800) n += 2
    else if (c >= 0xd800 && c <= 0xdbff && i + 1 < s.length && s.charCodeAt(i + 1) >= 0xdc00 && s.charCodeAt(i + 1) <= 0xdfff) { n += 4; i++ }
    else n += 3
    if (n > MAX_BYTES) return n
  }
  return n
}

function safeObject(v, depth) {
  if (!v || typeof v !== "object") return true
  if (depth > MAX_DEPTH) return false
  var keys = Object.keys(v)
  for (var i = 0; i < keys.length; i++) {
    if (!safeObject(v[keys[i]], depth + 1)) return false
  }
  return true
}

// Action objects fail closed on their own, so an over-nested action removes
// that action without hiding an otherwise useful display row.
function safeRow(v) {
  var keys = Object.keys(v)
  for (var i = 0; i < keys.length; i++) {
    if (keys[i] === "action" || keys[i] === "actions") continue
    if (!safeObject(v[keys[i]], 1)) return false
  }
  return true
}

function forbidden(v) {
  var pending = [v]
  var visited = 0
  while (pending.length) {
    var one = pending.pop()
    if (!one || typeof one !== "object") continue
    if (++visited > 256) return true
    var keys = Object.keys(one)
    for (var i = 0; i < keys.length; i++) {
      if (DANGEROUS[keys[i]]) return true
      if (one[keys[i]] && typeof one[keys[i]] === "object") pending.push(one[keys[i]])
    }
  }
  return false
}

function actionShape(a) {
  if (!a || typeof a !== "object" || Array.isArray(a) || forbidden(a) || !safeObject(a, 0)) return false
  if (Array.isArray(a.exec)) {
    if (a.exec.length === 0 || a.exec.length > MAX_ACTION_ARGS) return false
    for (var i = 0; i < a.exec.length; i++)
      if (typeof a.exec[i] !== "string" || a.exec[i].length > MAX_ARG) return false
  }
  for (var k in a)
    if (typeof a[k] === "string" && a[k].length > MAX_ARG && k !== "query") return false
  return true
}

function trusted(source, info) {
  if (!source || source.trustedActions !== true || !info) return false
  var path = String(info.path || source.file || "")
  return path.charAt(0) === "/" && path === String(source.file || "")
    && info.sameFile === true
    && info.regular === true && info.symlink !== true
    && typeof info.uid === "number" && info.uid === info.ownerUid
    && typeof info.mode === "number" && (info.mode & 0x12) === 0
}

// Open once, read only MAX_BYTES + 1 from that descriptor, and compare the
// configured path with its inode both before and after the read. The final
// trailer is emitted only by this program and parsed from its last occurrence.
function readArgv(path, gate) {
  var script = [
    "set -u",
    'path="$1"; gate="${2-}"',
    'exec {fd}<"$path" || exit 3',
    'read -r dev ino uid hex < <(/usr/bin/stat -Lc "%d %i %u %f" "/proc/$$/fd/$fd") || exit 4',
    "trusted=1",
    'mode=$((16#$hex))',
    '(( (mode & 16#f000) == 16#8000 )) || trusted=0',
    '(( uid == EUID )) || trusted=0',
    '(( (mode & 16#12) == 0 )) || trusted=0',
    "matches_path() {",
    "  local pdev pino puid phex pmode",
    '  read -r pdev pino puid phex < <(/usr/bin/stat -c "%d %i %u %f" -- "$path" 2>/dev/null) || return 1',
    '  pmode=$((16#$phex))',
    '  (( (pmode & 16#f000) == 16#8000 )) || return 1',
    '  [[ "$pdev" == "$dev" && "$pino" == "$ino" && "$puid" == "$uid" && "$phex" == "$hex" ]]',
    "}",
    "matches_path || trusted=0",
    'if [[ -n "$gate" ]]; then',
    '  /usr/bin/touch -- "$gate.opened" || exit 5',
    '  while [[ ! -e "$gate.go" ]]; do /usr/bin/sleep 0.01; done',
    "fi",
    'read_ok=1; /usr/bin/head -c ' + (MAX_BYTES + 1) + ' <&$fd || read_ok=0',
    "matches_path || trusted=0",
    '(( read_ok == 1 )) || trusted=0',
    "printf '\\nNODI_HOME_END_V1\\t%s\\t%s\\t%s\\t%s\\t%s\\n' \"$trusted\" \"$dev\" \"$ino\" \"$uid\" \"$hex\""
  ].join("\n")
  var argv = ["/usr/bin/bash", "-c", script, "nodi-home-source", String(path || "")]
  if (gate) argv.push(String(gate))
  return argv
}

function readResult(output, path) {
  var text = typeof output === "string" ? output : ""
  var at = text.lastIndexOf(READ_TRAILER)
  if (at < 0) return { ok: false, text: "", info: null, error: "file could not be read" }
  var end = text.indexOf("\n", at + READ_TRAILER.length)
  if (end < 0 || end !== text.length - 1) return { ok: false, text: "", info: null, error: "file read was incomplete" }
  var fields = text.slice(at + READ_TRAILER.length, end).split("\t")
  if (fields.length !== 5 || !/^[01]$/.test(fields[0])
      || !/^\d+$/.test(fields[1]) || !/^\d+$/.test(fields[2])
      || !/^\d+$/.test(fields[3]) || !/^[0-9a-fA-F]+$/.test(fields[4]))
    return { ok: false, text: "", info: null, error: "file read metadata was invalid" }
  var mode = parseInt(fields[4], 16)
  return {
    ok: true,
    text: text.slice(0, at),
    info: {
      path: String(path || ""),
      sameFile: fields[0] === "1",
      regular: (mode & 0xf000) === 0x8000,
      symlink: false,
      uid: Number(fields[3]),
      ownerUid: Number(fields[3]),
      mode: mode
    },
    error: fields[0] === "1" ? "" : "file trust changed while it was read"
  }
}

function displayOnly(snapshot) {
  if (!snapshot || snapshot.valid !== true || !Array.isArray(snapshot.rows)) return null
  var rows = snapshot.rows.map(function(row) {
    var out = {}
    for (var k in row) out[k] = row[k]
    var primaryExec = !!(out.run && out.run.kind === "exec")
    var hadExec = primaryExec
    if (primaryExec) {
      out.run = null
      out.confirm = false
      out.confirmWord = ""
      out.risk = ""
    }
    var actions = []
    var sourceActions = Array.isArray(row.actions) ? row.actions : []
    for (var i = 0; i < sourceActions.length; i++) {
      if (sourceActions[i] && sourceActions[i].run && sourceActions[i].run.kind === "exec") { hadExec = true; continue }
      actions.push(sourceActions[i])
    }
    out.actions = actions
    if (hadExec) {
      out.showsCommand = false
      out.remember = false
    }
    return out
  })
  return { valid: true, rows: rows, error: snapshot.error || "" }
}

function priority(v) {
  return typeof v === "number" && isFinite(v) ? Math.max(-1000, Math.min(1000, v)) : 0
}

function expiry(v) {
  if (typeof v !== "string" || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/.test(v)) return 0
  var n = Date.parse(v)
  return isNaN(n) ? 0 : n
}

function normalizedAction(a, canExec) {
  if (!actionShape(a)) return {}
  return External.actionOf(a, { exec: canExec, paste: false, next: false, safeOpen: true, completeMax: MAX.title })
}

// Encode UTF-16 code units directly. encodeURIComponent throws for lone
// surrogates, which JSON permits, and truncation can create one at the edge.
// "~" is always escaped, so the representation is total and one-to-one.
function keyPart(value) {
  var text = String(value)
  var out = ""
  for (var i = 0; i < text.length; i++) {
    var code = text.charCodeAt(i)
    var ch = text.charAt(i)
    if (/[A-Za-z0-9._-]/.test(ch)) out += ch
    else out += "~" + ("000" + code.toString(16)).slice(-4)
  }
  return out
}

function keyOf(sourceId, id, unique, line) {
  var prefix = "home:" + keyPart(sourceId) + ":"
  return prefix + (unique ? "id:" + keyPart(id) : "line:" + line)
}

function executionToken(key, slot, line) {
  return JSON.stringify([String(key), String(slot), String(line)])
}

function parse(textOut, source, info) {
  var text = typeof textOut === "string" ? textOut : ""
  if (utf8Bytes(text) > MAX_BYTES) return { valid: false, rows: [], error: "file exceeds " + MAX_BYTES + " bytes" }
  var lines = text.split("\n")
  var rows = []
  var seen = Object.create(null)
  var canExec = trusted(source, info)
  var wanted = Math.max(0, Math.min(MAX_ROWS_PER_SOURCE, Math.floor(Number(source && source.max) || MAX_ROWS_PER_SOURCE)))
  for (var i = 0; i < lines.length; i++) {
    if (lines[i].length > MAX_LINE) return { valid: false, rows: [], error: "line " + (i + 1) + " exceeds " + MAX_LINE + " characters" }
    var line = lines[i].trim()
    if (!line) continue
    var o
    try { o = JSON.parse(line) }
    catch (e) { return { valid: false, rows: [], error: "line " + (i + 1) + " is not valid JSON" } }
    if (!o || typeof o !== "object" || Array.isArray(o) || forbidden(o) || !safeRow(o)
        || typeof o.title !== "string" || !o.title || rows.length >= wanted) continue
    var id = External.text(o.id, MAX.id)
    var unique = !!id && !seen[id]
    if (id && !seen[id]) seen[id] = true
    var rowKey = keyOf(source.id, id, unique, i)
    var act = normalizedAction(o.action, canExec)
    var executable = !!(act.run && act.run.kind === "exec")
    var c = External.confirmOf(o.confirm)
    var actions = []
    var rawActions = Array.isArray(o.actions) ? o.actions.slice(0, 12) : []
    var hasExecutable = executable
    for (var j = 0; j < rawActions.length; j++) {
      var raw = rawActions[j]
      if (!raw || typeof raw !== "object" || forbidden(raw) || !safeObject(raw, 0)) continue
      var secondary = normalizedAction(raw.action, canExec)
      if (!secondary.run) continue
      var exec = secondary.run.kind === "exec"
      var ask = External.confirmOf(raw.confirm)
      actions.push({
        label: External.text(raw.title, MAX.title), icon: "", run: secondary.run,
        confirm: exec ? true : ask.confirm, confirmWord: exec ? "" : ask.confirmWord,
        risk: External.text(raw.risk, MAX.risk), undoable: false, showsCommand: exec
      })
      if (exec) actions[actions.length - 1].homeExecution = executionToken(rowKey, "action:" + j, line)
      if (exec) hasExecutable = true
    }
    actions = actions.filter(function(a) { return !!a.label })
    rows.push({
      key: rowKey,
      title: External.text(o.title, MAX.title),
      subtitle: External.text(o.subtitle, MAX.subtitle),
      // `icon` names a theme's icon or a file: a picture, as a filter's
      // icon is (providers/filters.js), never glyph text, which drew
      // "emblem-default" across the row (2026-10-21).
      icon: "",
      image: typeof o.image === "string" && o.image.charAt(0) === "/" ? o.image.slice(0, MAX_ARG)
        : (External.iconOf(o.icon) || External.iconOf(source.icon)),
      badge: External.text(o.badge, MAX.badge),
      copy: act.copy || "",
      run: act.run || null,
      complete: typeof o.complete === "string" && o.complete ? o.complete.slice(0, MAX.title) : (act.complete || ""),
      confirm: executable ? true : c.confirm,
      confirmWord: executable ? "" : c.confirmWord,
      risk: External.text(o.risk, MAX.risk),
      showsCommand: hasExecutable,
      undoable: false,
      remember: unique && !hasExecutable,
      preview: External.previewOf(o.preview),
      group: External.text(o.group, MAX.group) || External.text(source.title, MAX.group) || String(source.id),
      priority: priority(o.priority),
      sourcePriority: priority(source.priority),
      expiresAt: expiry(o.expires),
      fileOrder: i,
      actions: actions
    })
    if (executable) rows[rows.length - 1].homeExecution = executionToken(rowKey, "primary", line)
  }
  return { valid: true, rows: rows, error: "" }
}

function merge(entries, nowMs) {
  var all = []
  var next = 0
  var list = Array.isArray(entries) ? entries : []
  for (var i = 0; i < list.length; i++) {
    var snap = list[i] && list[i].snapshot
    if (!snap || snap.valid !== true || !Array.isArray(snap.rows)) continue
    for (var j = 0; j < snap.rows.length; j++) {
      var row = snap.rows[j]
      if (row.expiresAt && row.expiresAt <= nowMs) continue
      if (row.expiresAt && (!next || row.expiresAt < next)) next = row.expiresAt
      all.push({ row: row, sourceOrder: i })
    }
  }
  all.sort(function(a, b) {
    return b.row.sourcePriority - a.row.sourcePriority
      || b.row.priority - a.row.priority
      || a.sourceOrder - b.sourceOrder
      || a.row.fileOrder - b.row.fileOrder
  })
  return { rows: all.slice(0, MAX_ROWS_GLOBAL).map(function(x) { return x.row }), nextExpiry: next }
}

function sameExecutable(a, b) {
  if (!a || !b || a.kind !== "exec" || b.kind !== "exec"
      || !Array.isArray(a.argv) || !Array.isArray(b.argv) || a.argv.length !== b.argv.length) return false
  for (var i = 0; i < a.argv.length; i++) if (a.argv[i] !== b.argv[i]) return false
  return true
}

function currentExecutable(entries, key, token, run, nowMs) {
  if (typeof token !== "string" || !token || !run) return false
  var rows = merge(entries, nowMs).rows
  for (var i = 0; i < rows.length; i++) {
    var row = rows[i]
    if (row.key !== key) continue
    if (row.homeExecution === token && sameExecutable(row.run, run)) return true
    var actions = Array.isArray(row.actions) ? row.actions : []
    for (var j = 0; j < actions.length; j++)
      if (actions[j].homeExecution === token && sameExecutable(actions[j].run, run)) return true
    return false
  }
  return false
}
