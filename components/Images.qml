import QtQuick
import "../lib/Images.js" as Images

// One decoder at a time, with visible icon requests ahead of background
// warmup, a bounded queue and a bounded in-memory cache. Only raster.py's
// newly written PNG enters a Qt image decoder.
Item {
  id: images
  visible: false
  property string pluginDir: ""
  property int revision: 0
  property var cacheState: Images.create()

  function source(value, large, background) {
    var key = Images.key(value, large)
    if (!key) return ""
    var result = Images.get(cacheState, key, Date.now(), !!background)
    Qt.callLater(images.drain)
    return result
  }

  function drain() {
    if (reader.busy || !pluginDir) return
    var job = Images.next(cacheState)
    if (!job) return
    reader.run(["/usr/bin/python3", "-I", pluginDir + "/lib/raster.py", String(job.edge)],
               { key: job.key, env: { NODI_IMAGE: job.path } })
  }

  Reader {
    id: reader
    timeoutMs: 5000
    maxBytes: 5400000
    onFinished: function(text, ok, tag) {
      Images.finish(images.cacheState, tag.key, ok ? text.trim() : "", Date.now())
      images.revision++
      Qt.callLater(images.drain)
    }
  }
}
