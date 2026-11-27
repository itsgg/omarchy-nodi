import QtQuick
import Quickshell
import Quickshell.Io
import "../.."
import "../../lib/Prefs.js" as Prefs

// An agent at its plan's usage limit (claude-agent-acp's "You've hit your
// 5-hour limit"), with "fallbackAgent" set: the failed turn shows the error
// as the agent said it and leads with the fallback agent's row; choosing it
// prepares the turn on that agent, and Enter sends it the message the
// failed turn sent: here about a selection, so the message is more than the
// question in the field.
Item {
  id: test
  signal done(bool ok, string report)
  property var failures: []
  readonly property string base: (Quickshell.env("XDG_RUNTIME_DIR") || "/tmp") + "/nodi-agent-fallback-" + Date.now()
  readonly property string fake: String(Qt.resolvedUrl("fake-agent.py")).replace(/^file:\/\//, "")
  readonly property string question: "echo the message about uv"
  readonly property string message: question + "\n\n<text>\nteh\n</text>"

  Nodi { id: nodi }

  function check(ok, what) { if (!ok) test.failures.push(what) }
  function rows() { return nodi.results.map(function(r) { return r.key }) }
  function row(key) {
    for (var i = 0; i < nodi.results.length; i++) if (nodi.results[i].key === key) return nodi.results[i]
    return null
  }

  function start() {
    setup.command = ["/usr/bin/bash", "-c", 'mkdir -p "$1" && ln -sf "$2" "$1/limited" && ln -sf "$2" "$1/free"',
                     "nodi-agent-fallback", test.base, test.fake]
    setup.running = true
    deadline.start()
  }

  Process {
    id: setup
    onExited: {
      // In memory: nothing of this reaches the real state file.
      nodi.prefsLoaded = false
      nodi.cacheReady = false
      nodi.configFiles.defaultConfig = {
        providers: ["ask"],
        fallbacks: [],
        ask: {
          agent: "limited",
          fallbackAgent: "free",
          agents: [
            { id: "limited", name: "Limited", command: [test.base + "/limited", "plain", "limited"] },
            { id: "free", name: "Free", command: [test.base + "/free", "plain"] }
          ]
        }
      }
      nodi.configFiles.userConfig = ({})
      nodi.prefs = Prefs.empty()
      nodi.agentAvailability = ({ limited: true, free: true })
      nodi.open("{}")
      nodi.selection = "teh"
      nodi.selectionSource = "selection"
      askNow.start()
    }
  }

  Timer {
    id: askNow
    interval: 0
    onTriggered: {
      nodi.doNodi({ nodi: "askWith", ask: { question: test.question, message: test.message, context: "selection", purpose: "ask" } })
      failed.start()
    }
  }

  Timer {
    id: failed
    interval: 20
    repeat: true
    property int ticks: 0
    onTriggered: {
      var ask = nodi.services().ask
      if ((ask.phase !== "error" || !test.row("ask:agent-fallback")) && ++ticks < 400) return
      stop()
      test.check(ask.phase === "error" && ask.agentId === "limited", "the limited turn did not fail: " + ask.phase + "/" + ask.agentId)
      test.check(/5-hour limit/.test(ask.error), "the limit was not said: " + ask.error)
      test.check(test.rows()[0] === "ask:agent-fallback", "the fallback agent did not lead: " + JSON.stringify(test.rows()))
      var fb = test.row("ask:agent-fallback")
      var err = test.row("ask:error")
      test.check(err && /^Could not ask: .*You've hit your 5-hour limit/.test(err.title), "the error row: " + JSON.stringify(err && err.title))
      test.check(fb && fb.subtitle === "Limited hit a limit; prepare it for Free", "the fallback row: " + JSON.stringify(fb && fb.subtitle))
      if (!fb) { cleanup.running = true; return }
      nodi.doNodi(fb)
      prepared.start()
    }
  }

  Timer {
    id: prepared
    interval: 100
    onTriggered: {
      var ask = nodi.services().ask
      test.check(nodi.resolvedAgent === "free", "the fallback did not switch to Free: " + nodi.resolvedAgent)
      test.check(nodi.input.text === "ask " + test.question, "the field: " + nodi.input.text)
      test.check(ask.phase === "idle" && ask.question === test.question && ask.message === test.message,
                 "the turn was not prepared on Free: " + ask.phase + "/" + ask.question + "/" + ask.message)
      // Enter on the prepared row.
      nodi.doNodi({ nodi: "ask" })
      sent.start()
    }
  }

  Timer {
    id: sent
    interval: 20
    repeat: true
    property int ticks: 0
    onTriggered: {
      var ask = nodi.services().ask
      if (ask.phase !== "done" && ask.phase !== "error" && ++ticks < 400) return
      stop()
      test.check(ask.phase === "done" && ask.agentId === "free", "Free did not answer: " + ask.phase + "/" + ask.agentId + "/" + ask.error)
      test.check(ask.answer === "got: " + test.message, "Free was not sent the message: " + JSON.stringify(ask.answer))
      nodi.dismiss()
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
    interval: 20000
    onTriggered: {
      var ask = nodi.services().ask
      test.failures.push("timed out at " + ask.phase + "/" + ask.agentId + "/" + ask.error)
      cleanup.running = true
    }
  }
}
