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
  property int remaining: 21
  readonly property string fake: String(Qt.resolvedUrl("fake-agent.py")).replace(/^file:\/\//, "")
  readonly property string nodi: String(Qt.resolvedUrl("../../bin/nodi")).replace(/^file:\/\//, "")
  readonly property string dir: Quickshell.env("XDG_RUNTIME_DIR") || "/tmp"
  // bin/nodi's omarchy-shell, a stand-in that reaches this instance.
  readonly property var toolEnv: ({ OMARCHY_PATH: String(Qt.resolvedUrl("fake-omarchy")).replace(/^file:\/\//, ""), NODI_TEST_SHELL: Quickshell.shellDir, NODI_TEST_TARGET: "nodiAskTest" })
  readonly property var sessions: [ask, dying, recycled, closing, selected, picture, closedBar, forgetful, lateAgain, named, plain, signIn, signHang, signWarm, installed, consent, own75, readyThenFails, flood, closed, named2]

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
    // What the bar says it waits on, in order (the pane, the row).
    property var statuses: []
    Component.onCompleted: statuses = [status]
    onStatusChanged: if (statuses[statuses.length - 1] !== status) statuses.push(status)
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
      // The tool he refused is said at the answer's end (2026-10-10).
      if (ask.answer !== "ok\n\n(Refused: Bash)") test.failures.push("the stand-in said: " + JSON.stringify(ask.answer))
      if (JSON.stringify(test.ran) !== JSON.stringify(["menu:system.lock"])) test.failures.push("ran " + JSON.stringify(test.ran))
      if (test.proposals !== 3) test.failures.push("proposals " + test.proposals + ": " + test.phases.join(","))
      var said = ask.statuses.join(" | ")
      if (!/^Starting Claude \| Asking Claude \| Searching the bar \|/.test(said + " |")) test.failures.push("what it said it waits on: " + said)
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

  // An adapter that installed as the session started: the bar says so
  // until the agent is up, and then what it is doing (Fable 2026-10-07:
  // "Installing" stayed for the whole session); the rest of the start has
  // its own time, not what the install left of it (its second pass). The
  // stand-in installs for 3 s and answers session/new 2 s later, against
  // a 3.5 s start limit (Fable: a second's margin either way).
  Ask {
    id: installed
    acts: true
    startMs: 3500
    program: [test.fake, "claude", "installing"]
    workDir: test.dir
    toolServer: test.nodi
    toolEnv: test.toolEnv
    property bool sawInstall: false
    onStatusChanged: if (/^Installing fake@1/.test(status)) sawInstall = true
    onPhaseChanged: {
      if (phase !== "error" && phase !== "done") return
      if (phase !== "done" || installed.answer !== "ok" || !installed.sawInstall || installed.status !== "Asking Claude")
        test.failures.push("after an install: " + phase + " " + installed.sawInstall + " " + JSON.stringify(installed.status) + " " + installed.error + installed.answer)
      test.finished()
    }
  }

  // An adapter not yet installed (lib/Agents.js ends with 75 unless
  // NODI_INSTALL=1, and says "nodi: adapter ready" before it runs one):
  // before any start the rows say an Enter installs it; warmed while a
  // question is typed, nothing installs, nothing fails, and typing on
  // starts nothing more; the question asked installs it, is answered, and
  // the rows stop saying so.
  Ask {
    id: consent
    acts: true
    program: ["/usr/bin/bash", "-c", '[ "${NODI_INSTALL-}" = 1 ] || { echo "nodi: fake@1 is not installed" >&2; exit 75; }; echo "nodi: adapter ready" >&2; exec "$0" claude', test.fake]
    workDir: test.dir
    toolServer: test.nodi
    toolEnv: test.toolEnv
    property int starts: 0
    property bool typed: false
    onStartedChanged: {
      if (started) { starts++; return }
      if (typed || starts !== 1) return
      typed = true
      // Once its exit is handled, as a keystroke after it would be.
      Qt.callLater(function() {
        if (consent.phase !== "idle" || consent.error) test.failures.push("a warm with nothing installed failed: " + consent.phase + " " + consent.error)
        if (!consent.install) test.failures.push("after a warm that did not install, the rows no longer say an Enter installs")
        consent.warm()
        if (consent.starts !== 1) test.failures.push("typing on started " + consent.starts + " sessions")
        consent.send("say ok")
      })
    }
    onPhaseChanged: {
      if (phase !== "error" && phase !== "done") return
      if (phase !== "done" || answer !== "ok" || install !== "" || starts !== 2)
        test.failures.push("asked after a warm that did not install: " + phase + " " + error + answer + " install " + JSON.stringify(install) + " starts " + starts)
      test.finished()
    }
  }

  // An agent of the adapter's that exits 75 for its own reasons, not the
  // launch script's word for "not installed": a warm that ends so is not
  // taken for an adapter to install, and the question fails, saying why
  // (not "adapter ready", the launch script's word before it), started
  // once, not again and again.
  Ask {
    id: own75
    program: ["/usr/bin/bash", "-c", 'echo "nodi: adapter ready" >&2; echo "out of quota" >&2; exit 75']
    workDir: test.dir
    property int starts: 0
    onStartedChanged: {
      if (started) { starts++; return }
      if (starts !== 1) return
      Qt.callLater(function() {
        if (own75.notInstalled !== "") test.failures.push("an agent's own exit 75 was taken for an adapter not installed")
        own75.send("say ok")
      })
    }
    onPhaseChanged: {
      if (phase !== "error" && phase !== "done") return
      if (phase !== "error" || !/out of quota/.test(error) || starts !== 2)
        test.failures.push("an agent's own exit 75: " + phase + " " + JSON.stringify(error) + " starts " + starts)
      test.finished()
    }
  }

  // Installed, then the session fails: the rows do not go on saying an
  // Enter installs it.
  Ask {
    id: readyThenFails
    program: ["/usr/bin/bash", "-c", 'echo "nodi: adapter ready" >&2; echo "nodi: no session" >&2; exit 1']
    workDir: test.dir
    onPhaseChanged: {
      if (phase !== "error" && phase !== "done") return
      if (phase !== "error" || install !== "") test.failures.push("ready, then a failed session: " + phase + " install " + JSON.stringify(install))
      test.finished()
    }
  }

  // A long answer: cut at the most an answer holds, said so, the turn
  // cancelled, and nothing it says after kept.
  Ask {
    id: flood
    program: [test.fake, "claude"]
    workDir: test.dir
    answerMax: 1000
    onPhaseChanged: {
      if (phase !== "error" && phase !== "done") return
      var body = answer.split("\n\n(Cut here")[0]
      if (phase !== "done" || body.length !== 1000 || !/\(Cut here: the answer ran past 1000 characters\.\)$/.test(answer) || /x$/.test(answer))
        test.failures.push("a long answer: " + phase + " " + error + " length " + answer.length + " " + JSON.stringify(answer.slice(-60)))
      test.finished()
    }
  }

  // The agent's environment: none of the shell's but what Ask names
  // (qs-test.sh exports NODI_TEST_INHERITED), the agent's own, and what
  // nodi.json adds by name.
  Ask {
    id: closed
    program: ["/usr/bin/bash", "-c", 'echo "nodi: inherited=${NODI_TEST_INHERITED-none} home=${HOME:+yes} path=${PATH:+yes} own=${CLAUDE_CODE_DISABLE_CLAUDE_MDS-none}" >&2; exit 1']
    workDir: test.dir
    onPhaseChanged: {
      if (phase !== "error" && phase !== "done") return
      if (error !== "Claude stopped: inherited=none home=yes path=yes own=1") test.failures.push("the agent's environment: " + JSON.stringify(error))
      test.finished()
    }
  }
  Ask {
    id: named2
    program: ["/usr/bin/bash", "-c", 'echo "nodi: inherited=${NODI_TEST_INHERITED-none}" >&2; exit 1']
    workDir: test.dir
    passed: ["NODI_TEST_INHERITED", "not a name"]
    onPhaseChanged: {
      if (phase !== "error" && phase !== "done") return
      if (error !== "Claude stopped: inherited=leak") test.failures.push("a variable nodi.json names: " + JSON.stringify(error))
      test.finished()
    }
  }

  function start() {
    flood.send("say a lot")
    closed.send("q")
    named2.send("q")
    if (!consent.install) test.failures.push("before any start, the rows do not say an Enter installs")
    consent.warm()
    own75.warm()
    readyThenFails.send("say ok")
    signHang.send("sign in first")
    installed.send("say ok")
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
