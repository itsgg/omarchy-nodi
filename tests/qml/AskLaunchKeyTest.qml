import QtQuick
import Quickshell
import "../../components"

// components/Ask.qml, an idle session whose launch key changes (another
// model, actions, servers): it is ended and a fresh one started, so the
// next question finds it up. The agent is a stand-in that only waits; no
// model is asked. Run by tools/qs-test.sh inside Quickshell.
Item {
  id: test
  signal done(bool ok, string report)
  property var failures: []
  property int starts: 0
  property bool ending: false

  function check(cond, what) { if (!cond) test.failures.push(what) }

  Ask {
    id: ask
    program: ["/usr/bin/sleep", "30"]
    workDir: Quickshell.env("XDG_RUNTIME_DIR") || "/tmp"
    onStartedChanged: if (started) test.starts++
  }

  function start() {
    ask.warm()
    deadline.start()
    poll.start()
  }

  Timer {
    id: poll
    interval: 100
    repeat: true
    onTriggered: {
      if (test.ending) {
        if (ask.started) return
        stop()
        deadline.stop()
        test.done(test.failures.length === 0, test.failures.join("; "))
        return
      }
      if (test.starts === 1 && ask.started && ask.model === "") {
        ask.model = "another"
        return
      }
      if (test.starts === 2 && ask.started && !ask.recycling) {
        test.ending = true
        ask.stop()
      }
    }
  }

  Timer {
    id: deadline
    interval: 15000
    onTriggered: {
      poll.stop()
      test.check(false, "a changed launch key left no fresh session: " + test.starts + " start(s), recycling " + ask.recycling)
      test.ending = true
      ask.stop()
      test.done(false, test.failures.join("; "))
    }
  }
}
