import QtQuick
import Quickshell
import Quickshell.Io
import "../../components"

// Persistent local-socket reads through Requests: streaming batches,
// superseding cancellation, stale IDs, malformed data, overflow, server
// exit, and lazy reconnect. tools/qs-test.sh gives this a private display.
Item {
  id: test
  signal done(bool ok, string report)
  property var failures: []
  property int phase: -1
  property int waited: 0
  property int arrivals: 0
  property string serverError: ""
  property int serverReady: 0
  property int warmIndex: 0
  property var dispatchSamples: []
  property var parseSamples: []
  property string path: (Quickshell.env("XDG_RUNTIME_DIR") || "/tmp") + "/nodi-socket-test-" + Date.now() + ".sock"

  function check(value, message) { if (!value) failures.push(message) }
  function param(query) {
    return paramAt(query, path)
  }
  function paramAt(query, target) {
    return JSON.stringify({ keyword: "s", title: "Socket", icon: "", socket: target, query: query,
                            window: { "class": "foot" }, timeoutMs: 1800, max: 8 })
  }

  readonly property var provider: ({
    id: "socket-test",
    sources: {
      rows: {
        socket: true, supersede: true, transient: true, maxAgeMs: 60000, retryMs: 100,
        timeoutMs: 2000, maxBytes: 16384, maxLineBytes: 1024, batchMs: 16,
        parse: function(raw, ok) {
          if (!ok) throw "socket failed"
          return raw.map(function(row) { return row.title })
        }
      }
    }
  })

  Requests { id: requests; providers: [test.provider] }
  Connections {
    target: requests
    function onArrived(key) { if (key.indexOf("rows:") === 0) test.arrivals++ }
  }

  Process {
    id: server
    command: ["/usr/bin/python", Qt.resolvedUrl("socket-server.py").toString().replace(/^file:\/\//, ""), test.path]
    stdout: SplitParser {
      onRead: function(data) {
        if (String(data).trim() !== "READY") return
        test.serverReady++
        if (test.phase === 5) {
          test.waited = 0
          requests.request("rows", test.param("reconnect"))
          return
        }
        if (test.phase >= 0) return
        startup.stop()
        test.phase = 0
        test.waited = 0
        requests.request("rows", test.param("stream"))
        poll.start()
      }
    }
    stderr: StdioCollector { id: serverStderr }
    onExited: function(exitCode) {
      test.serverError = "exit " + exitCode + ": " + serverStderr.text
      if (test.phase === 4) {
        restart.start()
        test.phase = 5
        test.waited = 0
      }
    }
  }

  Timer {
    id: startup
    interval: 3000
    onTriggered: {
      test.failures.push("socket fixture did not start: " + test.serverError)
      test.done(false, test.failures.join("; "))
    }
  }

  Timer {
    id: supersede
    interval: 30
    onTriggered: requests.request("rows", test.param("new"))
  }

  Timer {
    id: restart
    interval: 800
    onTriggered: server.running = true
  }

  Timer {
    id: poll
    interval: 20
    repeat: true
    onTriggered: {
      waited++
      if (phase === 0) {
        var stream = requests.request("rows", test.param("stream"), { fetch: false })
        if (stream.state !== "ready" && waited < 100) return
        check(stream.state === "ready" && JSON.stringify(stream.value) === '["One","Two"]',
              "streamed rows complete in order: " + JSON.stringify(stream))
        check(arrivals >= 2, "streaming recomputes in bounded batches before completion: " + arrivals)
        var reader = requests.readers[requests.socketSlot(param("stream"))]
        check(reader && reader.lastDispatchMs < 50 && reader.lastParseMs < 50,
              "warm dispatch and parse overhead stay under 50 ms: " + (reader ? reader.lastDispatchMs + "/" + reader.lastParseMs : "no reader"))
        phase = 8; waited = 0
        warmIndex = 0
        requests.request("rows", param("warm-" + warmIndex))
      } else if (phase === 8) {
        var warm = requests.request("rows", param("warm-" + warmIndex), { fetch: false })
        if (warm.state !== "ready" && waited < 100) return
        var warmReader = requests.readers[requests.socketSlot(param("warm-" + warmIndex))]
        check(warm.state === "ready", "warm query completed: " + JSON.stringify(warm))
        if (warmReader) {
          dispatchSamples.push(warmReader.lastDispatchMs)
          parseSamples.push(warmReader.lastParseMs)
        }
        warmIndex++
        waited = 0
        if (warmIndex < 20) {
          requests.request("rows", param("warm-" + warmIndex))
          return
        }
        dispatchSamples.sort(function(a, b) { return a - b })
        parseSamples.sort(function(a, b) { return a - b })
        var p95 = Math.ceil(dispatchSamples.length * 0.95) - 1
        check(dispatchSamples.length === 20 && dispatchSamples[p95] < 50,
              "warm dispatch p95 stays under 50 ms: " + JSON.stringify(dispatchSamples))
        check(parseSamples.length === 20 && parseSamples[p95] < 50,
              "warm parse p95 stays under 50 ms: " + JSON.stringify(parseSamples))
        phase = 1
        requests.request("rows", param("slow"))
        supersede.start()
      } else if (phase === 1) {
        var newest = requests.request("rows", param("new"), { fetch: false })
        if (newest.state !== "ready" && waited < 100) return
        check(newest.state === "ready" && JSON.stringify(newest.value) === '["new"]',
              "new query wins after cancellation: " + JSON.stringify(newest))
        check(!requests.cache["rows:" + param("slow")], "superseded query is dropped")
        phase = 2; waited = 0
        requests.request("rows", param("malformed"))
      } else if (phase === 2) {
        var malformed = requests.request("rows", param("malformed"), { fetch: false })
        if (malformed.state !== "ready" && waited < 100) return
        check(malformed.state === "ready" && JSON.stringify(malformed.value) === '["Valid"]',
              "malformed and stale frames are discarded: " + JSON.stringify(malformed))
        phase = 3; waited = 0
        requests.request("rows", param("overflow"))
      } else if (phase === 3) {
        var overflow = requests.request("rows", param("overflow"), { fetch: false })
        if (overflow.state !== "error" && waited < 100) return
        check(overflow.state === "error" && /line limit/.test(overflow.error),
              "an oversized line fails bounded parsing: " + JSON.stringify(overflow))
        phase = 4; waited = 0
        server.running = false
      } else if (phase === 4) {
        return
      } else if (phase === 5) {
        var reconnected = requests.request("rows", param("reconnect"), { fetch: false })
        if (reconnected.state !== "ready" && waited < 120) return
        var reconnectReader = requests.readers[requests.socketSlot(param("reconnect"))]
        check(reconnected.state === "ready" && JSON.stringify(reconnected.value) === '["reconnect"]',
              "a later request reconnects lazily: " + JSON.stringify(reconnected) + " server=" + server.running + " " + serverError
              + " ready=" + serverReady + " attempts=" + (reconnectReader ? reconnectReader.attempts : -1)
              + " sent=" + (reconnectReader ? reconnectReader.sentId : ""))
        phase = 6; waited = 0
        requests.request("rows", param("exit"))
      } else if (phase === 6) {
        var exited = requests.request("rows", param("exit"), { fetch: false })
        if (exited.state !== "error" && waited < 150) return
        check(exited.state === "error", "server exit finishes as an error: " + JSON.stringify(exited))
        check(waited < 50, "an interrupted request fails without waiting for its deadline: " + waited)
        phase = 7; waited = 0
        requests.request("rows", paramAt("file", Qt.resolvedUrl("socket-server.py").toString().replace(/^file:\/\//, "")))
      } else if (phase === 7) {
        var regular = requests.request("rows", paramAt("file", Qt.resolvedUrl("socket-server.py").toString().replace(/^file:\/\//, "")), { fetch: false })
        if (regular.state !== "error" && waited < 150) return
        check(regular.state === "error", "a regular-file target is rejected by the local-socket connection: " + JSON.stringify(regular))
        poll.stop()
        server.running = false
        Quickshell.execDetached(["/usr/bin/rm", "-f", "--", path])
        done(failures.length === 0, failures.join("; "))
      }
    }
  }

  function start() {
    var other = JSON.stringify({ keyword: "other", socket: path })
    check(requests.socketSlot(param("same")) !== requests.socketSlot(other),
          "configured sources sharing a socket keep separate connections")
    server.running = true
    startup.start()
  }
}
