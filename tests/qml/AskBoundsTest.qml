import QtQuick
import "../../components"

Item {
  id: test
  signal done(bool ok, string report)
  property var failures: []

  function check(ok, what) { if (!ok) test.failures.push(what) }
  function prime(item, suffix) {
    item.token = "token-" + suffix
    item.channel = "channel-" + suffix
    item.sessionId = "session-" + suffix
    item.turn = 1
    item.actionTurn = "turn-" + suffix
    item.stage = "ready"
    item.phase = "waiting"
  }
  function readyResponse(id) {
    return JSON.stringify({
      jsonrpc: "2.0", id: id,
      result: { content: [{ type: "text", text: '{"status":"executed"}' }] }
    })
  }

  Ask { id: operations; program: ["/usr/bin/true"] }
  Ask { id: requests; program: ["/usr/bin/true"] }
  Ask { id: tickets; program: ["/usr/bin/true"] }
  Ask { id: retired; program: ["/usr/bin/true"] }
  Ask { id: bindings; program: ["/usr/bin/true"] }
  Ask { id: rejections; program: ["/usr/bin/true"] }

  function inspectOperationBound() {
    prime(operations, "operations")
    check(operations.operationRecordLimit === 4096, "operation limit is not explicit")
    var records = Object.create(null)
    for (var i = 0; i < operations.operationRecordLimit - 2; i++)
      records["operation-" + i] = {
        session: operations.token, turn: operations.actionTurn,
        text: i === 0 ? "active" : "", seq: i + 1,
        state: i === 0 ? "pending" : "completed", terminal: i !== 0
      }
    operations.readActivities = records
    operations.readActivityCount = operations.operationRecordLimit - 2
    check(operations.setReadActivity("operation-0", "still active", "pending"),
          "an existing operation was rejected at the boundary")
    check(operations.setReadActivity("__proto__", "prototype operation", "pending")
      && operations.readActivityCount === operations.operationRecordLimit - 1
      && Object.prototype.hasOwnProperty.call(operations.readActivities, "__proto__"),
      "__proto__ was not charged as one real operation record")
    check(operations.setReadActivity("__proto__", "", "completed")
      && operations.readActivityCount === operations.operationRecordLimit - 1
      && operations.readActivities["__proto__"].terminal === true,
      "__proto__ completion changed capacity or missed its record")
    check(!operations.setReadActivity("__proto__", "reordered", "pending")
      && operations.readActivityCount === operations.operationRecordLimit - 1
      && operations.readActivities["__proto__"].terminal === true,
      "__proto__ reordered update revived or re-counted its record")
    check(operations.setReadActivity("__thinking", "provider operation", "pending")
      && operations.readActivityCount === operations.operationRecordLimit
      && Object.prototype.hasOwnProperty.call(operations.readActivities, "__thinking"),
      "__thinking provider ID escaped operation capacity accounting")
    check(operations.setReadActivity("__thinking", "", "failed")
      && operations.readActivityCount === operations.operationRecordLimit
      && operations.readActivities["__thinking"].terminal === true,
      "__thinking completion changed capacity or missed its record")
    check(!operations.setReadActivity("__thinking", "reordered", "pending")
      && operations.readActivityCount === operations.operationRecordLimit
      && operations.readActivities["__thinking"].terminal === true,
      "__thinking reordered update revived or re-counted its record")
    check(!operations.setReadActivity("operation-overflow", "overflow", "pending"),
          "an operation above the limit was accepted")
    check(Object.keys(operations.readActivities).length === operations.operationRecordLimit
      && operations.stage === "failed" && operations.token === "",
      "operation overflow did not terminate fail-closed")
  }

  function inspectRequestBound() {
    prime(requests, "requests")
    check(requests.actionRequestLimit === 1024, "action request limit is not explicit")
    var outcomes = {}
    for (var i = 0; i < requests.actionRequestLimit; i++)
      outcomes["string:request-" + i] = {
        id: "request-" + i, state: "ready",
        response: readyResponse("request-" + i)
      }
    requests.toolRequests = outcomes
    requests.toolRequestCount = requests.actionRequestLimit
    var replayTicket = requests.pendingToolResponse("request-0")
    check(!!replayTicket
      && JSON.stringify(requests.pollToolResponse(replayTicket))
        === requests.toolRequests["string:request-0"].response,
      "the accepted boundary request lost exact replay")
    check(requests.pendingToolResponse("request-overflow") === "",
          "an action request above the limit received a ticket")
    check(Object.keys(requests.toolRequests).length === requests.actionRequestLimit
      && requests.toolRequests["string:request-overflow"] === undefined
      && requests.stage === "failed",
      "action request overflow was registered or left the session live")
  }

  function inspectTicketBound() {
    prime(tickets, "tickets")
    check(tickets.mailboxTicketLimit === 2048, "mailbox ticket limit is not explicit")
    tickets.toolRequests = {
      "string:accepted": {
        id: "accepted", state: "ready", response: readyResponse("accepted")
      }
    }
    var live = {}
    for (var i = 0; i < tickets.mailboxTicketLimit; i++)
      live["ticket-" + i] = { requestKey: "string:accepted" }
    tickets.toolResponses = live
    tickets.toolResponseCount = tickets.mailboxTicketLimit
    check(tickets.pendingToolResponse("accepted") === "",
          "a live mailbox ticket above the limit was accepted")
    check(Object.keys(tickets.retiredToolResponses).length === tickets.mailboxTicketLimit
      && tickets.stage === "failed",
      "ticket overflow dropped accepted terminal responses: "
        + JSON.stringify([Object.keys(tickets.retiredToolResponses).length,
                          tickets.retiredToolResponseCount, tickets.stage,
                          tickets.toolResponseCount]))
  }

  function inspectRetiredBound() {
    prime(retired, "retired")
    check(retired.retiredResponseLimit === 2048, "retired response limit is not explicit")
    var old = {}
    for (var i = 0; i < retired.retiredResponseLimit; i++)
      old["old-ticket-" + i] = {
        token: "old-token", channel: "old-channel",
        response: readyResponse("old-" + i)
      }
    retired.retiredToolResponses = old
    retired.retiredToolResponseCount = retired.retiredResponseLimit
    retired.toolRequests = {
      "string:accepted": {
        id: "accepted", state: "ready", response: readyResponse("accepted")
      }
    }
    check(retired.pendingToolResponse("accepted") === "",
          "a ticket above the retired-response bound was accepted")
    check(Object.keys(retired.retiredToolResponses).length === retired.retiredResponseLimit
      && retired.stage === "failed",
      "retired response overflow evicted accepted responses")
  }

  function inspectBindingBounds() {
    prime(bindings, "bindings")
    check(bindings.runBindingLimit === 512, "run binding limit is not explicit")
    var held = []
    for (var i = 0; i < bindings.runBindingLimit; i++)
      held.push({
        session: bindings.token, channel: bindings.channel,
        turn: bindings.actionTurn, callId: "call-" + i,
        operation: "call-" + i, permissionId: "permission-" + i,
        server: bindings.actionServer, inputKey: '{"query":"lock"}',
        allowed: true, providerTurn: "", adapter: "acp"
      })
    bindings.runBindings = held
    check(!bindings.bindRunOrigin("overflow", "call-overflow",
                                  { query: "lock" }, true),
          "a run binding above the limit was accepted")
    check(bindings.runBindings.length === bindings.runBindingLimit
      && bindings.stage === "failed",
      "run-binding overflow evicted an accepted binding")

    prime(rejections, "rejections")
    check(rejections.rejectionLimit === 1024, "rejection limit is not explicit")
    var tombstones = {}
    for (var j = 0; j < rejections.rejectionLimit; j++)
      tombstones["string:rejected-" + j] = { id: "rejected-" + j }
    rejections.originRejections = tombstones
    rejections.originRejectionCount = rejections.rejectionLimit
    var relay = {
      requestInputKey: '{"query":"lock"}', adapterKey: "adapter"
    }
    check(!rejections.rememberOriginRejection("rejected-overflow",
                                               { query: "lock" },
                                               rejections.actionServer, relay),
          "a rejection tombstone above the limit was accepted")
    check(Object.keys(rejections.originRejections).length === rejections.rejectionLimit
      && rejections.stage === "failed",
      "rejection overflow evicted an accepted tombstone")
  }

  function start() {
    inspectOperationBound()
    inspectRequestBound()
    inspectTicketBound()
    inspectRetiredBound()
    inspectBindingBounds()
    test.done(test.failures.length === 0, test.failures.join("; "))
  }
}
