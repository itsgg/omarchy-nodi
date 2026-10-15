import QtQuick
import Quickshell.Io
import "../lib/SocketProtocol.js" as Protocol

// One persistent QLocalSocket connection for a configured row source.
// Queries are framed in the socket body, responses are bounded JSONL, and
// a newer query explicitly cancels the active ID.
Item {
  id: reader
  visible: false

  property int timeoutMs: 3000
  property int maxBytes: Protocol.LIMITS.bytes
  property int maxLineBytes: Protocol.LIMITS.lineBytes
  property int maxRows: Protocol.LIMITS.rows
  property int batchMs: 16
  property int maxReconnects: 5
  property bool active: false
  readonly property bool busy: active
  property var tag: null
  property string socketPath: ""
  property string queryId: ""
  property var protocol: null
  property var rawRows: []
  property var pendingRows: []
  property bool responseDone: false
  property int sequence: 0
  property int attempts: 0
  property bool retryScheduled: false
  property string sentId: ""
  property real lastDispatchMs: 0
  property real lastParseMs: 0
  property var wire: null

  signal partial(var rows, var tag)
  signal finished(var rows, bool ok, string error, var tag)

  function ensureWire(recreate) {
    if (recreate && reader.wire) {
      reader.wire.connected = false
      reader.wire.destroy()
      reader.wire = null
    }
    if (!reader.wire) reader.wire = socketType.createObject(reader, { path: reader.socketPath })
    return reader.wire
  }

  function run(paramText, runTag) {
    var param
    try { param = JSON.parse(paramText) } catch (e) {
      reader.finished([], false, "invalid socket request", runTag)
      return
    }
    if (reader.active) reader.cancel()
    reader.active = true
    reader.tag = runTag === undefined ? null : runTag
    reader.socketPath = String(param.socket || "")
    reader.sequence++
    reader.queryId = Protocol.queryId(reader.sequence, Date.now().toString(36))
    reader.protocol = Protocol.parser(reader.queryId, {
      maxBytes: reader.maxBytes,
      maxLineBytes: reader.maxLineBytes,
      maxRows: Math.min(reader.maxRows, Number(param.max) || reader.maxRows)
    })
    reader.rawRows = []
    reader.pendingRows = []
    reader.responseDone = false
    reader.attempts = 0
    reader.retryScheduled = false
    reader.sentId = ""
    reader.lastDispatchMs = 0
    reader.lastParseMs = 0
    deadline.interval = Math.max(100, Math.min(reader.timeoutMs, Number(param.timeoutMs) || reader.timeoutMs))
    deadline.restart()
    reader.ensureWire(false)
    if (wire.path !== reader.socketPath) {
      if (wire.connected) wire.connected = false
      wire.path = reader.socketPath
    }
    reader.connectOrSend()
  }

  function connectOrSend() {
    if (!reader.active) return
    reader.ensureWire(reader.attempts > 0)
    if (wire.connected) {
      reader.dispatch()
      return
    }
    reader.attempts++
    wire.connected = true
    if (reader.active && !reader.sentId && reader.attempts < reader.maxReconnects) {
      reader.retryScheduled = true
      retry.restart()
    }
  }

  function dispatch() {
    if (!reader.active || !wire.connected || reader.sentId === reader.queryId) return
    var began = Date.now()
    var param = JSON.parse(reader.tag.param)
    wire.write(Protocol.requestFrame(reader.queryId, param))
    wire.flush()
    reader.lastDispatchMs = Date.now() - began
    reader.sentId = reader.queryId
  }

  function cancel() {
    retry.stop()
    batch.stop()
    deadline.stop()
    reader.retryScheduled = false
    if (!reader.active) return
    if (reader.tag) reader.tag.cancelled = true
    if (wire.connected && reader.queryId) {
      wire.write(Protocol.cancelFrame(reader.queryId))
      wire.flush()
    }
    reader.active = false
    reader.pendingRows = []
    reader.responseDone = false
  }

  function acceptLine(line) {
    if (!reader.active) return
    var began = Date.now()
    var result = Protocol.feed(reader.protocol, String(line) + "\n")
    reader.lastParseMs += Date.now() - began
    if (result.error) {
      wire.connected = false
      reader.end(false, result.error)
      return
    }
    if (result.rows.length) {
      reader.rawRows = reader.rawRows.concat(result.rows)
      reader.pendingRows = reader.pendingRows.concat(result.rows)
      if (!batch.running) batch.start()
    }
    if (result.done) {
      reader.responseDone = true
      if (!reader.pendingRows.length) reader.end(true, "")
    }
  }

  function flushBatch() {
    if (!reader.active) return
    if (reader.pendingRows.length) {
      reader.pendingRows = []
      reader.partial(reader.rawRows.slice(), reader.tag)
    }
    if (reader.responseDone) reader.end(true, "")
  }

  function disconnected() {
    if (!reader.active || reader.responseDone || reader.retryScheduled) return
    if (reader.attempts >= reader.maxReconnects) {
      reader.end(false, "socket disconnected")
      return
    }
    reader.retryScheduled = true
    retry.restart()
  }

  function end(ok, error) {
    if (!reader.active) return
    deadline.stop()
    retry.stop()
    batch.stop()
    reader.retryScheduled = false
    var endedTag = reader.tag
    var rows = reader.rawRows.slice()
    reader.active = false
    reader.pendingRows = []
    reader.responseDone = false
    reader.finished(rows, ok, error, endedTag)
  }

  Component {
    id: socketType
    Socket {
      id: transport
      parser: SplitParser {
        splitMarker: "\n"
        onRead: function(data) { reader.acceptLine(data) }
      }
      onConnectionStateChanged: {
        if (connected) {
          reader.retryScheduled = false
          retry.stop()
          reader.dispatch()
        } else {
          reader.disconnected()
        }
      }
      onError: function(error) {
        if (connected) connected = false
        reader.disconnected()
      }
    }
  }

  Timer {
    id: retry
    interval: Math.min(400, 50 * Math.pow(2, Math.max(0, reader.attempts - 1)))
    onTriggered: {
      reader.retryScheduled = false
      reader.connectOrSend()
    }
  }

  Timer {
    id: batch
    interval: Math.max(1, reader.batchMs)
    onTriggered: reader.flushBatch()
  }

  Timer {
    id: deadline
    onTriggered: {
      if (wire && wire.connected && reader.queryId) {
        wire.write(Protocol.cancelFrame(reader.queryId))
        wire.flush()
      }
      reader.end(false, "socket timed out")
    }
  }
}
