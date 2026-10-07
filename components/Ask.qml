import QtQuick
import Quickshell.Io
import "../lib/Acp.js" as Acp
import "../lib/AskTools.js" as AskTools
import "../lib/Agents.js" as Agents

// A quick answer from a coding agent, held open over ACP (ROADMAP 84,
// lib/Acp.js), so that asking costs the model's time and not the agent's
// start. One session: started when the bar enters `ask `, so it warms
// while the question is typed. It is a conversation (ROADMAP 43): a
// question asked within ten minutes of the last answer follows it, across
// closes; later, or after "New question", a fresh session starts with no
// context; an idle one stops after half an hour. Which agent, and how it
// starts, is lib/Agents.js.
Item {
  id: ask
  visible: false

  // The agent, by Omarchy's name for it or as nodi.json gives his own
  // (lib/Agents.js), and the model asked of it ("" is the agent's own
  // choice, haiku for Claude).
  property var agent: "claude"
  property string model: ""
  property string workDir: ""
  // Where an adapter is installed (lib/Agents.js).
  property string dataDir: ""
  // bin/nodi, whose `mcp --ask` serves the bar's tools to the agent, and
  // what it is started with besides its session (a test's stand-in shell).
  property string toolServer: ""
  property var toolEnv: ({})
  property string version: ""
  property int idleMs: 30 * 60 * 1000
  // How long a session has to come up, and an adapter's install or a
  // sign-in he allowed (upGuard).
  property int startMs: 30000
  property int longMs: 5 * 60 * 1000
  // How long after its last answer a question still follows it.
  property int freshMs: 10 * 60 * 1000
  property real lastAt: 0
  // The bar is open (Nodi.qml binds it): a run the agent asks for can be
  // shown to him. Closed, it is refused, so no proposal waits where he
  // cannot see it.
  property bool shown: true
  // The bar's rows as two tools (lib/AskTools.js, ROADMAP 44):
  // `searcher(query)` returns rows as data, `checker(key)` says why a key
  // cannot run ("" when it can), `runner(key)` runs one and says what
  // happened. A row runs at once only when he allowed it through the
  // agent's question; else the run shows it in the bar, for his Enter.
  property bool acts: false
  // MCP servers he named (AskTools.servers): each call to one of their
  // tools the agent asks about waits in `proposal` for him too (ROADMAP 49).
  property var mcp: ({})
  property var searcher: null
  property var checker: null
  property var runner: null
  // A test's stand-in agent: its command, run as it is; else the agent's.
  property var program: null

  // What the agent is told, and the MCP servers it is given by name: some
  // agents take both at their start (lib/Agents.js).
  readonly property bool named: ask.acts && Object.keys(ask.mcp || {}).length > 0
  readonly property string instructions: AskTools.instructions(ask.acts, ask.named)
  readonly property var serverNames: ask.acts ? (ask.toolServer ? [AskTools.SERVER] : []).concat(Object.keys(ask.mcp || {})) : []
  readonly property var spec: Agents.spec(ask.agent, ask.dataDir, ask.model, ask.instructions, ask.serverNames)
  // What the bar says while it waits for words (providers/ask.js, the
  // pane): what the start is doing, else what the agent is doing.
  readonly property string status: ask.setup ? ask.setup
    : ask.signingIn ? "Signing in to " + ask.agentName
    : ask.recycling || ask.stage !== "ready" ? "Starting " + ask.agentName
    : ask.activity === "thinking" ? "Thinking"
    : ask.activity ? ask.activity
    : "Asking " + ask.agentName

  // What the bar calls the agent: Omarchy's name for it, else what it
  // calls itself (a stand-in), else the name it was asked by.
  property string agentTitle: ""
  readonly property string agentName: ask.spec ? ask.spec.name : ask.agentTitle || ask.agent
  readonly property string modelName: ask.spec ? ask.spec.model : ask.model
  // What a session starts with: a change (another agent or model, actions,
  // servers) restarts an idle session, so the next question has it (Fable
  // 2026-10-06: an added server waited for a fresh conversation).
  readonly property string launchKey: JSON.stringify([ask.agent, ask.model, ask.acts, ask.mcp, ask.program, ask.dataDir, ask.toolServer])
  onLaunchKeyChanged: if (proc.running && !ask.busy() && !ask.recycling) ask.restart()

  // What the bar shows.
  property string question: ""
  // What the agent was sent for it: the question, or the question with
  // what it is about (the selection's text); and what it is about.
  property string message: ""
  property string context: ""
  property var image: null           // { mediaType, data } sent with the question
  property string answer: ""
  property string phase: "idle"      // idle | waiting | streaming | proposing | done | error
  property string error: ""
  // What waits for his Enter or Escape: the agent asking to use a tool
  // ("permission", a row of the bar's when its input names one), a row
  // the bar's run tool showed ("row"), or a sign-in ("auth").
  property var proposal: null
  property string allowed: ""        // the row he allowed, until it runs
  property string activity: ""       // what the agent is doing: "thinking", or a tool, in words (AskTools.doing)
  property string setup: ""          // what the start does first: an adapter installing
  property bool signingIn: false     // an authenticate he allowed, not yet answered

  property bool used: false          // this session has been asked something
  property bool started: false
  property bool recycling: false
  // A start that failed, still exiting: its exit is not the next question's.
  property bool ending: false
  // The session: off, init (initialize sent), session (session/new sent),
  // config (its mode or model being set), ready, or failed.
  property string stage: "off"
  property string sessionId: ""
  property var caps: null
  property int nextId: 0
  property var waits: ({})           // request id: what it asked
  property var turn: null            // the open session/prompt's id
  property var calls: ({})           // this turn's tool calls, by id
  property bool afterTool: false     // a tool ran since the last text
  property var pending: null         // { text, image } waiting for the session
  property string token: ""          // names this session to the bar's tool server
  property bool instructed: false    // the instructions have gone, at the start or with a prompt
  property string errTail: ""

  // Long after its last answer, the conversation is over: the next
  // question starts a fresh session.
  function stale() { return ask.used && ask.lastAt > 0 && Date.now() - ask.lastAt > ask.freshMs && !ask.busy() }

  // One question at a time: a second one while the first is answered would
  // take the rest of the first answer as its own (Fable 2026-10-02).
  function busy() { return ask.phase === "waiting" || ask.phase === "streaming" || ask.phase === "proposing" }

  // When a start last failed: typing does not start another for ten
  // seconds, asking does.
  property real failedAt: 0

  function warm() {
    // Afresh while he types, so the fresh session is up when he asks
    // (Fable 2026-10-06: recycled at the send, it waited for a start).
    if (ask.stale()) ask.recycle()
    if (!ask.busy() && Date.now() - ask.failedAt < 10000) return
    if (!proc.running && !ask.recycling && !ask.ending) {
      var argv = ask.program || (ask.spec && ask.spec.argv)
      if (!argv) { if (ask.busy()) ask.fail("Ask cannot hold the agent " + JSON.stringify(ask.agent) + ": it knows " + Agents.known().join(", ") + ", or one given by its command"); return }
      ask.resetSession()
      ask.token = ask.newToken()
      ask.stage = "init"
      proc.environment = ask.spec ? ask.spec.env : {}
      proc.command = argv
      proc.running = true
      upGuard.since = Date.now()
      upGuard.restart()
    }
    idle.restart()
  }

  function newToken() {
    var t = ""
    for (var i = 0; i < 4; i++) t += Math.floor(Math.random() * 0x100000000).toString(16)
    return t
  }

  function resetSession() {
    ask.stage = "off"
    ask.sessionId = ""
    ask.caps = null
    ask.waits = ({})
    ask.turn = null
    ask.calls = ({})
    ask.token = ""
    ask.instructed = false
    ask.errTail = ""
    ask.setup = ""
    ask.agentTitle = ""
    ask.activity = ""
    ask.signingIn = false
  }

  // A request to the agent, remembered by its id with what it asked.
  function toAgent(kind, make) {
    var id = ask.nextId++
    ask.waits[id] = kind
    proc.write(make(id))
    return id
  }

  // `message` and `context` default to the question and none; asked again
  // without them, a question goes with what it was sent with before.
  function send(q, message, context, image) {
    if (ask.busy()) return false
    // Asked again, a question goes with what it was sent with before, read
    // before a fresh start forgets it (Fable 2026-10-06).
    var again = message === undefined && String(q) === ask.question
    var kept = again ? { message: ask.message, context: ask.context, image: ask.image } : null
    // Long after the last answer, a question starts a conversation afresh.
    if (ask.stale()) ask.recycle()
    ask.message = message !== undefined ? String(message) : kept ? kept.message : String(q)
    ask.context = context !== undefined ? String(context) : kept ? kept.context : ""
    ask.image = image !== undefined ? image : kept ? kept.image : null
    ask.allowed = ""
    ask.question = String(q)
    ask.answer = ""
    ask.error = ""
    ask.phase = "waiting"
    ask.used = true
    ask.pending = { text: ask.message, image: ask.image }
    // A session being recycled is still running until it exits: the
    // question waits for the fresh one (agy 2026-10-03).
    if (ask.stage === "ready" && !ask.recycling) ask.flush()
    else if (!ask.recycling) ask.warm()
    idle.restart()
    return true
  }

  // The question waiting, sent once the session is up: the picture when the
  // agent takes pictures, else a word that it could not go; the
  // instructions first when the agent took none with the session.
  function flush() {
    var p = ask.pending
    if (!p || ask.stage !== "ready") return
    ask.pending = null
    var image = p.image && ask.caps.image ? p.image : null
    var text = p.text + (p.image && !image ? "\n\n(The picture could not be sent: " + ask.agentName + " takes none.)" : "")
    ask.calls = ({})
    ask.afterTool = false
    var preface = ask.instructed ? "" : ask.instructions
    ask.instructed = true
    ask.turn = ask.toAgent("prompt", function(id) { return Acp.prompt(id, ask.sessionId, text, image, preface) })
  }

  // A fresh session for the next question: "New question", or long after
  // the last answer.
  function recycle() {
    if (!ask.used) return
    ask.used = false
    ask.lastAt = 0
    ask.pending = null
    ask.question = ""
    ask.message = ""
    ask.context = ""
    ask.image = null
    ask.answer = ""
    ask.error = ""
    ask.phase = "idle"
    ask.allowed = ""
    // A request he never answered is refused, so the agent is not left asking.
    if (ask.proposal) ask.deny()
    ask.phase = "idle"
    if (proc.running) ask.restart()
  }

  // The session ends, and the bar's tool server with it: a call it makes
  // after this reaches nothing (serve).
  function restart() {
    ask.recycling = true
    ask.token = ""
    ask.stop()
  }

  // TERM, then KILL three seconds later if this process still runs: an
  // agent that ignores TERM would hold `recycling` or `ending` for ever,
  // and no session could start (Fable 2026-10-07).
  function stop() {
    killGuard.pid = proc.processId || 0
    proc.signal(15)
    killGuard.restart()
  }

  // The bar closed: a request waiting for him is refused, as one asked for
  // while it stays closed will be; the conversation goes on.
  function hidden() {
    if (ask.proposal) ask.deny()
  }

  // After his answer, the phase the question is in.
  function settle() {
    if (ask.phase !== "proposing") return
    ask.phase = ask.turn !== null ? (ask.answer ? "streaming" : "waiting") : "done"
  }

  // His answer to what waits: Enter allows, Escape refuses.
  function allow() {
    var p = ask.proposal
    if (!p) return
    ask.proposal = null
    if (p.kind === "permission") {
      // A row of the bar's runs by the key he allowed, once, when the
      // agent's call to the bar's run comes (serve).
      if (p.key) ask.allowed = p.key
      proc.write(Acp.result(p.id, Acp.choose(p.options, true)))
    } else if (p.kind === "row") {
      if (ask.runner) ask.runner(p.key)
    } else if (p.kind === "auth") {
      // Waiting only for a question asked: a sign-in answered while he
      // typed leaves nothing to wait for (Fable 2026-10-07: it stuck), and
      // what was on screen, an answer or why one failed, stays.
      ask.phase = ask.pending ? "waiting" : ask.error ? "error" : ask.answer ? "done" : "idle"
      // The agent's sign-in has five minutes, then the question ends
      // (Fable 2026-10-07: unguarded, one never answered held it for ever).
      ask.signingIn = true
      upGuard.since = Date.now()
      upGuard.restart()
      ask.toAgent("auth", function(id) { return Acp.authenticate(id, p.method.id) })
      return
    }
    ask.settle()
  }

  function deny() {
    var p = ask.proposal
    if (!p) return
    ask.proposal = null
    if (p.kind === "permission") proc.write(Acp.result(p.id, Acp.choose(p.options, false)))
    else if (p.kind === "auth") { ask.fail("Not signed in to " + ask.agentName); return }
    ask.settle()
  }

  // The session failed while he waited: the question ends with why, and a
  // request it made goes with it. A session that never came up is ended,
  // so the next question starts one afresh.
  function fail(why) {
    ask.pending = null
    var p = ask.proposal
    ask.proposal = null
    if (p && p.kind === "permission" && proc.running) proc.write(Acp.result(p.id, Acp.choose(p.options, false)))
    ask.allowed = ""
    ask.activity = ""
    // The reason first: the bar redraws on the phase.
    ask.error = String(why)
    ask.phase = "error"
    // Not a recycle, which would start the next session at once: the next
    // question does.
    if (ask.stage !== "ready" && proc.running && !ask.recycling) {
      ask.stage = "failed"
      ask.token = ""
      ask.failedAt = Date.now()
      ask.ending = true
      ask.stop()
    }
  }

  // ---------------------------------------------------------------- the agent's side

  function handle(line) {
    if (ask.stage === "failed") return
    var m = Acp.parse(line)
    if (m.kind === "response") {
      var kind = ask.waits[m.id]
      delete ask.waits[m.id]
      if (kind !== undefined) ask.agentAnswers(kind, m)
    } else if (m.kind === "request") ask.agentAsks(m)
    else if (m.kind === "notification" && m.method === "session/update") ask.agentSays(m.params)
  }

  // An answer to one of Nodi's requests.
  function agentAnswers(kind, m) {
    var why = m.error ? m.error.message || ("error " + m.error.code) : ""
    if (kind === "init") {
      // An adapter that installed is up: its install is over (Fable
      // 2026-10-07: the status said "Installing" for the whole session),
      // and the rest of the start has its own time again, as after a
      // sign-in (Fable's second pass: a long install then failed the start).
      if (ask.setup) {
        ask.setup = ""
        upGuard.since = Date.now()
        upGuard.restart()
      }
      if (why) { ask.fail(ask.agentName + " did not start: " + why); return }
      ask.caps = Acp.capabilities(m.result)
      if (ask.caps.version !== Acp.VERSION) { ask.fail(ask.agentName + " speaks ACP " + ask.caps.version + "; Nodi speaks " + Acp.VERSION); return }
      ask.agentTitle = ask.caps.name
      ask.openSession()
    } else if (kind === "session") {
      if (m.error && m.error.code === Acp.AUTH_REQUIRED) { ask.signIn(why); return }
      if (why || !m.result || typeof m.result.sessionId !== "string") { ask.fail(ask.agentName + " could not start a session: " + (why || "no session")); return }
      ask.sessionId = m.result.sessionId
      // The mode Ask needs, and the model asked for, before any question.
      var want = Acp.configure(ask.sessionId, m.result, ask.spec ? ask.spec.mode : "",
                               ask.spec && !ask.spec.modelInMeta ? ask.model : "")
      if (want.error) { ask.fail(ask.agentName + " could not start as Ask needs: " + want.error); return }
      ask.stage = "config"
      ask.configuring = want.requests.length
      want.requests.forEach(function(q) {
        ask.toAgent("config:" + q.what, function(id) { return Acp.request(id, q.method, q.params) })
      })
      if (!ask.configuring) ask.sessionUp()
    } else if (kind.indexOf("config:") === 0) {
      if (why) { ask.fail(ask.agentName + " could not set its " + kind.slice(7) + ": " + why); return }
      if (--ask.configuring === 0) ask.sessionUp()
    } else if (kind === "auth") {
      ask.signingIn = false
      if (why) { ask.fail("Signing in to " + ask.agentName + " failed: " + why); return }
      // Signed in: the session has its own time again to come up.
      upGuard.since = Date.now()
      upGuard.restart()
      ask.openSession()
    } else if (kind === "prompt") {
      // The agent echoes the id it was given; a string for a number is
      // still this turn's answer.
      if (String(m.id) !== String(ask.turn)) return
      ask.turn = null
      ask.activity = ""
      ask.lastAt = Date.now()
      // The agent's own words, when it said why before failing (Codex says
      // "out of credits", then fails with "Internal error").
      if (why) { ask.fail(ask.answer.trim() ? ask.answer.trim().split("\n")[0].slice(0, 300) : why); return }
      var stop = Acp.stopped(m.result && m.result.stopReason)
      if (stop && !ask.answer) { ask.fail(stop); return }
      if (stop) ask.answer += "\n\n(" + stop + ")"
      // A row the bar's run showed waits for him after the answer ends.
      ask.phase = ask.proposal ? "proposing" : "done"
    }
  }

  property int configuring: 0

  function openSession() {
    var servers = []
    var env = { NODI_ASK_SESSION: ask.token }
    for (var k in ask.toolEnv || {}) env[k] = ask.toolEnv[k]
    if (ask.acts && ask.toolServer) servers.push(Acp.stdioServer(AskTools.SERVER, ask.toolServer, ["mcp", "--ask"], env))
    if (ask.acts) servers = servers.concat(Acp.servers(ask.mcp, ask.caps.http))
    var meta = ask.spec && ask.spec.meta ? ask.spec.meta(ask.acts) : null
    // Instructions that went with the start do not go again with a prompt.
    ask.instructed = !!ask.spec && ask.spec.instructs
    ask.stage = "session"
    ask.toAgent("session", function(id) { return Acp.newSession(id, ask.workDir, servers, meta) })
  }

  function sessionUp() {
    ask.stage = "ready"
    upGuard.stop()
    ask.flush()
  }

  // The agent needs him signed in: he is asked in the bar, by its first
  // way of signing in, when the bar is open to ask him; else it fails
  // with what the agent said.
  function signIn(said) {
    // His time, not the start's: a browser sign-in takes what it takes.
    upGuard.stop()
    var methods = ask.caps ? ask.caps.auth : []
    if (!methods.length || !ask.shown || ask.proposal) {
      ask.fail(ask.agentName + " needs you signed in" + (said ? " (" + said + ")" : "") + ": run it once in a terminal")
      return
    }
    ask.proposal = { kind: "auth", method: methods[0], title: "Sign in to " + ask.agentName + ": " + methods[0].name,
                     subtitle: methods[0].description || said, at: Date.now() }
    ask.phase = "proposing"
  }

  // A request from the agent: a permission, or what Nodi does not offer
  // (files, a terminal, anything else), which it should not have asked.
  function agentAsks(m) {
    if (m.method === "session/request_permission") { ask.permission(m); return }
    proc.write(Acp.failure(m.id, Acp.NOT_FOUND, "Nodi does not offer " + m.method))
  }

  // The agent asks before a tool runs. The bar's search is allowed at once;
  // its run is shown as the row, or refused unshown when the bar cannot run
  // that key (Fable 2026-10-06: a made-up key was an Enter that did
  // nothing); any other tool is shown with its name and input. One waits
  // at a time, and only while the bar is open to show it.
  function permission(m) {
    var p = m.params || {}
    var tc = p.toolCall && typeof p.toolCall === "object" ? p.toolCall : {}
    var refuse = function() { proc.write(Acp.result(m.id, Acp.choose(p.options, false))) }
    if (ask.recycling || p.sessionId !== ask.sessionId) { refuse(); return }
    var call = Acp.mergeCall(ask.calls[tc.toolCallId], tc)
    var input = call.rawInput === undefined || call.rawInput === null ? {} : call.rawInput
    // Kept with what the request carries, its input often first here.
    if (tc.toolCallId !== undefined) {
      ask.calls[String(tc.toolCallId)] = call
      ask.activity = AskTools.doing(call)
    }
    var own = AskTools.barTool(call)
    if (own === "search") { proc.write(Acp.result(m.id, Acp.choose(p.options, true))); return }
    if (!ask.shown || ask.proposal) { refuse(); return }
    var key = own === "run" && typeof input.key === "string" ? input.key : ""
    if (own === "run" && (!key || (ask.checker && ask.checker(key) !== ""))) { refuse(); return }
    ask.proposal = { kind: "permission", id: m.id, options: p.options, key: key, title: Acp.title(call), input: input, at: Date.now() }
    ask.phase = "proposing"
  }

  // What the agent says as it works: the answer's text, and its tool calls.
  // Only what belongs to this session's open question; text after a tool
  // ran, or in a new message, starts a paragraph of its own.
  property string lastMessage: ""
  function agentSays(params) {
    if (ask.recycling || !params || params.sessionId !== ask.sessionId || ask.turn === null) return
    var u = Acp.update(params)
    if (u.kind === "text") {
      if (!u.text) return
      var fresh = u.messageId !== "" && u.messageId !== ask.lastMessage
      if (u.messageId !== "") ask.lastMessage = u.messageId
      if (ask.answer && (ask.afterTool || fresh) && !/\n\s*$/.test(ask.answer)) ask.answer += "\n\n"
      ask.afterTool = false
      if (ask.activity === "thinking") ask.activity = ""
      ask.answer += u.text
      if (ask.phase === "waiting") ask.phase = "streaming"
    } else if (u.kind === "thought") {
      if (!ask.answer && !ask.activity) ask.activity = "thinking"
    } else if (u.kind === "tool") {
      var id = String(u.call.toolCallId)
      var c = Acp.mergeCall(ask.calls[id], u.call)
      ask.calls[id] = c
      ask.afterTool = true
      ask.activity = c.status === "completed" || c.status === "failed" ? "" : AskTools.doing(c)
    }
  }

  // ---------------------------------------------------------------- the bar's tools

  // `nodi mcp --ask`'s one argument, { token, line } as JSON (Nodi.qml
  // askMcp): the answer as a line, "" for a notification, never anything
  // else, as the shell's facade would say "ok" for nothing.
  function serveCall(arg) {
    var o = null
    try { o = JSON.parse(String(arg)) } catch (e) { o = null }
    if (!o || typeof o !== "object" || typeof o.token !== "string" || typeof o.line !== "string")
      return JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32600, message: "not a message for Ask" } })
    return String(ask.serve(o.token, o.line))
  }

  // One message from the agent's `nodi mcp --ask`: the answer as a line,
  // "" for a notification. A server another session started reaches
  // nothing.
  function serve(token, line) {
    var m = null
    try { m = JSON.parse(String(line)) } catch (e) { return JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "parse error" } }) }
    var isRequest = !!m && typeof m === "object" && m.id !== undefined && typeof m.method === "string"
    if (!ask.token || String(token) !== ask.token || ask.recycling)
      return isRequest ? JSON.stringify({ jsonrpc: "2.0", id: m.id, error: { code: -32603, message: "This question's session has ended" } }) : ""
    var r = AskTools.mcp(m, {
      search: function(q) { return ask.searcher ? ask.searcher(q) : [] },
      run: ask.runTool
    })
    return r ? JSON.stringify(r) : ""
  }

  // The bar's run: the row he allowed, once (Fable 2026-10-06); else shown
  // in the bar for his Enter, the agent told so and not kept waiting.
  function runTool(key) {
    var k = String(key || "")
    if (k && k === ask.allowed) {
      ask.allowed = ""
      return ask.runner ? ask.runner(k) : "The bar cannot run rows here."
    }
    var why = !ask.shown ? "The bar is closed; he sees what you say when he asks again, and can run it then."
            : ask.proposal ? "One run at a time: he has not answered the last one."
            : ask.checker ? ask.checker(k) : ""
    if (why) return "Not run: " + why
    // An allowance for another key goes: his next Enter is for this row
    // (Fable 2026-10-07).
    ask.allowed = ""
    ask.proposal = { kind: "row", key: k, at: Date.now() }
    ask.phase = "proposing"
    return "Shown to him in the bar, not run yet: Enter runs it, Escape refuses, and you will not hear which. Say in one line what you proposed."
  }

  // ---------------------------------------------------------------- the process

  Process {
    id: proc
    stdinEnabled: true
    workingDirectory: ask.workDir
    // A session being recycled may still print the end of the answer it
    // was giving; that is not the next question's (codex 2026-10-04).
    stdout: SplitParser { onRead: function(line) { if (!ask.recycling) ask.handle(line) } }
    // The agent's log: an adapter installing says so first (lib/Agents.js),
    // and the last lines say why a start failed.
    stderr: SplitParser {
      onRead: function(line) {
        var l = String(line)
        // Only before the agent's first answer: stderr and stdout are read
        // apart, and an install is over once the agent answers.
        var inst = l.match(/^nodi: installing (.+)$/)
        if (inst && ask.stage === "init") ask.setup = "Installing " + inst[1] + ", once"
        if (l.trim()) ask.errTail = (ask.errTail.split("\n").slice(-2).concat([l.slice(0, 300)])).join("\n")
      }
    }
    onStarted: {
      ask.started = true
      ask.toAgent("init", function(id) { return Acp.initialize(id, ask.version) })
    }
    // A program that cannot start sends neither `started` nor `exited`, only
    // `running` going false: the question fails then, not later (Fable
    // 2026-10-04).
    onRunningChanged: {
      if (proc.running || ask.started) return
      upGuard.stop()
      ask.resetSession()
      ask.ending = false
      if (ask.recycling) { ask.recycling = false; return }
      ask.pending = null
      if (ask.busy()) ask.fail(ask.agentName + " could not start")
    }
    onExited: function(exitCode) {
      ask.started = false
      upGuard.stop()
      var said = ask.errTail.split("\n").filter(function(l) { return /^nodi: /.test(l) })
      var last = ask.errTail.split("\n").filter(function(l) { return l.trim() !== "" })
      var why = said.length ? said[said.length - 1].slice(6) : last.length ? last[last.length - 1] : "exit " + exitCode
      ask.resetSession()
      // A recycled session's exit is expected, and a question asked since
      // waits in `pending` for the fresh one.
      if (ask.recycling) { ask.recycling = false; ask.warm(); return }
      // A failed start's end: a question asked since starts afresh.
      if (ask.ending) { ask.ending = false; if (ask.pending) ask.warm(); return }
      // The reason a failed start gave stays shown.
      if (ask.phase === "error") return
      if (!ask.used || ask.busy()) ask.failedAt = Date.now()
      // Gone between questions: the conversation is over, its answer with
      // it, as when it goes stale (Fable 2026-10-06: clearing only `used`
      // left the rows of a session that was gone).
      if (!ask.busy()) { ask.recycle(); return }
      // While a request waits for him too: Enter would answer a dead
      // session (Fable 2026-10-06).
      ask.fail(ask.agentName + " stopped: " + why)
    }
  }

  // A session that never comes up fails rather than waiting for ever, and
  // the next question can be asked; an adapter installing, or a sign-in he
  // allowed, has longer.
  Timer {
    id: upGuard
    interval: Math.min(1000, ask.startMs)
    repeat: true
    property real since: 0
    onTriggered: {
      if (ask.stage === "ready" || ask.stage === "off") { stop(); return }
      if (Date.now() - since < (ask.setup || ask.signingIn ? ask.longMs : ask.startMs)) return
      stop()
      if (ask.busy()) ask.fail(ask.signingIn ? "Signing in to " + ask.agentName + " did not finish"
                               : ask.agentName + " did not answer" + (ask.setup ? " while installing" : ""))
      else if (proc.running && !ask.recycling) ask.restart()
    }
  }

  Timer {
    id: idle
    interval: ask.idleMs
    onTriggered: if (proc.running && !ask.busy()) ask.stop()
  }

  Timer {
    id: killGuard
    interval: 3000
    property int pid: 0
    onTriggered: if (proc.running && pid && proc.processId === pid) proc.signal(9)
  }

  Component.onDestruction: if (proc.running) proc.signal(15)
}
