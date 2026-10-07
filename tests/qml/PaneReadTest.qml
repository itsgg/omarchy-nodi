import QtQuick
import Quickshell
import "../../components"

// components/PaneRead.qml with the real Requests: a preview that names a
// read shows nothing of it at first, asks for it, and takes what lands;
// changing the preview four times asks again each time. A read started
// inside the preview's binding logged a binding loop each time, which
// tools/qs-test.sh fails on (2026-10-07).
Item {
  id: test
  signal done(bool ok, string report)
  property int pick: 0
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

  function start() { step.start() }

  Timer {
    id: step
    interval: 250
    repeat: true
    onTriggered: {
      var p = pane.preview
      if (!p || p.read) test.failures.push("pick " + test.pick + ": the read kept in the preview " + JSON.stringify(p))
      else if (p.text !== "lines of f" + test.pick) test.failures.push("pick " + test.pick + ": " + JSON.stringify(p.text))
      if (++test.pick > 4) { stop(); test.done(test.failures.length === 0, test.failures.join("; ")) }
    }
  }
}
