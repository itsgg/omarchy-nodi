.pragma library

function own(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key)
}

function requestKey(id) {
  return typeof id + ":" + String(id)
}

var ACTION_REQUEST_LIMIT = 1024

function requestLimit() {
  return ACTION_REQUEST_LIMIT
}

function requestCount(book) {
  return Number(book && book.requestCount || 0)
}

function requestAt(book, key) {
  var requests = book && book.requests
  return requests && key in requests ? requests[key] : null
}

function clone(value) {
  if (!value || typeof value !== "object") return value
  var out = Array.isArray(value) ? [] : {}
  for (var key in value)
    if (own(value, key)) out[key] = clone(value[key])
  return out
}

function copyBook(book) {
  return {
    session: book.session, turn: book.turn, channel: book.channel,
    active: book.active, proposal: book.proposal, terminal: book.terminal,
    requests: book.requests, requestCount: requestCount(book)
  }
}

// A request update is an O(1) overlay. Older books retain their own view,
// while direct requests[key] lookup still sees every accepted ID.
function writeRequest(book, key, request) {
  var requests = Object.create(book.requests || null)
  requests[key] = request
  book.requests = requests
}

function result(book, extra) {
  var out = extra || {}
  out.book = book
  return out
}

function create(sessionId, turnId, channel) {
  return {
    session: String(sessionId), turn: String(turnId), channel: String(channel),
    active: null, proposal: null, terminal: null,
    requests: Object.create(null), requestCount: 0
  }
}

function input(args) {
  var q = args && typeof args.query === "string" && args.query.trim() ? args.query : ""
  var k = args && typeof args.key === "string" && args.key.trim() ? args.key : ""
  if (!!q === !!k) return { ok: false, error: "run needs exactly one of query or key" }
  return { ok: true, kind: q ? "query" : "key", value: q || k }
}

function origin(request) {
  return {
    session: String(request && request.session !== undefined ? request.session : ""),
    turn: String(request && request.turn !== undefined ? request.turn : ""),
    channel: String(request && request.channel !== undefined ? request.channel : ""),
    callId: String(request && request.callId !== undefined ? request.callId : ""),
    providerTurn: String(request && request.providerTurn !== undefined ? request.providerTurn : ""),
    adapterKey: String(request && request.adapterKey !== undefined ? request.adapterKey : ""),
    inputKey: String(request && request.inputKey !== undefined ? request.inputKey : ""),
    operation: String(request && request.operation !== undefined ? request.operation : ""),
    server: String(request && request.server !== undefined ? request.server : "")
  }
}

function current(book, trusted) {
  return trusted.session === book.session
      && trusted.turn === book.turn
      && trusted.channel === book.channel
}

function sameOrigin(record, trusted) {
  return record.session === trusted.session
      && record.turn === trusted.turn
      && record.channel === trusted.channel
      && record.callId === trusted.callId
      && record.providerTurn === trusted.providerTurn
      && record.adapterKey === trusted.adapterKey
      && record.inputKey === trusted.inputKey
      && record.operation === trusted.operation
      && record.server === trusted.server
}

function begin(book, request) {
  var next = copyBook(book)
  var id = request && request.id !== undefined ? request.id : ""
  var key = requestKey(id)
  var trusted = origin(request)
  var found = requestAt(next, key)

  if (found) {
    if (!sameOrigin(found, trusted))
      return result(next, { effect: { type: "stale", error: "The action request origin is stale" } })
    if (found.terminal)
      return result(next, { effect: { type: "replay", result: clone(found.terminal) } })
    if (!current(next, trusted))
      return result(next, { effect: { type: "stale", error: "The action request is from an old turn" } })
    return result(next, { effect: { type: "join", requestId: found.id } })
  }

  // The adapter supplies these fields from its trusted transport binding.
  // Reject them before assigning the request ID to this session.
  if (!current(next, trusted))
    return result(next, { effect: { type: "stale", error: "The action request is from an old turn" } })
  if (next.terminal)
    return result(next, { effect: { type: "terminal", error: "This turn already ended its action attempt" } })
  if (next.active)
    return result(next, { effect: { type: "busy", error: "Another action request is already in progress" } })
  if (next.requestCount >= ACTION_REQUEST_LIMIT)
    return result(next, { effect: { type: "capacity", error: "The action request limit was reached" } })

  writeRequest(next, key, {
    id: id,
    session: trusted.session,
    turn: trusted.turn,
    channel: trusted.channel,
    callId: trusted.callId,
    providerTurn: trusted.providerTurn,
    adapterKey: trusted.adapterKey,
    inputKey: trusted.inputKey,
    operation: trusted.operation,
    server: trusted.server,
    kind: String(request && request.kind !== undefined ? request.kind : ""),
    value: request ? request.value : undefined,
    phase: "resolving",
    proposalId: null,
    terminal: null
  })
  next.requestCount++
  next.active = key
  return result(next, {
    effect: {
      type: "resolve",
      requestId: id,
      operation: next.requests[key].operation,
      kind: next.requests[key].kind,
      value: next.requests[key].value
    }
  })
}

function resolve(book, requestId, snapshot, proposalId) {
  var next = copyBook(book)
  var key = requestKey(requestId)
  var pid = String(proposalId)
  var request = requestAt(next, key)
  if (!request || next.active !== key || request.phase !== "resolving"
      || !current(next, request) || next.proposal || next.terminal)
    return result(next, { effect: { type: "stale", error: "The action request can no longer propose" } })

  request = clone(request)
  writeRequest(next, key, request)
  var captured = clone(snapshot)
  request.phase = "awaiting_confirmation"
  request.proposalId = pid
  next.proposal = {
    id: pid,
    requestId: request.id,
    requestKey: key,
    session: next.session,
    turn: next.turn,
    channel: next.channel,
    status: "pending",
    snapshot: captured
  }
  return result(next, {
    effect: { type: "confirm", proposalId: pid, snapshot: clone(captured) }
  })
}

function preProposalError(book, requestId, message) {
  var next = copyBook(book)
  var key = requestKey(requestId)
  var request = requestAt(next, key)
  if (!request || next.active !== key || request.phase !== "resolving")
    return result(next, { finished: false })

  request = clone(request)
  writeRequest(next, key, request)
  var terminal = { status: "error", message: String(message || "") }
  request.phase = "terminal"
  request.terminal = terminal
  next.active = null
  return result(next, {
    finished: true,
    effect: { type: "error", result: clone(terminal) }
  })
}

function commit(book, proposalId) {
  var next = copyBook(book)
  var pid = String(proposalId)
  var proposal = next.proposal
  var request = proposal ? requestAt(next, proposal.requestKey) : null
  if (!proposal || proposal.id !== pid || proposal.status !== "pending"
      || proposal.session !== next.session || proposal.turn !== next.turn
      || proposal.channel !== next.channel
      || !request || !current(next, request)
      || next.active !== proposal.requestKey
      || request.phase !== "awaiting_confirmation"
      || request.proposalId !== pid || next.terminal)
    return result(next, { committed: false, snapshot: null })

  proposal = clone(proposal)
  request = clone(request)
  next.proposal = proposal
  writeRequest(next, proposal.requestKey, request)
  proposal.status = "committed"
  request.phase = "executing"
  return result(next, { committed: true, snapshot: clone(proposal.snapshot) })
}

function finish(book, requestId, outcome) {
  var next = copyBook(book)
  var key = requestKey(requestId)
  var request = requestAt(next, key)
  var final = clone(outcome || {})
  var status = String(final.status || "")
  if (!request || next.active !== key || request.terminal)
    return result(next, { finished: false })

  var beforeCommit = request.phase === "awaiting_confirmation"
      && (status === "refused" || status === "dismissed" || status === "cancelled")
  var afterCommit = request.phase === "executing"
      && (status === "executed" || status === "failed" || status === "unknown")
  if (!beforeCommit && !afterCommit)
    return result(next, { finished: false })

  request = clone(request)
  writeRequest(next, key, request)
  request.phase = "terminal"
  request.terminal = final
  next.active = null
  next.terminal = {
    requestId: request.id,
    proposalId: request.proposalId,
    status: status
  }
  if (next.proposal && next.proposal.requestKey === key) {
    next.proposal = clone(next.proposal)
    next.proposal.status = status
  }
  return result(next, {
    finished: true,
    effect: { type: "complete", result: clone(final) }
  })
}

function display(book, readActivities) {
  var request = book.active ? requestAt(book, book.active) : null
  if (request && current(book, request)) {
    if (request.phase === "resolving") return "Resolving a bar action"
    if (request.phase === "awaiting_confirmation") return "Waiting for confirmation"
    if (request.phase === "executing") return "Running a bar action"
  }

  var reads = readActivities || {}
  var newest = null
  for (var operation in reads) {
    if (!own(reads, operation)) continue
    var activity = reads[operation]
    if (!activity || activity.turn !== book.turn
        || (activity.session !== undefined && activity.session !== book.session)
        || typeof activity.text !== "string" || !activity.text)
      continue
    if (!newest || Number(activity.seq || 0) > Number(newest.seq || 0))
      newest = activity
  }
  return newest ? newest.text : ""
}
