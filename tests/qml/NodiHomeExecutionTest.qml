import QtQuick
import Quickshell
import Quickshell.Io
import "../.."

// Held watched-home actions must be checked against the current trusted,
// unexpired source at the last execution boundary.
Item {
  id: test
  signal done(bool ok, string report)
  property var failures: []
  property int phase: 0
  property var heldRow: null
  property var heldAction: null
  property var heldSnapshot: null
  property string pendingLabel: ""
  property int afterVerify: 0
  readonly property string dir: (Quickshell.env("XDG_RUNTIME_DIR") || "/tmp") + "/nodi-home-execution-" + Date.now()
  readonly property string source: dir + "/home.jsonl"
  readonly property string marker: dir + "/ran-" + phase

  Nodi { id: nodi }

  function check(ok, what) { if (!ok) test.failures.push(what) }
  function homeRow() {
    for (var i = 0; i < nodi.results.length; i++)
      if (nodi.results[i].provider === "home") return nodi.results[i]
    return null
  }
  function writeRow(marker, expires) {
    var row = {
      id: "held", title: "Held watched action",
      action: { exec: ["/usr/bin/touch", marker] }
    }
    if (expires) row.expires = expires
    writer.command = ["/usr/bin/bash", "-c",
      'rm -f -- "$1"; umask 077; printf "%s\\n" "$2" > "$1"',
      "nodi-home-execution-write", test.source, JSON.stringify(row)]
    writer.running = true
  }
  function loseTrust(marker) {
    var row = {
      id: "held", title: "Held watched action",
      action: { exec: ["/usr/bin/touch", marker] }
    }
    writer.command = ["/usr/bin/bash", "-c",
      'printf "%s\\n" "$2" > "$1"; chmod 666 -- "$1"',
      "nodi-home-execution-untrust", test.source, JSON.stringify(row)]
    writer.running = true
  }
  function verifyAbsent(label, next) {
    test.pendingLabel = label
    test.afterVerify = next
    verifyDelay.restart()
  }
  function beginPaletteTrust() {
    test.phase = 1
    test.writeRow(test.dir + "/palette-trust", "")
  }
  function advance(next) {
    test.phase = next
    if (next === 4) {
      nodi.open("{}")
      test.writeRow(test.dir + "/palette-expiry", new Date(Date.now() + 6000).toISOString())
    } else if (next === 7) {
      nodi.open("{}")
      test.writeRow(test.dir + "/agent-trust", "")
    } else if (next === 10) {
      nodi.open("{}")
      test.writeRow(test.dir + "/agent-expiry", new Date(Date.now() + 6000).toISOString())
    }
    else if (next === 13) cleanup.running = true
  }

  Timer {
    id: poll
    interval: 25
    repeat: true
    onTriggered: {
      var row = test.homeRow()
      if (test.phase === 1 && row && row.run && !writer.running) {
        nodi.selectedIndex = nodi.results.indexOf(row)
        test.check(nodi.openPalette(), "the watched row had no action palette")
        test.heldRow = nodi.paletteRow
        test.heldAction = nodi.paletteActions[0]
        test.phase = 2
        test.loseTrust(test.dir + "/palette-trust")
      } else if (test.phase === 2 && row && !row.run && !writer.running) {
        test.check(!nodi.paletteOpen, "trust loss left the held action palette open")
        nodi.runAction(test.heldRow, test.heldAction)
        test.phase = 3
        test.verifyAbsent("palette trust loss", 4)
      } else if (test.phase === 4 && row && row.run && !writer.running) {
        nodi.selectedIndex = nodi.results.indexOf(row)
        test.check(nodi.openPalette(), "the expiring watched row had no action palette")
        test.heldRow = nodi.paletteRow
        test.heldAction = nodi.paletteActions[0]
        test.phase = 5
      } else if (test.phase === 5 && !row) {
        test.check(!nodi.paletteOpen, "expiry left the held action palette open")
        nodi.runAction(test.heldRow, test.heldAction)
        test.phase = 6
        test.verifyAbsent("palette expiry", 7)
      } else if (test.phase === 7 && row && row.run && !writer.running) {
        var searched = JSON.parse(nodi.search(""))
        test.check(searched.some(function(r) { return r.key === row.key }), "agent search did not cache the watched row")
        test.check(nodi.describeRow(row.key) !== "unknown row", "agent proposal did not capture the watched row")
        test.heldRow = row
        test.phase = 8
        test.loseTrust(test.dir + "/agent-trust")
      } else if (test.phase === 8 && row && !row.run && !writer.running) {
        test.check(nodi.runProposed(test.heldRow.key) !== "ok", "a trust-lost agent proposal reported success")
        test.phase = 9
        test.verifyAbsent("agent proposal trust loss", 10)
      } else if (test.phase === 10 && row && row.run && !writer.running) {
        var rows = nodi.askSearch("", "home-expiry-turn")
        test.check(rows.some(function(r) { return r.key === row.key }), "Ask search did not cache the watched row")
        var resolved = nodi.askResolve("key", row.key, "home-expiry-turn")
        test.check(resolved.ok, "Ask did not resolve the watched proposal: " + JSON.stringify(resolved))
        test.heldSnapshot = resolved.snapshot
        test.phase = 11
      } else if (test.phase === 11 && !row) {
        var result = nodi.askCommit(test.heldSnapshot)
        test.check(result.status === "failed", "an expired Ask proposal reported success: " + JSON.stringify(result))
        test.phase = 12
        test.verifyAbsent("agent proposal expiry", 13)
      }
    }
  }

  Timer {
    id: verifyDelay
    interval: 250
    onTriggered: {
      verifier.command = ["/usr/bin/test", "!", "-e", test.dir + "/"
        + (test.pendingLabel === "palette trust loss" ? "palette-trust"
          : test.pendingLabel === "palette expiry" ? "palette-expiry"
          : test.pendingLabel === "agent proposal trust loss" ? "agent-trust" : "agent-expiry")]
      verifier.running = true
    }
  }

  Process { id: writer }
  Process {
    id: verifier
    onExited: function(code) {
      test.check(code === 0, test.pendingLabel + " executed its stale watched action")
      test.advance(test.afterVerify)
    }
  }
  Process {
    id: setup
    onExited: {
      nodi.defaultConfig = {
        providers: [], fallbacks: [], teach: false,
        home: [{ id: "test", file: test.source, title: "Test", max: 4, priority: 0, trustedActions: true }]
      }
      nodi.userConfig = ({})
      nodi.open("{}")
      test.beginPaletteTrust()
      poll.start()
      deadline.start()
    }
  }
  Process {
    id: cleanup
    command: ["/usr/bin/rm", "-rf", "--", test.dir]
    onExited: {
      poll.stop()
      deadline.stop()
      test.done(test.failures.length === 0, test.failures.join("; "))
    }
  }
  Timer {
    id: deadline
    interval: 45000
    onTriggered: {
      test.failures.push("timed out in phase " + test.phase + " with row " + JSON.stringify(test.homeRow()))
      cleanup.running = true
    }
  }

  function start() {
    setup.command = ["/usr/bin/mkdir", "-p", "--", test.dir]
    setup.running = true
  }
}
