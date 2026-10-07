import QtQuick
import Quickshell
import "../../components"

// components/Requests.qml with real reads: a value arriving, the cache
// answering after, a failure, a deadline, output past its cap, a read
// queued behind another replaced by a newer one, reads asked while one
// lands, a concurrent source's keys read side by side, and a newer read
// ending the running one of a `supersede` source, program and all. Run by
// tools/qs-test.sh inside Quickshell.
Item {
  id: test
  signal done(bool ok, string report)
  property var failures: []
  property int step: 0
  property int sameArrivals: 0
  property real sameFirstAt: 0

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
      side: { argv: function(p) { return ["/usr/bin/bash", "-c", "sleep 1.2; printf %s \"$0\"", p] }, parse: function(text) { return text.trim() }, maxAgeMs: 60000, concurrent: true },
      // A script filter's shape: a newer read ends the running one, which
      // must then never reach its end (it would leave a marker), and the
      // program sees the session's PATH. Three seconds to its end, so the
      // ending has room on a loaded machine (2026-10-07: at a load of 20,
      // 1.2 s was not enough for a kill sent every 50 ms through pkill).
      typed: { argv: function(p) { return ["/usr/bin/bash", "-c", 'sleep 3; : > "$1/$0.done"; printf "%s %s" "$0" "$PATH"', p, test.marks] },
               parse: function(text) { return text.trim() }, maxAgeMs: 60000, supersede: true, sessionPath: true },
      marks: { argv: function() { return ["/usr/bin/ls", "-1", test.marks] }, parse: function(text) { return text.trim().split("\n").filter(Boolean) }, maxAgeMs: 0 },
      // What a source puts in its program's environment, for the read it
      // is for, and never in its arguments; its queued read keeps its own.
      secret: { argv: function(p) { return ["/usr/bin/bash", "-c", 'sleep 0.2; printf "%s|%s|%s" "$NODI_SECRET" "$#" "$HOME"'] },
                environment: function(p) { return { NODI_SECRET: "s-" + p } }, parse: function(text) { return text.trim() }, maxAgeMs: 60000, concurrent: false },
      // Read twice to the same text: the second lands without an arrival.
      same: { argv: function() { return ["/usr/bin/printf", "x"] }, parse: function(text) { return [text] }, maxAgeMs: 0 }
    }
  })

  readonly property string marks: (Quickshell.env("XDG_RUNTIME_DIR") || "/tmp") + "/nodi-requests-test-" + Date.now()

  Requests { id: requests; providers: [test.provider]; env: ({ path: "/nodi/test/bin:/usr/bin:/bin" }) }

  // While chain:a lands, c and d are asked: d, the newest, must be read,
  // not left pending behind the b that waited before (codex 2026-10-04).
  Connections {
    target: requests
    function onArrived(key) {
      if (key === "same") { test.sameArrivals++; test.sameFirstAt = requests.cache["same"].at }
      if (key !== "chain:a") return
      requests.request("chain", "c")
      requests.request("chain", "d")
    }
  }

  // Started by tools/qs-test.sh once it listens for `done`.
  function start() {
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
    Quickshell.execDetached(["/usr/bin/mkdir", "-p", test.marks])
    // Replaced before it starts, then replaced while it runs.
    requests.request("typed", "a")
    requests.request("typed", "b")
    requests.request("same")
    requests.request("secret", "a")
    requests.request("secret", "b")
    sameAgain.start()
    typedLater.began = Date.now()
    typedLater.start()
    sidesCheck.start()
    later.start()
  }

  // `c` replaces `b` while `b` runs: asked once `b` is running, however long
  // `a`'s end takes (Fable 2026-10-07: asked at a fixed 300 ms, under load
  // `b` was still queued, was dropped unrun, and the check passed without
  // the case it names).
  Timer {
    id: typedLater
    interval: 50
    repeat: true
    property real began: 0
    onTriggered: {
      var r = requests.readers["typed"]
      var bRuns = !!r && r.active && !!r.tag && r.tag.key === "typed:b"
      if (!bRuns && Date.now() - began < 3000) return
      stop()
      check(bRuns, "b ran, so its replacing is tested")
      requests.request("typed", "c")
    }
  }

  // Three reads of 1.2 s each, side by side, are all in by 2.2 s; one at a
  // time, at most the first would be (Fable 2026-10-07: checked at 3.8 s,
  // after the 3.6 s one at a time takes, it could not tell them apart).
  Timer {
    id: sidesCheck
    interval: 2200
    onTriggered: {
      var sides = ["a", "b", "c"].map(function(p) { return requests.request("side", p, { fetch: false }) })
      check(sides.every(function(e, i) { return e.state === "ready" && e.value === ["a", "b", "c"][i] }),
            "a concurrent source reads its keys side by side (one at a time would have one by now): " + JSON.stringify(sides))
      check(Object.keys(requests.readers).filter(function(k) { return k.indexOf("side:") === 0 }).length === 0,
            "a concurrent key's Reader is gone once its read lands: " + Object.keys(requests.readers).join(","))
    }
  }
  Timer { id: sameAgain; interval: 1500; onTriggered: requests.request("same") }

  Timer {
    id: later
    interval: 3800
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
      var sm = requests.request("same", "", { fetch: false })
      check(test.sameArrivals === 1 && sm.state === "ready" && sm.value[0].trim() === "x" && sm.at > test.sameFirstAt,
            "a second read of the same text lands without an arrival (Requests.same): " + test.sameArrivals + " " + JSON.stringify(sm))
      var sa = requests.request("secret", "a", { fetch: false }), sb = requests.request("secret", "b", { fetch: false })
      check(sa.state === "ready" && sa.value.indexOf("s-a|0|") === 0 && sb.state === "ready" && sb.value.indexOf("s-b|0|") === 0 && sa.value.split("|")[2] !== "",
            "a source's environment reaches its program, each read its own, the rest kept (HOME): " + JSON.stringify([sa, sb]))
      typedLast.start()
    }
  }

  // No fixed time (Fable 2026-10-07): `c` starts only once `b`'s program
  // has ended, so once `c` is in, an unstopped `b` has left its marker;
  // then the markers are read, and that read waited for. Fifteen seconds
  // for `c`, two for the read, each a loud failure past it.
  Timer {
    id: typedLast
    interval: 100
    repeat: true
    property int waited: 0
    property bool asked: false
    onTriggered: {
      waited++
      if (!asked) {
        if (requests.request("typed", "c", { fetch: false }).state !== "ready" && waited < 150) return
        asked = true
        waited = 0
        requests.request("marks")
        return
      }
      if (requests.request("marks", "", { fetch: false }).state !== "ready" && waited < 20) return
      stop()
      var tc = requests.request("typed", "c", { fetch: false })
      check(tc.state === "ready" && tc.value === "c /nodi/test/bin:/usr/bin:/bin", "the newest typed read lands, with the session's PATH: " + JSON.stringify(tc))
      check(!requests.cache["typed:a"] && !requests.cache["typed:b"], "the replaced reads hold nothing: " + Object.keys(requests.cache).filter(function(k) { return k.indexOf("typed") === 0 }).join(","))
      var m = requests.request("marks", "", { fetch: false })
      check(m.state === "ready" && m.value.indexOf("c.done") !== -1 && m.value.indexOf("a.done") === -1 && m.value.indexOf("b.done") === -1,
            "a replaced program never reached its end, before it started or while it ran: " + JSON.stringify(m))
      Quickshell.execDetached(["/usr/bin/rm", "-rf", "--", test.marks])
      test.done(test.failures.length === 0, test.failures.join("; "))
    }
  }
}
