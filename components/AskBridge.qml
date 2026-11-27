import Quickshell
import Quickshell.Io
import QtQuick
import "../lib/Agents.js" as Agents
import "../lib/Sources.js" as Sources
import "../lib/PromptContext.js" as PromptContext
import "../lib/Probes.js" as Probes
import "../lib/Prefs.js" as Prefs
import "../lib/Run.js" as Run
import "../lib/History.js" as History
import "../lib/NodiMcp.js" as NodiMcp
import "../providers/answers.js" as Answers

// Between the bar and Ask (components/Ask.qml): which agent Ask holds and
// which are there to choose (the agent probe), an Ask's context taken as
// it is chosen (the window's working directory, its picture, the files it
// names), the Ask waiting for its agent, and the rows an agent finds and
// proposes. Nodi.qml gives it what it reads of the bar and the few of the
// bar's functions it calls; the bar reads it, never the other way round.
Item {
  id: bridge
  visible: false

  property var session: null         // components/Ask.qml
  property var answer: null          // components/Answer.qml, for an Ask his answers filter takes
  property var input: null           // the bar's field, which an Ask rewrites
  property var config: ({})          // the merged settings (components/ConfigFiles.qml)
  property var prefs: ({})           // prefs.json: the agent he chose
  property string home: ""
  property var cameFrom: ({})        // the window the bar opened over (Nodi.qml noteWindow)
  property var windows: []           // the window list (components/DesktopSources.qml)
  property var selections: null      // components/SelectionReads.qml
  // The bar's own: run a row's action (Nodi.qml execute), save the prefs,
  // a desktop action's command, and the bar's ranking for an agent.
  property var execute: null
  property var savePrefs: null
  property var appAction: null
  property var agentRows: null
  property var agentTop: null

  // What the bar shows changed: an open bar recomputes.
  signal updated()
  // What Nodi says in its toast.
  signal warn(string title, string body)

  // Ask's status as the bar shows it: taken as an Ask starts and when Ask
  // says it changed (syncStatus), never bound to it (Nodi.qml syncAskStatus).
  property string askStatus: ""
  function syncStatus() { bridge.askStatus = bridge.session.status }

  // A window's picture is being taken for an Ask.
  readonly property bool shooting: windowShot.active
  function shoot(argv) { windowShot.run(argv) }

  // Looks for every agent's program again (agentProbe).
  function look() { agentProbe.look() }

  // A file an Ask waits for is given up: the bar closed.
  function dropFileAsk() {
    bridge.pendingFileAsk = null
    if (askFileReader.active) askFileReader.cancel()
  }

  // A direct Ask ends once it is idle and the field no longer names it.
  function releaseDirect(query) {
    if (bridge.directAskAgent && !bridge.session.busy() && !bridge.queryUsesDirectAgent(query))
      bridge.directAskAgent = ""
  }

  // The direct Ask given up for a new one (lib/NodiActions.js askNew).
  function endDirect() { bridge.directAskAgent = "" }

  // The rows an agent found belong to one turn: a new turn starts empty.
  function newTurn(turn) { bridge.askRows = ({ turn: turn, rows: ({}) }) }
  function clearRows() { bridge.askRows = ({ turn: "", rows: ({}) }) }

  // The last login shell's PATH, { at, key, path } (lib/Probes.js): the
  // agents are looked for on it at every open without a login shell.
  property var agentsSeen: null
  function agentsKey(tag) { return tag + "\n" + (Quickshell.env("PATH") || "") }
  // An Ask that failed as a missing program fails: looked for again now.
  Connections {
    target: bridge.session
    function onErrorChanged() {
      if (!Probes.suggestsMissing(bridge.session.error)) return
      bridge.agentsSeen = null
      agentProbe.look()
    }
  }

  // A question about the window, held with what it is about until its
  // picture is taken (askWindow, windowShot).
  function holdShotAsk(a) {
    bridge.shotAsk = Object.assign({}, a, { captured: bridge.askCapture(a.message, a.context, a.purpose) })
  }

  readonly property var askRegistry: Agents.registry(bridge.config.ask)
  property var agentAvailability: ({})
  readonly property var resolvedAgent: Agents.chosen(bridge.config.ask && bridge.config.ask.agent, bridge.omarchyAgent,
                                                     bridge.prefs.askAgent, bridge.askRegistry, bridge.agentAvailability)
  property string directAskAgent: ""
  property var pendingAsk: null
  readonly property var effectiveAskAgent: bridge.directAskAgent || bridge.resolvedAgent
  readonly property string resolvedModel: Agents.modelFor(bridge.effectiveAskAgent, bridge.config.ask, bridge.omarchyAgent, bridge.askRegistry)
  readonly property string resolvedAgentId: typeof bridge.resolvedAgent === "string" ? bridge.resolvedAgent : ""
  readonly property string effectiveAgentId: typeof bridge.effectiveAskAgent === "string" ? bridge.effectiveAskAgent : ""
  readonly property string agentProgram: Agents.program(bridge.effectiveAskAgent, bridge.askRegistry)
  readonly property string resolvedAgentProgram: Agents.program(bridge.resolvedAgent, bridge.askRegistry)
  readonly property string resolvedAvailabilityKey: bridge.effectiveAgentId || (bridge.agentProgram ? "__legacy__" : "")
  readonly property bool agentMissing: !!bridge.resolvedAvailabilityKey && bridge.agentAvailability[bridge.resolvedAvailabilityKey] === false
  readonly property var askAgents: bridge.askRegistry.map(function(a) {
    var program = Agents.program(a.id, bridge.askRegistry)
    var reason = Agents.disabledReason(a.id)
    var available = bridge.agentAvailability[a.id] === true
    return { id: a.id, name: a.name, model: Agents.modelFor(a.id, bridge.config.ask, bridge.omarchyAgent, bridge.askRegistry),
             policy: Agents.policy(a.id, bridge.askRegistry),
             missing: bridge.agentAvailability[a.id] === false ? program : "", reason: reason, available: available,
             current: a.id === bridge.resolvedAgentId }
  })

  // What the agent is told of the Ask beside its question
  // (lib/PromptContext.js), seen now, as the Ask is chosen and never before:
  // the window the bar came from, and the selection only when the action is
  // about it (`context`) and the message holds its text, so the structured
  // copy never carries what the textual prompt does not.
  function askContext(message, context, purpose) {
    var snap = {
      purpose: purpose || "",
      window: Sources.windowSnapshot(bridge.cameFrom, bridge.windows),
      clipboard: bridge.selections.lastCopied || "",
      primarySelection: bridge.selections.selection || ""
    }
    var source = context === "copied" ? "clipboard" : context === "selection" ? "selection" : ""
    if (source && bridge.selections.selectionSource === source && bridge.selections.selection !== "" && String(message || "").indexOf(bridge.selections.selection) !== -1) {
      var seen = source === "clipboard" ? bridge.selections.copiedSeenAt : bridge.selections.selectionSeenAt
      snap.selection = { text: bridge.selections.selection, source: source === "clipboard" ? "clipboard" : "primary", ageMs: Math.max(0, Date.now() - seen) }
    }
    return snap
  }

  // What askContext saw, with the window's own address, which stays here:
  // taken when the Ask is chosen and carried by an Ask that waits for a
  // picture (askWindow), so that what is sent is of the window the question
  // was asked about, not of the one the bar knows when the picture is done.
  function askCapture(message, context, purpose) {
    return { snapshot: bridge.askContext(message, context, purpose), address: String(bridge.cameFrom.address || "") }
  }

  property var pendingFileAsk: null

  function askRoute(qText, agentId) {
    return PromptContext.askRoute({ answered: !!Answers.spec(qText, bridge.config.answers, bridge.cameFrom), agentId: agentId || "",
                                    busy: bridge.session.busy(), shooting: windowShot.active })
  }

  // A turn an agent fallback prepared (askAgentFallback, Ask.qml prepare):
  // idle, on the question still in the field. Enter sends the message the
  // failed turn effectively sent, as it was, with its context: it was
  // expanded when first asked, and expanding it again would read mentions
  // from text he did not type (PromptContext.mentionSource).
  function preparedAsk(question) {
    var q = String(question || "")
    return q !== "" && bridge.session.phase === "idle" && bridge.session.question === q
  }
  function sendPreparedAsk(agentId, question) {
    bridge.askRows = ({ turn: "", rows: ({}) })
    // No message: Ask.send asked again on its question keeps the prepared one.
    bridge.startAsk(agentId || "", question)
  }

  // An Ask, its context expanded (window, clipboard, selection and files),
  // so that an answers filter of his and an ACP agent get the same question.
  function dispatchAsk(question, rawMessage, context, purpose, extraEnv, image, filePath, agentId, answerFresh, commandQuery) {
    var qText = commandQuery || ("ask " + question)
    // Busy: nothing of this Ask is done, the field left as he has it.
    if (bridge.askRoute(qText, agentId) === "busy") return
    bridge.pendingFileAsk = null
    if (askFileReader.active) askFileReader.cancel()
    // An agent named in the field keeps its name there: "ask " would end
    // the direct Ask (queryUsesDirectAgent).
    if (!(agentId && !commandQuery) && bridge.input.text !== qText) {
      bridge.input.text = qText
      bridge.input.cursorPosition = bridge.input.text.length
    }
    var snap = bridge.askCapture(rawMessage || question, context, purpose).snapshot
    var env = extraEnv || (context === "selection" && bridge.selections.selection ? { NODI_SELECTION: bridge.selections.selection } : {})

    // Only what he typed is read for mentions (PromptContext.mentionSource):
    // selected or copied text may carry an @f: of its own.
    var targets = PromptContext.fileTargets(PromptContext.mentionSource(context, question, rawMessage), filePath, bridge.home)

    if (targets.length > 0) {
      var token = Math.random()
      bridge.pendingFileAsk = {
        question: question, rawMessage: rawMessage, context: context,
        purpose: purpose, extraEnv: env, image: image, targets: targets,
        agentId: agentId, snapshot: snap, token: token,
        answerFresh: !!answerFresh, commandQuery: commandQuery
      }
      askFileReader.run(PromptContext.fileReadArgv(targets), bridge.pendingFileAsk)
      return
    }

    bridge.finishDispatchAsk(question, rawMessage, context, purpose, env, image, snap, agentId, answerFresh, commandQuery)
  }

  function finishDispatchAsk(question, rawMessage, context, purpose, extraEnv, image, snapshot, agentId, answerFresh, commandQuery) {
    var qText = commandQuery || ("ask " + question)
    var expanded = PromptContext.expandFor(context, question, rawMessage, snapshot)
    // Again after a file read: the agent may have taken another question since.
    var route = bridge.askRoute(qText, agentId)
    if (route === "busy") return
    if (route === "answer") {
      var ansSpec = Answers.spec(qText, bridge.config.answers, bridge.cameFrom, expanded, extraEnv)
      if (answerFresh) ansSpec.fresh = true
      bridge.answer.start(ansSpec)
      return
    }
    bridge.askRows = ({ turn: "", rows: ({}) })
    bridge.startAsk(agentId || "", question, expanded, context, image, purpose, { snapshot: snapshot, address: String(bridge.cameFrom.address || "") })
  }

  // `captured` (askCapture) is the context of an Ask chosen earlier.
  function startAsk(id, question, message, context, image, purpose, captured) {
    if (bridge.pendingAsk || bridge.session.busy() || windowShot.active) return false
    var direct = !!id
    var target = direct ? Agents.canonicalId(id) : bridge.resolvedAgent
    if (direct && (!Agents.byId(bridge.askRegistry, target) || Agents.disabledReason(target)
        || bridge.agentAvailability[target] !== true)) return false
    var made = captured && captured.snapshot ? captured : bridge.askCapture(message, context, purpose)
    var snapshot = made.snapshot
    bridge.pendingAsk = { direct: direct, target: target, question: String(question || ""),
                        message: message, context: context, image: image, snapshot: snapshot, cwdWait: false }
    bridge.directAskAgent = direct ? target : ""
    bridge.askStatus = bridge.session.status
    // The window's working directory, one bounded read now; the Ask waits
    // for it, and goes without it when the read fails (windowCwdReader). The
    // pid goes in the reader's environment, never its argv, and only while
    // the window list still holds this window's address with that pid: a pid
    // is a number another program may take. The address stays here, out of
    // what the agent is told.
    var pid = snapshot.window.pid || 0
    var address = made.address
    var env = Sources.cwdEnv(pid)
    if (env && Sources.sameWindow(bridge.windows, address, pid)) {
      bridge.pendingAsk.cwdWait = true
      bridge.pendingAsk.token = Math.random()
      windowCwdReader.run(Sources.cwdArgv(), { token: bridge.pendingAsk.token, pid: pid, address: address, env: env })
      return true
    }
    if (direct ? bridge.session.agent === target : bridge.session.agent === bridge.resolvedAgent)
      bridge.flushAsk()
    else Qt.callLater(bridge.flushAsk)
    return true
  }

  // The read of the window's working directory (Sources.cwdArgv), started
  // only by startAsk: a second at most, and 8 KB. Its answer is the
  // pending Ask's if that is still the one waiting and the window list still
  // holds the same window (address and pid) as it did at the start; failing,
  // timing out, another pid's answer, a vanished process or a replaced
  // window leave the directory out, and the Ask goes on.
  Reader {
    id: windowCwdReader
    timeoutMs: 1000
    maxBytes: 8192
    onFinished: function(text, ok, tag) {
      // Matched by token: an object in a `var` signal argument arrives as a
      // copy (Qt 6.12), never the pending Ask itself, so an identity test
      // never matched and the Ask waited for good (NodiAskStatusTest.qml).
      var pending = bridge.pendingAsk
      if (!tag || !pending || pending.token !== tag.token) return
      var cwd = ok && Sources.sameWindow(bridge.windows, tag.address, tag.pid) ? Sources.windowCwd(text, tag.pid) : ""
      if (cwd) pending.snapshot.window.cwd = cwd
      pending.cwdWait = false
      bridge.flushAsk()
    }
  }

  // Bounded (PromptContext.flushStep): an Ask whose agent never comes is
  // given up, said in a toast, never left pending to refuse the next.
  function flushAsk() {
    var pending = bridge.pendingAsk
    if (!pending || pending.cwdWait) return
    var step = PromptContext.flushStep(pending, bridge.session.agent, bridge.resolvedAgent, bridge.directAskAgent)
    if (step === "wait") {
      pending.tries = (pending.tries || 0) + 1
      Qt.callLater(bridge.flushAsk)
      return
    }
    bridge.pendingAsk = null
    if (step === "drop") {
      if (!pending.prepare) bridge.warn("Ask did not send the question", "The agent changed while it waited; ask again")
      return
    }
    if (pending.prepare) bridge.session.prepare(pending.question, pending.message, pending.context)
    else bridge.session.send(pending.question, pending.message, pending.context, pending.image, pending.snapshot)
  }

  function prepareDirectAsk(id, question, message, context) {
    var target = Agents.canonicalId(id)
    if (!Agents.byId(bridge.askRegistry, target) || Agents.disabledReason(target)
        || bridge.agentAvailability[target] !== true) return false
    bridge.pendingAsk = { direct: true, prepare: true, target: target, question: String(question || ""),
                        message: message, context: context }
    bridge.directAskAgent = target
    if (bridge.session.agent === target) bridge.flushAsk()
    else Qt.callLater(bridge.flushAsk)
    return true
  }

  function selectAskAgent(id) {
    id = Agents.canonicalId(id)
    var available = bridge.agentAvailability[id]
    if (!Agents.byId(bridge.askRegistry, id) || Agents.disabledReason(id)
        || (id === bridge.resolvedAgentId ? available === false : available !== true)) return false
    var next = Prefs.withAskAgent(bridge.prefs, id)
    if (!next) return false
    if (id === bridge.resolvedAgentId) {
      bridge.savePrefs(next)
      bridge.directAskAgent = ""
      return true
    }
    bridge.askRows = ({ turn: "", rows: ({}) })
    bridge.savePrefs(next)
    bridge.directAskAgent = ""
    return true
  }

  // Availability for every palette agent, from the same login PATH its
  // session uses. The resolved agent's missing state is one entry in this
  // map, never a second interpretation of raw configuration.
  onAskRegistryChanged: agentProbe.look()
  onResolvedAgentChanged: agentProbe.look()
  onEffectiveAskAgentChanged: {
    // A palette choice or an availability change must end every operation
    // owned by the old agent before the new name is presented.
    bridge.shotAsk = null
    bridge.session.switchAway()
  }
  onAgentMissingChanged: bridge.updated()
  Reader {
    id: agentProbe
    timeoutMs: 5000
    // The session's PATH, as Ask's agent has it (Ask.qml environment), then
    // the login shell's: found here is found there.
    extraEnvironment: ({ PATH: Quickshell.env("PATH") || "" })
    function probeTag() {
      var all = bridge.askRegistry.map(function(a) {
        return [a.id, Agents.disabledReason(a.id) ? "" : Agents.program(a.id, bridge.askRegistry)]
      })
      if (!bridge.resolvedAgentId && bridge.resolvedAgentProgram) all.push(["__legacy__", bridge.resolvedAgentProgram])
      return JSON.stringify(all)
    }
    // Every look asks for each program on the login shell's PATH. Only a
    // look that finds that PATH old, or the programs or the session's PATH
    // changed (lib/Probes.js agentsDue), starts the login shell to learn it
    // again; the others are a plain shell given the PATH learnt, so an
    // agent installed or removed shows at the next open without a login
    // shell's cost at each one.
    readonly property string lookScript: 'while [ "$#" -ge 2 ]; do id=$1 p=$2; shift 2; command -v -- "$p" >/dev/null 2>&1 && printf "%s\\tyes\\n" "$id" || printf "%s\\tno\\n" "$id"; done'
    function look() {
      var tag = probeTag()
      var seen = bridge.agentsSeen
      var argv = Probes.agentsDue(seen, Date.now(), bridge.agentsKey(tag))
        ? ["/usr/bin/bash", "-lc", lookScript + '; printf "@path\\t%s\\n" "$PATH"', "nodi-agent-probe"]
        : ["/usr/bin/bash", "--norc", "--noprofile", "-c", 'PATH=$1; shift; ' + lookScript, "nodi-agent-probe", seen.path]
      for (var i = 0; i < bridge.askRegistry.length; i++)
        argv.push(bridge.askRegistry[i].id, Agents.disabledReason(bridge.askRegistry[i].id) ? ""
                                                   : Agents.program(bridge.askRegistry[i].id, bridge.askRegistry))
      if (!bridge.resolvedAgentId && bridge.resolvedAgentProgram) argv.push("__legacy__", bridge.resolvedAgentProgram)
      agentProbe.run(argv, probeTag())
    }
    onFinished: function(text, ok, tag) {
      if (tag !== agentProbe.probeTag() || !ok) return
      var found = {}
      var lines = String(text || "").trim().split("\n")
      for (var i = 0; i < lines.length; i++) {
        var pair = lines[i].split("\t")
        if (pair[0] === "@path") bridge.agentsSeen = { at: Date.now(), key: bridge.agentsKey(tag), path: pair.slice(1).join("\t") }
        else if (pair.length === 2) found[pair[0]] = pair[1] === "yes"
      }
      bridge.agentAvailability = found
      bridge.updated()
    }
  }

  // Omarchy's default coding agent (omarchy-default-agent), which Ask holds
  // unless nodi.json names another (lib/Agents.js chosen).
  property string omarchyAgent: ""
  FileView {
    path: bridge.home + "/.config/omarchy/defaults/agent"
    printErrors: false
    watchChanges: true
    onLoaded: bridge.omarchyAgent = text().trim()
    onLoadFailed: bridge.omarchyAgent = ""
    onFileChanged: reload()
  }

  // A question about the window, waiting for its picture (askWindow).
  property var shotAsk: null

  Reader {
    id: windowShot
    timeoutMs: 5000
    maxBytes: 8388608
    onActiveChanged: bridge.updated()
    onFinished: function(text, ok) {
      var a = bridge.shotAsk
      bridge.shotAsk = null
      if (!a) return
      var data = ok ? String(text).replace(/\s+/g, "") : ""
      // No picture (the window gone, grim failing): the question goes as
      // text, and says so.
      // Once this read has ended: the reader is still active while it
      // reports, which startAsk refuses.
      var image = data ? { mediaType: "image/jpeg", data: data } : undefined
      var message = data ? a.message : a.question + "\n\n(The window could not be captured.)"
      var context = data ? a.context : ""
      Qt.callLater(function() { bridge.startAsk("", a.question, message, context, image, a.purpose, a.captured) })
    }
  }

  Reader {
    id: askFileReader
    timeoutMs: 1000
    maxBytes: PromptContext.FILE_READ_BYTES
    cancelable: true
    onFinished: function(text, ok, tag) {
      if (!tag || !bridge.pendingFileAsk || bridge.pendingFileAsk.token !== tag.token) return
      var pending = bridge.pendingFileAsk
      bridge.pendingFileAsk = null
      // A file not read is said so in the prompt (PromptContext.fileReads).
      pending.snapshot.files = PromptContext.attachFiles(pending.snapshot.files, pending.targets,
                                                         PromptContext.fileReads(text, ok, pending.targets))
      bridge.finishDispatchAsk(
        pending.question, pending.rawMessage, pending.context,
        pending.purpose, pending.extraEnv, pending.image, pending.snapshot, pending.agentId,
        pending.answerFresh, pending.commandQuery
      )
    }
  }

  // What the agent found for one turn, by key. Request tombstones live in
  // Ask for the ACP session; search rows do not cross turn boundaries.
  property var askRows: ({ turn: "", rows: ({}) })

  // A row as an agent reads it; a row that asks says how.
  function agentData(r) { return NodiMcp.agentData(r) }

  // The agent's exploratory search: as data, with its live rows scoped to
  // the prompt turn that requested them.
  function askSearch(q, turnId) {
    var rows = bridge.agentRows(q)
    var all = bridge.askRows.turn === turnId ? Object.assign({}, bridge.askRows.rows) : {}
    for (var i = 0; i < rows.length; i++) all[rows[i].key] = rows[i]
    bridge.askRows = { turn: String(turnId), rows: all }
    return rows.map(bridge.agentData)
  }

  function askCheckRow(row) {
    if (row.confirmWord) return "That row asks for a typed word; he must run it from the bar himself."
    if (row.help) return "That top-ranked row is help and cannot be run."
    if (row.nodi) return "That top-ranked row belongs to Nodi and cannot be run by an agent."
    if (!Run.command(row.run, bridge.appAction, row.title)) return "That row cannot run here."
    return ""
  }

  function askClone(value) {
    if (!value || typeof value !== "object") return value
    var out = Array.isArray(value) ? [] : {}
    for (var key in value)
      if (Object.prototype.hasOwnProperty.call(value, key)) out[key] = bridge.askClone(value[key])
    return out
  }

  function askSnapshot(row, turnId) {
    return bridge.askClone({
      key: String(row.key || ""),
      title: String(row.title || ""),
      subtitle: String(row.subtitle || ""),
      risk: String(row.risk || ""),
      confirmWord: String(row.confirmWord || ""),
      run: row.run,
      toggle: row.toggle,
      rememberKey: row.remember ? String(row.key || "") : "",
      history: History.snapshot(row),
      undoable: !!row.undoable,
      provider: String(row.provider || ""),
      homeExecution: typeof row.homeExecution === "string" ? row.homeExecution : "",
      turn: String(turnId)
    })
  }

  // A direct query resolves only the top-ranked row. If that row is not
  // runnable, a lower row is never silently substituted.
  function askResolve(kind, value, turnId) {
    var row = null
    if (kind === "query") {
      row = bridge.agentTop(value)
    } else {
      row = bridge.askRows.turn === String(turnId) ? bridge.askRows.rows[value] : null
    }
    if (!row) return { ok: false, error: "No matching row" }
    var why = bridge.askCheckRow(row)
    if (why) return { ok: false, error: why }
    return { ok: true, snapshot: bridge.askSnapshot(row, turnId) }
  }

  // Enter executes exactly the proposal snapshot captured before the card
  // appeared; no live row is resolved at commit time.
  function askCommit(snapshot) {
    bridge.input.text = ""
    var executed = bridge.execute(snapshot.run, snapshot.toggle, snapshot.rememberKey,
                                snapshot.history, snapshot.title, snapshot.undoable,
                                snapshot.provider === "home" ? snapshot.key : "", snapshot.homeExecution)
    return executed
      ? { status: "executed", key: snapshot.key, title: snapshot.title }
      : { status: "failed", key: snapshot.key, title: snapshot.title,
          message: "The captured action could not be dispatched." }
  }

  // A direct Ask's query, and the question a query asks (lib/Agents.js).
  function queryUsesDirectAgent(query) {
    return Agents.usesDirect(query, bridge.askRegistry, bridge.directAskAgent)
  }

  function askQuestion(query) {
    return Agents.askQuestion(query, bridge.askRegistry, bridge.directAskAgent)
  }
}
