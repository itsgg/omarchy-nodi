import QtQuick
import Quickshell.Io
import "../lib/HomeSources.js" as Parser

// One in-process FileView per configured JSONL home source. Valid snapshots
// replace atomically; a malformed, missing, or half-written file leaves the
// last valid snapshot in place and publishes a diagnostic.
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
    root.updated()
  }

  function record(source, snapshot, error) {
    var next = []
    var previous = null
    for (var i = 0; i < root._records.length; i++) {
      if (root.sameSource(root._records[i].source, source)) previous = root._records[i]
      else next.push(root._records[i])
    }
    next.push({
      source: source,
      snapshot: snapshot && snapshot.valid === true ? snapshot : (previous ? previous.snapshot : null),
      error: String(error || "")
    })
    root._records = next
    root.publish()
  }

  onSourcesChanged: root.publish()

  Repeater {
    model: root.sources

    delegate: Item {
      id: watched
      required property var modelData
      readonly property var source: modelData
      property string pendingText: ""
      property bool reloadPending: false

      function boundedText(value) {
        var text = String(value || "")
        return text.length > Parser.MAX_BYTES + 1 ? text.slice(0, Parser.MAX_BYTES + 1) : text
      }

      function parse(info) {
        var parsed = Parser.parse(watched.pendingText, watched.source, info)
        root.record(watched.source, parsed.valid ? parsed : null, parsed.error)
      }

      function readSettled() {
        if (metadata.busy) { watched.reloadPending = true; return }
        file.reload()
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
        onLoaded: {
          watched.pendingText = watched.boundedText(text())
          if (watched.source.trustedActions === true) {
            metadata.run([
              "/usr/bin/bash", "-c",
              'set -e; [ -f "$1" ] && [ ! -L "$1" ]; /usr/bin/stat -c "%u %a" -- "$1"; /usr/bin/id -u',
              "nodi-home-source-metadata", watched.source.file
            ], null)
          } else {
            watched.parse(null)
          }
        }
        onLoadFailed: function(error) {
          var said = error === FileViewError.FileNotFound ? "file not found"
            : error === FileViewError.PermissionDenied ? "permission denied"
            : error === FileViewError.NotAFile ? "not a regular file"
            : "file could not be read"
          root.record(watched.source, null, said)
        }
        onFileChanged: settle.restart()
      }

      Reader {
        id: metadata
        timeoutMs: 1000
        maxBytes: 128
        terminateLines: false
        onFinished: function(text, ok) {
          if (watched.reloadPending) {
            watched.reloadPending = false
            settle.restart()
            return
          }
          var info = null
          if (ok) {
            var fields = text.trim().split(/\s+/)
            if (fields.length === 3) {
              info = {
                path: watched.source.file,
                regular: true,
                symlink: false,
                uid: Number(fields[0]),
                ownerUid: Number(fields[2]),
                mode: parseInt(fields[1], 8)
              }
            }
          }
          watched.parse(info)
        }
      }

      Component.onCompleted: settle.restart()
    }
  }
}
