import QtQuick
import Quickshell
import "../../components"

// components/PaneRead.qml with the real Requests: a preview that names a
// read shows nothing of it at first, asks for it, and takes what lands;
// changing the preview five times asks again each time. A read started
// inside the preview's binding logged a binding loop, which
// tools/qs-test.sh fails on (2026-10-07). Each pick waits for its read, up
// to five seconds, however slow the machine (Fable 2026-10-07: a fixed
// 250 ms failed under load).
Item {
  id: test
  signal done(bool ok, string report)
  property int pick: 0
  property real pickedAt: 0
  property var failures: []

  Requests {
    id: requests
    providers: [{ sources: { "head": {
      argv: function(p) { return ["/usr/bin/printf", "%s", JSON.stringify({ size: p.length, text: "lines of " + p })] },
      parse: function(t) { return JSON.parse(t) }, maxAgeMs: 60000 } } }]
  }

  PaneRead {
    id: pane
    store: requests
    chosen: ({ title: "file " + test.pick, read: { source: "head", param: "f" + test.pick } })
  }

  function start() { test.pickedAt = Date.now(); step.start() }

  Timer {
    id: step
    interval: 50
    repeat: true
    onTriggered: {
      var p = pane.preview
      if (p && p.read) test.failures.push("pick " + test.pick + ": the read kept in the preview")
      var landed = !!p && p.text === "lines of f" + test.pick
      if (!landed && Date.now() - test.pickedAt < 5000) return
      if (!landed) test.failures.push("pick " + test.pick + ": never took its read, " + JSON.stringify(p && p.text))
      if (++test.pick > 4) { stop(); test.done(test.failures.length === 0, test.failures.join("; ")); return }
      test.pickedAt = Date.now()
    }
  }
}
