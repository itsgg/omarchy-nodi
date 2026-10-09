import QtQuick
import "../../components"

// components/LaunchFeedback.qml, what it decides before the OSD would show:
// a launch is named, waited for two seconds, and ended by done() with no
// OSD asked for; an app with no name is "application". The OSD itself is
// not asked here: the shell this runs beside is the one on his screen, and
// /usr/bin/omarchy-shell would show it there. Run by tools/qs-test.sh
// inside Quickshell.
Item {
  id: test
  signal done(bool ok, string report)
  property var failures: []

  function check(cond, what) { if (!cond) test.failures.push(what) }

  LaunchFeedback { id: feedback }

  function start() {
    feedback.opened()
    feedback.begin("Firefox")
    check(feedback.message === "Launching Firefox...", "the launch is named: " + feedback.message)
    check(!feedback.osdOpen, "nothing shown at once: the OSD waits two seconds")
    // A check while nothing has appeared keeps it waiting.
    feedback.check()
    check(!feedback.osdOpen, "still waiting")
    feedback.done()
    check(!feedback.osdOpen, "ended before the OSD: none to close")
    feedback.begin("")
    check(feedback.message === "Launching application...", "no name: application")
    feedback.done()
    // Past the two seconds after done(), the OSD was never asked for.
    later.start()
  }

  Timer {
    id: later
    interval: 2300
    onTriggered: {
      check(!feedback.osdOpen, "done() stopped the wait: no OSD after two seconds")
      test.done(test.failures.length === 0, test.failures.join("; "))
    }
  }
}
