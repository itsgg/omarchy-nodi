.pragma library

// One way for a provider to ask for data that takes a while to read: the
// process list, a directory, exchange rates, Omarchy's command list, and
// next an AI answer or a developer view (ROADMAP item 7, review A2).
//
// A provider says how to read what it needs, in `sources`:
//
//   sources: { processes: { argv(param, env), parse(text, ok, param),
//                           maxAgeMs, retryMs?, fresh(value, now)?,
//                           timeoutMs?, maxBytes? } }
//
// maxAgeMs may be a function of the parameter, for a source whose entries
// age at their own pace (each inline script's refreshTime); `concurrent:
// true` reads each parameter on its own Reader instead of one at a time.
//
// and asks with ctx.request(name, param), which answers at once from what
// is held:
//
//   { state: "pending" }                  nothing yet; a read is on its way
//   { state: "ready", value, at }
//   { state: "error", error, value? }     the read failed; the last value, if any
//
// Asking starts a read when there is nothing, or what there is has aged
// past the source's limit; ctx.request(name, param, { fetch: false }) only
// looks. components/Requests.qml runs the reads, one at a time per source,
// and recomputes the bar when one lands. This file decides; that one runs.

function keyOf(name, param) {
  var p = param === undefined || param === null ? "" : String(param)
  return p ? name + ":" + p : name
}

function copy(entry) {
  var e = {}
  for (var k in entry || {}) e[k] = entry[k]
  return e
}

// What a provider sees of an entry.
function view(entry) {
  if (!entry || (entry.value === undefined && entry.state !== "error")) return { state: "pending" }
  return { state: entry.state, value: entry.value, error: entry.error || "", at: entry.at || 0 }
}

function maxAge(source, param) {
  return typeof source.maxAgeMs === "function" ? Number(source.maxAgeMs(param)) || 0 : source.maxAgeMs || 0
}

// Whether to start a read now.
function due(entry, source, now, param) {
  if (!entry) return true
  if (entry.pending) return false
  if (entry.state === "error") return now - entry.at >= (source.retryMs || maxAge(source, param))
  if (source.fresh) return !source.fresh(entry.value, now)
  return now - entry.at >= maxAge(source, param)
}

// A read has started: what was there stays on show until it lands.
function begun(entry, now) {
  var e = copy(entry)
  e.pending = true
  e.startedAt = now
  return e
}

// A read has finished. A parse that throws, or reads nothing, is an error
// that keeps the last value, so saved rates still convert offline.
function settled(entry, source, text, ok, param, now) {
  var e = { at: now, pending: false }
  try {
    var value = source.parse(text, ok, param)
    if (value === undefined || value === null) throw "nothing was read"
    e.state = "ready"
    e.value = value
  } catch (err) {
    e.state = "error"
    e.error = String(err && err.message ? err.message : err)
    if (entry && entry.value !== undefined) e.value = entry.value
  }
  return e
}

// Whether a read that landed says what the entry already held: then the
// bar is not worked out again, which would scroll a list moved by the
// wheel back to its selection at every rerun (Sonnet 2026-10-06).
function same(before, after) {
  return !!before && !!after && before.state === "ready" && after.state === "ready" && before.value !== undefined
    && JSON.stringify(before.value) === JSON.stringify(after.value)
}

// A read that waited behind another was replaced by a newer one before it
// ran: the entry goes back to what it had, or to nothing.
function dropped(entry) {
  if (!entry) return null
  var e = copy(entry)
  e.pending = false
  return e.value === undefined && e.state !== "error" ? null : e
}

// What a saved copy (rates.json) gives before any read, dated when saved.
function seeded(source, text, param, at) {
  try {
    var value = source.parse(text, true, param)
    return value === undefined || value === null ? null : { state: "ready", value: value, at: at, pending: false }
  } catch (e) {
    return null
  }
}

// The source a name refers to, from the providers that declare one.
function sourceOf(providers, name) {
  for (var i = 0; i < (providers || []).length; i++) {
    var s = providers[i].sources
    if (s && Object.prototype.hasOwnProperty.call(s, name)) return s[name]
  }
  return null
}

// The keys to forget so the cache holds at most `limit` entries with a
// parameter ("directory:/home/u"): the oldest first, never one with a read
// on its way. Those are the ones that multiply, one per directory ever
// typed; a source with one entry (the rates seeded from rates.json, the
// Omarchy list) is never forgotten (Fable 2026-10-02).
// `keeps(key)`: an entry never forgotten, of a source that says `keep`: a
// script filter's list, read once for its refresh, was the oldest entry
// and went first, and its rows left the bar (Sonnet 2026-10-06).
function prune(cache, limit, keeps) {
  var keyed = Object.keys(cache || {}).filter(function(k) { return k.indexOf(":") > 0 && !(keeps && keeps(k)) })
  var over = keyed.length - limit
  if (over <= 0) return []
  var idle = keyed.filter(function(k) { return cache[k] && !cache[k].pending })
  idle.sort(function(a, b) { return (cache[a].at || 0) - (cache[b].at || 0) })
  return idle.slice(0, over)
}
