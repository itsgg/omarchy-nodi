import QtQuick
import "../lib/Requests.js" as Requests

// Runs the reads providers ask for through ctx.request (lib/Requests.js
// says when one is due and what it leaves). One Reader per source, made on
// first use, so a slow source never holds up another; a read asked while
// one of its source is running waits, and a newer one replaces it, as a
// path typed further replaces the folder listed a keystroke ago. A source
// marked `concurrent` (inline scripts) gives each key its own Reader, so one
// slow script does not hold back the others' output.
Item {
  id: requests
  visible: false

  property var providers: []
  property var env: ({})            // { user, home, cacheDir, path } for the sources' argv

  signal arrived(string key)

  property var cache: ({})          // key -> entry, changed in place
  property var readers: ({})        // source name, or key of a concurrent source -> Reader
  property var waiting: ({})        // the same -> key of the read queued behind the running one

  Component { id: readerType; Reader {} }

  // ctx.request(name, param, { fetch: false }?)
  function request(name, param, opts) {
    var source = Requests.sourceOf(requests.providers, name)
    if (!source) return { state: "error", error: "no source named " + name }
    var key = Requests.keyOf(name, param)
    if (!(opts && opts.fetch === false) && Requests.due(requests.cache[key], source, Date.now(), param)) requests.start(name, key, source, param)
    return Requests.view(requests.cache[key])
  }

  function start(name, key, source, param) {
    var argv = source.argv(param, requests.env)
    if (!argv) return
    var slot = source.concurrent ? key : name
    var reader = requests.readers[slot] || requests.make(slot, name, source)
    // A `supersede` source's newer read ends the one running (a keystroke
    // replacing the last query's run): that one is dropped, not failed, so
    // the query typed again is read again.
    if (reader.busy && source.supersede && reader.tag && reader.tag.key !== key && !reader.tag.cancelled) {
      requests.put(reader.tag.key, Requests.dropped(requests.cache[reader.tag.key]))
      reader.cancel()
    }
    if (reader.busy) {
      var before = requests.waiting[slot]
      if (before && before !== key) requests.put(before, Requests.dropped(requests.cache[before]))
      requests.waiting[slot] = key
    }
    requests.put(key, Requests.begun(requests.cache[key], Date.now()))
    reader.run(argv, { key: key, param: param, slot: slot })
  }

  function make(slot, name, source) {
    // A source that runs the user's own programs (`sessionPath`) gets the
    // session's PATH, ~/.local/bin and the like, where the rest get only
    // Omarchy's and the system's.
    var reader = readerType.createObject(requests, { timeoutMs: source.timeoutMs || 5000, maxBytes: source.maxBytes || 1048576,
      cancelable: !!source.supersede, extraEnvironment: source.sessionPath && requests.env.path ? { PATH: requests.env.path } : {} })
    reader.finished.connect(function(text, ok, tag) { requests.finish(name, tag, text, ok) })
    requests.readers[slot] = reader
    return reader
  }

  function finish(name, tag, text, ok) {
    if (!tag) return
    if (requests.waiting[tag.slot] === tag.key) requests.waiting[tag.slot] = ""
    // Cancelled by a newer read: its entry was dropped then; nothing lands.
    if (tag.cancelled) return
    // A concurrent key's Reader goes when its read lands, or one per script
    // ever listed would stay for the life of the shell (agy 2026-10-03).
    if (tag.slot !== name && !requests.waiting[tag.slot]) {
      var spent = requests.readers[tag.slot]
      delete requests.readers[tag.slot]
      if (spent) spent.destroy()
    }
    var source = Requests.sourceOf(requests.providers, name)
    if (!source) return
    var before = requests.cache[tag.key]
    var after = Requests.settled(before, source, text, ok, tag.param, Date.now())
    // The same rows again: held as they were, so what is worked out of
    // them by identity stays, and nothing to show anew (Requests.same).
    var unchanged = Requests.same(before, after)
    if (unchanged) after.value = before.value
    requests.put(tag.key, after)
    if (!unchanged) requests.arrived(tag.key)
  }

  // What a saved copy gives before any read (rates.json at start).
  function seed(name, param, text, at) {
    var source = Requests.sourceOf(requests.providers, name)
    var key = Requests.keyOf(name, param)
    var entry = source ? Requests.seeded(source, text, param, at) : null
    if (entry && !(requests.cache[key] && requests.cache[key].pending)) { requests.put(key, entry); requests.arrived(key) }
  }

  // Whether a key's source keeps its entries (`keep`, lib/Requests.js prune).
  function keeps(key) {
    var source = Requests.sourceOf(requests.providers, key.slice(0, key.indexOf(":")))
    return !!(source && source.keep)
  }

  function put(key, entry) {
    if (entry) requests.cache[key] = entry
    else delete requests.cache[key]
    var old = Requests.prune(requests.cache, 64, requests.keeps)
    for (var i = 0; i < old.length; i++) delete requests.cache[old[i]]
  }
}
