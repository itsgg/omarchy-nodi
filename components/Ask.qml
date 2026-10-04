import QtQuick
import Quickshell.Io
import "../lib/AskStream.js" as AskStream

// A quick answer from Claude, held open so that asking costs the model's
// time and not Claude Code's start (about 1.5 s against 10 measured here,
// 2026-10-02). One session: started when the bar enters `ask `, so it warms
// while the question is typed; after a bar session that asked something it
// is replaced by a fresh one, so the next question starts with no context;
// an idle one stops after half an hour. lib/AskStream.js reads its output
// and holds the command.
Item {
  id: ask
  visible: false

  property string model: "haiku"
  property string workDir: ""
  property int idleMs: 30 * 60 * 1000

  // What the bar shows.
  property string question: ""
  property string answer: ""
  property string phase: "idle"      // idle | waiting | streaming | done | error
  property string error: ""

  property bool used: false          // this session has been asked something
  property bool started: false
  property string pending: ""        // asked before the process had started
  property bool recycling: false

  function warm() {
    if (!proc.running) {
      proc.command = AskStream.argv(ask.model)
      proc.running = true
      startGuard.restart()
    }
    idle.restart()
  }

  // One question at a time: a second one while the first is answered would
  // take the rest of the first answer as its own (Fable 2026-10-02).
  function busy() { return ask.phase === "waiting" || ask.phase === "streaming" }

  function send(q) {
    if (ask.busy()) return false
    ask.question = String(q)
    ask.answer = ""
    ask.error = ""
    ask.phase = "waiting"
    ask.used = true
    // A session being recycled is still running until it exits: the
    // question waits for the fresh one (agy 2026-10-03).
    if (proc.running && ask.started && !ask.recycling) proc.write(AskStream.message(ask.question))
    else { ask.pending = ask.question; if (!ask.recycling) ask.warm() }
    idle.restart()
    return true
  }

  // After a bar session that asked: a fresh session for the next question.
  function recycle() {
    if (!ask.used) return
    ask.used = false
    ask.pending = ""
    ask.question = ""
    ask.answer = ""
    ask.error = ""
    ask.phase = "idle"
    if (proc.running) { ask.recycling = true; proc.signal(15) }
  }

  function handle(ev) {
    if (ev.kind === "text") { ask.answer += ev.text; ask.phase = "streaming" }
    else if (ev.kind === "done") {
      if (ev.error) { ask.phase = "error"; ask.error = ev.error }
      else { if (!ask.answer) ask.answer = ev.text; ask.phase = "done" }
    }
  }

  Process {
    id: proc
    stdinEnabled: true
    workingDirectory: ask.workDir
    // A session being recycled may still print the end of the answer it
    // was giving; that is not the next question's (codex 2026-10-04).
    stdout: SplitParser { onRead: function(line) { if (!ask.recycling) ask.handle(AskStream.parse(line)) } }
    onStarted: {
      startGuard.stop()
      ask.started = true
      if (ask.pending) { proc.write(AskStream.message(ask.pending)); ask.pending = "" }
    }
    // A program that cannot start sends neither `started` nor `exited`, only
    // `running` going false: the question fails then, not 20 s later (Fable
    // 2026-10-04).
    onRunningChanged: {
      if (proc.running || ask.started) return
      startGuard.stop()
      ask.pending = ""
      if (ask.busy()) { ask.phase = "error"; ask.error = "Claude could not start" }
    }
    onExited: function(exitCode) {
      ask.started = false
      // A recycled session's exit is expected, and a question asked since
      // waits in `pending` for the fresh one.
      if (ask.recycling) { ask.recycling = false; ask.warm(); return }
      if (ask.phase === "waiting" || ask.phase === "streaming") { ask.phase = "error"; ask.error = "Claude stopped (exit " + exitCode + ")" }
    }
  }

  // A process that never starts sends no `exited`: the question fails
  // rather than waiting for ever, and the next one can be asked.
  Timer {
    id: startGuard
    interval: 20000
    onTriggered: {
      if (ask.started) return
      ask.pending = ""
      if (ask.busy()) { ask.phase = "error"; ask.error = "Claude did not start" }
      proc.running = false
    }
  }

  Timer {
    id: idle
    interval: ask.idleMs
    onTriggered: if (proc.running && ask.phase !== "waiting" && ask.phase !== "streaming") proc.signal(15)
  }

  Component.onDestruction: if (proc.running) proc.signal(15)
}
