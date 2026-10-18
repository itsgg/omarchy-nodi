import QtQuick
import Quickshell
import Quickshell.Io
import "../lib/Acp.js" as Acp
import "../lib/AskTools.js" as AskTools
import "../lib/AskActions.js" as AskActions
import "../lib/Agents.js" as Agents
import "../lib/PromptContext.js" as PromptContext
import "../lib/AskInteraction.js" as AskInteraction
import "../lib/ExternalRows.js" as ExternalRows

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
  property var registry: []
  property string model: ""
  property string workDir: ""
  // Where an adapter is installed, and where the lockfiles that say what
  // it is are (lib/Agents.js).
  property string dataDir: ""
  property string adaptersDir: Qt.resolvedUrl("../lib/adapters").toString().replace(/^file:\/\//, "")
  // bin/nodi, whose `mcp --ask` serves the bar's tools to the agent, and
  // what it is started with besides its session (a test's stand-in shell).
  property string toolServer: ""
  property var toolEnv: ({})
  // A second capability binds this server's relay calls to this exact ACP
  // session. It travels beside the session token, never in the tool input.
  property string channel: ""
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
  // `searcher(query, turn)` returns rows as data, `resolver` captures one
  // immutable action snapshot, and `committer` runs only that snapshot
  // after Enter wins its one compare-and-swap.
  // Answer-only built-ins may decline these through Agents.capabilities.
  property bool acts: false
  // MCP servers he named (AskTools.servers): each call to one of their
  // tools the agent asks about waits in `proposal` for him too (ROADMAP 49).
  property var mcp: ({})
  property var searcher: null
  property var checker: null
  property var runner: null
  property var resolver: null
  property var committer: null
  // A test's stand-in agent: its command, run as it is; else the agent's.
  property var program: null

  // What the agent is started with: nothing of the shell's environment but
  // these, by name, and what nodi.json adds ("ask": { "environment": [...] },
  // `passed`): the session (its PATH, which the login shell the agent starts
  // in adds to from his profile), the proxy and certificates a network
  // needs, and the variables the three agents read their sign-in and
  // provider from. Nothing that decides what a program loads (LD_PRELOAD,
  // NODE_OPTIONS, PYTHONPATH, BASH_ENV) is passed unless he names it (the
  // marketplace's review, 2026-09-16). The login shell then adds what his
  // profile sets, which is his to set.
  readonly property var sessionNames: ["HOME", "USER", "LOGNAME", "SHELL", "PATH", "LANG", "LANGUAGE", "LC_ALL", "LC_CTYPE", "LC_MESSAGES",
    "LC_TIME", "LC_NUMERIC", "TZ", "XDG_RUNTIME_DIR", "XDG_CONFIG_HOME", "XDG_DATA_HOME", "XDG_CACHE_HOME", "XDG_STATE_HOME", "XDG_CONFIG_DIRS",
    "XDG_DATA_DIRS", "XDG_SESSION_TYPE", "XDG_CURRENT_DESKTOP", "WAYLAND_DISPLAY", "DISPLAY", "DBUS_SESSION_BUS_ADDRESS",
    "HYPRLAND_INSTANCE_SIGNATURE", "OMARCHY_PATH", "BROWSER", "EDITOR", "TERMINAL", "MISE_DATA_DIR", "MISE_CONFIG_DIR",
    "HTTP_PROXY", "HTTPS_PROXY", "NO_PROXY", "ALL_PROXY", "http_proxy", "https_proxy", "no_proxy", "all_proxy",
    "NODE_EXTRA_CA_CERTS", "SSL_CERT_FILE", "SSL_CERT_DIR"]
  readonly property var agentNames: ["ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN", "ANTHROPIC_BASE_URL", "CLAUDE_CONFIG_DIR",
    "CLAUDE_CODE_USE_BEDROCK", "CLAUDE_CODE_USE_VERTEX", "ANTHROPIC_VERTEX_PROJECT_ID", "CLOUD_ML_REGION",
    "CLAUDE_CODE_OAUTH_TOKEN", "AWS_PROFILE", "AWS_REGION", "AWS_DEFAULT_REGION", "AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_SESSION_TOKEN",
    "OPENAI_API_KEY", "OPENAI_BASE_URL", "CODEX_HOME",
    "GEMINI_API_KEY", "GOOGLE_API_KEY", "GOOGLE_APPLICATION_CREDENTIALS", "GOOGLE_CLOUD_PROJECT", "GOOGLE_CLOUD_LOCATION", "GOOGLE_GENAI_USE_VERTEXAI"]
  property var passed: []
  function environment() {
    var env = {}
    var names = ask.sessionNames.concat(ask.agentNames, (ask.passed || []).filter(function(n) { return /^[A-Za-z_][A-Za-z0-9_]*$/.test(String(n)) }))
    for (var i = 0; i < names.length; i++) {
      var v = Quickshell.env(String(names[i]))
      if (v !== null && v !== undefined && String(v) !== "") env[names[i]] = String(v)
    }
    return env
  }

  // An answer is at most this many characters (lib/Acp.js capped): past it
  // the turn is cancelled, any request of the agent's refused, and the
  // answer says it was cut.
  property int answerMax: 1000000
  property bool cut: false

  // What the agent is told, and the MCP servers it is given by name: some
  // agents take both at their start (lib/Agents.js).
  readonly property var agentCapabilities: Agents.capabilities(ask.agent, ask.registry)
  readonly property bool providesActions: ask.acts && ask.agentCapabilities.actions
  readonly property bool actionServerAvailable: ask.providesActions && !!ask.toolServer && !!ask.actionServer
  readonly property bool named: ask.providesActions && Object.keys(ask.mcp || {}).length > 0
  readonly property string instructions: AskTools.instructions(ask.providesActions, ask.named)
  readonly property string actionServer: ask.channel ? Acp.actionServer(ask.channel) : ""
  readonly property var serverNames: ask.providesActions ? (ask.actionServerAvailable ? [ask.actionServer] : []).concat(Object.keys(ask.mcp || {})) : []
  readonly property var spec: Agents.spec(ask.agent, ask.dataDir, ask.model, ask.instructions, ask.serverNames, ask.adaptersDir, ask.registry, ask.workDir)
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
  readonly property string launchKey: JSON.stringify([ask.agent, ask.registry, ask.model, ask.acts, ask.mcp, ask.program, ask.dataDir, ask.toolServer, ask.adaptersDir, ask.passed])
  // The adapter an npm agent runs from, as a key: "" for an agent that is
  // its own program (OpenCode, his own).
  readonly property string adapterKey: ask.spec && ask.spec.adapter ? JSON.stringify([ask.spec.adapter, ask.dataDir, ask.adaptersDir]) : ""
  // The adapter the launch script last said was installed ("nodi: adapter
  // ready", lib/Agents.js), and the one a start found not installed: typing
  // starts no other until a question is asked, which installs it. Until a
  // start has said it is ready, the rows say the Enter that asks installs
  // it (`install`), so no Enter installs unannounced, however soon after
  // `ask ` it comes.
  property string readyAdapter: ""
  property string notInstalled: ""
  readonly property string install: ask.adapterKey && ask.readyAdapter !== ask.adapterKey ? ask.spec.adapter : ""
  // Whether the adapter is in place is asked at the load and whenever it
  // changes (NODI_INSTALL=check, lib/Agents.js), so the rows stop saying
  // an Enter installs it once it is installed; until a start said so they
  // said it after every shell restart (2026-10-10). Only for an agent Nodi
  // starts by its own launch script: one given by `program` says so when
  // it starts. The check installs nothing and starts nothing.
  // A reader's environment: the check needs no key of the agent's.
  property string checkedAdapter: ""
  function checkReady() {
    // One asked while one runs waits for it (Reader.qml), the newest kept.
    if (ask.program || !ask.adapterKey || !ask.spec || ask.readyAdapter === ask.adapterKey) return
    var argv = Agents.checkArgv(ask.spec.argv)
    if (argv) readyCheck.run(argv, ask.adapterKey)
  }
  onAdapterKeyChanged: ask.checkReady()
  Component.onCompleted: ask.checkReady()
  // This start was allowed to install (NODI_INSTALL=1).
  property bool startInstalls: false
  onLaunchKeyChanged: if (proc.running && !ask.busy() && !ask.recycling) ask.restart()

  // What the bar shows.
  property string question: ""
  // The tools refused this turn, his Escape or the bar closing: said at the
  // answer's end, so a preface ("I'll run the touch command.") does not
  // read as done (2026-10-10, Codex driven live).
  property var refused: []
  // What the agent was sent for it: the question, or the question with
  // what it is about (the selection's text); and what it is about.
  property string message: ""
  property string context: ""
  property var image: null           // { mediaType, data } sent with the question
  // What Nodi saw when the Ask was chosen (lib/PromptContext.js build's
  // input), kept until the prompt is sent, and with the question after it so
  // asking again tells the agent what the first turn did. Never shown,
  // logged or kept past the conversation.
  property var snapshot: null
  property string answer: ""
  // The conversation's turns answered before the current one, { question,
  // answer }: drawn above it in the pane, and what "Continue in your agent"
  // carries; forgotten when the conversation starts afresh (recycle).
  property var turns: []
  property string phase: "idle"      // idle | waiting | streaming | proposing | done | error
  property string error: ""
  // What waits for his Enter or Escape: the agent asking to use a tool
  // ("permission", a row of the bar's when its input names one), a row
  // the bar's run tool showed ("row"), or a sign-in ("auth").
  property var proposal: null
  property string allowed: ""        // the row he allowed, until it runs
  property var readActivities: Object.create(null) // session-lifetime operation -> immutable origin and monotonic state
  readonly property int operationRecordLimit: 4096
  property int readActivityCount: 0
  property string thoughtActivity: "" // current-turn thought, outside provider operation IDs
  property int activitySeq: 0
  property string actionActivity: AskActions.display(ask.actionBook, ({}))
  readonly property string activity: AskActions.display(ask.actionBook, ask.readActivities)
    || ask.thoughtActivity
  property string setup: ""          // what the start does first: an adapter installing
  property bool signingIn: false     // an authenticate he allowed, not yet answered

  property bool used: false          // this session has been asked something
  property bool started: false
  property bool recycling: false
  property bool warmAfterRecycle: true
  // A start that failed, still exiting: its exit is not the next question's.
  property bool ending: false
  // The session: off, init (initialize sent), session (session/new sent),
  // config (its mode or model being set), ready, or failed.
  property string stage: "off"
  property string sessionId: ""
  property var caps: null
  property string processBinding: ""
  property var interactionState: AskInteraction.create("", "", "")
  property int interactionRevision: 0
  readonly property var commands: interactionState.commands || []
  readonly property var plans: interactionState.plans || []
  readonly property var resultActions: interactionState.actions || []
  readonly property var remoteSessions: interactionState.sessions || []
  readonly property var form: interactionState.form || null
  property string completedTurn: ""
  property var metadataBook: AskActions.create("", "", "")
  property var sessionServers: []
  property var resumeTarget: null
  property var toolInventory: null    // Claude's trusted strict inventory, separate from calls
  property var toolCatalogs: null     // Codex MCP/app diagnostics, never its final tool inventory
  property int nextId: 0
  property var waits: ({})           // request id: what it asked
  property var turn: null            // the open session/prompt's id
  property var calls: Object.create(null) // this turn's tool calls, by provider ID
  property string actionTurn: ""     // trusted action origin for this prompt
  property var actionBook: AskActions.create("", "", "")
  readonly property int actionRequestLimit: AskActions.requestLimit()
  property var runBindings: []       // permission-time origins awaiting MCP delivery
  readonly property int runBindingLimit: 512
  property var codexTurns: []        // provider turn -> immutable Nodi action turn
  property var claudeTurns: []       // provider turn -> immutable Nodi action turn
  readonly property int providerTurnBindingLimit: 1024
  property var originRejections: ({}) // typed request ID -> immutable rejected origin
  readonly property int rejectionLimit: 1024
  property int originRejectionCount: 0
  property int nextProposal: 0
  property bool afterTool: false     // a tool ran since the last text
  property var pending: null         // { text, image } waiting for the session
  property string token: ""          // names this session to the bar's tool server
  property var toolResponses: ({})   // transport ticket -> { requestKey }
  property var toolRequests: ({})    // typed request id -> { id, state, response }
  property var retiredToolResponses: ({}) // dead-session tickets with terminal responses
  readonly property int mailboxTicketLimit: 2048
  readonly property int retiredResponseLimit: 2048
  property int toolResponseCount: 0
  property int toolRequestCount: 0
  property int retiredToolResponseCount: 0
  property string capacityFailure: ""
  property int nextTicket: 0
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
    if (!ask.busy() && ask.adapterKey && ask.notInstalled === ask.adapterKey) return
    if (!proc.running && !ask.recycling && !ask.ending) {
      var argv = ask.program || (ask.spec && ask.spec.argv)
      if (!argv) { if (ask.busy()) ask.fail("Ask cannot hold the agent " + JSON.stringify(ask.agent) + ": it knows " + Agents.known().join(", ") + ", or one given by its command"); return }
      ask.resetSession()
      ask.processBinding = ask.newToken()
      ask.interactionState = AskInteraction.create(ask.processBinding, "", "")
      ask.token = ask.newToken()
      ask.channel = ask.newToken()
      ask.stage = "init"
      // An adapter is installed for a question asked, never while one is
      // typed (lib/Agents.js).
      // Said either way: one inherited from the shell is not his Enter.
      var env = Object.assign(ask.environment(), ask.spec ? ask.spec.env : {})
      ask.startInstalls = ask.busy()
      env.NODI_INSTALL = ask.startInstalls ? "1" : "0"
      proc.environment = env
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
    ask.retireToolResponses()
    ask.stage = "off"
    ask.sessionId = ""
    ask.caps = null
    ask.processBinding = ""
    ask.interactionState = AskInteraction.create("", "", "")
    ask.completedTurn = ""
    ask.metadataBook = AskActions.create("", "", "")
    ask.sessionServers = []
    ask.resumeTarget = null
    ask.toolInventory = null
    ask.toolCatalogs = null
    ask.waits = ({})
    ask.turn = null
    ask.calls = Object.create(null)
    ask.actionTurn = ""
    ask.actionBook = AskActions.create("", "", "")
    ask.runBindings = []
    ask.codexTurns = []
    ask.claudeTurns = []
    ask.originRejections = ({})
    ask.originRejectionCount = 0
    ask.nextProposal = 0
    ask.token = ""
    ask.channel = ""
    ask.toolResponses = ({})
    ask.toolRequests = ({})
    ask.toolResponseCount = 0
    ask.toolRequestCount = 0
    ask.nextTicket = 0
    ask.capacityFailure = ""
    ask.instructed = false
    ask.errTail = ""
    ask.setup = ""
    ask.agentTitle = ""
    ask.readActivities = Object.create(null)
    ask.readActivityCount = 0
    ask.thoughtActivity = ""
    ask.activitySeq = 0
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
  // `snapshot` is what Nodi saw as the Ask was chosen: asked again with a
  // new one, the window is the new one's and the selection and purpose the
  // first turn's, which the message still holds.
  function send(q, message, context, image, snapshot, fromCompletedProposal) {
    if (ask.busy() && fromCompletedProposal !== true) return false
    // Asked again, a question goes with what it was sent with before, read
    // before a fresh start forgets it (Fable 2026-10-06).
    var again = message === undefined && String(q) === ask.question
    var kept = again ? { message: ask.message, context: ask.context, image: ask.image, snapshot: ask.snapshot } : null
    // Long after the last answer, a question starts a conversation afresh;
    // else the answer before this one is a turn of it now, for the pane to
    // draw above the next (as Raycast's Quick AI shows one), but not one
    // asked again, nor one that failed.
    if (ask.stale()) ask.recycle()
    else if (!again && ask.question !== "" && ask.answer.trim() !== ""
             && (ask.phase === "done" || fromCompletedProposal === true))
      ask.turns = ask.turns.concat([{ question: ask.question, message: ask.message, answer: ask.answer }])
    ask.message = message !== undefined ? String(message) : kept ? kept.message : String(q)
    ask.context = context !== undefined ? String(context) : kept ? kept.context : ""
    ask.image = image !== undefined ? image : kept ? kept.image : null
    var snap = snapshot !== undefined ? snapshot : kept ? kept.snapshot : null
    if (kept && snapshot && kept.snapshot && kept.snapshot.selection)
      snap = Object.assign({}, snapshot, { purpose: kept.snapshot.purpose, selection: kept.snapshot.selection })
    ask.snapshot = snap && typeof snap === "object" ? snap : null
    ask.allowed = ""
    ask.refused = []
    ask.question = String(q)
    ask.answer = ""
    ask.error = ""
    ask.phase = "waiting"
    ask.used = true
    ask.pending = { text: ask.message, image: ask.image, snapshot: ask.snapshot }
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
    ask.calls = Object.create(null)
    ask.actionTurn = ask.newToken()
    ask.interactionState = AskInteraction.bind(
      ask.interactionState, ask.processBinding, ask.sessionId, ask.actionTurn)
    ask.metadataBook = AskActions.create(ask.token, ask.actionTurn, ask.channel)
    ask.completedTurn = ""
    var keptRequests = ask.actionBook && ask.actionBook.session === ask.token
      && ask.actionBook.channel === ask.channel ? ask.actionBook.requests : ({})
    var keptRequestCount = ask.actionBook && ask.actionBook.session === ask.token
      && ask.actionBook.channel === ask.channel
      ? AskActions.requestCount(ask.actionBook) : 0
    ask.actionBook = AskActions.create(ask.token, ask.actionTurn, ask.channel)
    ask.actionBook.requests = keptRequests
    ask.actionBook.requestCount = keptRequestCount
    ask.afterTool = false
    ask.cut = false
    var preface = ask.instructed ? "" : Agents.firstPromptInstructions(ask.agent, ask.instructions)
    ask.instructed = true
    var nodi = p.snapshot ? PromptContext.build(p.snapshot) : undefined
    ask.turn = ask.toAgent("prompt", function(id) { return Acp.prompt(id, ask.sessionId, text, image, preface, nodi) })
  }

  function commandNamed(name) {
    for (var i = 0; i < ask.commands.length; i++)
      if (ask.commands[i].name === name) return ask.commands[i]
    return null
  }

  function runCommand(name, input) {
    if (ask.busy() || ask.stage !== "ready") return false
    var command = ask.commandNamed(String(name || ""))
    if (!command) return false
    if (command.input && input === undefined) {
      ask.interactionState = AskInteraction.elicit(
        ask.interactionState, ask.processBinding, ask.sessionId,
        ask.actionTurn, "command:" + command.name, {
          sessionId: ask.sessionId,
          mode: "form",
          message: command.description || command.name,
          requestedSchema: {
            type: "object",
            required: command.input.required ? ["input"] : [],
            properties: {
              input: {
                type: "string",
                title: command.input.hint || "Input",
                maxLength: AskInteraction.LIMITS.actionText
              }
            }
          }
        })
      if (!ask.form) return false
      ask.proposal = {
        kind: "command", command: command, title: "/" + command.name,
        subtitle: command.description, at: Date.now()
      }
      ask.phase = "proposing"
      return true
    }
    return ask.send(AskInteraction.commandPrompt(command, input))
  }

  function setFormField(name, value) {
    ask.interactionState = AskInteraction.setField(
      ask.interactionState, String(name || ""), value)
  }

  function submitForm() {
    var p = ask.proposal
    if (!p || (p.kind !== "elicitation" && p.kind !== "command")) return false
    var result = AskInteraction.formResult(ask.interactionState, "accept")
    if (!result.ok) return false
    ask.interactionState = result.state
    ask.proposal = null
    if (p.kind === "elicitation") {
      proc.write(Acp.result(p.id, result.response))
      ask.settle()
      return true
    }
    return ask.send(AskInteraction.commandPrompt(
      p.command, result.response.content.input),
      undefined, undefined, undefined, undefined, true)
  }

  function cancelForm() {
    var p = ask.proposal
    if (!p || (p.kind !== "elicitation" && p.kind !== "command")) return false
    var result = AskInteraction.formResult(ask.interactionState, "cancel")
    ask.interactionState = result.state
    ask.proposal = null
    if (p.kind === "elicitation") proc.write(Acp.result(p.id, result.response))
    ask.settle()
    return true
  }

  function proposeResultAction(index) {
    var item = ask.resultActions[index]
    if (!item || item.turn !== ask.completedTurn || ask.phase !== "done"
        || !ask.shown || ask.proposal) return false
    var normalized = ExternalRows.actionOf(item.action, {
      safeOpen: true, paste: true, next: false,
      completeMax: AskInteraction.LIMITS.actionText
    })
    if (!normalized.run || (item.action.exec === undefined
        && item.action.copy === undefined && item.action.paste === undefined))
      return false
    var requestId = "metadata:" + item.turn + ":" + index
    var origin = {
      id: requestId, session: ask.token, turn: item.turn,
      channel: ask.channel, callId: requestId, providerTurn: "",
      adapterKey: "prompt-result", inputKey: JSON.stringify(item.action),
      operation: requestId, server: "prompt-result",
      kind: "metadata", value: index
    }
    var begun = AskActions.begin(ask.metadataBook, origin)
    ask.metadataBook = begun.book
    if (!begun.effect || begun.effect.type !== "resolve") return false
    var proposalId = requestId + ":" + ask.newToken()
    var snapshot = {
      key: "ask:metadata:" + item.turn + ":" + index,
      title: item.title, subtitle: "", risk: "",
      confirmWord: "", run: normalized.run, toggle: "",
      rememberKey: "", history: null, undoable: false,
      provider: "ask", turn: item.turn
    }
    var proposed = AskActions.resolve(
      ask.metadataBook, requestId, snapshot, proposalId)
    ask.metadataBook = proposed.book
    if (!proposed.effect || proposed.effect.type !== "confirm") return false
    ask.proposal = {
      kind: "metadataAction", id: proposalId,
      requestId: requestId, snapshot: proposed.effect.snapshot,
      at: Date.now()
    }
    ask.phase = "proposing"
    return true
  }

  function resultAction(index) {
    var item = ask.resultActions[index]
    if (!item || item.turn !== ask.completedTurn || ask.turn !== null
        || ask.phase !== "done") return null
    return item
  }

  function openedLink(url, turnId) {
    var owner = ask.turn !== null ? ask.actionTurn : ask.completedTurn
    if (!proc.running || ask.stage !== "ready" || !owner
        || String(turnId || "") !== owner) return false
    var message = Acp.openedLink(
      ask.sessionId, owner, url, true)
    if (!message) return false
    proc.write(message)
    return true
  }

  function resumeRemote(index) {
    if (!ask.caps || !ask.caps.resume || ask.busy() || ask.proposal
        || ask.stage !== "ready") return false
    var target = ask.remoteSessions[index]
    if (!target || !target.sessionId || target.sessionId === ask.sessionId)
      return false
    ask.resumeTarget = Object.assign({}, target)
    ask.stage = "closing"
    upGuard.since = Date.now()
    upGuard.restart()
    if (ask.sessionId && ask.caps.close) {
      var oldSession = ask.sessionId
      ask.toAgent("close:resume", function(id) {
        return Acp.close(id, oldSession)
      })
    } else ask.beginResume()
    return true
  }

  function beginResume() {
    var target = ask.resumeTarget
    if (!target) { ask.beginFreshSession(); return }
    ask.retireToolResponses()
    ask.used = false
    ask.lastAt = 0
    ask.turns = []
    ask.pending = null
    ask.turn = null
    ask.question = ""
    ask.message = ""
    ask.context = ""
    ask.image = null
    ask.snapshot = null
    ask.answer = ""
    ask.error = ""
    ask.phase = "idle"
    ask.clearSessionScope()
    ask.token = ask.newToken()
    ask.channel = ask.newToken()
    ask.sessionId = String(target.sessionId)
    ask.interactionState = AskInteraction.create(
      ask.processBinding, ask.sessionId, "")
    ask.instructed = true
    ask.sessionServers = ask.makeSessionServers()
    ask.stage = "resuming"
    ask.toAgent("resume", function(id) {
      return Acp.resumeSession(
        id, ask.sessionId, ask.workDir, ask.sessionServers)
    })
  }

  function stableActionInput(value) {
    if (!value || typeof value !== "object") return value
    if (Array.isArray(value)) return value.map(ask.stableActionInput)
    var out = Object.create(null)
    Object.keys(value).sort().forEach(function(key) {
      out[key] = ask.stableActionInput(value[key])
    })
    return out
  }

  function actionInputKey(input) {
    return JSON.stringify(ask.stableActionInput(input && typeof input === "object" ? input : {}))
  }

  function setReadActivity(operation, text, status) {
    var key = String(operation)
    var reads = ask.readActivities
    var found = Object.prototype.hasOwnProperty.call(reads, key) ? reads[key] : null
    if (found) {
      if (found.session !== ask.token || found.turn !== ask.actionTurn || found.terminal)
        return false
      var next = Object.assign({}, found)
      if (status === "completed" || status === "failed") {
        next.state = status
        next.terminal = true
        next.text = ""
      } else if (text) {
        next.state = String(status || "pending")
        next.text = String(text)
        next.seq = ++ask.activitySeq
      }
      reads[key] = next
    } else if (text && status !== "completed" && status !== "failed") {
      if (ask.readActivityCount >= ask.operationRecordLimit)
        return ask.sessionCapacityExceeded("operation records")
      reads[key] = {
        session: ask.token, turn: ask.actionTurn, text: String(text),
        seq: ++ask.activitySeq, state: String(status || "pending"), terminal: false
      }
      ask.readActivityCount++
    } else {
      // A completion with no session-lifetime start is delayed or foreign.
      return false
    }
    ask.readActivitiesChanged()
    return true
  }

  function terminalizeReadActivities(state) {
    var reads = ask.readActivities
    var changed = false
    for (var key in reads) {
      if (!Object.prototype.hasOwnProperty.call(reads, key)) continue
      var item = reads[key]
      if (!item || item.session !== ask.token || item.turn !== ask.actionTurn
          || item.terminal) continue
      reads[key] = Object.assign({}, item, {
        text: "", state: String(state || "completed"), terminal: true
      })
      changed = true
    }
    if (changed) ask.readActivitiesChanged()
    ask.thoughtActivity = ""
  }

  function identityField(object, key) {
    if (!object || typeof object !== "object"
        || !Object.prototype.hasOwnProperty.call(object, key))
      return { marker: "missing" }
    var value = object[key]
    if (value === null) return { marker: "null" }
    return { marker: "value", type: typeof value, value: ask.stableActionInput(value) }
  }

  function relayOrigin(message, requestId) {
    var params = message && message.params && typeof message.params === "object"
      ? message.params : {}
    var requestInputKey = JSON.stringify(ask.identityField(params, "arguments"))
    var managedCodex = ask.agent === "codex" && ask.spec
    var managedClaude = ask.agent === "claude" && !ask.program && ask.spec
      && ask.spec.policy === "strict"
    if (!managedCodex && !managedClaude) {
      return {
        valid: true, callId: String(requestId), providerTurn: "",
        requestInputKey: requestInputKey,
        adapterKey: JSON.stringify({
          adapter: "acp", requestId: {
            type: typeof requestId, value: ask.stableActionInput(requestId)
          }
        })
      }
    }
    var meta = params._meta && typeof params._meta === "object"
      ? params._meta : {}
    if (managedClaude) {
      var claudeCallId = typeof meta["claudecode/toolUseId"] === "string"
        && meta["claudecode/toolUseId"] ? meta["claudecode/toolUseId"] : ""
      var claudeProviderTurn = ask.claudeRelayProviderTurn(claudeCallId,
                                                           requestId)
      return {
        valid: !!claudeCallId && !!claudeProviderTurn,
        callId: claudeCallId,
        providerTurn: claudeProviderTurn,
        requestInputKey: requestInputKey,
        adapterKey: JSON.stringify({
          adapter: "claude",
          meta: ask.identityField(params, "_meta"),
          callId: ask.identityField(meta, "claudecode/toolUseId")
        })
      }
    }
    var turn = meta["x-codex-turn-metadata"]
    var turnObject = turn && typeof turn === "object" ? turn : {}
    var callId = typeof meta.callId === "string" && meta.callId ? meta.callId : ""
    var providerTurn = typeof turnObject.turn_id === "string" && turnObject.turn_id
      ? turnObject.turn_id : ""
    var adapterKey = JSON.stringify({
      adapter: "codex",
      meta: ask.identityField(params, "_meta"),
      turnMetadata: ask.identityField(meta, "x-codex-turn-metadata"),
      sessionId: ask.identityField(turnObject, "session_id"),
      threadId: ask.identityField(turnObject, "thread_id"),
      providerTurn: ask.identityField(turnObject, "turn_id"),
      callId: ask.identityField(meta, "callId")
    })
    return {
      valid: !!turn && typeof turn === "object"
        && turnObject.session_id === ask.sessionId
        && turnObject.thread_id === ask.sessionId
        && !!providerTurn && !!callId,
      callId: callId, providerTurn: providerTurn,
      requestInputKey: requestInputKey, adapterKey: adapterKey
    }
  }

  function bindCodexProviderTurn(update) {
    if (ask.agent !== "codex" || !ask.spec
        || !update || update.sessionUpdate !== "session_info_update"
        || !update._meta || update._meta.nodi_codex_turn_started !== true
        || typeof update._meta.nodi_codex_turn_id !== "string"
        || !update._meta.nodi_codex_turn_id
        || ask.turn === null || !ask.actionTurn)
      return false
    var providerTurn = update._meta.nodi_codex_turn_id
    var turns = ask.codexTurns.slice()
    for (var i = turns.length - 1; i >= 0; i--) {
      if (turns[i].providerTurn !== providerTurn) continue
      return turns[i].session === ask.token
        && turns[i].channel === ask.channel
        && turns[i].turn === ask.actionTurn
    }
    if (turns.length >= ask.providerTurnBindingLimit)
      return ask.sessionCapacityExceeded("Codex turn bindings")
    turns.push({
      providerTurn: providerTurn, session: ask.token,
      channel: ask.channel, turn: ask.actionTurn
    })
    ask.codexTurns = turns
    return true
  }

  function codexTurnOrigin(providerTurn) {
    for (var i = ask.codexTurns.length - 1; i >= 0; i--) {
      var turn = ask.codexTurns[i]
      if (turn.providerTurn === providerTurn) return turn
    }
    return null
  }

  function bindClaudeProviderTurn(update) {
    if (ask.agent !== "claude" || ask.program || !ask.spec
        || ask.spec.policy !== "strict"
        || !update || update.sessionUpdate !== "session_info_update"
        || !update._meta || update._meta.nodi_claude_turn_started !== true
        || typeof update._meta.nodi_claude_turn_id !== "string"
        || !update._meta.nodi_claude_turn_id
        || ask.turn === null || !ask.actionTurn)
      return false
    var providerTurn = update._meta.nodi_claude_turn_id
    var turns = ask.claudeTurns.slice()
    for (var i = turns.length - 1; i >= 0; i--) {
      if (turns[i].providerTurn !== providerTurn) continue
      return turns[i].session === ask.token
        && turns[i].channel === ask.channel
        && turns[i].turn === ask.actionTurn
    }
    if (turns.length >= ask.providerTurnBindingLimit)
      return ask.sessionCapacityExceeded("Claude turn bindings")
    turns.push({
      providerTurn: providerTurn, session: ask.token,
      channel: ask.channel, turn: ask.actionTurn
    })
    ask.claudeTurns = turns
    return true
  }

  function claudeTurnOrigin(providerTurn) {
    for (var i = ask.claudeTurns.length - 1; i >= 0; i--) {
      var turn = ask.claudeTurns[i]
      if (turn.providerTurn === providerTurn) return turn
    }
    return null
  }

  function claudeRelayProviderTurn(callId, requestId) {
    if (!callId) return ""
    var found = ""
    for (var i = ask.runBindings.length - 1; i >= 0; i--) {
      var binding = ask.runBindings[i]
      if (binding.adapter !== "claude" || binding.callId !== callId) continue
      if (found && found !== binding.providerTurn) return ""
      found = binding.providerTurn
    }
    if (found) return found
    var record = ask.actionRequest(requestId)
    return record && record.callId === callId ? record.providerTurn : ""
  }

  function rejectionOrigin(requestId, input, server, relay) {
    return {
      id: requestId, session: ask.token, channel: ask.channel,
      turn: ask.actionTurn,
      inputKey: relay.requestInputKey === undefined
        ? ask.actionInputKey(input) : relay.requestInputKey,
      server: String(server), adapterKey: relay.adapterKey
    }
  }

  function sameRejectedOrigin(record, origin) {
    return record && record.id === origin.id
      && record.session === origin.session && record.channel === origin.channel
      && record.turn === origin.turn && record.inputKey === origin.inputKey
      && record.server === origin.server && record.adapterKey === origin.adapterKey
  }

  function rememberOriginRejection(requestId, input, server, relay) {
    var key = ask.toolRequestKey(requestId)
    var records = ask.originRejections
    if (Object.prototype.hasOwnProperty.call(records, key)) return true
    if (ask.originRejectionCount >= ask.rejectionLimit)
      return ask.sessionCapacityExceeded("action rejection records")
    records[key] = ask.rejectionOrigin(requestId, input, server, relay)
    ask.originRejectionCount++
    ask.originRejectionsChanged()
    return true
  }

  function rejectedOrigin(requestId) {
    var key = ask.toolRequestKey(requestId)
    return Object.prototype.hasOwnProperty.call(ask.originRejections, key)
      ? ask.originRejections[key] : null
  }

  function bindRunOrigin(permissionId, callId, input, allowed, call) {
    if (typeof callId !== "string" || !callId) return false
    var bindings = ask.runBindings.slice()
    var codexOrigin = null
    for (var i = bindings.length - 1; i >= 0; i--) {
      if (bindings[i].adapter !== "codex" || bindings[i].callId !== callId)
        continue
      var same = bindings[i].session === ask.token
        && bindings[i].channel === ask.channel
        && bindings[i].turn === ask.actionTurn
        && bindings[i].operation === callId
        && bindings[i].server === ask.actionServer
        && bindings[i].inputKey === ask.actionInputKey(input)
        && bindings[i].allowed === (allowed === true)
      codexOrigin = same ? bindings[i] : null
      bindings.splice(i, 1)
      if (!same) {
        ask.runBindings = bindings
        return false
      }
    }
    if (ask.agent === "codex" && ask.spec
        && !codexOrigin)
      return false
    var managedClaude = ask.agent === "claude" && !ask.program && ask.spec
      && ask.spec.policy === "strict"
    var claudeOrigin = null
    if (managedClaude) {
      var meta = call && call._meta && typeof call._meta === "object"
        ? call._meta : {}
      var evidence = meta.nodi_claude_action_origin
      var server = evidence && evidence.server
      var provider = evidence && typeof evidence.providerTurn === "string"
        ? ask.claudeTurnOrigin(evidence.providerTurn) : null
      var hasInput = evidence && Object.prototype.hasOwnProperty.call(evidence,
                                                                       "input")
      if (!evidence || typeof evidence !== "object"
          || evidence.version !== 1 || evidence.adapter !== "claude"
          || evidence.acpSessionId !== ask.sessionId
          || evidence.callId !== callId
          || !server || typeof server !== "object"
          || server.name !== ask.actionServer || server.source !== "dynamic"
          || !hasInput
          || ask.actionInputKey(evidence.input) !== ask.actionInputKey(input)
          || AskTools.barTool(call, ask.actionServer) !== "run"
          || !provider || provider.session !== ask.token
          || provider.channel !== ask.channel
          || provider.turn !== ask.actionTurn)
        return false
      claudeOrigin = evidence
      for (var ci = bindings.length - 1; ci >= 0; ci--) {
        if (bindings[ci].adapter !== "claude"
            || bindings[ci].callId !== callId) continue
        var exact = bindings[ci].session === ask.token
          && bindings[ci].channel === ask.channel
          && bindings[ci].turn === ask.actionTurn
          && bindings[ci].permissionId === String(permissionId)
          && bindings[ci].server === ask.actionServer
          && bindings[ci].inputKey === ask.actionInputKey(input)
          && bindings[ci].allowed === (allowed === true)
          && bindings[ci].providerTurn === evidence.providerTurn
        if (exact) return true
        bindings.splice(ci, 1)
        ask.runBindings = bindings
        return false
      }
    }
    if (bindings.length >= ask.runBindingLimit)
      return ask.sessionCapacityExceeded("run origin bindings")
    bindings.push({
      session: ask.token, channel: ask.channel, turn: ask.actionTurn,
      callId: callId,
      operation: callId,
      permissionId: String(permissionId),
      server: ask.actionServer,
      inputKey: ask.actionInputKey(input), allowed: allowed === true,
      providerTurn: codexOrigin ? codexOrigin.providerTurn
        : claudeOrigin ? claudeOrigin.providerTurn : "",
      adapter: codexOrigin ? "codex" : claudeOrigin ? "claude" : "acp"
    })
    ask.runBindings = bindings
    return true
  }

  // Codex's pinned adapter publishes the app-server's structured mcpToolCall
  // start, with its generated call ID, before the MCP relay request. Bind only
  // that exact current-session event. This also covers adapter versions which
  // omit ACP permission; when permission is present bindRunOrigin replaces
  // this provisional binding. The relay must carry the same generated ID.
  function bindCodexRunOrigin(update) {
    if (ask.agent !== "codex" || !ask.spec
        || !update || update.sessionUpdate !== "tool_call"
        || typeof update.toolCallId !== "string" || !update.toolCallId
        || !update._meta || update._meta.is_mcp_tool_call !== true
        || AskTools.barTool(update, ask.actionServer) !== "run"
        || ask.turn === null || !ask.actionTurn || !ask.shown || ask.proposal)
      return false
    var input = AskTools.input(update)
    if (!AskTools.runInput(input).ok) return false
    var providerTurn = update._meta.nodi_codex_turn_id
    if (typeof providerTurn !== "string" || !providerTurn) return false
    var providerOrigin = ask.codexTurnOrigin(providerTurn)
    if (!providerOrigin || providerOrigin.session !== ask.token
        || providerOrigin.channel !== ask.channel
        || providerOrigin.turn !== ask.actionTurn)
      return false
    var bindings = ask.runBindings.slice()
    for (var i = bindings.length - 1; i >= 0; i--) {
      if (bindings[i].adapter === "codex"
          && bindings[i].callId === update.toolCallId) {
        bindings.splice(i, 1)
        ask.runBindings = bindings
        return false
      }
    }
    if (bindings.length >= ask.runBindingLimit)
      return ask.sessionCapacityExceeded("run origin bindings")
    bindings.push({
      session: ask.token, channel: ask.channel, turn: ask.actionTurn,
      callId: update.toolCallId,
      operation: update.toolCallId,
      permissionId: "",
      server: ask.actionServer,
      inputKey: ask.actionInputKey(input), allowed: true,
      adapter: "codex", providerTurn: providerTurn
    })
    ask.runBindings = bindings
    return true
  }

  function actionRequest(requestId) {
    var key = ask.toolRequestKey(requestId)
    return AskActions.requestAt(ask.actionBook, key)
  }

  function validateRunReplay(requestId, input, server, relay) {
    relay = relay && typeof relay === "object" ? relay
      : { valid: false, callId: String(relay || ""), providerTurn: "", adapterKey: "" }
    var rejected = ask.rejectedOrigin(requestId)
    if (rejected) {
      var replayedRejection = ask.rejectionOrigin(requestId, input, server, relay)
      return ask.sameRejectedOrigin(rejected, replayedRejection)
        ? { ok: true }
        : { ok: false, error: "The action replay does not match its recorded rejection origin" }
    }
    var record = ask.actionRequest(requestId)
    if (!record) return { ok: true }
    var managedOrigin = ask.spec && (ask.agent === "codex"
      || (ask.agent === "claude" && !ask.program
          && ask.spec.policy === "strict"))
    if (managedOrigin && !relay.valid)
      return { ok: false, error: "The action replay has no trusted call origin" }
    var trustedCallId = managedOrigin ? relay.callId : String(requestId)
    var parsed = AskTools.runInput(input)
    var kind = parsed.ok ? parsed.kind : "invalid"
    var value = parsed.ok ? parsed.value : null
    if (record.id !== requestId
        || record.session !== ask.token || record.channel !== ask.channel
        || typeof record.turn !== "string" || !record.turn
        || record.callId !== trustedCallId
        || record.providerTurn !== relay.providerTurn
        || record.adapterKey !== relay.adapterKey
        || record.inputKey !== ask.actionInputKey(input)
        || record.operation !== trustedCallId
        || record.server !== String(server)
        || record.kind !== kind || record.value !== value)
      return { ok: false, error: "The action replay does not match its recorded origin" }
    return { ok: true }
  }

  // A duplicate is owned by its original request record. A first delivery
  // consumes the permission-time or structured-adapter binding with the
  // same exact input. More than one is ambiguous and therefore cannot be
  // promoted to "current".
  function takeRunOrigin(requestId, input, server, relay) {
    relay = relay && typeof relay === "object" ? relay
      : { valid: false, callId: String(relay || ""), providerTurn: "", adapterKey: "" }
    var record = ask.actionRequest(requestId)
    var key = ask.actionInputKey(input)
    var bindings = ask.runBindings.slice()
    var managedOrigin = ask.spec && (ask.agent === "codex"
      || (ask.agent === "claude" && !ask.program
          && ask.spec.policy === "strict"))
    var unmanagedDelivery = ask.spec && ask.spec.policy === "unmanaged"
      && ask.agent !== "codex"
    if (managedOrigin && !relay.valid)
      return { ok: false, error: "The action request has no trusted call origin" }
    var trustedCallId = managedOrigin ? relay.callId : String(requestId)
    if (record) {
      if (record.callId !== trustedCallId || record.inputKey !== key
          || record.server !== String(server)
          || record.providerTurn !== relay.providerTurn
          || record.adapterKey !== relay.adapterKey)
        return { ok: false, error: "The action request does not match its permission-bound origin" }
      for (var ri = bindings.length - 1; ri >= 0; ri--) {
        if (bindings[ri].callId === String(requestId)
            && bindings[ri].inputKey === key
            && bindings[ri].server === String(server)) {
          bindings.splice(ri, 1)
          break
        }
      }
      ask.runBindings = bindings
      return { ok: true, origin: {
        session: record.session, channel: record.channel, turn: record.turn,
        callId: record.callId, inputKey: record.inputKey,
        operation: record.operation, server: record.server, allowed: true,
        providerTurn: record.providerTurn, adapterKey: record.adapterKey
      } }
    }
    // OpenCode and custom ACP agents do not necessarily identify an MCP
    // server in permission metadata. Their weaker origin is the authenticated
    // relay itself, accepted only during this visible Nodi turn. It still
    // enters runTool's immutable proposal lifecycle and always waits for the
    // separate Nodi action card.
    if (unmanagedDelivery) {
      if (ask.turn === null || !ask.actionTurn
          || ask.actionBook.session !== ask.token
          || ask.actionBook.channel !== ask.channel
          || ask.actionBook.turn !== ask.actionTurn)
        return { ok: false, error: "The unmanaged action request is from an old turn" }
      if (!ask.shown)
        return { ok: false, error: "The unmanaged action request arrived while the bar is closed" }
      return { ok: true, origin: {
        session: ask.token, channel: ask.channel, turn: ask.actionTurn,
        callId: String(requestId), inputKey: key,
        operation: String(requestId), server: String(server), allowed: true,
        providerTurn: "", adapterKey: relay.adapterKey
      } }
    }
    var matches = []
    for (var i = 0; i < bindings.length; i++)
      if (bindings[i].callId === trustedCallId
          && bindings[i].inputKey === key
          && bindings[i].session === ask.token
          && bindings[i].channel === ask.channel
          && bindings[i].turn === ask.actionTurn
          && bindings[i].providerTurn === relay.providerTurn
          && bindings[i].operation === trustedCallId
          && bindings[i].server === String(server)) matches.push(i)
    if (matches.length !== 1) {
      for (var mi = matches.length - 1; mi >= 0; mi--) bindings.splice(matches[mi], 1)
      ask.runBindings = bindings
      return { ok: false, error: matches.length
        ? "The action request origin is ambiguous"
        : "The action request has no permission-bound origin" }
    }
    var origin = bindings.splice(matches[0], 1)[0]
    origin.adapterKey = relay.adapterKey
    ask.runBindings = bindings
    return { ok: true, origin: origin }
  }

  function actionResponse(requestId, outcome, isError) {
    var result = { content: [{ type: "text", text: JSON.stringify(outcome) }] }
    if (isError) result.isError = true
    return { jsonrpc: "2.0", id: requestId, result: result }
  }

  function publishAction(requestId, outcome, isError) {
    return ask.completeToolResponse(requestId,
      JSON.stringify(ask.actionResponse(requestId, outcome, isError === true)))
  }

  // Every lifecycle end uses this transition. A pending proposal may be
  // refused; a committed proposal is never reported as stopped. When the
  // process itself dies after commit, unknown is the only truthful result.
  function cancelAction(message, committedUnknown) {
    var p = ask.proposal
    if (!p || p.kind !== "action") return false
    var requestId = p.requestId
    var outcome = {
      status: "refused", proposalId: p.id,
      key: p.snapshot ? p.snapshot.key : "", title: p.snapshot ? p.snapshot.title : "",
      message: String(message || "The action was refused.")
    }
    var ended = AskActions.finish(ask.actionBook, requestId, outcome)
    if (!ended.finished && committedUnknown === true) {
      outcome.status = "unknown"
      outcome.message = String(message || "The action outcome is unknown.")
      ended = AskActions.finish(ask.actionBook, requestId, outcome)
    }
    ask.actionBook = ended.book
    if (!ended.finished) return false
    ask.proposal = null
    ask.publishAction(requestId, outcome, false)
    ask.settle()
    return true
  }

  // A fresh ACP session on the same warm process. Session-scoped tokens,
  // commands, forms, plans, remote handles and action authority never cross
  // the boundary.
  function clearSessionScope() {
    ask.turn = null
    ask.calls = Object.create(null)
    ask.actionTurn = ""
    ask.actionBook = AskActions.create("", "", "")
    ask.metadataBook = AskActions.create("", "", "")
    ask.runBindings = []
    ask.codexTurns = []
    ask.claudeTurns = []
    ask.originRejections = ({})
    ask.originRejectionCount = 0
    ask.nextProposal = 0
    ask.proposal = null
    ask.toolResponses = ({})
    ask.toolRequests = ({})
    ask.toolResponseCount = 0
    ask.toolRequestCount = 0
    ask.nextTicket = 0
    ask.capacityFailure = ""
    ask.completedTurn = ""
    ask.waits = ({})
    ask.readActivities = Object.create(null)
    ask.readActivityCount = 0
    ask.thoughtActivity = ""
    ask.activitySeq = 0
    ask.lastMessage = ""
    ask.afterTool = false
    ask.cut = false
    ask.toolInventory = null
    ask.toolCatalogs = null
    ask.configuring = 0
  }

  function beginFreshSession() {
    ask.retireToolResponses()
    ask.sessionId = ""
    ask.clearSessionScope()
    ask.token = ask.newToken()
    ask.channel = ask.newToken()
    ask.instructed = false
    ask.interactionState = AskInteraction.create(
      ask.processBinding, "", "")
    ask.openSession()
  }

  // A fresh session for the next question: "New question", or long after
  // the last answer. The agent process stays warm.
  function recycle() {
    if (!ask.used) return
    ask.used = false
    ask.lastAt = 0
    ask.turns = []
    ask.pending = null
    ask.question = ""
    ask.message = ""
    ask.context = ""
    ask.image = null
    ask.snapshot = null
    ask.answer = ""
    ask.error = ""
    ask.phase = "idle"
    ask.allowed = ""
    ask.refused = []
    // A request he never answered is refused, so the agent is not left asking.
    if (ask.proposal) ask.deny()
    ask.phase = "idle"
    if (proc.running && ask.stage === "ready") {
      if (ask.turn !== null && ask.sessionId)
        proc.write(Acp.cancel(ask.sessionId))
      ask.turn = null
      ask.actionTurn = ""
      var oldSession = ask.sessionId
      if (oldSession && ask.caps && ask.caps.close) {
        ask.stage = "closing"
        upGuard.since = Date.now()
        upGuard.restart()
        ask.toAgent("close:new", function(id) {
          return Acp.close(id, oldSession)
        })
      } else ask.restart()
    } else if (proc.running) ask.restart()
  }

  // A palette agent change is stronger than a fresh question: cancel the
  // open turn, discard every part of the old provider's conversation, and
  // stop its session. It deliberately starts no replacement and sends no
  // question; typing or Enter warms/uses the newly resolved agent later.
  function switchAway() {
    if (ask.proposal) ask.deny()
    if (ask.turn !== null && proc.running && ask.sessionId) proc.write(Acp.cancel(ask.sessionId))
    ask.used = false
    ask.lastAt = 0
    ask.turns = []
    ask.pending = null
    ask.turn = null
    ask.question = ""
    ask.message = ""
    ask.context = ""
    ask.image = null
    ask.snapshot = null
    ask.answer = ""
    ask.error = ""
    ask.phase = "idle"
    ask.allowed = ""
    ask.refused = []
    ask.calls = Object.create(null)
    var running = proc.running
    ask.resetSession()
    if (running) ask.restart(false)
  }

  // A fallback agent keeps the effective message ready, but remains idle:
  // the user must press Enter before send() reuses it.
  function prepare(q, message, context, image) {
    ask.question = String(q || "")
    ask.message = message === undefined ? ask.question : String(message)
    ask.context = context === undefined ? "" : String(context)
    ask.image = image === undefined ? null : image
    ask.pending = null
    ask.phase = "idle"
  }

  // The session ends, and the bar's tool server with it: a call it makes
  // after this reaches nothing (serve).
  function restart(warmAfter) {
    ask.recycling = true
    ask.warmAfterRecycle = warmAfter !== false
    ask.retireToolResponses()
    ask.token = ""
    ask.channel = ""
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
    if (p.kind === "elicitation" || p.kind === "command") {
      ask.submitForm()
      return
    }
    if (p.kind === "metadataAction") {
      var ownsMetadata = ask.shown && ask.turn === null
        && ask.completedTurn && ask.completedTurn === ask.metadataBook.turn
        && ask.metadataBook.session === ask.token
        && ask.metadataBook.channel === ask.channel
      var accepted = ownsMetadata
        ? AskActions.commit(ask.metadataBook, p.id)
        : { book: ask.metadataBook, committed: false }
      ask.metadataBook = accepted.book
      ask.proposal = null
      if (!accepted.committed) { ask.phase = "done"; return }
      var result
      try {
        result = ask.committer ? ask.committer(accepted.snapshot)
          : { status: "failed", message: "The bar cannot run rows here." }
      } catch (e) {
        result = { status: "unknown", message: String(e) }
      }
      result = result && typeof result === "object" ? result
        : { status: "unknown", message: "The bar returned no action outcome." }
      ask.metadataBook = AskActions.finish(
        ask.metadataBook, p.requestId, result).book
      ask.phase = "done"
      return
    }
    if (p.kind === "action") {
      var owns = ask.shown && ask.turn !== null && p.snapshot
        && p.snapshot.session === ask.token
        && p.snapshot.turn === ask.actionTurn
        && ask.actionBook.session === ask.token
        && ask.actionBook.turn === ask.actionTurn
        && ask.actionBook.channel === ask.channel
      if (!owns) {
        ask.cancelAction("The action could no longer be confirmed.", false)
        return
      }
      if (!ask.markToolResponseCommitted(p.requestId)) {
        ask.cancelAction("The action response was already terminal.", false)
        return
      }
      var committed = AskActions.commit(ask.actionBook, p.id)
      ask.actionBook = committed.book
      if (!committed.committed) {
        ask.cancelAction("The action could no longer be confirmed.", false)
        return
      }
      ask.proposal = null
      var outcome
      try {
        outcome = ask.committer ? ask.committer(committed.snapshot)
                                : { status: "failed", message: "The bar cannot run rows here." }
      } catch (e) {
        outcome = { status: "unknown", message: String(e) }
      }
      outcome = outcome && typeof outcome === "object" ? outcome : { status: "unknown", message: "The bar returned no action outcome." }
      if (["executed", "failed", "unknown"].indexOf(String(outcome.status || "")) === -1)
        outcome = { status: "unknown", message: String(outcome.message || "The bar returned an invalid action outcome.") }
      outcome = Object.assign({}, outcome, {
        proposalId: p.id,
        key: String(outcome.key || committed.snapshot.key || ""),
        title: String(outcome.title || committed.snapshot.title || "")
      })
      var finished = AskActions.finish(ask.actionBook, p.requestId, outcome)
      ask.actionBook = finished.book
      if (finished.finished) ask.publishAction(p.requestId, outcome, false)
      ask.settle()
      return
    }
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
    if (p.kind === "elicitation" || p.kind === "command") {
      ask.cancelForm()
      return
    }
    if (p.kind === "metadataAction") {
      ask.metadataBook = AskActions.finish(
        ask.metadataBook, p.requestId, { status: "refused" }).book
      ask.proposal = null
      ask.phase = "done"
      return
    }
    if (p.kind === "action") {
      ask.cancelAction("The action was refused.", false)
      return
    }
    ask.proposal = null
    if (p.kind === "permission") {
      proc.write(Acp.result(p.id, Acp.choose(p.options, false)))
      if (ask.turn !== null) ask.refused = ask.refused.concat([String(p.title || "a tool")])
    }
    else if (p.kind === "auth") { ask.fail("Not signed in to " + ask.agentName + ask.signInHint()); return }
    ask.settle()
  }

  // Capacity is a session boundary: no accepted ID is evicted. Every
  // accepted mailbox request gets one immutable terminal response, all
  // issued tickets are retired, and the provider is stopped.
  function sessionCapacityExceeded(kind) {
    if (ask.capacityFailure) return false
    var why = "Ask ended this session after reaching its " + String(kind) + " limit."
    ask.capacityFailure = why
    if (ask.proposal && ask.proposal.kind === "action")
      ask.cancelAction(why, true)
    ask.proposal = null
    for (var key in ask.toolRequests) {
      if (!Object.prototype.hasOwnProperty.call(ask.toolRequests, key)) continue
      var item = ask.toolRequests[key]
      if (!item || item.state === "ready") continue
      var status = item.state === "committed" ? "unknown" : "error"
      item.state = "ready"
      item.response = JSON.stringify(ask.actionResponse(item.id, {
        status: status, message: why
      }, true))
    }
    ask.toolRequestsChanged()
    ask.terminalizeReadActivities("failed")
    ask.pending = null
    ask.allowed = ""
    ask.error = why
    ask.phase = "error"
    ask.stage = "failed"
    ask.retireToolResponses()
    ask.token = ""
    ask.channel = ""
    ask.failedAt = Date.now()
    if (proc.running && !ask.recycling) {
      ask.ending = true
      ask.stop()
    }
    return false
  }

  // The session failed while he waited: the question ends with why, and a
  // request it made goes with it. A session that never came up is ended,
  // so the next question starts one afresh.
  function fail(why) {
    ask.pending = null
    var p = ask.proposal
    if (p && p.kind === "action") ask.cancelAction(String(why), true)
    ask.proposal = null
    if (p && p.kind === "permission" && proc.running) proc.write(Acp.result(p.id, Acp.choose(p.options, false)))
    ask.allowed = ""
    ask.terminalizeReadActivities("failed")
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

  function recordRuntimeMetadata(meta) {
    var inventory = Acp.inventory(meta, String(ask.agent))
    if (inventory) ask.toolInventory = inventory
    var catalogs = Acp.catalogs(meta, String(ask.agent))
    if (catalogs) ask.toolCatalogs = catalogs
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
      ask.interactionState = AskInteraction.create(
        ask.processBinding, ask.sessionId, "")
      ask.recordRuntimeMetadata(m.result._meta)
      ask.configureSession(m.result)
    } else if (kind === "sessions") {
      if (why) return
      var listed = AskInteraction.sessionList(m.result)
      var next = ask.interactionState
      if (next && next.process === ask.processBinding
          && next.session === ask.sessionId) {
        next = Object.assign({}, next, {
          sessions: listed.sessions,
          nextCursor: listed.nextCursor
        })
        ask.interactionState = next
        ask.interactionRevision++
      }
    } else if (kind === "close:new") {
      if (why) ask.restart()
      else ask.beginFreshSession()
    } else if (kind === "close:resume") {
      if (why) {
        ask.resumeTarget = null
        ask.fail(ask.agentName + " could not close the current session: " + why)
      } else ask.beginResume()
    } else if (kind === "resume") {
      if (why) {
        ask.resumeTarget = null
        ask.fail(ask.agentName + " could not resume the session: " + why)
        return
      }
      ask.resumeTarget = null
      ask.recordRuntimeMetadata(m.result && m.result._meta)
      ask.configureSession(m.result)
    } else if (kind.indexOf("config:") === 0) {
      if (why) { ask.fail(ask.agentName + " could not set its " + kind.slice(7) + ": " + why); return }
      if (--ask.configuring === 0) ask.sessionUp()
    } else if (kind === "auth") {
      ask.signingIn = false
      if (why) { ask.fail("Signing in to " + ask.agentName + " failed: " + why + ask.signInHint()); return }
      // Signed in: the session has its own time again to come up.
      upGuard.since = Date.now()
      upGuard.restart()
      ask.openSession()
    } else if (kind === "prompt") {
      // The agent echoes the id it was given; a string for a number is
      // still this turn's answer.
      if (String(m.id) !== String(ask.turn)) return
      var finishedTurn = ask.actionTurn
      ask.interactionState = AskInteraction.finish(
        ask.interactionState, ask.processBinding, ask.sessionId,
        finishedTurn, m.result)
      ask.interactionRevision++
      ask.completedTurn = finishedTurn
      ask.metadataBook = AskActions.create(
        ask.token, finishedTurn, ask.channel)
      ask.turn = null
      ask.terminalizeReadActivities(why ? "failed" : "completed")
      ask.lastAt = Date.now()
      // The agent's own words, when it said why before failing (Codex says
      // "out of credits", then fails with "Internal error").
      if (why) { ask.fail(ask.answer.trim() ? ask.answer.trim().split("\n")[0].slice(0, 300) : why); return }
      var stop = Acp.stopped(m.result && m.result.stopReason)
      if (stop && !ask.answer) { ask.fail(stop); return }
      if (stop) ask.answer += "\n\n(" + stop + ")"
      if (ask.refused.length) ask.answer = Acp.withRefused(ask.answer, ask.refused, ask.answerMax)
      ask.refused = []
      // A row the bar's run showed waits for him after the answer ends.
      ask.phase = ask.proposal ? "proposing" : "done"
    }
  }

  property int configuring: 0

  function configureSession(result) {
    // The mode Ask needs, and the model asked for, before any question,
    // including after session/resume.
    var want = Acp.configure(ask.sessionId, result,
                             ask.spec ? ask.spec.mode : "",
                             ask.spec && !ask.spec.modelInMeta ? ask.model : "")
    if (want.error) {
      ask.fail(ask.agentName + " could not start as Ask needs: " + want.error)
      return
    }
    ask.stage = "config"
    ask.configuring = want.requests.length
    want.requests.forEach(function(q) {
      ask.toAgent("config:" + q.what, function(id) {
        return Acp.request(id, q.method, q.params)
      })
    })
    if (!ask.configuring) ask.sessionUp()
  }

  function makeSessionServers() {
    var servers = []
    var env = { NODI_ASK_SESSION: ask.token, NODI_ASK_CHANNEL: ask.channel }
    for (var k in ask.toolEnv || {}) env[k] = ask.toolEnv[k]
    if (ask.actionServerAvailable)
      servers.push(Acp.stdioServer(
        ask.actionServer, ask.toolServer, ["mcp", "--ask"], env))
    if (ask.providesActions)
      servers = servers.concat(Acp.servers(ask.mcp, ask.caps.http))
    return servers
  }

  function openSession() {
    // A new session knows nothing of the turns before it: a restart (a
    // setting changed, the agent died) must not show or hand on a history
    // the agent has lost (2026-10-11).
    ask.turns = []
    var servers = ask.makeSessionServers()
    var meta = ask.spec && ask.spec.meta ? ask.spec.meta(ask.actionServerAvailable, ask.actionServer) : null
    // Instructions that went with the start do not go again with a prompt.
    ask.instructed = !!ask.spec && ask.spec.instructs
    ask.sessionServers = servers
    ask.stage = "session"
    ask.toAgent("session", function(id) { return Acp.newSession(id, ask.workDir, servers, meta) })
  }

  function sessionUp() {
    ask.stage = "ready"
    upGuard.stop()
    if (ask.caps && ask.caps.list && ask.caps.resume)
      ask.toAgent("sessions", function(id) {
        return Acp.listSessions(id, ask.workDir, "")
      })
    ask.flush()
  }

  // The agent needs him signed in: he is asked in the bar, by its first
  // way of signing in, when the bar is open to ask him; else it fails
  // with what the agent said.
  function signInHint() {
    var command = Agents.signInCommand(ask.agent, ask.dataDir, ask.registry)
    return ": run " + (command || ask.agent) + " in a terminal"
  }

  function signIn(said) {
    // His time, not the start's: a browser sign-in takes what it takes.
    upGuard.stop()
    var methods = ask.caps ? ask.caps.auth : []
    if (!methods.length || !ask.shown || ask.proposal) {
      ask.fail(ask.agentName + " needs you signed in" + (said ? " (" + said + ")" : "")
               + ask.signInHint())
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
    if (m.method === "elicitation/create") {
      var p = m.params || {}
      var state = AskInteraction.elicit(
        ask.interactionState, ask.processBinding, ask.sessionId,
        ask.actionTurn, m.id, p)
      if (!ask.shown || ask.recycling || ask.turn === null || ask.proposal
          || state === ask.interactionState || !state.form) {
        proc.write(Acp.result(m.id, { action: "cancel" }))
        return
      }
      ask.interactionState = state
      ask.interactionRevision++
      ask.proposal = {
        kind: "elicitation", id: m.id,
        title: state.form.message || "Answer " + ask.agentName,
        subtitle: "", at: Date.now()
      }
      ask.phase = "proposing"
      return
    }
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
    if (!ask.providesActions || ask.recycling || ask.cut || p.sessionId !== ask.sessionId
        || ask.turn === null || !ask.actionTurn) { refuse(); return }
    var callId = typeof tc.toolCallId === "string" && tc.toolCallId ? tc.toolCallId : ""
    var call = Acp.mergeCall(callId ? ask.calls[callId] : null, tc)
    var input = AskTools.input(call)
    var own = AskTools.barTool(call, ask.actionServer)
    if (own === "run" && !callId) own = ""
    // Kept with what the request carries, its input often first here.
    if (callId) {
      if (own === "run")
        ask.calls[callId] = call
      else if (ask.setReadActivity(callId, AskTools.doing(call, ask.actionServer),
                                   call.status))
        ask.calls[callId] = call
    }
    if (own === "search") { proc.write(Acp.result(m.id, Acp.choose(p.options, true))); return }
    if (own === "run") {
      var parsed = AskTools.runInput(input)
      var allowed = parsed.ok && ask.shown && !ask.proposal
      ask.bindRunOrigin(m.id, callId, input, allowed, call)
      proc.write(Acp.result(m.id, Acp.choose(p.options, allowed)))
      return
    }
    if (!ask.shown || ask.proposal) { refuse(); return }
    ask.proposal = { kind: "permission", id: m.id, options: p.options, key: "", title: Acp.title(call), input: input, at: Date.now() }
    ask.phase = "proposing"
  }

  // What the agent says as it works: the answer's text, and its tool calls.
  // Only what belongs to this session's open question; text after a tool
  // ran, or in a new message, starts a paragraph of its own.
  property string lastMessage: ""
  function agentSays(params) {
    if (ask.recycling || !params || params.sessionId !== ask.sessionId) return
    ask.recordRuntimeMetadata(params.update && params.update._meta)
    ask.bindCodexProviderTurn(params.update)
    ask.bindClaudeProviderTurn(params.update)
    var u = Acp.update(params)
    if (u.kind === "interaction") {
      if (u.interaction === "plan" && ask.turn === null) return
      ask.interactionState = AskInteraction.update(
        ask.interactionState, ask.processBinding, ask.sessionId,
        ask.interactionState.turn, u.update)
      ask.interactionRevision++
      return
    }
    if (ask.turn === null) return
    if (u.kind === "text") {
      var answerText = Agents.answerText(ask.agent, u.text)
      if (!answerText || ask.cut) return
      var fresh = u.messageId !== "" && u.messageId !== ask.lastMessage
      if (u.messageId !== "") ask.lastMessage = u.messageId
      var sep = ask.answer && (ask.afterTool || fresh) && !/\n\s*$/.test(ask.answer) ? "\n\n" : ""
      ask.afterTool = false
      ask.thoughtActivity = ""
      var c = Acp.capped(ask.answer, sep, answerText, ask.answerMax)
      if (c.cut) {
        // Past the most an answer holds: what fits, a word that it was
        // cut, the turn cancelled, and a request waiting refused; anything
        // it still says or asks is dropped or refused.
        ask.answer = c.text + "\n\n(Cut here: the answer ran past " + ask.answerMax + " characters.)"
        ask.cut = true
        if (ask.proposal) ask.deny()
        proc.write(Acp.cancel(ask.sessionId))
      } else ask.answer = c.text
      if (ask.phase === "waiting") ask.phase = "streaming"
    } else if (u.kind === "thought") {
      if (!ask.answer && !ask.activity) ask.thoughtActivity = "thinking"
    } else if (u.kind === "tool") {
      var id = String(u.call.toolCallId)
      var c = Acp.mergeCall(ask.calls[id], u.call)
      ask.afterTool = true
      if (AskTools.barTool(c, ask.actionServer) === "run") {
        ask.calls[id] = c
        ask.bindCodexRunOrigin(u.call)
      } else if (ask.setReadActivity(id,
                   c.status === "completed" || c.status === "failed"
                     ? "" : AskTools.doing(c, ask.actionServer),
                   c.status)) {
        ask.calls[id] = c
      }
    }
  }

  // ---------------------------------------------------------------- the bar's tools

  function toolRequestKey(requestId) {
    return typeof requestId + ":" + String(requestId)
  }

  function pendingToolResponse(requestId) {
    var key = ask.toolRequestKey(requestId)
    if (ask.toolResponseCount + ask.retiredToolResponseCount
        >= ask.mailboxTicketLimit) {
      ask.sessionCapacityExceeded("mailbox tickets")
      return ""
    }
    if (!Object.prototype.hasOwnProperty.call(ask.toolRequests, key)) {
      if (ask.toolRequestCount >= ask.actionRequestLimit) {
        ask.sessionCapacityExceeded("action request records")
        return ""
      }
      ask.toolRequests[key] = { id: requestId, state: "pending", response: "" }
      ask.toolRequestCount++
      ask.toolRequestsChanged()
    }
    var ticket = ask.token + ":" + (++ask.nextTicket)
    ask.toolResponses[ticket] = { requestKey: key }
    ask.toolResponseCount++
    ask.toolResponsesChanged()
    return ticket
  }

  function markToolResponseCommitted(requestId) {
    var item = ask.toolRequests[ask.toolRequestKey(requestId)]
    if (!item || item.state !== "pending") return false
    item.state = "committed"
    ask.toolRequestsChanged()
    return true
  }

  function completeToolResponse(requestId, response) {
    var item = ask.toolRequests[ask.toolRequestKey(requestId)]
    if (!item || item.state === "ready") return false
    item.state = "ready"
    item.response = String(response)
    ask.toolRequestsChanged()
    return true
  }

  function toolResponseFor(requestId) {
    var item = ask.toolRequests[ask.toolRequestKey(requestId)]
    if (!item || item.state !== "ready") return null
    try { return JSON.parse(item.response) }
    catch (e) { return { jsonrpc: "2.0", id: item.id, error: { code: -32603, message: "Ask produced an invalid action response" } } }
  }

  // A dead ACP session accepts no new calls, but tickets it already issued
  // keep their authenticated terminal response until that ticket is polled.
  function retireToolResponses() {
    if (!ask.token || !ask.channel) return
    var retired = ask.retiredToolResponses
    var tickets = Object.keys(ask.toolResponses)
    for (var ti = 0; ti < tickets.length; ti++) {
      var ticket = tickets[ti]
      var transport = ask.toolResponses[ticket]
      var item = transport ? ask.toolRequests[transport.requestKey] : null
      if (item && item.state === "ready"
          && !Object.prototype.hasOwnProperty.call(retired, ticket)) {
        if (ask.retiredToolResponseCount >= ask.retiredResponseLimit) {
          ask.sessionCapacityExceeded("retired action responses")
          return
        }
        retired[ticket] = {
          token: ask.token, channel: ask.channel, response: String(item.response)
        }
        ask.retiredToolResponseCount++
      }
      delete ask.toolResponses[ticket]
    }
    ask.toolResponseCount = 0
    ask.toolResponsesChanged()
    ask.retiredToolResponsesChanged()
  }

  // Even a response already known is collected through the mailbox: the
  // shell IPC call returns promptly, and later action work can complete the
  // same ticket after confirmation without holding that IPC connection.
  function queueToolResponse(requestId, jsonRpcResult) {
    var ticket = ask.pendingToolResponse(requestId)
    if (!ticket) return jsonRpcResult
    ask.completeToolResponse(requestId, typeof jsonRpcResult === "string"
      ? jsonRpcResult : JSON.stringify(jsonRpcResult))
    return { nodiPending: ticket }
  }

  function pollToolResponse(ticket) {
    var transport = ask.toolResponses[ticket]
    var item = transport ? ask.toolRequests[transport.requestKey] : null
    if (!item) return { jsonrpc: "2.0", id: null, error: { code: -32603, message: "This action response is no longer available" } }
    if (item.state !== "ready") return { nodiPending: String(ticket) }
    delete ask.toolResponses[ticket]
    ask.toolResponseCount--
    ask.toolResponsesChanged()
    return ask.toolResponseFor(item.id)
  }

  function cancelToolResponse(ticket) {
    var transport = ask.toolResponses[ticket]
    if (!transport) return false
    var item = ask.toolRequests[transport.requestKey]
    delete ask.toolResponses[ticket]
    ask.toolResponseCount--
    ask.toolResponsesChanged()
    if (!item || item.state !== "pending") return false
    if (ask.proposal && ask.proposal.kind === "action"
        && ask.toolRequestKey(ask.proposal.requestId) === transport.requestKey)
      return ask.cancelAction("The action request was cancelled.", false)
    return ask.completeToolResponse(item.id, JSON.stringify({
      jsonrpc: "2.0", id: item.id,
      result: { content: [{ type: "text", text: JSON.stringify({ status: "refused" }) }] }
    }))
  }

  // `nodi mcp --ask`'s one carried relay envelope (Nodi.qml askMcp).
  // Authentication happens before call, poll, or cancel is dispatched.
  function serveCall(arg) {
    var o = null
    try { o = JSON.parse(String(arg)) } catch (e) { o = null }
    if (!o || typeof o !== "object" || typeof o.token !== "string"
        || typeof o.channel !== "string" || typeof o.op !== "string")
      return JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32600, message: "not a message for Ask" } })
    if ((o.op === "poll" || o.op === "cancel") && typeof o.ticket === "string"
        && Object.prototype.hasOwnProperty.call(ask.retiredToolResponses, o.ticket)) {
      var retired = ask.retiredToolResponses[o.ticket]
      if (o.token !== retired.token || o.channel !== retired.channel) return ""
      delete ask.retiredToolResponses[o.ticket]
      ask.retiredToolResponseCount--
      ask.retiredToolResponsesChanged()
      return o.op === "cancel" ? "ok" : retired.response
    }
    if (!ask.token || o.token !== ask.token || !ask.channel
        || o.channel !== ask.channel || ask.recycling) {
      var staleId = null
      var staleRequest = false
      if (o.op === "call" && typeof o.line === "string") {
        try {
          var stale = JSON.parse(o.line)
          staleRequest = !!stale && typeof stale === "object"
            && stale.id !== undefined && typeof stale.method === "string"
          if (staleRequest) staleId = stale.id
        } catch (e) {}
      }
      return staleRequest
        ? JSON.stringify({ jsonrpc: "2.0", id: staleId, error: { code: -32603, message: "This question's session has ended" } })
        : ""
    }
    if (o.op === "poll" && typeof o.ticket === "string")
      return JSON.stringify(ask.pollToolResponse(o.ticket))
    if (o.op === "cancel" && typeof o.ticket === "string") {
      ask.cancelToolResponse(o.ticket)
      return "ok"
    }
    if (o.op !== "call" || typeof o.line !== "string")
      return JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32600, message: "not a message for Ask" } })
    return String(ask.serve(o.token, o.channel, o.line))
  }

  // One message from the agent's `nodi mcp --ask`: the answer as a line,
  // "" for a notification. A server another session started reaches
  // nothing.
  function serve(token, channel, line) {
    var m = null
    try { m = JSON.parse(String(line)) } catch (e) { return JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "parse error" } }) }
    var isRequest = !!m && typeof m === "object" && m.id !== undefined && typeof m.method === "string"
    if (!ask.token || String(token) !== ask.token || !ask.channel
        || String(channel) !== ask.channel || ask.recycling)
      return isRequest ? JSON.stringify({ jsonrpc: "2.0", id: m.id, error: { code: -32603, message: "This question's session has ended" } }) : ""
    var isRun = isRequest && m.method === "tools/call" && m.params && m.params.name === "run"
    if (isRun) {
      var replayRelay = ask.relayOrigin(m, m.id)
      var replayArgs = m.params.arguments && typeof m.params.arguments === "object"
        && !Array.isArray(m.params.arguments) ? m.params.arguments : {}
      var pendingItem = ask.toolRequests[ask.toolRequestKey(m.id)]
      // A live ID already owns its origin and shared mailbox. Validate a
      // duplicate before consuming another origin or touching that mailbox.
      if (pendingItem
          && (pendingItem.state === "pending"
              || pendingItem.state === "committed")) {
        var accepted = ask.actionRequest(m.id)
        var joined = accepted
          ? ask.validateRunReplay(m.id, replayArgs, ask.actionServer,
                                  replayRelay)
          : { ok: false, error: "The pending action request has no accepted origin" }
        if (!joined.ok)
          return JSON.stringify(ask.actionResponse(m.id,
            { status: "error", message: joined.error }, true))
        var joinedTicket = ask.pendingToolResponse(m.id)
        if (joinedTicket)
          return JSON.stringify({ nodiPending: joinedTicket })
        var capacityResult = ask.toolResponseFor(m.id)
        return capacityResult ? JSON.stringify(capacityResult)
          : JSON.stringify(ask.actionResponse(m.id, {
              status: "error",
              message: ask.capacityFailure || "The action session reached its capacity."
            }, true))
      }
      if (ask.toolResponseFor(m.id)) {
        var replay = ask.validateRunReplay(m.id, replayArgs, ask.actionServer,
                                           replayRelay)
        if (!replay.ok)
          return JSON.stringify(ask.actionResponse(m.id,
            { status: "error", message: replay.error }, true))
        var replayTicket = ask.pendingToolResponse(m.id)
        return replayTicket
          ? JSON.stringify({ nodiPending: replayTicket })
          : JSON.stringify(ask.toolResponseFor(m.id))
      }
      var args = replayArgs
      var owned = ask.takeRunOrigin(m.id, args, ask.actionServer,
                                    replayRelay)
      var ticket = ask.pendingToolResponse(m.id)
      if (!ticket) {
        var capacityResponse = ask.toolResponseFor(m.id)
        return capacityResponse ? JSON.stringify(capacityResponse)
          : JSON.stringify(ask.actionResponse(m.id, {
              status: "error",
              message: ask.capacityFailure || "The action session reached its capacity."
            }, true))
      }
      if (!owned.ok) {
        ask.rememberOriginRejection(m.id, args, ask.actionServer, replayRelay)
        ask.publishAction(m.id, { status: "error", message: owned.error }, true)
        return JSON.stringify({ nodiPending: ticket })
      }
      ask.runTool(m.id, AskTools.runInput(args), owned.origin)
      return JSON.stringify({ nodiPending: ticket })
    }
    var r = AskTools.mcp(m, {
      search: function(q) { return ask.searcher ? ask.searcher(q, ask.actionTurn) : [] },
      run: function(input) { return "" }
    })
    return r ? JSON.stringify(r) : ""
  }

  function preProposalFailure(requestId, message) {
    var failed = AskActions.preProposalError(ask.actionBook, requestId, message)
    ask.actionBook = failed.book
    ask.publishAction(requestId, failed.effect ? failed.effect.result
      : { status: "error", message: String(message || "The action could not be resolved.") }, true)
  }

  function proposalGate(origin) {
    if (!origin.allowed) return "The action permission was refused"
    if (ask.turn === null || !ask.actionTurn) return "The action request has no active turn"
    if (origin.session !== ask.token || origin.channel !== ask.channel
        || origin.turn !== ask.actionTurn) return "The action request is from an old turn"
    if (!ask.shown) return "The bar is closed"
    if (ask.cut) return "The answer was cancelled"
    if (ask.proposal) return "Another confirmation is already shown"
    return ""
  }

  function runTool(requestId, input, origin) {
    var begun = AskActions.begin(ask.actionBook, {
      id: requestId,
      session: origin.session,
      turn: origin.turn,
      channel: origin.channel,
      callId: origin.callId,
      providerTurn: origin.providerTurn || "",
      adapterKey: origin.adapterKey || "",
      inputKey: origin.inputKey,
      operation: origin.operation || ("run:" + typeof requestId + ":" + String(requestId)),
      server: origin.server,
      kind: input.ok ? input.kind : "invalid",
      value: input.ok ? input.value : null
    })
    ask.actionBook = begun.book
    var effect = begun.effect || {}
    if (effect.type === "join") return
    if (effect.type === "replay") {
      ask.publishAction(requestId, effect.result, effect.result.status === "error")
      return
    }
    if (effect.type === "capacity") {
      ask.sessionCapacityExceeded("action request records")
      return
    }
    if (effect.type !== "resolve") {
      ask.publishAction(requestId, {
        status: "error", message: String(effect.error || "The action could not be started.")
      }, true)
      return
    }
    if (!input.ok) {
      ask.preProposalFailure(requestId, input.error)
      return
    }
    var gate = ask.proposalGate(origin)
    if (gate) {
      ask.preProposalFailure(requestId, gate)
      return
    }

    var resolved
    try {
      resolved = ask.resolver ? ask.resolver(effect.kind, effect.value, origin.turn)
                              : { ok: false, error: "The bar cannot resolve rows here." }
    } catch (e) {
      resolved = { ok: false, error: String(e) }
    }
    if (!resolved || !resolved.ok || !resolved.snapshot) {
      ask.preProposalFailure(requestId,
        resolved && resolved.error ? resolved.error : "No matching row")
      return
    }
    gate = ask.proposalGate(origin)
    if (gate) {
      ask.preProposalFailure(requestId, gate)
      return
    }

    var proposalId = ask.token + ":proposal:" + (++ask.nextProposal)
    var snapshot = Object.assign({}, resolved.snapshot, {
      id: proposalId,
      session: origin.session,
      turn: origin.turn,
      operation: effect.operation
    })
    var proposed = AskActions.resolve(ask.actionBook, requestId, snapshot, proposalId)
    ask.actionBook = proposed.book
    if (!proposed.effect || proposed.effect.type !== "confirm") {
      ask.publishAction(requestId, { status: "error", message: "The action request became stale." }, true)
      return
    }
    ask.proposal = {
      kind: "action", id: proposalId, requestId: requestId,
      snapshot: ask.actionBook.proposal.snapshot, at: Date.now()
    }
    ask.phase = "proposing"
  }

  // ---------------------------------------------------------------- the process

  Reader {
    id: readyCheck
    timeoutMs: 10000
    maxBytes: 4096
    onFinished: function(text, ok, key) {
      if (ok && key === ask.adapterKey && /(^|\n)nodi: adapter ready\s*$/.test(readyCheck.errorTail)) { ask.readyAdapter = key; ask.notInstalled = "" }
      ask.checkedAdapter = String(key)
    }
  }

  Process {
    id: proc
    stdinEnabled: true
    // Only what `environment()` names, and the agent's own (warm).
    clearEnvironment: true
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
        // The adapter is the shipped lock's tree, installed now or before:
        // the rows stop saying an Enter installs it.
        if (l === "nodi: adapter ready" && !ask.recycling) { ask.readyAdapter = ask.adapterKey; ask.notInstalled = "" }
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
      ask.cancelAction(ask.agentName + " could not start", true)
      ask.resetSession()
      ask.ending = false
      if (ask.recycling) { ask.recycling = false; ask.warmAfterRecycle = true; return }
      ask.pending = null
      if (ask.busy()) ask.fail(ask.agentName + " could not start")
    }
    onExited: function(exitCode) {
      ask.started = false
      upGuard.stop()
      // The launch script's word for why it stopped; not what it said on
      // the way (installing, ready), which is no reason.
      var said = ask.errTail.split("\n").filter(function(l) { return /^nodi: /.test(l) && !/^nodi: (installing .*|adapter ready)$/.test(l) })
      var last = ask.errTail.split("\n").filter(function(l) { return l.trim() !== "" })
      var why = said.length ? said[said.length - 1].slice(6) : last.length ? last[last.length - 1] : "exit " + exitCode
      ask.cancelAction(ask.agentName + " stopped: " + why, true)
      ask.resetSession()
      // Not installed, and not asked to install: nothing failed. A question
      // asked meanwhile starts it again, to install. Only the launch
      // script's own word for it, from a start not allowed to install: an
      // agent that exits 75 for its own reasons fails as any other.
      if (exitCode === 75 && ask.adapterKey && !ask.startInstalls && !ask.recycling && !ask.ending && said.length && /is not installed$/.test(said[said.length - 1])) {
        ask.notInstalled = ask.adapterKey
        if (ask.pending) ask.warm()
        return
      }
      // A recycled session's exit is expected, and a question asked since
      // waits in `pending` for the fresh one.
      if (ask.recycling) {
        var warm = ask.warmAfterRecycle || !!ask.pending
        ask.recycling = false
        ask.warmAfterRecycle = true
        ask.ending = false
        if (warm) ask.warm()
        return
      }
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
      if (ask.resumeTarget) ask.fail(ask.agentName + " did not resume the saved session")
      else if (ask.busy()) ask.fail(ask.signingIn ? "Signing in to " + ask.agentName + " did not finish"
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

  // TERM and, if it is still there three seconds later, KILL: the
  // killGuard's way, by a program of its own, as this goes with its timers.
  Component.onDestruction: {
    if (!proc.running) return
    var argv = Agents.stopArgv(proc.processId)
    if (argv) Quickshell.execDetached(argv)
    else proc.signal(15)
  }
}
