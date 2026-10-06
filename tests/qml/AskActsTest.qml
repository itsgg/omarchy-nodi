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
// asked again. One whose allowed run closes the bar from inside the call:
// the conversation goes on, and its next run is refused. One asked
// about the selection, with its text, twice: asked again, the text goes
// again (ROADMAP 47). No model is asked. Run by tools/qs-test.sh inside
// Quickshell.
Item {
  id: test
  signal done(bool ok, string report)
  property var phases: []
  property var ran: []
  property var failures: []
  property int proposals: 0
  property int remaining: 10
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
    property int proposals: 0
    // As Nodi.qml askRun: the run closes the bar (shown goes false) inside
    // the session's own call; the conversation goes on, and a next run is
    // refused until he opens the bar and asks again (ROADMAP 43).
    runner: function(k) { closing.ran = true; closing.shown = false; return "Ran: Lock. The bar closed." }
    onPhaseChanged: {
      if (phase === "proposing") { closing.proposals++; Qt.callLater(closing.allow); return }
      if (phase !== "error" && phase !== "done") return
      if (!closing.ran || closing.proposals !== 1 || phase !== "done" || closing.answer !== "ok")
        test.failures.push("the bar closed in the run: " + closing.ran + " " + closing.proposals + " " + phase + " " + closing.error + closing.answer)
      test.finished()
    }
  }


  Ask {
    id: selected
    acts: true
    program: test.fake
    workDir: test.dir
    property int round: 0
    onPhaseChanged: {
      if (phase !== "error" && phase !== "done") return
      if (phase !== "done" || selected.answer !== "ok") test.failures.push("about the selection, round " + selected.round + ": " + phase + " " + selected.error + selected.answer)
      if (selected.question !== "Fix the spelling and grammar of the selection" || selected.context !== "selection")
        test.failures.push("shown as " + JSON.stringify([selected.question, selected.context]))
      if (++selected.round === 1) { Qt.callLater(function() { selected.send("Fix the spelling and grammar of the selection") }); return }
      test.finished()
    }
  }

  // A question with the window's picture (ROADMAP 43).
  Ask {
    id: picture
    acts: true
    program: test.fake
    workDir: test.dir
    onPhaseChanged: {
      if (phase !== "error" && phase !== "done") return
      if (phase !== "done" || picture.answer !== "ok") test.failures.push("with a picture: " + phase + " " + picture.error + picture.answer)
      test.finished()
    }
  }

  // The bar closed: a run Claude asks for is refused, never left waiting.
  Ask {
    id: closedBar
    acts: true
    shown: false
    program: test.fake
    workDir: test.dir
    checker: function(k) { return "" }
    onPhaseChanged: {
      if (phase === "proposing") test.failures.push("proposed while the bar is closed")
      if (phase !== "error" && phase !== "done") return
      if (phase !== "done" || closedBar.answer !== "ok") test.failures.push("closed bar: " + phase + " " + closedBar.error + closedBar.answer)
      test.finished()
    }
  }

  // Long after its last answer, a question starts afresh: the stand-in
  // answers one question a process, so the second is answered only by a
  // fresh session.
  Ask {
    id: forgetful
    acts: true
    freshMs: 1
    program: test.fake
    workDir: test.dir
    property int round: 0
    onPhaseChanged: {
      if (phase !== "error" && phase !== "done") return
      if (phase !== "done" || forgetful.answer !== "ok") test.failures.push("afresh, round " + forgetful.round + ": " + phase + " " + forgetful.error + forgetful.answer)
      if (++forgetful.round === 1) { later.start(); return }
      test.finished()
    }
  }
  Timer { id: later; interval: 50; onTriggered: forgetful.send("say ok") }

  // Asked again long after, a question about the selection starts afresh
  // and still goes with its text (Fable 2026-10-06: the recycle forgot it).
  Ask {
    id: lateAgain
    acts: true
    freshMs: 1
    program: test.fake
    workDir: test.dir
    property int round: 0
    onPhaseChanged: {
      if (phase !== "error" && phase !== "done") return
      if (phase !== "done" || lateAgain.answer !== "ok") test.failures.push("asked again late, round " + lateAgain.round + ": " + phase + " " + lateAgain.error + lateAgain.answer)
      if (++lateAgain.round === 1) { againLater.start(); return }
      test.finished()
    }
  }
  Timer { id: againLater; interval: 50; onTriggered: lateAgain.send("Fix the spelling and grammar of the selection") }

  // A server he named (ROADMAP 49): its call waits for him, shown as a tool.
  Ask {
    id: named
    acts: true
    mcp: ({ shouter: { command: "shout" } })
    program: test.fake
    workDir: test.dir
    property bool asked: false
    onPhaseChanged: {
      if (phase === "proposing") {
        named.asked = named.proposal && named.proposal.kind === "tool" && named.proposal.server === "shouter" && named.proposal.tool === "shout"
        Qt.callLater(named.allow); return
      }
      if (phase !== "error" && phase !== "done") return
      if (!named.asked || phase !== "done" || named.answer !== "ok") test.failures.push("a named server: " + named.asked + " " + phase + " " + named.error + named.answer)
      test.finished()
    }
  }

  function start() {
    named.send("use the shouter")
    picture.send("What is in the picture?", "What is in the picture?", "window", { mediaType: "image/jpeg", data: "AAAA" })
    closedBar.send("while the bar is closed")
    forgetful.send("say ok")
    lateAgain.send("Fix the spelling and grammar of the selection",
                   "Fix the spelling and grammar of the text below. Reply with the result only.\n\n<text>\nteh\n</text>", "selection")
    closing.send("the bar closes in the run")
    selected.send("Fix the spelling and grammar of the selection",
                  "Fix the spelling and grammar of the text below. Reply with the result only.\n\n<text>\nteh\n</text>", "selection")
    ask.send("lock my screen")
    dying.send("exit while proposing")
    recycled.send("recycle while proposing")
    deadline.start()
  }

  Timer { id: deadline; interval: 20000; onTriggered: test.done(false, "not finished: " + test.remaining + " left; phases " + test.phases.join(",") + "; " + test.failures.join("; ")) }
}
