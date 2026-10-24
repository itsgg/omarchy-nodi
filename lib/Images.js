.pragma library

var MAX_QUEUE = 64
var MAX_ENTRIES = 128
var MAX_BYTES = 24 * 1024 * 1024
var MAX_AGE = 30000
var FAILURE_RETRY_MS = 30000

function create() { return { cache: {}, pending: {}, persistentRequests: {}, queue: [], backgroundQueue: [], bytes: 0, generation: 0 } }

function invalidate(state) {
  state.generation++
  state.cache = {}
  state.pending = {}
  state.persistentRequests = {}
  state.queue = []
  state.backgroundQueue = []
  state.bytes = 0
  return state.generation
}

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

function get(state, key, now, background, persistent) {
  var entry = state.cache[key]
  if (entry) {
    if (entry.value) {
      if (entry.persistent || now - entry.used < MAX_AGE) {
        if (background || persistent) entry.persistent = true
        entry.used = now
        return entry.value
      }
      state.bytes -= entry.value.length
      delete state.cache[key]
      entry = null
    }
    if (entry && now - entry.at < FAILURE_RETRY_MS) return ""
    delete state.cache[key]
  }
  if (state.pending[key]) {
    if (background || persistent) state.persistentRequests[key] = true
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
      delete state.persistentRequests[dropped]
    }
    state.pending[key] = true
    if (background || persistent) state.persistentRequests[key] = true
    if (background) {
      state.backgroundQueue.push(key)
    }
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
  return { key: key, path: keyParts[0], edge: keyParts[1], generation: state.generation }
}

function finish(state, key, value, now, generation) {
  if (generation !== undefined && generation !== state.generation) return false
  delete state.pending[key]
  var parts = JSON.parse(key)
  var edge = parts[1]
  var max = Math.ceil((edge * edge * 4 + edge + 4096) * 4 / 3) + 64
  if (value.length > max || !/^data:image\/png;base64,[A-Za-z0-9+/]+=*$/.test(value)) value = ""
  if (state.cache[key]) state.bytes -= state.cache[key].value.length
  var persistent = !!state.persistentRequests[key] || parts[0].charAt(0) !== "/"
  delete state.persistentRequests[key]
  state.cache[key] = { value: value, at: now, used: now, persistent: persistent }
  state.bytes += value.length
  var keys = Object.keys(state.cache).sort(function(a, b) { return state.cache[a].used - state.cache[b].used })
  while (keys.length > MAX_ENTRIES || state.bytes > MAX_BYTES) {
    var old = keys.shift()
    state.bytes -= state.cache[old].value.length
    delete state.cache[old]
  }
  return true
}
