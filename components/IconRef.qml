import QtQuick

// One picture's source from the bar's image cache (Nodi.iconSource), read
// again only when that picture's own raster lands or goes (Nodi's
// rasterChanged, with its key) and not at every other decode or open: a
// binding on a shared revision made every warm tile and visible row call
// the cache again, and queue its drain, for each icon decoded.
Item {
  id: ref
  visible: false
  property var nodi: null
  // An icon name or a path; "" draws none.
  property string value: ""
  property bool large: false
  property bool background: false
  property int seen: 0
  readonly property string key: ref.value !== "" && ref.nodi ? ref.nodi.iconKey(ref.value, ref.large) : ""
  readonly property string url: {
    ref.seen
    return ref.value !== "" && ref.nodi ? ref.nodi.iconSource(ref.value, ref.large, ref.background) : ""
  }
  Connections {
    target: ref.nodi
    ignoreUnknownSignals: true
    function onRasterChanged(key) { if (key === "" || key === ref.key) ref.seen++ }
  }
}
