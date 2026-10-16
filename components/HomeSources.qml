import QtQuick
import Quickshell.Io
import "../lib/HomeSources.js" as Parser

// FileView only reports changes. Reader opens each path once, bounds the bytes
// before QML sees them, and validates trust against that same descriptor.
Item {
  id: root

  property var sources: []
  property int debounceMs: 150
  readonly property var snapshots: root._snapshots
  readonly property var diagnostics: root._diagnostics
  property var _records: []
  property var _snapshots: []
  property var _diagnostics: []
  signal updated()

  function scheduleExpiry() {
    var next = Parser.merge(root._snapshots, Date.now()).nextExpiry
    expiry.stop()
    if (!next) return
    expiry.interval = Math.max(1, Math.min(2147483647, next - Date.now() + 1))
    expiry.start()
  }

  function sameSource(a, b) {
    return !!a && !!b && a.id === b.id && a.file === b.file
      && a.title === b.title && a.max === b.max && a.priority === b.priority
      && a.trustedActions === b.trustedActions
  }

  function publish() {
    var kept = []
    var snapshots = []
    var diagnostics = []
    for (var i = 0; i < root.sources.length; i++) {
      var source = root.sources[i]
      var record = null
      for (var j = 0; j < root._records.length; j++) {
        if (root.sameSource(root._records[j].source, source)) { record = root._records[j]; break }
      }
      if (!record) continue
      kept.push(record)
      if (record.snapshot) snapshots.push({ source: source, snapshot: record.snapshot })
      if (record.error) diagnostics.push({ id: source.id, file: source.file, error: record.error })
    }
    root._records = kept
    root._snapshots = snapshots
    root._diagnostics = diagnostics
    root.scheduleExpiry()
    root.updated()
  }

  function record(source, snapshot, error) {
    var next = []
    var previous = null
    for (var i = 0; i < root._records.length; i++) {
      if (root.sameSource(root._records[i].source, source)) previous = root._records[i]
      else next.push(root._records[i])
    }
    var usable = snapshot && snapshot.valid === true ? snapshot
      : (previous ? Parser.displayOnly(previous.snapshot) : null)
    next.push({
      source: source,
      snapshot: usable,
      error: String(error || "")
    })
    root._records = next
    root.publish()
  }

  // A change or read attempt invalidates the old trust immediately. Display
  // data may remain while the new read settles, but executable actions cannot.
  function revoke(source, error) {
    var previous = null
    for (var i = 0; i < root._records.length; i++)
      if (root.sameSource(root._records[i].source, source)) { previous = root._records[i]; break }
    if (previous && previous.snapshot) root.record(source, Parser.displayOnly(previous.snapshot), error || previous.error)
  }

  onSourcesChanged: root.publish()

  Timer {
    id: expiry
    onTriggered: {
      root.updated()
      root.scheduleExpiry()
    }
  }

  Repeater {
    model: root.sources

    delegate: Item {
      id: watched
      required property var modelData
      readonly property var source: modelData
      property bool reloadPending: false

      function readSettled() {
        root.revoke(watched.source, "")
        if (reader.busy) { watched.reloadPending = true; return }
        reader.run(Parser.readArgv(watched.source.file), watched.source.file)
      }

      Timer {
        id: settle
        interval: root.debounceMs
        onTriggered: watched.readSettled()
      }

      FileView {
        id: file
        path: watched.source.file
        watchChanges: true
        printErrors: false
        preload: false
        blockLoading: true
        blockAllReads: true
        onFileChanged: {
          root.revoke(watched.source, "")
          settle.restart()
        }
      }

      Reader {
        id: reader
        timeoutMs: 1000
        maxBytes: Parser.MAX_BYTES + 1024
        terminateLines: false
        onFinished: function(text, ok) {
          if (watched.reloadPending) {
            watched.reloadPending = false
            settle.restart()
            return
          }
          if (!ok) {
            root.record(watched.source, null, "file could not be read")
            return
          }
          var read = Parser.readResult(text, watched.source.file)
          if (!read.ok) {
            root.record(watched.source, null, read.error)
            return
          }
          var parsed = Parser.parse(read.text, watched.source, read.info)
          root.record(watched.source, parsed.valid ? parsed : null, parsed.error || read.error)
        }
      }

      Component.onCompleted: settle.restart()
    }
  }
}
