.pragma library

// What Ask tells an agent beside a question, as `_meta.nodi` on the prompt
// (docs/ask.md, "What leaves the machine"). Informational only: it grants
// the agent no action and changes no binding of a turn.
//
// `build` takes what Nodi saw when the Ask was chosen and keeps only what it
// can vouch for: a field is on the allowlist, of the right type and within
// its bound, or it is left out. Nothing is coerced (a string is no pid) and
// nothing is invented (an unknown field is absent, never empty).
//
//   { purpose, window: { class, title, workspace, pid, cwd },
//     selection: { text, source, ageMs } }

var VERSION = 1
var CLASS_LIMIT = 128
var TITLE_LIMIT = 300
var CWD_LIMIT = 4096
// The textual selection prompt's own limit (lib/Sources.js SELECTION_READ).
var SELECTION_LIMIT = 65536
var AGE_LIMIT = 24 * 60 * 60 * 1000

function object(value) { return !!value && typeof value === "object" && !Array.isArray(value) }

// A cut never ends inside a surrogate pair.
function cut(text, max) {
  if (text.length <= max) return text
  var kept = text.slice(0, max)
  return /[\uD800-\uDBFF]$/.test(kept) ? kept.slice(0, -1) : kept
}

// One bounded line: control characters become spaces.
function line(value, max) {
  if (typeof value !== "string") return ""
  return cut(value.replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]+/g, " ").trim(), max)
}

function count(value, max) {
  return typeof value === "number" && isFinite(value) && Math.floor(value) === value && value > 0 && value <= max ? value : 0
}

// An absolute path, whole or not at all: a path cut short is another place.
function path(value) {
  if (typeof value !== "string" || value.length > CWD_LIMIT || value.charAt(0) !== "/") return ""
  if (/[\u0000-\u001f\u007f-\u009f]/.test(value) || / \(deleted\)$/.test(value)) return ""
  return value
}

function windowOf(w) {
  if (!object(w)) return null
  var out = {}
  var cls = line(w["class"], CLASS_LIMIT)
  var title = line(w.title, TITLE_LIMIT)
  var workspace = count(w.workspace, 1000000)
  var pid = count(w.pid, 4194304)
  var cwd = path(w.cwd)
  if (cls) out["class"] = cls
  if (title) out.title = title
  if (workspace) out.workspace = workspace
  if (pid) out.pid = pid
  if (cwd) out.cwd = cwd
  return Object.keys(out).length ? out : null
}

function selectionOf(s) {
  if (!object(s) || typeof s.text !== "string" || !/\S/.test(s.text)) return null
  var out = { text: cut(s.text, SELECTION_LIMIT) }
  if (s.source === "primary" || s.source === "clipboard") out.source = s.source
  if (typeof s.ageMs === "number" && isFinite(s.ageMs) && s.ageMs >= 0) out.ageMs = Math.min(AGE_LIMIT, Math.floor(s.ageMs))
  return out
}

function build(input) {
  var given = object(input) ? input : {}
  var out = { version: VERSION, purpose: typeof given.purpose === "string" && /^[a-z][a-z0-9-]{0,31}$/.test(given.purpose) ? given.purpose : "ask" }
  var w = windowOf(given.window)
  var s = selectionOf(given.selection)
  if (w) out.window = w
  if (s) out.selection = s
  return out
}

var MENTION_LIMIT = 4096
var FILE_LIMIT = 16384

function formatFileMention(filePath) {
  var p = String(filePath || "")
  if (!p) return ""
  if (p.indexOf("\"") !== -1 && p.indexOf("\x27") === -1) {
    return "@f:\x27" + p + "\x27"
  }
  if (!/^[A-Za-z0-9_./-]+$/.test(p)) {
    return "@f:\"" + p.replace(/\\/g, "\\\\").replace(/\"/g, "\\\"") + "\""
  }
  return "@f:" + p
}

function parseFileMentions(text) {
  var s = String(text || "")
  var re = /(^|[\s(\["])@(file|f):(?:"((?:\\.|[^"\\])+)"|\x27([^\x27]+)\x27|([^\s\n"';)\]]+))(?=[\s)\]"',.:;!?]|$)/g
  var out = []
  var m
  while ((m = re.exec(s)) !== null) {
    var rawPath = m[3] ? m[3].replace(/\\"/g, "\"").replace(/\\\\/g, "\\") : (m[4] || m[5])
    out.push({ token: m[2], rawPath: rawPath })
  }
  return out
}

function hasMentions(text) {
  var s = String(text || "")
  return /(?:^|[\s(\["])@(window|app|w|cb|clipboard|c|selection|s|file|f)(?::(?:"(?:\\.|[^"\\])+"|\x27[^\x27]+\x27|[^\s\n"';)\]]+))?(?=[\s)\]"',.:;!?]|$)/.test(s)
}

function expandMentions(text, snapshot) {
  var s = String(text || "")
  if (!hasMentions(s)) return s
  var snap = object(snapshot) ? snapshot : {}
  var w = object(snap.window) ? snap.window : null
  var sel = object(snap.selection) ? snap.selection : null

  var MENTION_RE = /(^|[\s(\["])@(window|app|w|cb|clipboard|c|selection|s|file|f)(?::(?:"((?:\\.|[^"\\])+)"|\x27([^\x27]+)\x27|([^\s\n"';)\]]+)))?(?=[\s)\]"',.:;!?]|$)/g

  return s.replace(MENTION_RE, function(match, prefix, token, q1, q2, bare) {
    if (token === "window" || token === "app" || token === "w") {
      var winStr = ""
      if (w) {
        var desc = []
        if (w.title) desc.push('"' + line(w.title, 120) + '"')
        if (w["class"]) desc.push("(" + line(w["class"], 64) + ")")
        if (w.cwd) desc.push("in " + path(w.cwd))
        if (desc.length) winStr = "[Active Window: " + desc.join(" ") + "]"
      }
      if (!winStr) winStr = "[Active Window: none]"
      return prefix + winStr
    }
    if (token === "cb" || token === "clipboard" || token === "c") {
      var clipText = ""
      if (typeof snap.clipboard === "string" && snap.clipboard.trim())
        clipText = snap.clipboard
      else if (sel && sel.source === "clipboard" && typeof sel.text === "string")
        clipText = sel.text
      var clipStr = clipText ? '[Clipboard: "' + cut(clipText.trim(), MENTION_LIMIT) + '"]' : "[Clipboard: empty]"
      return prefix + clipStr
    }
    if (token === "selection" || token === "s") {
      var selText = ""
      if (typeof snap.primarySelection === "string" && snap.primarySelection.trim())
        selText = snap.primarySelection
      else if (sel && typeof sel.text === "string")
        selText = sel.text
      var selStr = selText ? '[Selection: "' + cut(selText.trim(), MENTION_LIMIT) + '"]' : "[Selection: none]"
      return prefix + selStr
    }
    if (token === "file" || token === "f") {
      var filePath = q1 ? q1.replace(/\\"/g, "\"").replace(/\\\\/g, "\\") : (q2 || bare)
      var content = snap.files && (snap.files[filePath] || (filePath.charAt(0) === "~" && snap.files[filePath.replace(/^~(?=\/|$)/, snap.home || "")]))
      if (typeof content === "string") {
        return prefix + '[File "' + line(filePath, 120) + '":\n' + cut(content.trim(), FILE_LIMIT) + '\n]'
      }
      return prefix + '[File "' + line(filePath, 120) + '"]'
    }
    return match
  })
}

