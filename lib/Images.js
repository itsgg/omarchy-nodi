.pragma library

var MAX_QUEUE = 64
var MAX_ENTRIES = 128
var MAX_BYTES = 24 * 1024 * 1024
var MAX_AGE = 30000

function create() { return { cache: {}, pending: {}, queue: [], backgroundQueue: [], bytes: 0 } }

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

function queued(state) { return state.queue.length + state.backgroundQueue.length }

function get(state, key, now, background) {
  var entry = state.cache[key]
  if (entry && now - (entry.value ? entry.used : entry.at) < MAX_AGE) {
    if (entry.value) entry.used = now
    return entry.value
  }
  if (state.pending[key]) {
    // A row or preview can need an icon already waiting behind the warmup
    // batch. Promote that same job without duplicating it.
    if (!background) {
      var at = state.backgroundQueue.indexOf(key)
      if (at >= 0) { state.backgroundQueue.splice(at, 1); state.queue.push(key) }
    }
  } else if (queued(state) < MAX_QUEUE || (!background && state.backgroundQueue.length > 0)) {
    // Keep the queue bounded while reserving capacity for visible requests.
    // If background work filled it, discard its last job; its image binding
    // will request it again after the next completion changes the revision.
    if (queued(state) >= MAX_QUEUE) {
      var dropped = state.backgroundQueue.pop()
      delete state.pending[dropped]
    }
    state.pending[key] = true
    if (background) state.backgroundQueue.push(key)
    else state.queue.push(key)
  }
  // A refreshed or failed image never falls back to the source file.
  return ""
}

function next(state, allowLarge) {
  function take(queue) {
    for (var i = 0; i < queue.length; i++) {
      var parts = JSON.parse(queue[i])
      if (allowLarge === false && parts[1] === 1000) continue
      return JSON.parse(queue.splice(i, 1)[0])
    }
    return null
  }
  var keyParts = take(state.queue) || take(state.backgroundQueue)
  if (!keyParts) return null
  var key = JSON.stringify(keyParts)
  return { key: key, path: keyParts[0], edge: keyParts[1] }
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
