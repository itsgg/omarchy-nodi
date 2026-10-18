import QtQuick
import Quickshell
import "../../components"

// The production reader, worker, cache and Qt PNG decoder together.
Item {
  id: test
  signal done(bool ok, string report)
  property bool finished: false
  property double startedAt: 0
  property string icon: ""

  Images {
    id: images
    pluginDir: decodeURIComponent(String(Qt.resolvedUrl("../..")).replace(/^file:\/\//, "").replace(/\/$/, ""))
    onRevisionChanged: {
      test.icon = images.source(decodeURIComponent(String(Qt.resolvedUrl("../../docs/home.png")).replace(/^file:\/\//, "")), true)
    }
  }
  Image {
    source: test.icon
    asynchronous: true
    onStatusChanged: {
      if (status === Image.Ready && !test.finished) {
        test.finished = true
        test.done(sourceSize.width > 0 && sourceSize.width <= 1000 && sourceSize.height <= 1000,
                  "unbounded decoded raster dimensions")
      }
    }
  }
  Timer {
    interval: 50
    repeat: true
    running: !test.finished && test.startedAt > 0
    onTriggered: {
      if (Date.now() - test.startedAt > 10000) {
        test.finished = true
        test.done(false, "worker never delivered a PNG to Qt")
      }
    }
  }
  function start() {
    test.startedAt = Date.now()
    if (images.source("image://qsimage/123", false) !== "") {
      test.finished = true
      test.done(false, "opaque handle escaped the decoder boundary")
      return
    }
    test.icon = images.source(decodeURIComponent(String(Qt.resolvedUrl("../../docs/home.png")).replace(/^file:\/\//, "")), true)
  }
}
