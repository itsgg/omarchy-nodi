import QtQuick
import Quickshell
import "../../components"

// components/Ask.qml with the bar's rows as Claude's tools (ROADMAP 44),
// against a stand-in for Claude (fake-claude.py) that plays the control
// channel. One session: the handshake before the question, a search
// allowed at once, another tool refused, a made-up key refused unshown, a
// run called unasked refused, a second run refused while the first waits,
// the first allowed by him and run once, the next refused by him. Another
// that exits while a run waits, and one recycled while a run waits, then
// asked again. One whose allowed run ends the session from inside the
// call, as the bar's run closes the bar, then is asked again. No model is
// asked. Run by tools/qs-test.sh inside Quickshell.
Item {
  id: test
  signal done(bool ok, string report)
  property var phases: []
  property var ran: []
  property var failures: []
  property int proposals: 0
  property int remaining: 4
  readonly property string fake: String(Qt.resolvedUrl("fake-claude.py")).replace(/^file:\/\//, "")
  readonly property string dir: Quickshell.env("XDG_RUNTIME_DIR") || "/tmp"

  function finished() {
    if (--test.remaining > 0) return
    deadline.stop()
    test.done(test.failures.length === 0, test.failures.join("; "))
  }

  Ask {
    id: ask
    acts: true
    program: test.fake
    workDir: test.dir
    searcher: function(q) { return [{ key: "menu:system.lock", title: "Lock", subtitle: "System", kind: "action", asks: "" }] }
    checker: function(k) { return k === "menu:system.lock" ? "" : "No row has that key" }
    runner: function(k) { test.ran.push(k); return "Ran: Lock" }
    onPhaseChanged: {
      test.phases.push(phase)
      if (phase === "proposing") {
        test.proposals++
        if (!ask.proposal || ask.proposal.key !== "menu:system.lock") test.failures.push("proposal " + JSON.stringify(ask.proposal))
        if (test.proposals === 1 && test.ran.length !== 0) test.failures.push("ran before he allowed it")
        // Later, so the stand-in's second request comes while this waits.
        answerLater.start()
      }
      if (phase !== "done" && phase !== "error") return
      if (phase === "error") test.failures.push("error: " + ask.error)
      if (ask.answer !== "ok") test.failures.push("the stand-in said: " + ask.answer)
      if (JSON.stringify(test.ran) !== JSON.stringify(["menu:system.lock"])) test.failures.push("ran " + JSON.stringify(test.ran))
      if (test.proposals !== 2) test.failures.push("proposals " + test.proposals + ": " + test.phases.join(","))
      test.finished()
    }
  }

  // The first run he allows, the second he refuses.
  Timer { id: answerLater; interval: 300; onTriggered: if (test.proposals === 1) ask.allow(); else ask.deny() }

  Ask {
    id: dying
    acts: true
    program: test.fake
    workDir: test.dir
    checker: function(k) { return "" }
    onPhaseChanged: {
      if (phase !== "error" && phase !== "done") return
      if (phase !== "error" || !/exit 3/.test(dying.error)) test.failures.push("a session that exits while a run waits: " + phase + " " + dying.error)
      if (dying.proposal !== null) test.failures.push("its run still waits after it exited")
      test.finished()
    }
  }

  Ask {
    id: recycled
    acts: true
    program: test.fake
    workDir: test.dir
    checker: function(k) { return "" }
    property bool again: false
    onPhaseChanged: {
      if (phase === "proposing" && !recycled.again) {
        recycled.again = true
        recycled.recycle()
        if (recycled.proposal !== null || recycled.phase !== "idle") test.failures.push("recycled with a run waiting: " + recycled.phase)
        recycled.send("say ok")
        return
      }
      if (phase !== "error" && phase !== "done") return
      if (phase !== "done" || recycled.answer !== "ok") test.failures.push("asked again after a recycle: " + phase + " " + recycled.error + recycled.answer)
      test.finished()
    }
  }

  Ask {
    id: closing
    acts: true
    program: test.fake
    workDir: test.dir
    checker: function(k) { return "" }
    property bool ran: false
    // As Nodi.qml askRun: the run closes the bar, which recycles the
    // session, inside the session's own call; a question then waits for
    // the fresh one.
    runner: function(k) { closing.ran = true; closing.recycle(); closing.send("say ok"); return "Ran: Lock; the bar closed" }
    onPhaseChanged: {
      if (phase === "proposing") { Qt.callLater(closing.allow); return }
      if (phase !== "error" && phase !== "done") return
      if (!closing.ran || phase !== "done" || closing.answer !== "ok") test.failures.push("recycled in the run: " + closing.ran + " " + phase + " " + closing.error + closing.answer)
      test.finished()
    }
  }

  function start() {
    closing.send("recycle in the run")
    ask.send("lock my screen")
    dying.send("exit while proposing")
    recycled.send("recycle while proposing")
    deadline.start()
  }

  Timer { id: deadline; interval: 20000; onTriggered: test.done(false, "not finished: " + test.remaining + " left; phases " + test.phases.join(",") + "; " + test.failures.join("; ")) }
}
