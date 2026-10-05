import QtQuick
import "../../components"

// components/Undoer.qml with real programs: an action whose last line names
// its undo leaves an entry; one that names none leaves none; one that fails
// is said, with the last line it wrote to stderr; two run side by side and
// both are kept, where one Reader's queue would have dropped the first; an
// entry taken is gone. Run by tools/qs-test.sh inside Quickshell.
Item {
  id: test
  signal done(bool ok, string report)
  property var failures: []
  property var failedSaid: []

  function check(cond, what) { if (!cond) test.failures.push(what) }

  function action(script) { return ["/usr/bin/bash", "-c", script, "undoer-test"] }

  Undoer {
    id: undoer
    env: ({ PATH: "/usr/bin:/bin" })
    onFailed: function(title, why) { test.failedSaid.push(title + ": " + why) }
  }

  function start() {
    undoer.run(action('sleep 0.5; echo sent; echo \'{"undo": {"exec": ["mailer", "recall", "1"], "title": "Recall the first"}}\''), "Send the first")
    undoer.run(action('sleep 0.3; echo \'{"undo": {"exec": ["mailer", "recall", "2"]}}\''), "Send the second")
    undoer.run(action('echo nothing to undo'), "Plain")
    undoer.run(action('echo half; echo "the disk is full" >&2; exit 4'), "Broken")
    later.start()
  }

  Timer {
    id: later
    interval: 2000
    onTriggered: {
      var titles = undoer.entries.map(function(e) { return e.title }).sort()
      check(JSON.stringify(titles) === JSON.stringify(["Recall the first", "Undo Send the second"]),
            "both side by side, each kept, none for an action that names none: " + JSON.stringify(titles))
      check(test.failedSaid.length === 1 && test.failedSaid[0] === "Broken: the disk is full", "a failure is said with its reason: " + JSON.stringify(test.failedSaid))
      var first = undoer.entries.filter(function(e) { return e.title === "Recall the first" })[0]
      check(!!first && JSON.stringify(first.run) === JSON.stringify({ kind: "exec", argv: ["mailer", "recall", "1"] }), "its run is the one named: " + JSON.stringify(first))
      var taken = first ? undoer.take(first.key) : null
      check(!!taken && undoer.entries.length === 1 && undoer.take(first.key) === null, "taken once, then gone")
      test.done(test.failures.length === 0, test.failures.join("; "))
    }
  }
}
