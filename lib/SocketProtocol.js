.pragma library

// Bounded protocol helpers for persistent local-socket row sources.
var LIMITS = {
  id: 64,
  query: 8192,
  keyword: 64,
  context: 4096,
  bytes: 1048576,
  lineBytes: 131072,
  rows: 50,
  depth: 12
}

function string(v, max) {
  return (typeof v === "string" ? v : String(v === undefined || v === null ? "" : v)).slice(0, max)
}

function byteLength(text) {
  var s = String(text || "")
  try { return unescape(encodeURIComponent(s)).length } catch (e) { return s.length * 3 }
}

function cleanId(v) {
  return string(v, LIMITS.id).replace(/[^A-Za-z0-9_-]/g, "_") || "q"
}

function queryId(sequence, entropy) {
  return cleanId(Number(sequence).toString(36) + "-" + cleanId(entropy))
}

function windowOf(value) {
  var w = value && typeof value === "object" && !Array.isArray(value) ? value : {}
  return { "class": string(w["class"], LIMITS.context) }
}

function requestFrame(id, param) {
  var p = param || {}
  return JSON.stringify({
    version: 1,
    id: cleanId(id),
    q: string(p.query, LIMITS.query),
    keyword: string(p.keyword, LIMITS.keyword),
    window: windowOf(p.window)
  }) + "\n"
}

function cancelFrame(id) {
  return JSON.stringify({ version: 1, cancel: cleanId(id) }) + "\n"
}

function positive(v, fallback, ceiling) {
  var n = Number(v)
  return isFinite(n) && n > 0 ? Math.min(ceiling, Math.floor(n)) : fallback
}

function parser(id, options) {
  var o = options || {}
  return {
    id: cleanId(id),
    buffer: "",
    bytes: 0,
    count: 0,
    done: false,
    failed: "",
    maxBytes: positive(o.maxBytes, LIMITS.bytes, LIMITS.bytes),
    maxLineBytes: positive(o.maxLineBytes, LIMITS.lineBytes, LIMITS.lineBytes),
    maxRows: positive(o.maxRows, LIMITS.rows, 1000)
  }
}

function safeDepth(value, depth) {
  if (depth > LIMITS.depth) return false
  if (!value || typeof value !== "object") return true
  if (Array.isArray(value)) {
    if (value.length > 64) return false
    for (var i = 0; i < value.length; i++) if (!safeDepth(value[i], depth + 1)) return false
    return true
  }
  var keys = Object.keys(value)
  if (keys.length > 64) return false
  for (var k = 0; k < keys.length; k++) if (!safeDepth(value[keys[k]], depth + 1)) return false
  return true
}

function fail(state, message) {
  state.failed = message
  return { rows: [], done: false, error: message }
}

function feed(state, chunk) {
  if (state.failed) return { rows: [], done: false, error: state.failed }
  if (state.done) return { rows: [], done: true, error: "" }
  var text = String(chunk || "")
  // Quickshell exposes decoded QString chunks rather than raw bytes. A
  // multibyte UTF-8 character split between chunks could already be
  // corrupted before it reaches this parser, so response framing is ASCII
  // JSON and non-ASCII data must use JSON's \u escapes.
  if (/[^\u0000-\u007f]/.test(text))
    return fail(state, "socket response must use ASCII JSON with escaped non-ASCII text")
  state.bytes += byteLength(text)
  if (state.bytes > state.maxBytes) return fail(state, "socket response exceeded byte limit")
  state.buffer += text
  if (state.buffer.indexOf("\n") === -1 && byteLength(state.buffer) > state.maxLineBytes)
    return fail(state, "socket response exceeded line limit")

  var rows = []
  var lines = state.buffer.split("\n")
  state.buffer = lines.pop()
  for (var i = 0; i < lines.length; i++) {
    if (byteLength(lines[i]) > state.maxLineBytes) return fail(state, "socket response exceeded line limit")
    var line = lines[i].trim()
    if (!line) continue
    var message
    try { message = JSON.parse(line) } catch (e) { continue }
    if (!message || typeof message !== "object" || Array.isArray(message) || message.id !== state.id) continue
    if (message.done === true) {
      state.done = true
      break
    }
    if (!message.row || typeof message.row !== "object" || Array.isArray(message.row) || !safeDepth(message.row, 0)) continue
    if (state.count >= state.maxRows) return fail(state, "socket response exceeded row limit")
    state.count++
    rows.push(message.row)
  }
  if (!state.done && byteLength(state.buffer) > state.maxLineBytes)
    return fail(state, "socket response exceeded line limit")
  return { rows: rows, done: state.done, error: "" }
}

function finish(state) {
  if (state.failed) return { rows: [], done: false, error: state.failed }
  if (state.buffer) return fail(state, "socket response ended with an incomplete line")
  return state.done ? { rows: [], done: true, error: "" } : fail(state, "socket response ended before done")
}

function active() { return { id: "" } }
function activate(state, id) {
  var before = state.id || ""
  state.id = cleanId(id)
  return before && before !== state.id ? before : ""
}
function isActive(state, id) { return !!state && state.id === cleanId(id) }
function complete(state, id) { if (isActive(state, id)) state.id = "" }
