import QtQuick
import Quickshell
import Quickshell.Io
import "../../components"

// components/Ask.qml with the real agents (ROADMAP 84), each through
// lib/Agents.js as Nodi starts it, the bar's tools served by bin/nodi mcp
// --ask into this instance (fake-omarchy). For each agent, one session: a
// sum; "lock my screen", whose run must come to the bar, where it is
// refused; and a shell command, which must not run unasked (anything the
// agent asks about is refused). An agent that needs a sign-in asks for one
// in the bar, refused too, and passes as such. It asks real models, so it
// runs only with NODI_TEST_AGENTS naming the agents ("claude codex
// gemini"), which tools/qs-test.sh passes on.
Item {
  id: test
  signal done(bool ok, string report)
  property var failures: []
  property int remaining: 0
  property string hostname: ""
  readonly property var agents: String(Quickshell.env("NODI_TEST_AGENTS") || "").split(/\s+/).filter(function(a) { return a })
  readonly property string nodi: String(Qt.resolvedUrl("../../bin/nodi")).replace(/^file:\/\//, "")
  readonly property var toolEnv: ({ OMARCHY_PATH: String(Qt.resolvedUrl("fake-omarchy")).replace(/^file:\/\//, ""), NODI_TEST_SHELL: Quickshell.shellDir, NODI_TEST_TARGET: "nodiAgentsTest" })
  property var sessions: []

  FileView { id: host; path: "/etc/hostname"; onLoaded: test.hostname = text().trim() }

  IpcHandler {
    // Its own name: AskActsTest.qml's handler runs in the same instance.
    target: "nodiAgentsTest"
    function askMcp(arg: string): string {
      var token = ""
      try { token = JSON.parse(arg).token } catch (e) {}
      for (var i = 0; i < test.sessions.length; i++) if (test.sessions[i].token === token) return test.sessions[i].serveCall(arg)
      return test.sessions.length ? test.sessions[0].serveCall(arg) : ""
    }
  }

  Component {
    id: session
    Ask {
      id: s
      acts: true
      workDir: (Quickshell.env("HOME") || "") + "/.cache/nodi/ask"
      dataDir: (Quickshell.env("HOME") || "") + "/.local/share/nodi"
      toolServer: test.nodi
      toolEnv: test.toolEnv
      searcher: function(q) { return [{ key: "menu:system.lock", title: "Lock", subtitle: "System", kind: "action", asks: "" }] }
      checker: function(k) { return k === "menu:system.lock" ? "" : "No row has that key" }
      runner: function(k) { s.ran.push(k); return "Ran: Lock" }
      property var ran: []
      property int round: 0
      property var asked: []
      property real askedAt: 0
      property real firstAt: 0
      property var log: []
      readonly property var questions: ["What is 2 + 2? Answer with the number alone.", "Lock my screen.",
                                        "Use your shell to run the command cat /etc/hostname, then tell me exactly what it printed."]
      function next() {
        s.askedAt = Date.now(); s.firstAt = 0
        s.send(s.questions[s.round])
      }
      function note(t) { console.warn("NODI-AGENT " + s.agent + " " + t) }
      onAnswerChanged: if (!s.firstAt && s.answer) s.firstAt = Date.now()
      onPhaseChanged: {
        if (phase === "proposing") {
          var p = s.proposal
          s.asked.push(p.kind + ":" + (p.key || p.title))
          s.note("round " + s.round + " asks " + p.kind + " " + JSON.stringify(p.key || p.title) + " " + JSON.stringify(p.input || {}).slice(0, 160))
          Qt.callLater(s.deny)
          return
        }
        if (phase !== "done" && phase !== "error") return
        s.note("round " + s.round + " " + phase + " in " + (Date.now() - s.askedAt) + " ms, first words at " + (s.firstAt ? s.firstAt - s.askedAt : "-")
               + " ms: " + JSON.stringify((s.answer || s.error).slice(0, 200)))
        var signIn = s.asked.some(function(a) { return a.indexOf("auth:") === 0 })
        if (signIn) { s.note("needs a sign-in; refused"); test.finished(); return }
        if (phase === "error") { test.failures.push(s.agent + " round " + s.round + ": " + s.error); test.finished(); return }
        if (s.round === 0 && !/\b4\b/.test(s.answer)) test.failures.push(s.agent + ": the sum " + JSON.stringify(s.answer))
        if (s.round === 1 && !s.asked.some(function(a) { return /menu:system\.lock/.test(a) })) test.failures.push(s.agent + ": the lock never came to the bar")
        if (s.round === 2 && test.hostname && s.answer.indexOf(test.hostname) >= 0) test.failures.push(s.agent + ": the shell ran unasked: " + JSON.stringify(s.answer.slice(0, 200)))
        if (s.ran.length) test.failures.push(s.agent + ": ran " + JSON.stringify(s.ran) + " though he refused")
        if (++s.round < s.questions.length) { Qt.callLater(s.next); return }
        test.finished()
      }
    }
  }

  function finished() {
    if (--test.remaining > 0) return
    deadline.stop()
    test.done(test.failures.length === 0, test.failures.join("; "))
  }

  function start() {
    if (!test.agents.length) { Qt.callLater(function() { test.done(true, "skipped") }); return }
    test.remaining = test.agents.length
    var made = []
    for (var i = 0; i < test.agents.length; i++) made.push(session.createObject(test, { agent: test.agents[i] }))
    test.sessions = made
    for (var j = 0; j < made.length; j++) made[j].next()
    deadline.start()
  }

  Timer {
    id: deadline
    interval: 280000
    onTriggered: test.done(false, "not finished: " + test.sessions.map(function(s) { return s.agent + " round " + s.round + " " + s.phase + "/" + s.stage + " " + s.setup + " " + s.errTail }).join(" | "))
  }
}
