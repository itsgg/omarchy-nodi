import QtQuick
import "../../components"
import "../../lib/AskActions.js" as AskActions

Item {
  id: test
  signal done(bool ok, string report)
  property var failures: []
  property int sequence: 0
  property int commits: 0

  function check(ok, what) {
    if (!ok) test.failures.push(what)
  }

  function requestMessage(id, callId, input, providerTurn, acpSession) {
    var session = acpSession === undefined ? codex.sessionId : acpSession
    return {
      jsonrpc: "2.0", id: id, method: "tools/call",
      params: {
        name: "run", arguments: input,
        _meta: {
          callId: callId,
          "x-codex-turn-metadata": {
            session_id: session, thread_id: session,
            turn_id: providerTurn
          }
        }
      }
    }
  }

  function parse(raw) {
    try { return JSON.parse(raw) } catch (e) { return null }
  }

  function seed(phase) {
    var number = ++test.sequence
    var id = "request-" + number
    var callId = "call-" + number
    var providerTurn = "provider-" + number
    var input = { query: "lock" }
    codex.token = "token-" + number
    codex.channel = "channel-" + number
    codex.sessionId = "acp-" + number
    codex.turn = number
    codex.actionTurn = "turn-" + number
    codex.shown = true
    codex.phase = "waiting"
    codex.capacityFailure = ""
    codex.originRejections = ({})
    codex.originRejectionCount = 0
    codex.nextTicket = 0
    codex.toolRequests = ({})
    codex.toolResponses = ({})
    codex.toolRequestCount = 1
    codex.toolResponseCount = 1
    codex.retiredToolResponseCount = 0

    var message = test.requestMessage(id, callId, input, providerTurn)
    var relay = codex.relayOrigin(message, id)
    var begun = AskActions.begin(
      AskActions.create(codex.token, codex.actionTurn, codex.channel), {
        id: id, session: codex.token, turn: codex.actionTurn,
        channel: codex.channel, callId: callId,
        providerTurn: providerTurn, adapterKey: relay.adapterKey,
        inputKey: codex.actionInputKey(input), operation: callId,
        server: codex.actionServer, kind: "query", value: "lock"
      })
    var book = begun.book
    var proposalId = codex.token + ":proposal"
    var snapshot = {
      key: "menu:system.lock", title: "Lock",
      session: codex.token, turn: codex.actionTurn,
      operation: callId,
      run: { kind: "exec", argv: ["/usr/bin/test-action", phase] }
    }
    if (phase !== "resolving")
      book = AskActions.resolve(book, id, snapshot, proposalId).book
    if (phase === "executing")
      book = AskActions.commit(book, proposalId).book
    codex.actionBook = book
    codex.proposal = phase === "awaiting_confirmation" ? {
      kind: "action", id: proposalId, requestId: id,
      snapshot: book.proposal.snapshot, at: Date.now()
    } : null
    if (codex.proposal) codex.phase = "proposing"

    var key = codex.toolRequestKey(id)
    codex.toolRequests[key] = {
      id: id, state: phase === "executing" ? "committed" : "pending",
      response: ""
    }
    var originalTicket = codex.token + ":original"
    codex.toolResponses[originalTicket] = { requestKey: key }
    codex.runBindings = [{
      session: codex.token, channel: codex.channel,
      turn: codex.actionTurn, callId: id,
      inputKey: codex.actionInputKey(input), server: codex.actionServer
    }]
    return {
      phase: phase, id: id, callId: callId,
      providerTurn: providerTurn, input: input, message: message,
      key: key, originalTicket: originalTicket
    }
  }

  function preservedState(s) {
    return JSON.stringify({
      request: codex.actionRequest(s.id),
      actionProposal: codex.actionBook.proposal,
      proposal: codex.proposal,
      mailbox: codex.toolRequests[s.key],
      requestCount: codex.toolRequestCount,
      ticketCount: codex.toolResponseCount,
      nextTicket: codex.nextTicket,
      tickets: codex.toolResponses,
      rejections: codex.originRejections,
      rejectionCount: codex.originRejectionCount,
      bindings: codex.runBindings
    })
  }

  function mismatchMessage(s, kind) {
    if (kind === "input")
      return test.requestMessage(s.id, s.callId, { query: "logout" },
                                 s.providerTurn)
    if (kind === "call")
      return test.requestMessage(s.id, "other-call", s.input, s.providerTurn)
    if (kind === "provider turn")
      return test.requestMessage(s.id, s.callId, s.input, "other-turn")
    return test.requestMessage(s.id, s.callId, s.input, s.providerTurn,
                               "other-acp-session")
  }

  function inspectMismatch(phase, kind) {
    var s = test.seed(phase)
    var before = test.preservedState(s)
    var savedToken = codex.token
    var savedChannel = codex.channel
    var message = kind === "Nodi session" || kind === "server"
      ? s.message : test.mismatchMessage(s, kind)
    if (kind === "Nodi session") codex.token = "other-token"
    if (kind === "server") codex.channel = "other-channel"
    var response = test.parse(codex.serve(codex.token, codex.channel,
                                          JSON.stringify(message)))
    codex.token = savedToken
    codex.channel = savedChannel
    var body = response && response.result && response.result.content
      ? response.result.content[0].text : ""
    test.check(response && !response.nodiPending
      && response.result && response.result.isError === true
      && /origin|replay/i.test(body),
      phase + " " + kind + " mismatch was not rejected on its delivery: "
        + JSON.stringify(response))
    test.check(test.preservedState(s) === before,
      phase + " " + kind + " mismatch mutated accepted state: "
        + JSON.stringify([before, test.preservedState(s)]))
  }

  function inspectExactResolving() {
    var s = test.seed("resolving")
    var bindings = JSON.stringify(codex.runBindings)
    var duplicate = test.parse(codex.serve(
      codex.token, codex.channel, JSON.stringify(s.message)))
    test.check(duplicate && duplicate.nodiPending
      && JSON.stringify(codex.runBindings) === bindings,
      "exact resolving duplicate consumed origin or missed its ticket: "
        + JSON.stringify([duplicate, codex.runBindings]))
    codex.preProposalFailure(s.id, "No match")
    var original = codex.pollToolResponse(s.originalTicket)
    var joined = codex.pollToolResponse(duplicate ? duplicate.nodiPending : "")
    test.check(JSON.stringify(joined) === JSON.stringify(original),
      "exact resolving tickets did not share the terminal response: "
        + JSON.stringify([original, joined]))
  }

  function inspectExactAwaiting() {
    var s = test.seed("awaiting_confirmation")
    var duplicate = test.parse(codex.serve(
      codex.token, codex.channel, JSON.stringify(s.message)))
    var beforeCommits = test.commits
    codex.allow()
    var original = codex.pollToolResponse(s.originalTicket)
    var joined = codex.pollToolResponse(duplicate ? duplicate.nodiPending : "")
    test.check(duplicate && duplicate.nodiPending
      && test.commits === beforeCommits + 1
      && JSON.stringify(joined) === JSON.stringify(original)
      && original && original.result
      && /"status":"executed"/.test(original.result.content[0].text),
      "exact awaiting duplicate did not share one Enter execution: "
        + JSON.stringify([duplicate, original, joined, test.commits]))
  }

  function inspectExactExecutingAndReady() {
    var s = test.seed("executing")
    var duplicate = test.parse(codex.serve(
      codex.token, codex.channel, JSON.stringify(s.message)))
    var outcome = {
      status: "executed", key: "menu:system.lock", title: "Lock",
      proposalId: codex.actionBook.proposal.id
    }
    var finished = AskActions.finish(codex.actionBook, s.id, outcome)
    codex.actionBook = finished.book
    codex.publishAction(s.id, outcome, false)
    var original = codex.pollToolResponse(s.originalTicket)
    var joined = codex.pollToolResponse(duplicate ? duplicate.nodiPending : "")
    var replay = test.parse(codex.serve(
      codex.token, codex.channel, JSON.stringify(s.message)))
    var replayed = codex.pollToolResponse(replay ? replay.nodiPending : "")
    test.check(duplicate && duplicate.nodiPending && replay && replay.nodiPending
      && JSON.stringify(joined) === JSON.stringify(original)
      && JSON.stringify(replayed) === JSON.stringify(original),
      "executing join or ready replay changed the terminal response: "
        + JSON.stringify([original, joined, replayed]))
  }

  Ask {
    id: codex
    agent: "codex"
    acts: true
    toolServer: "/tmp/nodi"
    dataDir: "/tmp/nodi-data"
    resolver: function(kind, value, turnId) {
      return { ok: false, error: "seeded tests must not resolve again" }
    }
    committer: function(snapshot) {
      test.commits++
      return {
        status: "executed", key: snapshot.key, title: snapshot.title
      }
    }
  }

  function start() {
    var phases = ["resolving", "awaiting_confirmation", "executing"]
    var mismatches = [
      "input", "call", "provider turn", "ACP session", "Nodi session", "server"
    ]
    for (var pi = 0; pi < phases.length; pi++)
      for (var mi = 0; mi < mismatches.length; mi++)
        test.inspectMismatch(phases[pi], mismatches[mi])
    test.inspectExactResolving()
    test.inspectExactAwaiting()
    test.inspectExactExecutingAndReady()
    test.done(test.failures.length === 0, test.failures.join("; "))
  }
}
