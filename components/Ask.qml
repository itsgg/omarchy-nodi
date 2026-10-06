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
  // The bar's rows as the session's only tools (lib/AskStream.js, ROADMAP
  // 44): `searcher(query)` returns rows as data, `checker(key)` says why a
  // key cannot run ("" when it can), `runner(key)` runs one and says what
  // happened. A run waits in `proposal` for allow() or deny(), and only the
  // key he allowed runs, once.
  property bool acts: false
  property var searcher: null
  property var checker: null
  property var runner: null
  // The program run in Claude's place: a test's stand-in; "claude" else.
  // The command is always AskStream.argv (tools/hygiene.mjs).
  property string program: ""

  // What the bar shows.
  property string question: ""
  // What the session was sent for it: the question, or the question with
  // what it is about (the selection's text); and what it is about.
  property string message: ""
  property string context: ""
  property string answer: ""
  property string phase: "idle"      // idle | waiting | streaming | proposing | done | error
  property string error: ""
  property var proposal: null        // { id, key, input } while a run waits for him
  property string allowed: ""        // the key he allowed, until it runs
  property bool inited: false        // the session has taken the bar's server

  property bool used: false          // this session has been asked something
  property bool started: false
  property string pending: ""        // asked before the process had started
  property bool recycling: false

  function warm() {
    if (!proc.running) {
      ask.inited = false
      proc.environment = { NODI_ASK_PROGRAM: ask.program || "claude" }
      proc.command = AskStream.argv(ask.model, ask.acts)
      proc.running = true
      startGuard.restart()
    }
    idle.restart()
  }

  // One question at a time: a second one while the first is answered would
  // take the rest of the first answer as its own (Fable 2026-10-02).
  function busy() { return ask.phase === "waiting" || ask.phase === "streaming" || ask.phase === "proposing" }

  // `message` and `context` default to the question and none; asked again
  // without them, a question goes with what it was sent with before.
  function send(q, message, context) {
    if (ask.busy()) return false
    var again = message === undefined && String(q) === ask.question
    ask.message = message !== undefined ? String(message) : again ? ask.message : String(q)
    ask.context = context !== undefined ? String(context) : again ? ask.context : ""
    ask.allowed = ""
    ask.question = String(q)
    ask.answer = ""
    ask.error = ""
    ask.phase = "waiting"
    ask.used = true
    // A session being recycled is still running until it exits: the
    // question waits for the fresh one (agy 2026-10-03).
    if (proc.running && ask.started && !ask.recycling && (ask.inited || !ask.acts)) proc.write(AskStream.message(ask.message))
    else { ask.pending = ask.message; if (!ask.recycling) ask.warm() }
    idle.restart()
    return true
  }

  // After a bar session that asked: a fresh session for the next question.
  function recycle() {
    if (!ask.used) return
    ask.used = false
    ask.pending = ""
    ask.question = ""
    ask.message = ""
    ask.context = ""
    ask.answer = ""
    ask.error = ""
    ask.phase = "idle"
    ask.allowed = ""
    // A run he never answered is refused, so the session is not left asking.
    if (ask.proposal) ask.deny()
    if (proc.running) { ask.recycling = true; proc.signal(15) }
  }

  // His answer to a run Claude proposed: Enter allows, Escape refuses.
  function allow() {
    var p = ask.proposal
    if (!p) return
    ask.proposal = null
    ask.allowed = p.key
    ask.phase = "streaming"
    proc.write(AskStream.reply(p.id, { behavior: "allow", updatedInput: p.input }))
  }

  function deny() {
    var p = ask.proposal
    if (!p) return
    ask.proposal = null
    if (ask.phase === "proposing") ask.phase = "streaming"
    proc.write(AskStream.reply(p.id, { behavior: "deny", message: "He refused it in the bar." }))
  }

  // The session asks the bar: a tool's permission, or a message for the
  // bar's own server.
  function control(ev) {
    var r = ev.request
    if (r.subtype === "can_use_tool") {
      var decided = AskStream.permission(r)
      if (decided) { proc.write(AskStream.reply(ev.id, decided)); return }
      var key = String((r.input && r.input.key) || "")
      // One run waits at a time, and only a row the bar can run is shown:
      // a second request would leave the first unanswered, a made-up key
      // an Enter that does nothing (Fable 2026-10-06).
      var why = ask.proposal ? "One run at a time: he has not answered the last one." : ask.checker ? ask.checker(key) : ""
      if (why) { proc.write(AskStream.reply(ev.id, { behavior: "deny", message: why })); return }
      ask.proposal = { id: ev.id, key: key, input: r.input || {} }
      ask.phase = "proposing"
      return
    }
    if (r.subtype === "mcp_message") {
      var handlers = {
        search: function(q) { return ask.searcher ? ask.searcher(q) : [] },
        // The key he allowed and no other, once: the permission asked
        // before is the only gate otherwise (Fable 2026-10-06).
        run: function(k) {
          if (!k || k !== ask.allowed) return "Not run: he has not allowed " + (k || "that") + "; ask with run first."
          ask.allowed = ""
          return ask.runner ? ask.runner(k) : "The bar cannot run rows here."
        }
      }
      proc.write(AskStream.reply(ev.id, { mcp_response: AskStream.mcp(r.message, handlers) }))
      return
    }
    proc.write(AskStream.reply(ev.id, {}))
  }

  // The session failed while he waited: the question ends with why, and a
  // run it proposed goes with it.
  function fail(why) {
    ask.pending = ""
    ask.proposal = null
    ask.allowed = ""
    // The reason first: the bar redraws on the phase.
    ask.error = why
    ask.phase = "error"
  }

  function handle(ev) {
    if (ev.kind === "control") { ask.control(ev); return }
    if (ev.kind === "controlDone" && ev.id === "nodi-init") {
      ask.inited = true
      if (ask.pending) { proc.write(AskStream.message(ask.pending)); ask.pending = "" }
      return
    }
    if (ev.kind === "text") { ask.answer += ev.text; if (ask.phase !== "proposing") ask.phase = "streaming" }
    else if (ev.kind === "done") {
      if (ev.error) { ask.error = ev.error; ask.phase = "error" }
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
      // With the bar's tools, its server first; the question waits for the
      // session to take it (lib/AskStream.js initialize).
      if (ask.acts) { proc.write(AskStream.initialize()); return }
      if (ask.pending) { proc.write(AskStream.message(ask.pending)); ask.pending = "" }
    }
    // A program that cannot start sends neither `started` nor `exited`, only
    // `running` going false: the question fails then, not 20 s later (Fable
    // 2026-10-04).
    onRunningChanged: {
      if (proc.running || ask.started) return
      startGuard.stop()
      ask.pending = ""
      if (ask.busy()) ask.fail("Claude could not start")
    }
    onExited: function(exitCode) {
      ask.started = false
      // A recycled session's exit is expected, and a question asked since
      // waits in `pending` for the fresh one.
      if (ask.recycling) { ask.recycling = false; ask.warm(); return }
      // While a run waits for him too: Enter would write to a dead session
      // (Fable 2026-10-06).
      if (ask.busy()) ask.fail("Claude stopped (exit " + exitCode + ")")
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
      if (ask.busy()) ask.fail("Claude did not start")
      proc.running = false
    }
  }

  Timer {
    id: idle
    interval: ask.idleMs
    onTriggered: if (proc.running && !ask.busy()) proc.signal(15)
  }

  Component.onDestruction: if (proc.running) proc.signal(15)
}
