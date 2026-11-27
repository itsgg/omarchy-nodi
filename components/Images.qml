import QtQuick
import "../lib/Images.js" as Images

// Two bounded decoders, with visible icon requests ahead of background
// warmup, a bounded queue and a bounded in-memory cache. Only raster.py's
// newly written PNG enters a Qt image decoder.
Item {
  id: images
  visible: false
  property string pluginDir: ""
  property int revision: 0
  // A raster for `key` (Images.key) landed or went; "" for every key. A
  // picture listens for its own key (IconRef.qml), so a decoded icon
  // rebinds the rows that show it and no others.
  signal rasterChanged(string key)
  property var cacheState: Images.create()
  readonly property var readers: [reader0, reader1]

  // GTK must resolve icon names without connecting to the shell's Wayland
  // display. Its display backend exhausts the small decoder memory limit.
  function workerEnvironment(path) {
    return { NODI_IMAGE: String(path || ""), WAYLAND_DISPLAY: "" }
  }

  function keyOf(value, large) { return Images.key(value, !!large) }

  function source(value, large, background, persistent) {
    var key = Images.key(value, large)
    if (!key) return ""
    var result = Images.get(cacheState, key, Date.now(), !!background, !!persistent)
    Qt.callLater(images.drain)
    return result
  }

  // Every drop re-decodes each warm app icon, so each one says why in the
  // shell's log.
  function invalidate(reason) {
    console.info("nodi: icon rasters dropped: " + (reason || "unknown"))
    Images.invalidate(cacheState)
    revision++
    images.rasterChanged("")
    Qt.callLater(images.drain)
  }

  function catalog(apps) {
    if (Images.catalogChanged(cacheState, apps)) invalidate("app catalog changed")
  }

  function drain() {
    if (!pluginDir) return
    var largeBusy = false
    for (var r = 0; r < readers.length; r++) {
      if (readers[r].busy && readers[r].imageEdge === 1000) largeBusy = true
    }
    for (var i = 0; i < readers.length; i++) {
      var worker = readers[i]
      if (worker.busy) continue
      var job = Images.next(cacheState, !largeBusy)
      if (!job) return
      worker.imageEdge = job.edge
      if (job.edge === 1000) largeBusy = true
      worker.run(["/usr/bin/python3", "-I", pluginDir + "/lib/raster.py", String(job.edge)],
                 { key: job.key, generation: job.generation, env: images.workerEnvironment(job.path) })
    }
  }

  function finished(text, ok, tag) {
    var landed = Images.finish(cacheState, tag.key, ok ? text.trim() : "", Date.now(), tag.generation)
    revision++
    if (landed) images.rasterChanged(tag.key)
    // A worker is free: the pictures whose jobs a full queue dropped ask again.
    var dropped = Images.takeDropped(cacheState)
    for (var i = 0; i < dropped.length; i++) images.rasterChanged(dropped[i])
    Qt.callLater(images.drain)
  }

  // At an open: the pictures whose rasters are stale ask again, and no
  // others (Images.stale).
  function refreshStale() {
    var keys = Images.stale(cacheState, Date.now())
    for (var i = 0; i < keys.length; i++) images.rasterChanged(keys[i])
  }

  Reader {
    id: reader0
    property int imageEdge: 0
    timeoutMs: 5000
    maxBytes: 5400000
    onFinished: function(text, ok, tag) { images.finished(text, ok, tag) }
  }
  Reader {
    id: reader1
    property int imageEdge: 0
    timeoutMs: 5000
    maxBytes: 5400000
    onFinished: function(text, ok, tag) { images.finished(text, ok, tag) }
  }
}
