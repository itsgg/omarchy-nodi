import QtQuick
import "../../components"

// components/WindowShot.qml, what it does before a picture: an address as
// hyprctl writes it is found as Quickshell writes it (no "0x", any case),
// and one no window has finds none, so nothing is captured and the pane is
// not ready. No window is captured here. Run by tools/qs-test.sh inside
// Quickshell.
Item {
  id: test
  signal done(bool ok, string report)
  property var failures: []

  function check(cond, what) { if (!cond) test.failures.push(what) }

  WindowShot { id: shot; width: 400; height: 300; address: "0xDEADBEEF0000" }

  function start() {
    check(shot.bare === "deadbeef0000", "the address as Quickshell has it: " + shot.bare)
    check(shot.toplevel === null, "no window has it: none found")
    later.start()
  }

  // Still nothing found or shown a moment on, when a capture would have
  // begun (Cursor's review, 2026-10-10).
  Timer {
    id: later
    interval: 500
    onTriggered: {
      test.check(shot.toplevel === null, "a moment on, still none found")
      test.check(!shot.ready, "nothing to show")
      shot.address = ""
      test.check(shot.bare === "" && shot.toplevel === null, "no address: no window")
      Qt.callLater(function() { test.done(test.failures.length === 0, test.failures.join("; ")) })
    }
  }
}
