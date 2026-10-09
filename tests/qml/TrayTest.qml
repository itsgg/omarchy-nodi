import QtQuick
import "../../components"

// components/Tray.qml, what it does without opening a menu: an app named
// as its tray item gives it, first letter raised and at most 60 letters;
// Enter on a record triggers its entry while the menu holds it, and on one
// it no longer holds triggers nothing. Its menus are not opened here: that
// asks each app in his tray to fill its menu in. Run by tools/qs-test.sh
// inside Quickshell.
Item {
  id: test
  signal done(bool ok, string report)
  property var failures: []

  function check(cond, what) { if (!cond) test.failures.push(what) }

  Tray { id: tray }

  QtObject {
    id: entry
    property int fired: 0
    function triggered() { entry.fired++ }
  }

  function start() {
    check(tray.appOf({ tooltipTitle: "dropbox" }) === "Dropbox", "its tooltip's title, first letter raised")
    check(tray.appOf({ tooltipTitle: "", title: "nm-applet" }) === "Nm-applet", "else its title")
    check(tray.appOf({ id: "steam" }) === "Steam", "else its id")
    check(tray.appOf({ title: "x".repeat(80) }).length === 60, "at most 60 letters")
    check(tray.appOf({}) === "", "nothing to name it: no name")
    tray.handles = ({ "tray:dropbox:Pause syncing": entry })
    check(tray.trigger("tray:dropbox:Pause syncing") === true && entry.fired === 1, "Enter triggers the entry the menu holds")
    check(tray.trigger("tray:dropbox:Quit") === false && entry.fired === 1, "one it does not hold: nothing")
    check(!tray.active && tray.entries.length === 0, "closed, it reads no tray")
    Qt.callLater(function() { test.done(test.failures.length === 0, test.failures.join("; ")) })
  }
}
