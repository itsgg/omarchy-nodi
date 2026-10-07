import QtQuick
import "../lib/Requests.js" as Requests
import "../lib/Rows.js" as Rows

// The pane's read (ROADMAP 82): a preview that names a read (a file's
// first lines, a folder's listing) shows what the read has given so far,
// and the read is asked for when the preview changes, outside any binding.
// Asked from inside the preview's binding, starting the read set the
// reader's `active`, which the binding had just read through `busy`, and
// Qt logged a binding loop at each new preview: 18 in the shell's log on
// 2026-10-07, reproduced with the real Requests (tests/qml/PaneReadTest.qml).
Item {
  id: pane
  visible: false

  // The reads (components/Requests.qml), and what the pane would show
  // before its read (lib/Pane.js choose).
  property var store: null
  property var chosen: null
  property var formatTime: null

  // Counted up when the read the pane names lands, so the preview takes
  // it even if nothing else is recomputed.
  property int landed: 0

  readonly property var preview: {
    var p = pane.chosen
    pane.landed
    if (!p || !p.read || !pane.store) return p
    return Rows.withRead(p, pane.store.request(p.read.source, p.read.param, { fetch: false }), pane.formatTime)
  }

  onChosenChanged: {
    var p = pane.chosen
    if (p && p.read && pane.store) pane.store.request(p.read.source, p.read.param)
  }

  Connections {
    target: pane.store
    function onArrived(key) {
      var p = pane.chosen
      if (p && p.read && key === Requests.keyOf(p.read.source, p.read.param)) pane.landed++
    }
  }
}
