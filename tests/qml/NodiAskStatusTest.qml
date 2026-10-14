import QtQuick
import Quickshell
import Quickshell.Io
import "../.."
import "../../lib/Prefs.js" as Prefs

// A waiting Ask row follows status-only startup transitions. In particular,
// becoming ready changes "Starting Alpha" to "Asking Alpha" before words,
// without a phase, activity or install change to refresh the rows.
Item {
  id: test
  signal done(bool ok, string report)
  property var failures: []
  readonly property string base: (Quickshell.env("XDG_RUNTIME_DIR") || "/tmp") + "/nodi-ask-status-" + Date.now()
  readonly property string fake: String(Qt.resolvedUrl("fake-agent.py")).replace(/^file:\/\//, "")

  Nodi { id: nodi }

  function check(ok, what) { if (!ok) failures.push(what) }
  function askRow() {
    for (var i = 0; i < nodi.results.length; i++)
      if (nodi.results[i].key === "ask:wait") return nodi.results[i]
    return null
  }

  function start() {
    setup.command = ["/usr/bin/bash", "-c", 'mkdir -p "$1"; ln -sf "$2" "$1/alpha"', "nodi-ask-status", base, fake]
    setup.running = true
    deadline.start()
  }

  Process {
    id: setup
    onExited: {
      nodi.defaultConfig = {
        providers: ["ask"],
        fallbacks: [],
        ask: {
          agent: "alpha",
          agents: [{ id: "alpha", name: "Alpha", command: [test.base + "/alpha", "plain", "installing"] }]
        }
      }
      nodi.userConfig = ({})
      nodi.prefs = Prefs.empty()
      nodi.agentAvailability = ({ alpha: true })
      nodi.open("{}")
      nodi.input.text = "ask wait before words"
      askNow.start()
    }
  }

  Timer {
    id: askNow
    interval: 0
    onTriggered: {
      nodi.doNodi({ nodi: "ask" })
      observe.start()
    }
  }

  Timer {
    id: observe
    interval: 20
    repeat: true
    property bool sawInstalling: false
    onTriggered: {
      var ask = nodi.services().ask
      if (/^Installing fake@1/.test(ask.status || "")) sawInstalling = true
      if (ask.phase === "waiting" && ask.status === "Asking Alpha") {
        stop()
        test.check(sawInstalling, "the fixture never crossed its setup-only status")
        var row = test.askRow()
        test.check(row && row.title === "Asking Alpha...",
                   "the row stayed stale while the pane said Asking Alpha: "
                   + JSON.stringify(row ? row.title : "no Ask row"))
        finish.start()
      }
    }
  }

  Timer {
    id: finish
    interval: 50
    repeat: true
    onTriggered: {
      if (nodi.services().ask.phase !== "done") return
      stop()
      cleanup.running = true
    }
  }

  Process {
    id: cleanup
    command: ["/usr/bin/rm", "-rf", "--", test.base]
    onExited: {
      deadline.stop()
      test.done(test.failures.length === 0, test.failures.join("; "))
    }
  }

  Timer {
    id: deadline
    interval: 12000
    onTriggered: {
      var ask = nodi.services().ask
      test.failures.push("timed out at " + ask.phase + "/" + ask.status)
      cleanup.running = true
    }
  }
}
