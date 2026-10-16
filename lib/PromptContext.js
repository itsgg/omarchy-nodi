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
