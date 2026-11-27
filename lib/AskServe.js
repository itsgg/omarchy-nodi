.pragma library
.import "AskActions.js" as AskActions
.import "AskTools.js" as AskTools

// The bar's side of `nodi mcp --ask` (components/Ask.qml): which envelope
// reaches which step, what a run call is answered with, and how an
// accepted run becomes the one proposal he confirms. The order of the
// checks is the decision; the steps are Ask's own (`host` is the Ask
// item, or a test's stand-in with the same members), since a step such
// as a full mailbox ends the session and the next check reads what that
// left.

function error(id, code, message) {
  return JSON.stringify({ jsonrpc: "2.0", id: id, error: { code: code, message: message } })
}

function actionError(host, id, message) {
  return JSON.stringify(host.actionResponse(id, { status: "error", message: message }, true))
}

// The one relay envelope, authenticated before it is dispatched. A ticket
// a dead session issued is answered once, by the token and channel that
// asked for it. Returns { reply } to answer at once, or { op, ticket } /
// { op: "call", token, channel, line } for Ask's step, and `retired` when
// that ticket is to be forgotten.
function envelope(arg, retiredTickets, live) {
  var o = null
  try { o = JSON.parse(String(arg)) } catch (e) { o = null }
  if (!o || typeof o !== "object" || typeof o.token !== "string"
      || typeof o.channel !== "string" || typeof o.op !== "string")
    return { reply: error(null, -32600, "not a message for Ask") }
  if ((o.op === "poll" || o.op === "cancel") && typeof o.ticket === "string"
      && Object.prototype.hasOwnProperty.call(retiredTickets, o.ticket)) {
    var retired = retiredTickets[o.ticket]
    if (o.token !== retired.token || o.channel !== retired.channel) return { reply: "" }
    return { retired: o.ticket, reply: o.op === "cancel" ? "ok" : retired.response }
  }
  if (!live.token || o.token !== live.token || !live.channel
      || o.channel !== live.channel || live.recycling) {
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
    return { reply: staleRequest ? error(staleId, -32603, "This question's session has ended") : "" }
  }
  if (o.op === "poll" && typeof o.ticket === "string") return { op: "poll", ticket: o.ticket }
  if (o.op === "cancel" && typeof o.ticket === "string") return { op: "cancel", ticket: o.ticket }
  if (o.op !== "call" || typeof o.line !== "string")
    return { reply: error(null, -32600, "not a message for Ask") }
  return { op: "call", token: o.token, channel: o.channel, line: o.line }
}

// The answer to a full mailbox: its terminal response when the session's
// end gave one, else why it ended.
function capacityReply(host, id) {
  var response = host.toolResponseFor(id)
  return response ? JSON.stringify(response)
    : actionError(host, id, host.capacityFailure || "The action session reached its capacity.")
}

// One message from the agent's `nodi mcp --ask`: the answer as a line, ""
// for a notification. A server another session started reaches nothing.
function serve(host, token, channel, line) {
  var m = null
  try { m = JSON.parse(String(line)) } catch (e) { return error(null, -32700, "parse error") }
  var isRequest = !!m && typeof m === "object" && m.id !== undefined && typeof m.method === "string"
  if (!host.token || String(token) !== host.token || !host.channel
      || String(channel) !== host.channel || host.recycling)
    return isRequest ? error(m.id, -32603, "This question's session has ended") : ""
  var isRun = isRequest && m.method === "tools/call" && m.params && m.params.name === "run"
  if (isRun) {
    var relay = host.relayOrigin(m, m.id)
    var args = m.params.arguments && typeof m.params.arguments === "object"
      && !Array.isArray(m.params.arguments) ? m.params.arguments : {}
    var pendingItem = host.toolRequests[host.toolRequestKey(m.id)]
    // A live ID already owns its origin and shared mailbox. Validate a
    // duplicate before consuming another origin or touching that mailbox.
    if (pendingItem
        && (pendingItem.state === "pending"
            || pendingItem.state === "committed")) {
      var joined = host.actionRequest(m.id)
        ? host.validateRunReplay(m.id, args, host.actionServer, relay)
        : { ok: false, error: "The pending action request has no accepted origin" }
      if (!joined.ok) return actionError(host, m.id, joined.error)
      var joinedTicket = host.pendingToolResponse(m.id)
      return joinedTicket ? JSON.stringify({ nodiPending: joinedTicket }) : capacityReply(host, m.id)
    }
    if (host.toolResponseFor(m.id)) {
      var replay = host.validateRunReplay(m.id, args, host.actionServer, relay)
      if (!replay.ok) return actionError(host, m.id, replay.error)
      var replayTicket = host.pendingToolResponse(m.id)
      return replayTicket
        ? JSON.stringify({ nodiPending: replayTicket })
        : JSON.stringify(host.toolResponseFor(m.id))
    }
    var owned = host.takeRunOrigin(m.id, args, host.actionServer, relay)
    var ticket = host.pendingToolResponse(m.id)
    if (!ticket) return capacityReply(host, m.id)
    if (!owned.ok) {
      host.rememberOriginRejection(m.id, args, host.actionServer, relay)
      host.publishAction(m.id, { status: "error", message: owned.error }, true)
      return JSON.stringify({ nodiPending: ticket })
    }
    host.runTool(m.id, AskTools.runInput(args), owned.origin)
    return JSON.stringify({ nodiPending: ticket })
  }
  var r = AskTools.mcp(m, {
    search: function(q) { return host.searcher ? host.searcher(q, host.actionTurn) : [] },
    run: function(input) { return "" }
  })
  return r ? JSON.stringify(r) : ""
}

// An accepted run: begun in the action book, resolved by the bar to one
// immutable row, checked again after the bar answered, and shown as the
// one proposal his Enter commits. Every way out publishes a terminal
// response, but a joined duplicate, which shares the first one's.
function runTool(host, requestId, input, origin) {
  var begun = AskActions.begin(host.actionBook, {
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
  host.actionBook = begun.book
  var effect = begun.effect || {}
  if (effect.type === "join") return
  if (effect.type === "replay") {
    host.publishAction(requestId, effect.result, effect.result.status === "error")
    return
  }
  if (effect.type === "capacity") {
    host.sessionCapacityExceeded("action request records")
    return
  }
  if (effect.type !== "resolve") {
    host.publishAction(requestId, {
      status: "error", message: String(effect.error || "The action could not be started.")
    }, true)
    return
  }
  if (!input.ok) {
    host.preProposalFailure(requestId, input.error)
    return
  }
  var gate = host.proposalGate(origin)
  if (gate) {
    host.preProposalFailure(requestId, gate)
    return
  }

  var resolved
  try {
    resolved = host.resolver ? host.resolver(effect.kind, effect.value, origin.turn)
                             : { ok: false, error: "The bar cannot resolve rows here." }
  } catch (e) {
    resolved = { ok: false, error: String(e) }
  }
  if (!resolved || !resolved.ok || !resolved.snapshot) {
    host.preProposalFailure(requestId,
      resolved && resolved.error ? resolved.error : "No matching row")
    return
  }
  gate = host.proposalGate(origin)
  if (gate) {
    host.preProposalFailure(requestId, gate)
    return
  }

  var proposalId = host.token + ":proposal:" + (++host.nextProposal)
  var snapshot = Object.assign({}, resolved.snapshot, {
    id: proposalId,
    session: origin.session,
    turn: origin.turn,
    operation: effect.operation
  })
  var proposed = AskActions.resolve(host.actionBook, requestId, snapshot, proposalId)
  host.actionBook = proposed.book
  if (!proposed.effect || proposed.effect.type !== "confirm") {
    host.publishAction(requestId, { status: "error", message: "The action request became stale." }, true)
    return
  }
  host.proposal = {
    kind: "action", id: proposalId, requestId: requestId,
    snapshot: host.actionBook.proposal.snapshot, at: Date.now()
  }
  host.phase = "proposing"
}
