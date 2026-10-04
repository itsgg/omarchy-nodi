import QtQuick
import "../../components"

// components/Requests.qml with real reads: a value arriving, the cache
// answering after, a failure, a deadline, output past its cap, a read
// queued behind another replaced by a newer one, reads asked while one
// lands, and a concurrent source's keys read side by side. Run by tools/qs-test.sh inside Quickshell.
Item {
  id: test
  signal done(bool ok, string report)
  property var failures: []
  property int step: 0

  function check(cond, what) { if (!cond) test.failures.push(what) }

  readonly property var provider: ({
    id: "t",
    sources: {
      echo: { argv: function() { return ["/usr/bin/printf", "a,b"] }, parse: function(text) { return text.trim().split(",") }, maxAgeMs: 60000 },
      broken: { argv: function() { return ["/usr/bin/false"] }, parse: function(text, ok) { if (!ok) throw "failed"; return text }, maxAgeMs: 60000, retryMs: 60000 },
      slow: { argv: function(p) { return ["/usr/bin/bash", "-c", "sleep 0.3; printf %s \"$0\"", p] }, parse: function(text) { return text.trim() }, maxAgeMs: 60000 },
      stuck: { argv: function() { return ["/usr/bin/sleep", "30"] }, parse: function(text, ok) { if (!ok) throw "timed out"; return text }, maxAgeMs: 60000, retryMs: 60000, timeoutMs: 1000 },
      // 5000 bytes from bash's own printf, under a cap of 1000 and of 10000:
      // the second read succeeding shows it is the cap that fails the first.
      big: { argv: function() { return ["/usr/bin/bash", "-c", "printf '%5000s' x"] }, parse: function(text, ok) { if (!ok) throw "too much"; return text.length },
             maxAgeMs: 60000, retryMs: 60000, maxBytes: 1000 },
      roomy: { argv: function() { return ["/usr/bin/bash", "-c", "printf '%5000s' x"] }, parse: function(text, ok) { if (!ok) throw "failed"; return text.replace(/\n$/, "").length },
               maxAgeMs: 60000, maxBytes: 10000 },
      chain: { argv: function(p) { return ["/usr/bin/bash", "-c", "sleep 0.3; printf %s \"$0\"", p] }, parse: function(text) { return text.trim() }, maxAgeMs: 60000 },
      side: { argv: function(p) { return ["/usr/bin/bash", "-c", "sleep 1.2; printf %s \"$0\"", p] }, parse: function(text) { return text.trim() }, maxAgeMs: 60000, concurrent: true }
    }
  })

  Requests { id: requests; providers: [test.provider]; env: ({}) }

  // While chain:a lands, c and d are asked: d, the newest, must be read,
  // not left pending behind the b that waited before (codex 2026-10-04).
  Connections {
    target: requests
    function onArrived(key) {
      if (key !== "chain:a") return
      requests.request("chain", "c")
      requests.request("chain", "d")
    }
  }

  Component.onCompleted: {
    check(requests.request("echo").state === "pending", "a first ask is pending")
    requests.request("broken")
    requests.request("slow", "p1")
    requests.request("slow", "p2")
    requests.request("slow", "p3")
    check(requests.request("slow", "p2", { fetch: false }).state === "pending", "p2 waits")
    requests.request("stuck")
    requests.request("big")
    requests.request("chain", "a")
    requests.request("chain", "b")
    requests.request("roomy")
    requests.request("side", "a")
    requests.request("side", "b")
    requests.request("side", "c")
    later.start()
  }

  Timer {
    id: later
    interval: 3000
    onTriggered: {
      var e = requests.request("echo")
      check(e.state === "ready" && e.value.length === 2 && e.value[1] === "b", "echo read a,b: " + JSON.stringify(e))
      var b = requests.request("broken")
      check(b.state === "error" && b.error === "failed", "a failed read is an error: " + JSON.stringify(b))
      var p1 = requests.request("slow", "p1", { fetch: false })
      var p3 = requests.request("slow", "p3", { fetch: false })
      check(p1.state === "ready" && p1.value === "p1", "p1 ran: " + JSON.stringify(p1))
      check(p3.state === "ready" && p3.value === "p3", "p3 ran after p1: " + JSON.stringify(p3))
      check(!requests.cache["slow:p2"], "p2, replaced while it waited, holds nothing")
      var s = requests.request("stuck")
      check(s.state === "error" && s.error === "timed out", "the deadline ends a read: " + JSON.stringify(s))
      var g = requests.request("big")
      check(g.state === "error" && g.error === "too much" && g.value === undefined, "output past the cap is a failure, never a cut value: " + JSON.stringify(g))
      var d = requests.request("chain", "d", { fetch: false })
      check(d.state === "ready" && d.value === "d", "a read asked while another lands is read: " + JSON.stringify(d))
      var r = requests.request("roomy")
      check(r.state === "ready" && r.value === 5000, "the same output under a larger cap reads whole: " + JSON.stringify(r))
      var sides = ["a", "b", "c"].map(function(p) { return requests.request("side", p, { fetch: false }) })
      check(sides.every(function(e, i) { return e.state === "ready" && e.value === ["a", "b", "c"][i] }),
            "a concurrent source reads its keys side by side (one at a time would take 3.6 s): " + JSON.stringify(sides))
      check(Object.keys(requests.readers).filter(function(k) { return k.indexOf("side:") === 0 }).length === 0,
            "a concurrent key's Reader is gone once its read lands: " + Object.keys(requests.readers).join(","))
      test.done(test.failures.length === 0, test.failures.join("; "))
    }
  }
}
