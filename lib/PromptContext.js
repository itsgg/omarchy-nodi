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
  var re = /(^|[\s(\["])@(file|f):(?:"((?:\\.|[^"\\])+)"|\x27([^\x27]+)\x27|([^\s"';)\]]*[^\s"';)\],.:;!?]))(?=[\s)\]"',.:;!?]|$)/g
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
  return /(?:^|[\s(\["])@(window|app|w|cb|clipboard|c|selection|s|file|f)(?::(?:"(?:\\.|[^"\\])+"|\x27[^\x27]+\x27|[^\s"';)\]]*[^\s"';)\],.:;!?]))?(?=[\s)\]"',.:;!?]|$)/.test(s)
}

function expandMentions(text, snapshot) {
  var s = String(text || "")
  if (!hasMentions(s)) return s
  var snap = object(snapshot) ? snapshot : {}
  var w = object(snap.window) ? snap.window : null
  var sel = object(snap.selection) ? snap.selection : null

  var MENTION_RE = /(^|[\s(\["])@(window|app|w|cb|clipboard|c|selection|s|file|f)(?::(?:"((?:\\.|[^"\\])+)"|\x27([^\x27]+)\x27|([^\s"';)\]]*[^\s"';)\],.:;!?])))?(?=[\s)\]"',.:;!?]|$)/g

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
      var content = object(snap.files) && Object.prototype.hasOwnProperty.call(snap.files, filePath) ? snap.files[filePath] : undefined
      var label = '[File "' + line(filePath, 120) + '"'
      // A link is named with what it leads to, whole.
      if (object(content) && typeof content.real === "string") label += ', a link to "' + line(content.real, CWD_LIMIT) + '"'
      if (typeof content === "string") content = { text: content }
      if (object(content) && typeof content.text === "string")
        return prefix + label + (content.truncated ? " (its first " + FILE_LIMIT + " bytes)" : "") + ':\n' + cut(content.text.trim(), FILE_LIMIT) + '\n]'
      if (object(content) && typeof content.error === "string")
        return prefix + label + ": not read, " + line(content.error, 120) + "]"
      return prefix + label + "]"
    }
    return match
  })
}


// Which part of an Ask's message is his own typing: only its mentions are
// read and expanded. A plain Ask ("") and "Ask about this file" are his
// words, or a path he chose, whole; any other context carries text he did
// not write (the selection, the copied text, a window's title), where a
// mention would read his files or his clipboard into the prompt. There
// only the question counts, and only when the message starts with it.
function mentionParts(context, question, rawMessage) {
  var raw = String(rawMessage || question || "")
  var c = String(context || "")
  if (c === "" || c === "file") return { typed: raw, rest: "" }
  var q = String(question || "")
  if (q && raw.indexOf(q) === 0) return { typed: q, rest: raw.slice(q.length) }
  return { typed: "", rest: raw }
}

function mentionSource(context, question, rawMessage) {
  return mentionParts(context, question, rawMessage).typed
}

// The message as it is sent: his typing expanded, the rest as it came.
function expandFor(context, question, rawMessage, snapshot) {
  var p = mentionParts(context, question, rawMessage)
  return expandMentions(p.typed, snapshot) + p.rest
}

// The files an Ask reads: the one it is about, then each @f: mention, as
// absolute paths, `~` expanded with `home`; a relative path is not read.
// Each keeps the paths as written (`raws`), which is how expandMentions
// finds its read.
function fileTargets(text, filePath, home) {
  var raws = []
  if (filePath) raws.push(String(filePath))
  var mentions = parseFileMentions(text)
  for (var i = 0; i < mentions.length; i++)
    if (raws.indexOf(mentions[i].rawPath) === -1) raws.push(mentions[i].rawPath)
  var out = []
  var at = {}
  for (var j = 0; j < raws.length; j++) {
    var p = raws[j]
    if (p.charAt(0) === "~" && /^~(\/|$)/.test(p)) p = home ? String(home).replace(/\/+$/, "") + p.slice(1) : ""
    if (p.charAt(0) !== "/") continue
    if (Object.prototype.hasOwnProperty.call(at, p)) { out[at[p]].raws.push(raws[j]); continue }
    at[p] = out.length
    out.push({ path: p, raws: [raws[j]] })
  }
  return out
}

// The reads, by absolute path, as expandMentions looks them up: under each
// path as he wrote it.
function attachFiles(files, targets, reads) {
  var out = object(files) ? files : {}
  for (var i = 0; i < targets.length; i++) {
    var t = targets[i]
    if (!Object.prototype.hasOwnProperty.call(reads, t.path)) continue
    for (var j = 0; j < t.raws.length; j++) out[t.raws[j]] = reads[t.path]
  }
  return out
}

// An Ask waiting for its agent's session to be the one it was asked of
// (Nodi.qml flushAsk): "send" once it is, "wait" a turn of the event loop
// while the binding settles, "drop" when it never will. A direct Ask whose
// agent is no longer the direct one (the query was edited meanwhile) is
// dropped at once; any other after FLUSH_TRIES turns, so no Ask is left
// pending, where it would refuse every later one.
var FLUSH_TRIES = 20

function flushStep(pending, agent, resolved, direct) {
  if (!object(pending)) return "drop"
  var want = pending.direct ? pending.target : resolved
  if (agent === want) return "send"
  if (pending.direct && direct !== pending.target) return "drop"
  return (pending.tries || 0) >= FLUSH_TRIES ? "drop" : "wait"
}

// Where an Ask goes (Nodi.qml dispatchAsk): "answer" to an answers filter
// of his that takes its keyword, else "agent", over ACP; "busy" while the
// agent answers another question or a window's picture is taken, decided
// before anything is changed or read for it. An agent he chose by name
// (`agentId`) is asked over ACP even when an answers filter of his takes
// "ask": the filter stands in for the plain Ask only.
function askRoute(o) {
  var given = object(o) ? o : {}
  if (given.answered && !given.agentId) return "answer"
  return given.busy || given.shooting ? "busy" : "agent"
}

// The read of an Ask's files: at most FILE_COUNT_LIMIT of them, FILE_LIMIT
// bytes of each, in one bounded python3 (-I: nothing of the folder it runs
// in, or of the environment, is imported). Each file is one JSON line,
// {"i": its place, "path", "text", "truncated"} or {"i", "path", "error"},
// `path` the file's real one, its links resolved, which is the one opened
// (O_NOFOLLOW: no link swapped in after) and the one the prompt names, so
// a link named README.md is never sent as README.md. ASCII alone, a
// newline in a file escaped, so no file's content can pass for another
// file's record. A character is at most six bytes of it (\uXXXX), which
// FILE_READ_BYTES allows for.
var FILE_COUNT_LIMIT = 8
var FILE_READ_BYTES = FILE_COUNT_LIMIT * (6 * FILE_LIMIT + 1024)

var READ_SCRIPT = [
  "import sys, os, stat, json",
  "LIMIT = " + FILE_LIMIT,
  "for i, p in enumerate(sys.argv[1:]):",
  "    out = {'i': i}",
  "    try:",
  "        real = os.path.realpath(p)",
  "        out['path'] = real",
  "        fd = os.open(real, os.O_RDONLY | os.O_NONBLOCK | os.O_NOCTTY | os.O_NOFOLLOW)",
  "        try:",
  "            if not stat.S_ISREG(os.fstat(fd).st_mode):",
  "                out['error'] = 'it is not a regular file'",
  "            else:",
  "                data = b''",
  "                while len(data) <= LIMIT:",
  "                    chunk = os.read(fd, LIMIT + 1 - len(data))",
  "                    if not chunk:",
  "                        break",
  "                    data += chunk",
  "                out['truncated'] = len(data) > LIMIT",
  "                out['text'] = data[:LIMIT].decode('utf-8', errors='replace')",
  "        finally:",
  "            os.close(fd)",
  "    except OSError as e:",
  "        out['error'] = (e.strerror or 'it could not be read').lower()",
  "    print(json.dumps(out), flush=True)"
].join("\n")

function fileReadArgv(targets) {
  var paths = (Array.isArray(targets) ? targets : []).slice(0, FILE_COUNT_LIMIT).map(function(t) { return t.path })
  return ["/usr/bin/python3", "-I", "-c", READ_SCRIPT].concat(paths)
}

// What the read said, by path: each file its record, and one it said
// nothing of (a read cut short, failed, or past the count) why not.
function fileReads(text, ok, targets) {
  var list = Array.isArray(targets) ? targets : []
  var reads = {}
  var lines = String(text || "").split("\n")
  for (var i = 0; i < lines.length; i++) {
    var r
    try { r = JSON.parse(lines[i]) } catch (e) { continue }
    if (!object(r) || typeof r.i !== "number" || r.i < 0 || r.i >= Math.min(list.length, FILE_COUNT_LIMIT) || Math.floor(r.i) !== r.i) continue
    var path = list[r.i].path
    if (typeof r.text === "string") reads[path] = { text: r.text, truncated: r.truncated === true }
    else reads[path] = { error: typeof r.error === "string" && r.error ? r.error : "it could not be read" }
    if (typeof r.path === "string" && r.path && r.path !== path) reads[path].real = r.path
  }
  for (var j = 0; j < list.length; j++) {
    if (Object.prototype.hasOwnProperty.call(reads, list[j].path)) continue
    reads[list[j].path] = { error: j >= FILE_COUNT_LIMIT ? "an Ask reads at most " + FILE_COUNT_LIMIT + " files"
                                 : ok ? "it could not be read" : "the read failed or took too long" }
  }
  return reads
}
