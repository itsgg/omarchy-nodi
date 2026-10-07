import QtQuick
import QtQuick.Window
import Quickshell.Wayland
import Quickshell.Hyprland

// The window a `w` row names, as it is now, in the pane (ROADMAP 78): a
// picture Hyprland makes of that window alone (hyprland-toplevel-export),
// so one on another workspace or under others shows whole, and the bar is
// never in it. A still, taken again every second while it shows: kept live
// it cost the shell's thread about 8% of a core and Hyprland about 6% more
// for as long as the row was selected, a still each second 0.4% (measured
// 2026-10-07 on a 936x1138 window). Loaded by PreviewPane only inside the
// shell (Nodi.qml `captures`); the offscreen renders have no compositor.
Item {
  id: shot
  // As hyprctl gives it, "0x5b8f7893e200"; Quickshell's has no "0x".
  property string address: ""
  readonly property bool ready: view.hasContent
  readonly property string bare: String(shot.address).replace(/^0x/i, "").toLowerCase()

  // Found again as Hyprland's windows change, so a window opened after
  // the bar was is found, and a closed one lets its picture go.
  readonly property var toplevel: {
    var tops = Hyprland.toplevels.values
    for (var i = 0; i < tops.length; i++)
      if (tops[i] && String(tops[i].address).toLowerCase() === shot.bare) return tops[i]
    return null
  }

  // Fitted whole, its own shape kept, and never drawn larger than the
  // window is on screen: a small one was blown up to the pane, blurred
  // (Cursor 2026-10-07). The picture is in the screen's pixels.
  readonly property real dpr: Screen.devicePixelRatio > 0 ? Screen.devicePixelRatio : 1
  readonly property real fit: view.sourceSize.width > 0 && view.sourceSize.height > 0
    ? Math.min(1, shot.width * shot.dpr / view.sourceSize.width, shot.height * shot.dpr / view.sourceSize.height) : 0

  ScreencopyView {
    id: view
    // Under the pane's header.
    anchors.top: parent.top
    anchors.horizontalCenter: parent.horizontalCenter
    width: view.sourceSize.width * shot.fit / shot.dpr
    height: view.sourceSize.height * shot.fit / shot.dpr
    // Only once this window's picture has come: until then the last one
    // drawn is still there, another window's (Cursor 2026-10-07).
    visible: view.hasContent
    live: false
    captureSource: shot.toplevel && shot.visible ? shot.toplevel.wayland : null
  }

  // Taken again only while a capture is under way: the first frame is
  // asked for by Quickshell itself, and a capture that never started or
  // was stopped has nothing to ask (each ask then logs a warning).
  Timer {
    interval: 1000
    repeat: true
    running: shot.visible && view.hasContent
    onTriggered: view.captureFrame()
  }
}
