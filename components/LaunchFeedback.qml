import QtQuick
import Quickshell
import Quickshell.Wayland

// What Omarchy's own launcher shows when an app is slow to appear (the
// shell's AppLibrary): nothing for two seconds, then the OSD's "Launching
// Name...", until a new window appears or another takes focus, or fifteen
// seconds pass. Nodi starts apps the same way (uwsm-app, gtk-launch), so it
// gives the same feedback.
Item {
  id: feedback
  visible: false

  property int countAtLaunch: 0
  property var activeAtLaunch: null
  // The window that was active when the bar opened: Nodi's layer holds the
  // focus by launch time, and the focus going back to this window when the
  // bar closes is not the app appearing (Fable 2026-10-02).
  property var activeBeforeOpen: null

  function opened() { feedback.activeBeforeOpen = ToplevelManager.activeToplevel }
  property string message: ""
  property bool osdOpen: false

  function count() {
    try { return ToplevelManager.toplevels.values.length } catch (e) { return 0 }
  }

  function begin(name) {
    feedback.countAtLaunch = feedback.count()
    feedback.activeAtLaunch = feedback.activeBeforeOpen || ToplevelManager.activeToplevel
    feedback.message = "Launching " + String(name || "application") + "..."
    delay.restart()
    timeout.restart()
  }

  function done() {
    delay.stop()
    timeout.stop()
    if (feedback.osdOpen) {
      Quickshell.execDetached(["omarchy-shell", "osd", "close"])
      feedback.osdOpen = false
    }
  }

  function appeared() {
    return feedback.count() > feedback.countAtLaunch || ToplevelManager.activeToplevel !== feedback.activeAtLaunch
  }

  function check() {
    if ((delay.running || timeout.running || feedback.osdOpen) && feedback.appeared()) feedback.done()
  }

  Connections { target: ToplevelManager.toplevels; function onValuesChanged() { feedback.check() } }
  Connections { target: ToplevelManager; function onActiveToplevelChanged() { feedback.check() } }

  Timer {
    id: delay
    interval: 2000
    onTriggered: {
      if (feedback.appeared()) return
      feedback.osdOpen = true
      Quickshell.execDetached(["omarchy-shell", "osd", "show", JSON.stringify({ icon: "󰓞", message: feedback.message, duration: 0 })])
    }
  }

  Timer { id: timeout; interval: 15000; onTriggered: feedback.done() }

  // Unloaded mid-launch (a reload, a disable): the OSD has no duration of
  // its own, so it is closed here.
  Component.onDestruction: feedback.done()
}
