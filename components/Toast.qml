import QtQuick
import Quickshell
import Quickshell.Wayland
import qs.Commons
import "../lib/Toasts.js" as Toasts

// Nodi's own popup for its notices: a failed row, an undo that failed, a
// script's last line, a reminder due, the settings' errors. Never a
// notification: notify-send holds the words in its arguments and Omarchy's
// notification host puts each popup's text in bash arguments, where
// another local user can read them in /proc (the marketplace's review,
// 2026-10-10). As Omarchy draws its own popups: a passive surface over
// the screen, no keyboard focus, taking clicks only on the cards; at the
// top and in the middle, clear of Omarchy's own at the right. Shown only
// while there is one, each for a few seconds.
Scope {
  id: toaster
  property var look
  property var items: []
  property int count: 0

  function show(title, body) {
    var now = Date.now()
    toaster.items = Toasts.add(Toasts.live(toaster.items, now), title, body, now, ++toaster.count)
    toaster.schedule()
  }

  function dismiss(id) {
    toaster.items = Toasts.dismiss(toaster.items, id)
    toaster.schedule()
  }

  function schedule() {
    var wait = Toasts.nextIn(toaster.items, Date.now())
    if (wait < 0) { expiry.stop(); return }
    expiry.interval = Math.max(50, wait)
    expiry.restart()
  }

  Timer {
    id: expiry
    onTriggered: { toaster.items = Toasts.live(toaster.items, Date.now()); toaster.schedule() }
  }

  PanelWindow {
    id: popup
    visible: toaster.items.length > 0
    anchors { top: true; bottom: true; left: true; right: true }
    color: "transparent"
    WlrLayershell.namespace: "nodi-toast"
    WlrLayershell.layer: WlrLayer.Overlay
    WlrLayershell.keyboardFocus: WlrKeyboardFocus.None
    exclusionMode: ExclusionMode.Ignore
    mask: Region { item: cards }

    ToastCard {
      id: cards
      look: toaster.look
      items: toaster.items
      anchors.horizontalCenter: parent.horizontalCenter
      anchors.top: parent.top
      anchors.topMargin: Style.gapsOut + Style.space(44)
      onDismiss: function(id) { toaster.dismiss(id) }
    }
  }
}
