import QtQuick
import Quickshell
import "../../components"

// components/Ask.qml with real questions to Haiku, through Claude's ACP
// adapter (lib/Agents.js, installed there on the first run): the answer streams,
// ends, and a recycle starts a fresh session; a question asked in the same
// turn as the recycle, while the old session is still dying, is answered
// by the new one; and one asked while the old session is still streaming
// gets its own answer alone, nothing of the old one in it. It spends four
// model calls, so it runs only with NODI_TEST_ASK=1 (tools/qs-test.sh
// passes the env on).
Item {
  id: test
  signal done(bool ok, string report)
  property var phases: []
  property int round: 1

  Ask {
    id: ask
    model: "haiku"
    workDir: Quickshell.env("XDG_RUNTIME_DIR") || "/tmp"
    dataDir: Quickshell.env("HOME") + "/.local/share/nodi"
    onPhaseChanged: test.phases.push(phase)
  }

  // Started by tools/qs-test.sh once it listens for `done`.
  function start() {
    if (!Quickshell.env("NODI_TEST_ASK")) { Qt.callLater(function() { test.done(true, "skipped") }); return }
    ask.send("What is the capital of Australia? Answer with the one word.")
    deadline.start()
  }

  Connections {
    target: ask
    function onPhaseChanged() {
      if (test.round === 3 && ask.phase === "streaming") {
        // Mid-answer: recycle and ask again in the same turn.
        test.round = 4
        ask.recycle()
        test.phases = []
        ask.send("What is 3 + 4? Answer with the number alone.")
        return
      }
      if (ask.phase !== "done" && ask.phase !== "error") return
      var f = []
      console.warn("NODI-ASK round " + test.round + " phases " + test.phases.join(",") + " answer " + JSON.stringify(ask.answer))
      if (ask.phase !== "done") f.push("round " + test.round + " ended " + ask.phase + ": " + ask.error)
      if (test.round === 1) {
        if (!/canberra/i.test(ask.answer)) f.push("answer: " + JSON.stringify(ask.answer))
        if (test.phases.indexOf("waiting") < 0) f.push("never waiting: " + test.phases.join(","))
        ask.recycle()
        if (ask.phase !== "idle" || ask.answer !== "") f.push("recycle left " + ask.phase)
        if (f.length) { deadline.stop(); test.done(false, f.join("; ")); return }
        test.round = 2
        test.phases = []
        // In the same turn as the recycle: the old session is certainly alive.
        ask.send("What is 2 + 3? Answer with the number alone.")
        return
      }
      if (test.round === 2) {
        if (!/\b5\b/.test(ask.answer)) f.push("second answer: " + JSON.stringify(ask.answer))
        if (f.length) { deadline.stop(); test.done(false, f.join("; ")); return }
        test.round = 3
        test.phases = []
        ask.recycle()
        ask.send("Write the numbers from 1 to 60, one per line, nothing else.")
        return
      }
      if (ask.answer.trim() !== "7") f.push("answer after a recycle mid-stream: " + JSON.stringify(ask.answer.slice(0, 120)))
      deadline.stop()
      test.done(f.length === 0, f.join("; "))
    }
  }

  Timer { id: deadline; interval: 90000; onTriggered: test.done(false, "no answer in 45 s, phases " + test.phases.join(",")) }
}
