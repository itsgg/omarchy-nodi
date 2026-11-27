.pragma library
.import "AskActions.js" as AskActions

// The mailbox the bar's run tool answers through (components/Ask.qml): a
// request ID's one terminal response, and the transport tickets `nodi mcp
// --ask` polls for it. A ticket outlives its session only as a retired
// response its own token and channel may collect once.
//
// Each function takes a box of Ask's mailbox state:
//   { requests, responses, retired, requestCount, responseCount,
//     retiredCount, nextTicket, token, channel, ticketLimit, requestLimit,
//     retiredLimit }
// writes its maps and counts in place, as Ask's own properties, and
// returns { value, changed: { requests, responses, retired }, capacity },
// `capacity` naming a limit reached, which ends the session.

function result(value, changed, capacity) {
  var out = { value: value, changed: changed || {} }
  if (capacity) out.capacity = capacity
  return out
}

function key(requestId) {
  return AskActions.requestKey(requestId)
}

// What the agent's tools/call is answered with.
function response(requestId, outcome, isError) {
  var r = { content: [{ type: "text", text: JSON.stringify(outcome) }] }
  if (isError) r.isError = true
  return { jsonrpc: "2.0", id: requestId, result: r }
}

// A ticket for the request's response, its record opened on first sight.
function pending(box, requestId) {
  var k = key(requestId)
  if (box.responseCount + box.retiredCount >= box.ticketLimit)
    return result("", null, "mailbox tickets")
  var changed = {}
  if (!Object.prototype.hasOwnProperty.call(box.requests, k)) {
    if (box.requestCount >= box.requestLimit)
      return result("", null, "action request records")
    box.requests[k] = { id: requestId, state: "pending", response: "" }
    box.requestCount++
    changed.requests = true
  }
  var ticket = box.token + ":" + (++box.nextTicket)
  box.responses[ticket] = { requestKey: k }
  box.responseCount++
  changed.responses = true
  return result(ticket, changed)
}

// His Enter won: the response may no longer say refused.
function commit(box, requestId) {
  var item = box.requests[key(requestId)]
  if (!item || item.state !== "pending") return result(false)
  item.state = "committed"
  return result(true, { requests: true })
}

function complete(box, requestId, text) {
  var item = box.requests[key(requestId)]
  if (!item || item.state === "ready") return result(false)
  item.state = "ready"
  item.response = String(text)
  return result(true, { requests: true })
}

function responseFor(box, requestId) {
  var item = box.requests[key(requestId)]
  if (!item || item.state !== "ready") return null
  try { return JSON.parse(item.response) }
  catch (e) { return { jsonrpc: "2.0", id: item.id, error: { code: -32603, message: "Ask produced an invalid action response" } } }
}

// A dead ACP session accepts no new calls, but tickets it already issued
// keep their authenticated terminal response until that ticket is polled.
function retire(box) {
  if (!box.token || !box.channel) return result(undefined)
  var tickets = Object.keys(box.responses)
  for (var ti = 0; ti < tickets.length; ti++) {
    var ticket = tickets[ti]
    var transport = box.responses[ticket]
    var item = transport ? box.requests[transport.requestKey] : null
    if (item && item.state === "ready"
        && !Object.prototype.hasOwnProperty.call(box.retired, ticket)) {
      if (box.retiredCount >= box.retiredLimit)
        return result(undefined, null, "retired action responses")
      box.retired[ticket] = {
        token: box.token, channel: box.channel, response: String(item.response)
      }
      box.retiredCount++
    }
    delete box.responses[ticket]
  }
  box.responseCount = 0
  return result(undefined, { responses: true, retired: true })
}

function poll(box, ticket) {
  var transport = box.responses[ticket]
  var item = transport ? box.requests[transport.requestKey] : null
  if (!item) return result({ jsonrpc: "2.0", id: null, error: { code: -32603, message: "This action response is no longer available" } })
  if (item.state !== "ready") return result({ nodiPending: String(ticket) })
  delete box.responses[ticket]
  box.responseCount--
  return result(responseFor(box, item.id), { responses: true })
}

// The relay gave up on a ticket. A request still pending is refused, or,
// when it is the proposal shown (`proposalKey`), `cancelAction` says the
// card is to be withdrawn, which publishes the refusal.
function cancel(box, ticket, proposalKey) {
  var transport = box.responses[ticket]
  if (!transport) return result(false)
  var item = box.requests[transport.requestKey]
  delete box.responses[ticket]
  box.responseCount--
  if (!item || item.state !== "pending") return result(false, { responses: true })
  if (proposalKey !== undefined && proposalKey === transport.requestKey) {
    var out = result(false, { responses: true })
    out.cancelAction = true
    return out
  }
  var done = complete(box, item.id, JSON.stringify({
    jsonrpc: "2.0", id: item.id,
    result: { content: [{ type: "text", text: JSON.stringify({ status: "refused" }) }] }
  }))
  return result(done.value, { responses: true, requests: done.changed.requests })
}

// The session's end: every accepted request still open gets its terminal
// response, unknown once his Enter committed it.
function endAll(box, why) {
  for (var k in box.requests) {
    if (!Object.prototype.hasOwnProperty.call(box.requests, k)) continue
    var item = box.requests[k]
    if (!item || item.state === "ready") continue
    var status = item.state === "committed" ? "unknown" : "error"
    item.state = "ready"
    item.response = JSON.stringify(response(item.id, {
      status: status, message: why
    }, true))
  }
  return result(undefined, { requests: true })
}
