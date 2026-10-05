import QtQuick
import "../lib/Undo.js" as Undo

// Actions that can be undone (lib/Undo.js): each runs through a Reader of
// its own, so two run side by side and neither waits for or replaces the
// other, as a single Reader's queue would. A reader's limits apply: a
// cleared environment with the session's PATH, two minutes, 1 MB of output.
// What one prints last may name its undo, kept in `entries` for ten
// minutes; one that fails is said through `failed`.
Item {
  id: undoer
  visible: false

  property var env: ({})
  property var entries: []           // [{ key, title, run, at }]
  property int count: 0

  signal failed(string title, string why)

  Component { id: readerComponent; Reader {} }

  // `argv` is what Run.command builds for the action's run.
  function run(argv, title) {
    var r = readerComponent.createObject(undoer, { timeoutMs: 120000, maxBytes: 1048576, extraEnvironment: undoer.env })
    r.finished.connect(function(text, ok) {
      var now = Date.now()
      if (!ok) undoer.failed(title, r.timedOut ? "it ran past two minutes" : (r.errorLine || "it exited with an error"))
      var u = ok ? Undo.parse(text, title) : null
      var kept = Undo.live(undoer.entries, now)
      if (u) {
        undoer.count++
        kept = kept.concat([{ key: "undo:" + undoer.count, title: u.title, run: u.run, at: now }])
      }
      undoer.entries = kept
      // Once `finished` has returned: the reader is still in it here.
      Qt.callLater(function() { r.destroy() })
    })
    r.run(argv, null)
  }

  // The entry for `key`, taken off the list, or null.
  function take(key) {
    var found = null
    undoer.entries = undoer.entries.filter(function(e) { if (e.key === key) { found = e; return false } return true })
    return found
  }
}
