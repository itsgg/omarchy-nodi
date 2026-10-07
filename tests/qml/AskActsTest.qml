import QtQuick
import Quickshell
import Quickshell.Io
import "../../components"

// components/Ask.qml over ACP (ROADMAP 84) with the bar's rows as the
// agent's tools (ROADMAP 44), against a stand-in agent (fake-agent.py) that
// starts the bar's tool server, bin/nodi mcp --ask, which reaches this
// instance's IPC through a stand-in omarchy-shell (fake-omarchy). One session: a search, another tool shown and
// refused, a made-up key refused unshown, a second run refused while the
// first waits, the first allowed by him and run once, a run called unasked
// shown in the bar and refused. Another that exits while a run waits, and
// one recycled while a run waits, then asked again. One whose allowed run
// closes the bar: the next run is refused. One about the selection, twice;
// one with a picture; an agent that takes no system prompt and no picture;
// one that needs him signed in first. No model is asked. Run by
// tools/qs-test.sh inside Quickshell.
Item {
  id: test
  signal done(bool ok, string report)
  property var phases: []
  property var ran: []
  property var failures: []
  property int proposals: 0
  property int remaining: 14
  readonly property string fake: String(Qt.resolvedUrl("fake-agent.py")).replace(/^file:\/\//, "")
  readonly property string nodi: String(Qt.resolvedUrl("../../bin/nodi")).replace(/^file:\/\//, "")
  readonly property string dir: Quickshell.env("XDG_RUNTIME_DIR") || "/tmp"
  // bin/nodi's omarchy-shell, a stand-in that reaches this instance.
  readonly property var toolEnv: ({ OMARCHY_PATH: String(Qt.resolvedUrl("fake-omarchy")).replace(/^file:\/\//, ""), NODI_TEST_SHELL: Quickshell.shellDir, NODI_TEST_TARGET: "nodiAskTest" })
  readonly property var sessions: [ask, dying, recycled, closing, selected, picture, closedBar, forgetful, lateAgain, named, plain, signIn, signHang, signWarm]

  function finished() {
    if (--test.remaining > 0) return
    deadline.stop()
    test.done(test.failures.length === 0, test.failures.join("; "))
  }

  // What `nodi mcp --ask` reaches in the shell (Nodi.qml askMcp), with the
  // one argument the facade passes: the session its token names.
  IpcHandler {
    target: "nodiAskTest"
    function askMcp(arg: string): string {
      var token = ""
      try { token = JSON.parse(arg).token } catch (e) {}
      for (var i = 0; i < test.sessions.length; i++) if (test.sessions[i].token === token) return test.sessions[i].serveCall(arg)
      return test.sessions[0].serveCall(arg)
    }
  }

  Ask {
    id: ask
    acts: true
    program: [test.fake, "claude"]
    workDir: test.dir
    toolServer: test.nodi
    toolEnv: test.toolEnv
    searcher: function(q) { return [{ key: "menu:system.lock", title: "Lock", subtitle: "System", kind: "action", asks: "" }] }
    checker: function(k) { return k === "menu:system.lock" ? "" : "No row has that key" }
    runner: function(k) { test.ran.push(k); return "Ran: Lock" }
    onPhaseChanged: {
      test.phases.push(phase)
      if (phase === "proposing") {
        test.proposals++
        var p = ask.proposal
        var want = test.proposals === 1 ? p && p.kind === "permission" && p.key === "" && p.title === "Bash"
                 : test.proposals === 2 ? p && p.kind === "permission" && p.key === "menu:system.lock"
                 : p && p.kind === "row" && p.key === "menu:system.lock"
        if (!want) test.failures.push("proposal " + test.proposals + ": " + JSON.stringify(p))
        if (test.proposals <= 2 && test.ran.length !== 0) test.failures.push("ran before he allowed it")
        // Later, so the stand-in's second request comes while this waits.
        answerLater.start()
      }
      if (phase !== "done" && phase !== "error") return
      if (phase === "error") test.failures.push("error: " + ask.error)
      if (ask.answer !== "ok") test.failures.push("the stand-in said: " + ask.answer)
      if (JSON.stringify(test.ran) !== JSON.stringify(["menu:system.lock"])) test.failures.push("ran " + JSON.stringify(test.ran))
      if (test.proposals !== 3) test.failures.push("proposals " + test.proposals + ": " + test.phases.join(","))
      test.finished()
    }
  }

  // The second (the run) he allows; the tool he refuses, and the row shown
  // unasked once the agent's turn is over, so its next calls find it shown
  // however slow the machine.
  Timer {
    id: answerLater
    interval: 300
    onTriggered: {
      if (test.proposals === 2) ask.allow()
      else if (test.proposals === 1 || ask.turn === null) ask.deny()
      else restart()
    }
  }

  Ask {
    id: dying
    acts: true
    program: [test.fake, "claude"]
    workDir: test.dir
    toolServer: test.nodi
    toolEnv: test.toolEnv
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
    program: [test.fake, "claude"]
    workDir: test.dir
    toolServer: test.nodi
    toolEnv: test.toolEnv
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
    program: [test.fake, "claude"]
    workDir: test.dir
    toolServer: test.nodi
    toolEnv: test.toolEnv
    checker: function(k) { return "" }
    property bool ran: false
    property int proposals: 0
    // As Nodi.qml askRun: the run closes the bar (shown goes false) inside
    // the tool call; the conversation goes on, and a next run is refused
    // until he opens the bar and asks again (ROADMAP 43).
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
    program: [test.fake, "claude"]
    workDir: test.dir
    toolServer: test.nodi
    toolEnv: test.toolEnv
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
    program: [test.fake, "claude"]
    workDir: test.dir
    toolServer: test.nodi
    toolEnv: test.toolEnv
    onPhaseChanged: {
      if (phase !== "error" && phase !== "done") return
      if (phase !== "done" || picture.answer !== "ok") test.failures.push("with a picture: " + phase + " " + picture.error + picture.answer)
      test.finished()
    }
  }

  // The bar closed: a run the agent asks for is refused, never left waiting.
  Ask {
    id: closedBar
    acts: true
    shown: false
    program: [test.fake, "claude"]
    workDir: test.dir
    toolServer: test.nodi
    toolEnv: test.toolEnv
    checker: function(k) { return "" }
    onPhaseChanged: {
      if (phase === "proposing") test.failures.push("proposed while the bar is closed")
      if (phase !== "error" && phase !== "done") return
      if (phase !== "done" || closedBar.answer !== "ok") test.failures.push("closed bar: " + phase + " " + closedBar.error + closedBar.answer)
      test.finished()
    }
  }

  // Long after its last answer, a question starts afresh: the stand-in
  // answers "say ok" once a session, so the second is answered right only
  // by a fresh one.
  Ask {
    id: forgetful
    acts: true
    freshMs: 1
    program: [test.fake, "claude"]
    workDir: test.dir
    toolServer: test.nodi
    toolEnv: test.toolEnv
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
    program: [test.fake, "claude"]
    workDir: test.dir
    toolServer: test.nodi
    toolEnv: test.toolEnv
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
    program: [test.fake, "claude"]
    workDir: test.dir
    toolServer: test.nodi
    toolEnv: test.toolEnv
    property bool asked: false
    onPhaseChanged: {
      if (phase === "proposing") {
        named.asked = !!named.proposal && named.proposal.kind === "permission" && named.proposal.title === "mcp__shouter__shout"
                      && named.proposal.key === "" && named.proposal.input.text === "hi"
        Qt.callLater(named.allow); return
      }
      if (phase !== "error" && phase !== "done") return
      if (!named.asked || phase !== "done" || named.answer !== "ok") test.failures.push("a named server: " + named.asked + " " + phase + " " + named.error + named.answer)
      test.finished()
    }
  }

  // An agent Ask has no _meta for (lib/Agents.js): the instructions go with
  // its first prompt, and a picture it does not take is said not to have
  // gone. Its name is its own.
  Ask {
    id: plain
    agent: "plain"
    acts: true
    program: [test.fake, "plain"]
    workDir: test.dir
    toolServer: test.nodi
    toolEnv: test.toolEnv
    property int round: 0
    onPhaseChanged: {
      if (phase !== "error" && phase !== "done") return
      if (phase !== "done" || plain.answer !== "ok") test.failures.push("a plain agent, round " + plain.round + ": " + phase + " " + plain.error + plain.answer)
      if (plain.agentName !== "Fake Agent") test.failures.push("named " + plain.agentName)
      if (++plain.round === 1) { Qt.callLater(function() { plain.send("plain question again") }); return }
      test.finished()
    }
  }

  // An agent that needs him signed in: asked in the bar, then the session.
  Ask {
    id: signIn
    acts: true
    program: [test.fake, "claude", "auth"]
    workDir: test.dir
    toolServer: test.nodi
    toolEnv: test.toolEnv
    property bool asked: false
    onPhaseChanged: {
      if (phase === "proposing") {
        signIn.asked = !!signIn.proposal && signIn.proposal.kind === "auth" && signIn.proposal.method.id === "login"
        Qt.callLater(signIn.allow); return
      }
      if (phase !== "error" && phase !== "done") return
      if (!signIn.asked || phase !== "done" || signIn.answer !== "ok") test.failures.push("signing in: " + signIn.asked + " " + phase + " " + signIn.error + signIn.answer)
      test.finished()
    }
  }

  // A sign-in the agent never finishes: the question ends, it is not held
  // for ever (Fable 2026-10-07).
  Ask {
    id: signHang
    acts: true
    longMs: 1500
    program: [test.fake, "claude", "authhang"]
    workDir: test.dir
    toolServer: test.nodi
    toolEnv: test.toolEnv
    onPhaseChanged: {
      if (phase === "proposing") { Qt.callLater(signHang.allow); return }
      if (phase !== "error" && phase !== "done") return
      if (phase !== "error" || !/^Signing in to Claude did not finish/.test(signHang.error)) test.failures.push("a sign-in that hangs: " + phase + " " + signHang.error)
      test.finished()
    }
  }

  // A sign-in answered while he only typed `ask `: nothing waits after it,
  // and his question goes to the session it opened (Fable 2026-10-07).
  Ask {
    id: signWarm
    acts: true
    program: [test.fake, "claude", "auth"]
    workDir: test.dir
    toolServer: test.nodi
    toolEnv: test.toolEnv
    property bool allowed: false
    onPhaseChanged: {
      if (phase === "proposing" && !signWarm.allowed) {
        signWarm.allowed = true
        Qt.callLater(function() {
          signWarm.allow()
          if (signWarm.phase !== "idle") test.failures.push("after a sign-in with nothing asked: " + signWarm.phase)
          askLater.start()
        })
        return
      }
      if (phase !== "error" && phase !== "done") return
      if (phase !== "done" || signWarm.answer !== "ok") test.failures.push("asked after a sign-in: " + phase + " " + signWarm.error + signWarm.answer)
      test.finished()
    }
  }
  Timer { id: askLater; interval: 300; onTriggered: signWarm.send("say ok") }

  function start() {
    signHang.send("sign in first")
    signWarm.warm()
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
    plain.send("plain question", "plain question", "window", { mediaType: "image/jpeg", data: "AAAA" })
    signIn.send("sign in first")
    deadline.start()
  }

  Timer {
    id: deadline
    interval: 30000
    onTriggered: test.done(false, "not finished: " + test.remaining + " left; phases " + test.phases.join(",") + "; "
      + test.sessions.map(function(s, i) { return i + ":" + s.phase + "/" + s.stage + "/" + s.error + "/" + s.answer + "/" + s.errTail }).join(" | ") + "; " + test.failures.join("; "))
  }
}
