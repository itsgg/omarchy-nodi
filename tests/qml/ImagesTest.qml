import QtQuick
import Quickshell
import "../../components"

// The production reader, workers, cache and Qt PNG decoder together.
Item {
  id: test
  signal done(bool ok, string report)
  property bool finished: false
  property double startedAt: 0
  property var paths: []
  property var icons: ["", "", ""]
  property var ready: [false, false, false]
  property int readyCount: 0
  property bool parallel: false

  Images {
    id: images
    pluginDir: decodeURIComponent(String(Qt.resolvedUrl("../..")).replace(/^file:\/\//, "").replace(/\/$/, ""))
    onRevisionChanged: test.refreshIcons()
  }
  Repeater {
    model: 3
    Image {
      required property int index
      source: test.icons[index]
      asynchronous: true
      onStatusChanged: {
        if (status !== Image.Ready || test.ready[index]) return
        var copy = test.ready.slice(0)
        copy[index] = true
        test.ready = copy
        test.readyCount++
        if (sourceSize.width <= 0 || sourceSize.width > 1000 || sourceSize.height <= 0 || sourceSize.height > 1000) {
          test.finished = true
          test.done(false, "unbounded decoded raster dimensions")
        }
        if (!test.finished && test.readyCount === 3) {
          test.finished = true
          test.done(test.parallel, test.parallel ? "three bounded rasters served by two concurrent workers" : "three icons completed without concurrent workers")
        }
      }
    }
  }
  Timer {
    interval: 25
    repeat: true
    running: !test.finished && test.startedAt > 0
    onTriggered: {
      var active = 0
      for (var i = 0; i < images.readers.length; i++) if (images.readers[i].busy) active++
      if (active === 2) test.parallel = true
      if (Date.now() - test.startedAt > 10000) {
        test.finished = true
        test.done(false, "the image workers did not deliver three PNGs to Qt")
      } else if (!test.parallel && test.readyCount < 3 && Date.now() - test.startedAt > 2000) {
        test.finished = true
        test.done(false, "two icons were not decoded concurrently")
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
    test.paths = ["home.png", "ask.png", "themes.png"].map(function(name) {
      return decodeURIComponent(String(Qt.resolvedUrl("../../docs/" + name)).replace(/^file:\/\//, "").replace(/\/$/, ""))
    })
    test.refreshIcons()
    Qt.callLater(test.checkParallel)
  }
  function refreshIcons() {
    if (paths.length) test.icons = paths.map(function(path) { return images.source(path, false) })
  }
  function checkParallel() {
    var active = 0
    for (var i = 0; i < images.readers.length; i++) if (images.readers[i].busy) active++
    if (active === 2) test.parallel = true
  }
}
