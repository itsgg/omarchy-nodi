import QtQuick
import Quickshell
import Quickshell.Io
import "../../components"
import "../../lib/Agents.js" as Agents

// components/Ask.qml asks at its load whether Claude's adapter is in place
// (NODI_INSTALL=check, lib/Agents.js): one installed, its tree from the
// shipped lock, is ready without a start, and its rows no longer say an
// Enter installs it; one not installed still says so. The check starts no
// adapter (the stand-in tree's would leave a mark) and writes no settings
// file. Run by tools/qs-test.sh inside Quickshell.
Item {
  id: test
  signal done(bool ok, string report)
  property var failures: []
  readonly property string base: (Quickshell.env("XDG_RUNTIME_DIR") || "/tmp") + "/nodi-ready-test-" + Date.now()
  readonly property string adapters: String(Qt.resolvedUrl("../../lib/adapters")).replace(/^file:\/\//, "")

  function check(cond, what) { if (!cond) test.failures.push(what) }

  Ask { id: ready; agent: "claude" }
  Ask { id: missing; agent: "claude" }

  function start() {
    // Where the launch script looks, as spec() names it: the adapter's
    // folder, the shipped lock's, and its program.
    var argv = Agents.spec("claude", test.base + "/ready", "", "", [], test.adapters).argv
    var at = argv.indexOf("npm")
    // What the stand-in tree is, all of it: nothing else may appear.
    var d = argv[at + 1], agents = d.slice(0, d.lastIndexOf("/"))
    test.made = [agents, d, d + "/node_modules", d + "/node_modules/.bin", d + "/node_modules/.bin/" + argv[at + 5], d + "/package-lock.json"]
    setup.command = ["/usr/bin/bash", "-c",
      'set -e; mkdir -p "$1/node_modules/.bin" "$4"; cp -- "$2/package-lock.json" "$1/"; '
      + 'printf "#!/bin/sh\\ntouch \\"%s\\"\\n" "$4/ran" > "$1/node_modules/.bin/$3"; chmod +x "$1/node_modules/.bin/$3"',
      "nodi-ready-test", argv[at + 1], argv[at + 2], argv[at + 5], test.base]
    setup.running = true
  }

  Process {
    id: setup
    onExited: function(code) {
      if (code !== 0) { test.failures.push("the stand-in tree was not made"); finish(); return }
      ready.dataDir = test.base + "/ready"
      missing.dataDir = test.base + "/empty"
      wait.start()
    }
  }

  Timer {
    id: wait
    interval: 100
    repeat: true
    property int ticks: 0
    onTriggered: {
      var done = ready.checkedAdapter === ready.adapterKey && missing.checkedAdapter === missing.adapterKey
      if (!done && ++ticks < 100) return
      stop()
      check(done, "the checks did not end: " + ready.checkedAdapter + " / " + missing.checkedAdapter)
      check(ready.readyAdapter === ready.adapterKey && ready.install === "", "installed, yet the rows say an Enter installs it: " + ready.install)
      check(missing.install !== "" && missing.readyAdapter === "", "not installed, yet the rows do not say an Enter installs it")
      check(!ready.started && !missing.started, "a check started a session")
      look.running = true
    }
  }

  // Nothing ran the adapter, nothing was added to either data folder: no
  // lock, no settings file, not the empty one made (Cursor's review,
  // 2026-10-10: the top level alone hid a lock beside the tree).
  property var made: []
  Process {
    id: look
    command: ["/usr/bin/bash", "-c", '[ ! -e "$1/ran" ] || echo ran; [ ! -e "$1/empty" ] || echo empty; cd "$1/ready" && find . -mindepth 1', "nodi-ready-test", test.base]
    stdout: StdioCollector { id: seen }
    onExited: {
      var lines = seen.text.trim().split("\n")
      check(lines.indexOf("ran") === -1, "the check ran the adapter")
      check(lines.indexOf("empty") === -1, "the check made the empty data folder")
      var tree = test.made.map(function(p) { return "." + p.slice((test.base + "/ready").length) })
      check(JSON.stringify(lines.filter(function(l) { return l !== "ran" && l !== "empty" }).sort()) === JSON.stringify(tree.sort()),
            "the check changed the data folder: " + lines.join(" "))
      finish()
    }
  }

  function finish() { cleanup.running = true }

  Process {
    id: cleanup
    command: ["/usr/bin/rm", "-rf", "--", test.base]
    onExited: test.done(test.failures.length === 0, test.failures.join("; "))
  }
}
