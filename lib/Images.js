.pragma library

var MAX_QUEUE = 64
var MAX_ENTRIES = 128
var MAX_BYTES = 24 * 1024 * 1024
var MAX_AGE = 30000

function create() { return { cache: {}, pending: {}, queue: [], bytes: 0 } }

function key(value, large) {
  var path = String(value || "")
  if (path.length > 8192 || path.indexOf("\0") !== -1) return ""
  if (path.indexOf("file:///") === 0) {
    try { path = decodeURIComponent(path.slice(7)) } catch (e) { return "" }
  }
  if (path.charAt(0) !== "/" && !/^[A-Za-z0-9_.+-]{1,256}$/.test(path)
      && !/^image:\/\/icon\/[A-Za-z0-9_.+-]{1,256}(\?[^\n]*)?$/.test(path)) return ""
  return JSON.stringify([path, large ? 1000 : 128])
}

function get(state, key, now) {
  var entry = state.cache[key]
  if (entry && now - entry.at < MAX_AGE) { entry.used = now; return entry.value }
  if (!state.pending[key] && state.queue.length < MAX_QUEUE) {
    state.pending[key] = true
    state.queue.push(key)
  }
  // A refreshed or failed image never falls back to the source file.
  return ""
}

function next(state) {
  if (!state.queue.length) return null
  var key = state.queue.shift(), parts = JSON.parse(key)
  return { key: key, path: parts[0], edge: parts[1] }
}

function finish(state, key, value, now) {
  delete state.pending[key]
  var edge = JSON.parse(key)[1]
  var max = Math.ceil((edge * edge * 4 + edge + 4096) * 4 / 3) + 64
  if (value.length > max || !/^data:image\/png;base64,[A-Za-z0-9+/]+=*$/.test(value)) value = ""
  if (state.cache[key]) state.bytes -= state.cache[key].value.length
  state.cache[key] = { value: value, at: now, used: now }
  state.bytes += value.length
  var keys = Object.keys(state.cache).sort(function(a, b) { return state.cache[a].used - state.cache[b].used })
  while (keys.length > MAX_ENTRIES || state.bytes > MAX_BYTES) {
    var old = keys.shift()
    state.bytes -= state.cache[old].value.length
    delete state.cache[old]
  }
}
