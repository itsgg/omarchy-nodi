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
  property var cacheState: Images.create()
  readonly property var readers: [reader0, reader1]

  function source(value, large, background) {
    var key = Images.key(value, large)
    if (!key) return ""
    var result = Images.get(cacheState, key, Date.now(), !!background)
    Qt.callLater(images.drain)
    return result
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
                 { key: job.key, env: { NODI_IMAGE: job.path } })
    }
  }

  function finished(text, ok, tag) {
    Images.finish(cacheState, tag.key, ok ? text.trim() : "", Date.now())
    revision++
    Qt.callLater(images.drain)
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
