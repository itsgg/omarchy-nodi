import QtQuick
import "../../components"
import "../../lib/AskActions.js" as AskActions
import "../../lib/AskTools.js" as AskTools

// Every agent exposes its isolation policy. Pi and Agy are answer-only even
// when Ask actions and named MCP servers are enabled globally. The other
// built-ins and custom agents keep the existing action behavior.
Item {
  id: test
  signal done(bool ok, string report)
  property var failures: []
  property var codexDirect: null

  function check(ok, what) { if (!ok) test.failures.push(what) }
  function inspect(answerOnly, name) {
    test.check(answerOnly.providesActions === false, name + " exposes action capability")
    test.check(answerOnly.named === false, name + " names external MCP")
    test.check(answerOnly.instructions === AskTools.SYSTEM, name + " receives action instructions")
    test.check(JSON.stringify(answerOnly.serverNames) === "[]", name + " receives MCP servers: " + JSON.stringify(answerOnly.serverNames))
    test.check(answerOnly.spec && answerOnly.spec.capabilities.actions === false, name + " spec capability")
  }
  function inspectPolicy(agent, expected, name) {
    test.check(agent.spec && agent.spec.policy === expected,
               name + " policy: " + (agent.spec ? agent.spec.policy : "no spec"))
  }
  function codexTurn(providerTurn) {
    codex.agentSays({
      sessionId: codex.sessionId,
      update: {
        sessionUpdate: "session_info_update",
        _meta: {
          nodi_codex_turn_started: true,
          nodi_codex_turn_id: providerTurn
        }
      }
    })
  }
  function codexEvent(callId, input, server, session, trusted, providerTurn) {
    codex.agentSays({
      sessionId: session === undefined ? codex.sessionId : session,
      update: {
        sessionUpdate: "tool_call", toolCallId: callId,
        title: "untrusted display title", status: "pending",
        rawInput: {
          server: server === undefined ? codex.actionServer : server,
          tool: "run", arguments: input
        },
        _meta: trusted === false ? {} : {
          is_mcp_tool_call: true,
          nodi_codex_turn_id: providerTurn === undefined ? "codex-turn" : providerTurn
        }
      }
    })
  }
  function codexRelay(requestId, callId, input, options) {
    options = options || {}
    var sid = options.session === undefined ? codex.sessionId : options.session
    var thread = options.thread === undefined ? sid : options.thread
    var meta = { "x-codex-turn-metadata": {
      session_id: sid, thread_id: thread,
      turn_id: options.turnId === undefined ? "codex-turn" : options.turnId,
      model: "fake"
    } }
    if (options.includeTurn === false) delete meta["x-codex-turn-metadata"]
    if (options.includeCall !== false) meta.callId = callId
    var params = { name: "run", _meta: meta }
    if (options.includeArguments !== false) params.arguments = input
    var raw = codex.serve(codex.token, codex.channel, JSON.stringify({
      jsonrpc: "2.0", id: requestId, method: "tools/call",
      params: params
    }))
    var ticket = ""
    try {
      var parsed = JSON.parse(raw)
      ticket = parsed.nodiPending || ""
      test.codexDirect = ticket ? null : parsed
    } catch (e) { test.codexDirect = null }
    return ticket
  }
  function codexDelivered(ticket) {
    return ticket ? codex.pollToolResponse(ticket) : test.codexDirect
  }
  function rejected(ticket, what) {
    var response = codexDelivered(ticket)
    var text = response && response.result && response.result.content
      ? response.result.content[0].text : ""
    test.check(response && response.result && response.result.isError === true
      && /origin/i.test(text) && !codex.proposal, what + ": " + JSON.stringify(response))
    if (codex.proposal) codex.deny()
    return response
  }
  function freshCodexAttempt() {
    codex.actionBook = AskActions.create(codex.token, codex.actionTurn, codex.channel)
  }
  function claudeTurn(providerTurn, session) {
    claude.agentSays({
      sessionId: session === undefined ? claude.sessionId : session,
      update: {
        sessionUpdate: "session_info_update",
        _meta: {
          nodi_claude_turn_started: true,
          nodi_claude_turn_id: providerTurn
        }
      }
    })
  }
  function claudeCall(callId, input, options) {
    options = options || {}
    var origin = {
      version: 1, adapter: "claude",
      acpSessionId: options.acpSession === undefined
        ? claude.sessionId : options.acpSession,
      providerTurn: options.providerTurn === undefined
        ? "claude-turn" : options.providerTurn,
      callId: options.originCallId === undefined ? callId : options.originCallId,
      server: options.server === undefined
        ? { name: claude.actionServer, source: "dynamic" } : options.server,
      input: options.originInput === undefined ? input : options.originInput
    }
    var missing = options.missing || []
    for (var i = 0; i < missing.length; i++) delete origin[missing[i]]
    return {
      toolCallId: callId, rawInput: input,
      _meta: {
        claudeCode: {
          toolName: "mcp__" + claude.actionServer + "__run",
          mcpServer: { name: claude.actionServer, source: "dynamic" }
        },
        nodi_claude_action_origin: origin
      }
    }
  }
  function bindClaude(callId, input, options) {
    var call = claudeCall(callId, input, options)
    return claude.bindRunOrigin("permission-" + callId, callId, input, true, call)
  }
  function claudeRelay(requestId, callId, input, options) {
    options = options || {}
    var meta = { progressToken: requestId }
    if (options.includeCall !== false)
      meta["claudecode/toolUseId"] = callId
    var params = { name: "run", _meta: meta }
    if (options.includeArguments !== false) params.arguments = input
    var raw = claude.serve(claude.token, claude.channel, JSON.stringify({
      jsonrpc: "2.0", id: requestId, method: "tools/call", params: params
    }))
    try {
      var parsed = JSON.parse(raw)
      return parsed.nodiPending ? claude.pollToolResponse(parsed.nodiPending) : parsed
    } catch (e) { return null }
  }
  function claudeRejected(response, what) {
    var text = response && response.result && response.result.content
      ? response.result.content[0].text : ""
    test.check(response && response.result && response.result.isError === true
      && /origin/i.test(text) && !claude.proposal,
      what + ": " + JSON.stringify(response))
    if (claude.proposal) claude.deny()
  }
  function freshClaudeAttempt() {
    claude.actionBook = AskActions.create(claude.token, claude.actionTurn,
                                          claude.channel)
  }
  function addClaudeRequestOverlay(id) {
    var started = AskActions.begin(claude.actionBook, {
      id: id, session: claude.token, turn: claude.actionTurn,
      channel: claude.channel, callId: "overlay-" + id,
      providerTurn: "", adapterKey: "", inputKey: '{"query":"missing"}',
      operation: "overlay-" + id, server: claude.actionServer,
      kind: "query", value: "missing"
    })
    claude.actionBook = AskActions.preProposalError(
      started.book, id, "No match").book
  }
  function inspectClaudeOrigins() {
    var direct = { query: "lock" }
    claude.token = "claude-token"
    claude.channel = "claude-channel"
    claude.sessionId = "claude-session"
    claude.turn = 1
    claude.actionTurn = "old-turn"
    freshClaudeAttempt()
    claudeTurn("claude-old-turn")

    test.check(bindClaude("delayed", direct,
                          { providerTurn: "claude-old-turn" }),
               "Claude old-turn origin did not bind")
    claude.actionTurn = "current-turn"
    freshClaudeAttempt()
    claudeTurn("claude-turn")
    claudeRejected(claudeRelay(20, "delayed", direct),
                   "delayed old-provider-turn Claude call accepted")

    var invalid = [
      ["wrong-call", { originCallId: "other-call" }],
      ["missing-call", { missing: ["callId"] }],
      ["wrong-server", { server: { name: "nodi-other", source: "dynamic" } }],
      ["missing-server", { missing: ["server"] }],
      ["wrong-input", { originInput: { query: "logout" } }],
      ["missing-input", { missing: ["input"] }],
      ["wrong-provider-turn", { providerTurn: "claude-other-turn" }],
      ["missing-provider-turn", { missing: ["providerTurn"] }],
      ["wrong-acp-session", { acpSession: "other-session" }],
      ["missing-acp-session", { missing: ["acpSessionId"] }]
    ]
    for (var i = 0; i < invalid.length; i++) {
      var id = invalid[i][0]
      test.check(!bindClaude(id, direct, invalid[i][1]),
                 "invalid Claude origin bound: " + id)
      claudeRejected(claudeRelay(21 + i, id, direct),
                     "invalid Claude origin reached relay: " + id)
    }

    claudeTurn("wrong-acp-event", "other-session")
    test.check(!bindClaude("wrong-acp-event", direct,
                           { providerTurn: "wrong-acp-event" }),
               "wrong ACP-session Claude turn bound")
    claudeRejected(claudeRelay(40, "wrong-acp-event", direct),
                   "wrong ACP-session Claude turn reached relay")

    var token = claude.token
    claude.token = "other-nodi-session"
    claudeTurn("wrong-nodi-session")
    claude.token = token
    test.check(!bindClaude("wrong-nodi-session", direct,
                           { providerTurn: "wrong-nodi-session" }),
               "wrong Nodi-session Claude turn bound")
    claudeRejected(claudeRelay(41, "wrong-nodi-session", direct),
                   "wrong Nodi-session Claude turn reached relay")

    test.check(bindClaude("valid-claude", direct),
               "valid Claude action origin did not bind")
    var first = claudeRelay(50, "valid-claude", direct)
    test.check(claude.proposal && claude.proposal.kind === "action"
      && claude.cards === 1 && claude.resolves === 1,
      "trusted Claude run did not reach exactly one Nodi card: "
        + JSON.stringify([first, claude.proposal, claude.cards, claude.resolves]))
    claude.allow()
    var response = claude.pollToolResponse(first.nodiPending || "")
    var replay = claudeRelay(50, "valid-claude", direct)
    var wrongCall = claudeRelay(50, "other-call", direct)
    var missingCall = claudeRelay(50, "valid-claude", direct,
                                  { includeCall: false })
    var changedInput = claudeRelay(50, "valid-claude", { query: "logout" })
    var wrongServer = claude.validateRunReplay(50, direct, "nodi-other", {
      valid: true, callId: "valid-claude", providerTurn: "claude-turn",
      adapterKey: ""
    })
    var bad = [wrongCall, missingCall, changedInput]
    test.check(response && response.result
      && JSON.stringify(replay) === JSON.stringify(response)
      && bad.every(function(item) {
        var text = item && item.result && item.result.content
          ? item.result.content[0].text : ""
        return item && item.result && item.result.isError === true
          && !/"status":"executed"/.test(text)
      }) && !wrongServer.ok
      && claude.cards === 1 && claude.resolves === 1 && claude.commits === 1,
      "Claude replay/mismatch changed its one execution: "
        + JSON.stringify([response, replay, bad, wrongServer,
                          claude.cards, claude.resolves, claude.commits]))

    var oldRequests = claude.actionBook.requests
    var oldRequestCount = AskActions.requestCount(claude.actionBook)
    claude.actionTurn = "claude-later-nodi-turn"
    claude.actionBook = AskActions.create(
      claude.token, claude.actionTurn, claude.channel)
    claude.actionBook.requests = oldRequests
    claude.actionBook.requestCount = oldRequestCount
    addClaudeRequestOverlay("overlay-one")
    addClaudeRequestOverlay("overlay-two")
    var recovered = claudeRelay(50, "valid-claude", direct)
    var modifiedAfterOverlays = claudeRelay(
      50, "valid-claude", { query: "logout" })
    var modifiedText = modifiedAfterOverlays
      && modifiedAfterOverlays.result
      && modifiedAfterOverlays.result.content
      ? modifiedAfterOverlays.result.content[0].text : ""
    test.check(JSON.stringify(recovered) === JSON.stringify(response)
      && modifiedAfterOverlays && modifiedAfterOverlays.result
      && modifiedAfterOverlays.result.isError === true
      && !/"status":"executed"/.test(modifiedText)
      && claude.actionRequest(50)
      && claude.actionRequest(50).providerTurn === "claude-turn",
      "older Claude record was lost behind persistent request overlays: "
        + JSON.stringify([recovered, modifiedAfterOverlays,
                          claude.actionRequest(50)]))
  }
  function unmanagedDelivery(agent, requestId, input) {
    var raw = agent.serve(agent.token, agent.channel, JSON.stringify({
      jsonrpc: "2.0", id: requestId, method: "tools/call",
      params: { name: "run", arguments: input }
    }))
    try { return JSON.parse(raw) } catch (e) { return null }
  }
  function primeUnmanaged(agent, prefix) {
    agent.token = prefix + "-token"
    agent.channel = prefix + "-channel"
    agent.sessionId = prefix + "-acp-session"
    agent.turn = 1
    agent.actionTurn = prefix + "-nodi-turn"
    agent.shown = true
    agent.phase = "waiting"
    agent.actionBook = AskActions.create(
      agent.token, agent.actionTurn, agent.channel)
    agent.runBindings = []
  }
  function inspectUnmanagedOrigins(agent, name) {
    var direct = { query: "lock" }
    primeUnmanaged(agent, name.toLowerCase())
    agent.permission({
      id: "permission-" + name,
      params: {
        sessionId: agent.sessionId,
        toolCall: {
          toolCallId: "unverifiable-" + name,
          title: "mcp__" + agent.actionServer + "__run",
          rawInput: direct
        },
        options: [
          { kind: "allow_once", optionId: "yes" },
          { kind: "reject_once", optionId: "no" }
        ]
      }
    })
    test.check(agent.proposal && agent.proposal.kind === "permission"
      && agent.runBindings.length === 0,
      name + " trusted an unverifiable permission title: "
        + JSON.stringify([agent.proposal, agent.runBindings]))
    agent.allow()

    var beforeCommits = agent.commits
    var control = unmanagedDelivery(agent, "unmanaged-" + name, direct)
    test.check(control && control.nodiPending
      && agent.proposal && agent.proposal.kind === "action"
      && agent.commits === beforeCommits,
      name + " delivery did not require a Nodi action card: "
        + JSON.stringify([control, agent.proposal, agent.commits]))
    agent.allow()
    var response = control && control.nodiPending
      ? agent.pollToolResponse(control.nodiPending) : null
    var body = response && response.result && response.result.content
      ? response.result.content[0].text : ""
    test.check(/"status":"executed"/.test(body)
      && agent.commits === beforeCommits + 1,
      name + " current-turn action did not execute after Enter: "
        + JSON.stringify(response))

    agent.actionTurn = name.toLowerCase() + "-closed-turn"
    agent.turn = 2
    agent.actionBook = AskActions.create(
      agent.token, agent.actionTurn, agent.channel)
    agent.shown = false
    var closed = unmanagedDelivery(agent, "closed-" + name, direct)
    var closedResponse = closed && closed.nodiPending
      ? agent.pollToolResponse(closed.nodiPending) : closed
    var closedBody = closedResponse && closedResponse.result
      && closedResponse.result.content
      ? closedResponse.result.content[0].text : ""
    test.check(closedResponse && closedResponse.result
      && closedResponse.result.isError === true
      && /closed|origin/i.test(closedBody)
      && !agent.proposal && agent.commits === beforeCommits + 1,
      name + " accepted an action while the bar was closed: "
        + JSON.stringify(closedResponse))
    agent.shown = true

    var stale = agent.serve("stale-token", agent.channel, JSON.stringify({
      jsonrpc: "2.0", id: "stale-" + name, method: "tools/call",
      params: { name: "run", arguments: direct }
    }))
    var staleResponse = null
    try { staleResponse = JSON.parse(stale) } catch (e) {}
    test.check(staleResponse && staleResponse.error
      && !agent.proposal && agent.commits === beforeCommits + 1,
      name + " accepted a stale authenticated session: " + stale)
  }
  function inspectCodexOrigins() {
    var direct = { query: "lock" }
    codex.token = "codex-token"
    codex.channel = "codex-channel"
    codex.sessionId = "codex-session"
    codex.turn = 1
    codex.actionTurn = "old-turn"
    codex.actionBook = AskActions.create(codex.token, codex.actionTurn, codex.channel)
    codexTurn("codex-old-turn")

    codex.actionTurn = "current-turn"
    codex.actionBook = AskActions.create(codex.token, codex.actionTurn, codex.channel)
    codexTurn("codex-turn")

    codexEvent("codex-delayed", direct, undefined, undefined, true, "codex-old-turn")
    rejected(codexRelay("codex-delayed", "codex-delayed", direct,
                        { turnId: "codex-old-turn" }),
             "delayed old-provider-turn Codex call accepted in the current Nodi turn")

    codexEvent("permission-dedup", direct)
    test.check(codex.bindRunOrigin("permission-1", "permission-dedup", direct, true),
               "Codex permission did not replace its structured start")
    var deduped = codex.runBindings.filter(function(binding) {
      return binding.callId === "permission-dedup"
    })
    test.check(deduped.length === 1 && deduped[0].adapter === "codex"
      && deduped[0].providerTurn === "codex-turn"
      && deduped[0].permissionId === "permission-1",
      "Codex structured and permission origins were not deduplicated: " + JSON.stringify(deduped))

    codexEvent("wrong-server", direct, "nodi-other")
    rejected(codexRelay(2, "wrong-server", direct), "wrong Codex server accepted")

    codexEvent("right-call", direct)
    rejected(codexRelay(3, "wrong-call", direct), "wrong Codex call ID accepted")

    codexEvent("wrong-input", direct)
    rejected(codexRelay(4, "wrong-input", { query: "logout" }), "changed Codex input accepted")

    codexEvent("wrong-session-event", direct, undefined, "other-session")
    rejected(codexRelay(5, "wrong-session-event", direct), "wrong ACP session event accepted")

    codexEvent("missing-event-meta", direct, undefined, undefined, false)
    rejected(codexRelay(6, "missing-event-meta", direct), "missing ACP metadata accepted")

    codexEvent("missing-relay-meta", direct)
    rejected(codexRelay(7, "missing-relay-meta", direct, { includeCall: false }),
             "missing relay metadata accepted")

    codexEvent("wrong-relay-session", direct)
    rejected(codexRelay(8, "wrong-relay-session", direct, { session: "other-session" }),
             "wrong relay session accepted")

    codexEvent("collision-missing-call", direct)
    rejected(codexRelay("collision-missing-call", "collision-missing-call", direct,
                        { includeCall: false }),
             "Codex request-ID collision accepted without call ID")
    freshCodexAttempt()

    codexEvent("collision-wrong-session", direct)
    rejected(codexRelay("collision-wrong-session", "collision-wrong-session", direct,
                        { session: "other-session", thread: codex.sessionId }),
             "Codex request-ID collision accepted with wrong session")
    freshCodexAttempt()

    codexEvent("collision-wrong-thread", direct)
    rejected(codexRelay("collision-wrong-thread", "collision-wrong-thread", direct,
                        { thread: "other-session" }),
             "Codex request-ID collision accepted with wrong thread")
    freshCodexAttempt()

    codexEvent("collision-invalid-turn", direct)
    rejected(codexRelay("collision-invalid-turn", "collision-invalid-turn", direct,
                        { turnId: "" }),
             "Codex request-ID collision accepted with invalid turn metadata")
    freshCodexAttempt()

    codexEvent("collision-missing-turn", direct)
    rejected(codexRelay("collision-missing-turn", "collision-missing-turn", direct,
                        { includeTurn: false }),
             "Codex request-ID collision accepted without turn metadata")
    freshCodexAttempt()

    var missingInputRejected = rejected(
      codexRelay("missing-input", "missing-input", {}, {
        includeCall: false, includeArguments: false
      }), "Codex missing-input rejection was not recorded")
    var exactMissingInput = rejected(
      codexRelay("missing-input", "missing-input", {}, {
        includeCall: false, includeArguments: false
      }), "exact missing-input rejection did not replay")
    var explicitEmptyInput = rejected(
      codexRelay("missing-input", "missing-input", {}, { includeCall: false }),
      "explicit empty input replayed a missing-input rejection")
    test.check(JSON.stringify(exactMissingInput) === JSON.stringify(missingInputRejected)
      && JSON.stringify(explicitEmptyInput) !== JSON.stringify(missingInputRejected),
      "missing input marker was not immutable: "
        + JSON.stringify([missingInputRejected, exactMissingInput, explicitEmptyInput]))
    freshCodexAttempt()

    codexEvent("collision-replay", direct)
    var rejectedReplay = rejected(
      codexRelay("collision-replay", "collision-replay", direct, { includeCall: false }),
      "Codex invalid replay seed was not rejected")
    var exactRejectedReplay = rejected(
      codexRelay("collision-replay", "collision-replay", direct, { includeCall: false }),
      "exact rejected Codex delivery did not replay")
    var validAfterRejectedTicket = codexRelay("collision-replay", "collision-replay", direct)
    var validAfterRejected = rejected(validAfterRejectedTicket,
      "changed metadata reused an origin-rejected request ID")
    var changedRejected = rejected(
      codexRelay("collision-replay", "different-call", { query: "logout" }),
      "changed call and input reused an origin-rejected request ID")
    codex.actionTurn = "next-turn"
    freshCodexAttempt()
    codexTurn("codex-next-turn")
    var laterReplay = rejected(
      codexRelay("collision-replay", "collision-replay", direct, { includeCall: false }),
      "old rejected request ID replayed in a newer Nodi turn")
    test.check(JSON.stringify(exactRejectedReplay) === JSON.stringify(rejectedReplay)
      && JSON.stringify(validAfterRejected) !== JSON.stringify(rejectedReplay)
      && JSON.stringify(changedRejected) !== JSON.stringify(rejectedReplay)
      && JSON.stringify(laterReplay) !== JSON.stringify(rejectedReplay)
      && !codex.proposal && codex.cards === 0
      && codex.resolves === 0 && codex.commits === 0,
      "origin-rejection tombstone was not exact and immutable: "
        + JSON.stringify([rejectedReplay, exactRejectedReplay, validAfterRejected,
                          changedRejected, laterReplay, codex.proposal,
                          codex.cards, codex.resolves, codex.commits]))
    if (codex.proposal) codex.deny()
    codex.actionTurn = "current-turn"
    freshCodexAttempt()
    codex.cards = 0
    codex.resolves = 0
    codex.commits = 0

    var ownProto = JSON.parse('{"query":"lock","__proto__":{"scope":"one"}}')
    codexEvent("own-proto", ownProto)
    var ownProtoTicket = codexRelay("own-proto-request", "own-proto", ownProto)
    test.check(codex.proposal && codex.proposal.kind === "action",
               "own-__proto__ Codex run did not reach confirmation")
    codex.allow()
    var ownProtoResponse = codexDelivered(ownProtoTicket)
    var ownProtoReplay = codexDelivered(
      codexRelay("own-proto-request", "own-proto", ownProto))
    var omittedProtoReplay = codexDelivered(
      codexRelay("own-proto-request", "own-proto", { query: "lock" }))
    var omittedText = omittedProtoReplay && omittedProtoReplay.result
      && omittedProtoReplay.result.content
      ? omittedProtoReplay.result.content[0].text : ""
    test.check(JSON.stringify(ownProtoReplay) === JSON.stringify(ownProtoResponse)
      && omittedProtoReplay && omittedProtoReplay.result
      && omittedProtoReplay.result.isError === true
      && !/"status":"executed"/.test(omittedText),
      "own __proto__ was omitted from the immutable replay origin: "
        + JSON.stringify([ownProtoResponse, ownProtoReplay, omittedProtoReplay]))
    freshCodexAttempt()
    codex.cards = 0
    codex.resolves = 0
    codex.commits = 0

    codexEvent("valid-codex", direct)
    var ticket = codexRelay(9, "valid-codex", direct)
    test.check(codex.proposal && codex.proposal.kind === "action",
               "trusted Codex run did not reach one Nodi card: " + JSON.stringify(codex.proposal))
    var duplicateTicket = codexRelay(9, "valid-codex", direct)
    test.check(codex.proposal && codex.cards === 1 && codex.resolves === 1,
               "valid Codex duplicate created another card: " + JSON.stringify(codex.proposal))
    codex.allow()
    var response = ticket ? codex.pollToolResponse(ticket) : null
    var duplicate = duplicateTicket ? codex.pollToolResponse(duplicateTicket) : null
    var replayTicket = codexRelay(9, "valid-codex", direct)
    var replay = replayTicket ? codex.pollToolResponse(replayTicket) : null
    var text = response && response.result && response.result.content
      ? response.result.content[0].text : ""
    test.check(/"status":"executed"/.test(text)
      && JSON.stringify(duplicate) === JSON.stringify(response)
      && JSON.stringify(replay) === JSON.stringify(response)
      && codex.cards === 1 && codex.resolves === 1 && codex.commits === 1,
      "trusted Codex duplicate/replay changed its one execution: "
        + JSON.stringify([response, duplicate, replay]))

    var wrongCall = codexDelivered(codexRelay(9, "other-call", direct))
    var missingCall = codexDelivered(codexRelay(9, "valid-codex", direct,
                                                { includeCall: false }))
    var wrongSession = codexDelivered(codexRelay(9, "valid-codex", direct,
                                                 { session: "other-session" }))
    var changedInput = codexDelivered(codexRelay(9, "valid-codex",
                                                 { query: "logout" }))
    var changedKind = codexDelivered(codexRelay(9, "valid-codex",
                                                { key: "menu:system.lock" }))
    var wrongServer = codex.validateRunReplay(9, direct, "nodi-other", "valid-codex")
    var badReplays = [wrongCall, missingCall, wrongSession, changedInput, changedKind]
    test.check(badReplays.every(function(item) {
      var body = item && item.result && item.result.content
        ? item.result.content[0].text : ""
      return item && item.result && item.result.isError === true
        && !/"status":"executed"/.test(body)
    }) && !wrongServer.ok
      && codex.cards === 1 && codex.resolves === 1 && codex.commits === 1,
      "mismatched Codex replay received prior execution: "
        + JSON.stringify([badReplays, wrongServer,
                          codex.cards, codex.resolves, codex.commits]))
  }

  function inspectReadOrigins() {
    codex.readActivities = Object.create(null)
    codex.readActivityCount = 0
    var specialIds = ["__thinking", "__proto__"]
    for (var si = 0; si < specialIds.length; si++) {
      var specialId = specialIds[si]
      var specialTurn = "special-read-turn-" + si
      codex.actionTurn = specialTurn
      codex.actionBook = AskActions.create(codex.token, codex.actionTurn,
                                           codex.channel)
      codex.calls = Object.create(null)
      if (specialId === "__thinking") {
        codex.answer = ""
        codex.agentSays({ sessionId: codex.sessionId, update: {
          sessionUpdate: "agent_thought_chunk", content: {
            type: "text", text: "private thought"
          }
        } })
        test.check(codex.thoughtActivity === "thinking",
                   "thought activity did not use its own state")
      }
      var beforeCount = codex.readActivityCount
      codex.agentSays({ sessionId: codex.sessionId, update: {
        sessionUpdate: "tool_call", toolCallId: specialId,
        title: "Read special " + si, status: "pending", rawInput: {}
      } })
      var started = codex.readActivities[specialId]
      var afterStart = codex.readActivityCount
      codex.agentSays({ sessionId: codex.sessionId, update: {
        sessionUpdate: "tool_call_update", toolCallId: specialId,
        status: "completed"
      } })
      var terminalSpecial = JSON.stringify(codex.readActivities[specialId])
      codex.agentSays({ sessionId: codex.sessionId, update: {
        sessionUpdate: "tool_call_update", toolCallId: specialId,
        title: "Read reordered " + si, status: "pending"
      } })
      var afterReordered = JSON.stringify(codex.readActivities[specialId])
      codex.actionTurn = specialTurn + "-later"
      codex.actionBook = AskActions.create(codex.token, codex.actionTurn,
                                           codex.channel)
      codex.calls = Object.create(null)
      codex.agentSays({ sessionId: codex.sessionId, update: {
        sessionUpdate: "tool_call_update", toolCallId: specialId,
        title: "Read delayed " + si, status: "pending"
      } })
      var afterOldTurn = JSON.stringify(codex.readActivities[specialId])
      test.check(Object.prototype.hasOwnProperty.call(codex.readActivities,
                                                       specialId)
        && started && started.turn === specialTurn
        && afterStart === beforeCount + 1
        && codex.readActivityCount === afterStart
        && codex.readActivities[specialId].terminal === true
        && terminalSpecial === afterReordered
        && terminalSpecial === afterOldTurn,
        specialId + " completion/reordering/old-turn identity failed: "
          + JSON.stringify([started, beforeCount, afterStart,
                            codex.readActivityCount, terminalSpecial,
                            afterReordered, afterOldTurn]))
    }
    codex.terminalizeReadActivities("completed")
    test.check(codex.thoughtActivity === "",
               "terminalization retained thought activity")

    codex.actionTurn = "read-turn-1"
    codex.actionBook = AskActions.create(codex.token, codex.actionTurn, codex.channel)
    codex.calls = Object.create(null)
    codex.agentSays({ sessionId: codex.sessionId, update: {
      sessionUpdate: "tool_call", toolCallId: "reused-read",
      title: "Read old", status: "pending", rawInput: {}
    } })
    codex.agentSays({ sessionId: codex.sessionId, update: {
      sessionUpdate: "tool_call_update", toolCallId: "reused-read",
      status: "completed"
    } })
    var terminal = JSON.stringify(codex.readActivities["reused-read"])
    codex.agentSays({ sessionId: codex.sessionId, update: {
      sessionUpdate: "tool_call_update", toolCallId: "reused-read",
      title: "Read revived", status: "pending"
    } })

    codex.actionTurn = "read-turn-2"
    codex.actionBook = AskActions.create(codex.token, codex.actionTurn, codex.channel)
    codex.calls = Object.create(null)
    codex.agentSays({ sessionId: codex.sessionId, update: {
      sessionUpdate: "tool_call", toolCallId: "reused-read",
      title: "Read reused", status: "pending", rawInput: {}
    } })
    codex.agentSays({ sessionId: codex.sessionId, update: {
      sessionUpdate: "tool_call", toolCallId: "current-read",
      title: "Read current", status: "pending", rawInput: {}
    } })
    var beforeOldUpdate = codex.activity
    codex.agentSays({ sessionId: codex.sessionId, update: {
      sessionUpdate: "tool_call_update", toolCallId: "reused-read",
      status: "failed"
    } })
    test.check(terminal === JSON.stringify(codex.readActivities["reused-read"])
      && codex.readActivities["reused-read"].turn === "read-turn-1"
      && codex.readActivities["reused-read"].terminal === true
      && beforeOldUpdate === "Using Read current"
      && codex.activity === "Using Read current",
      "read operation origin/terminal state was mutable: "
        + JSON.stringify([terminal, codex.readActivities, beforeOldUpdate, codex.activity]))
  }

  Ask {
    id: pi
    agent: "pi"
    acts: true
    toolServer: "/tmp/nodi"
    mcp: ({ github: { command: "github-mcp" } })
    dataDir: "/tmp/nodi-data"
  }

  Ask {
    id: agy
    agent: "agy"
    acts: true
    toolServer: "/tmp/nodi"
    mcp: ({ github: { command: "github-mcp" } })
    dataDir: "/tmp/nodi-data"
  }

  Ask {
    id: claude
    agent: "claude"
    acts: true
    toolServer: "/tmp/nodi"
    mcp: ({ github: { command: "github-mcp" } })
    dataDir: "/tmp/nodi-data"
    property int cards: 0
    property int resolves: 0
    property int commits: 0
    onPhaseChanged: if (phase === "proposing" && proposal
                        && proposal.kind === "action") cards++
    resolver: function(kind, value, turnId) {
      resolves++
      return { ok: true, snapshot: {
        key: "menu:system.lock", title: "Lock",
        run: { kind: "exec", argv: ["/usr/bin/test-action", "claude"] }
      } }
    }
    committer: function(snapshot) {
      commits++
      return { status: "executed", key: snapshot.key, title: snapshot.title }
    }
  }

  Ask {
    id: codex
    agent: "codex"
    acts: true
    toolServer: "/tmp/nodi"
    dataDir: "/tmp/nodi-data"
    property int cards: 0
    property int resolves: 0
    property int commits: 0
    onPhaseChanged: if (phase === "proposing" && proposal && proposal.kind === "action") cards++
    resolver: function(kind, value, turnId) {
      resolves++
      return { ok: true, snapshot: { key: "menu:system.lock", title: "Lock",
        run: { kind: "exec", argv: ["/usr/bin/test-action", "codex"] } } }
    }
    committer: function(snapshot) {
      commits++
      return { status: "executed", key: snapshot.key, title: snapshot.title }
    }
  }

  Ask {
    id: opencode
    agent: "opencode"
    acts: true
    toolServer: "/tmp/nodi"
    dataDir: "/tmp/nodi-data"
    property int commits: 0
    resolver: function(kind, value, turnId) {
      return { ok: true, snapshot: {
        key: "menu:system.lock", title: "Lock",
        run: { kind: "exec", argv: ["/usr/bin/test-action", "opencode"] }
      } }
    }
    committer: function(snapshot) {
      commits++
      return { status: "executed", key: snapshot.key, title: snapshot.title }
    }
  }

  Ask {
    id: custom
    agent: "free"
    registry: [{ id: "free", name: "Free", command: ["free-acp"] }]
    acts: true
    toolServer: "/tmp/nodi"
    dataDir: "/tmp/nodi-data"
    property int commits: 0
    resolver: function(kind, value, turnId) {
      return { ok: true, snapshot: {
        key: "menu:system.lock", title: "Lock",
        run: { kind: "exec", argv: ["/usr/bin/test-action", "custom"] }
      } }
    }
    committer: function(snapshot) {
      commits++
      return { status: "executed", key: snapshot.key, title: snapshot.title }
    }
  }

  function start() {
    test.inspect(pi, "Pi")
    test.check(agy.spec !== null, "Agy has no start spec")
    test.check(agy.providesActions === false, "Agy exposes action capability")
    test.check(agy.named === false && JSON.stringify(agy.serverNames) === "[]",
               "Agy receives configured MCP servers")
    test.check(agy.instructions === AskTools.SYSTEM, "Agy receives action instructions")
    test.check(agy.spec && agy.spec.capabilities.actions === false, "Agy spec exposes actions")
    test.check(claude.providesActions === true, "Claude lost action capability")
    test.check(JSON.stringify(claude.serverNames) === '["github"]',
               "before a session has a channel, only configured servers are named: " + JSON.stringify(claude.serverNames))
    test.check(claude.instructions === AskTools.SYSTEM + AskTools.ACTS + AskTools.MCP_NOTE,
               "Claude instructions changed")
    test.check(claude.spec && claude.spec.capabilities.actions === true, "Claude spec capability")
    test.inspectPolicy(claude, "strict", "Claude")
    test.inspectPolicy(codex, "unmanaged", "Codex")
    test.check(codex.providesActions === true
      && codex.spec && codex.spec.capabilities.actions === true,
      "Codex lost Nodi action capability")
    test.check(codex.spec && /cannot disable/i.test(codex.spec.enforcement)
      && /built-in/i.test(codex.spec.enforcement),
      "Codex enforcement omits the stock router limitation")
    test.inspectPolicy(pi, "answer-only", "Pi")
    test.inspectPolicy(agy, "answer-only", "Agy")
    test.inspectPolicy(opencode, "unmanaged", "OpenCode")
    test.inspectPolicy(custom, "unmanaged", "custom agent")
    Qt.callLater(function() {
      test.inspectClaudeOrigins()
      test.inspectCodexOrigins()
      test.inspectReadOrigins()
      test.inspectUnmanagedOrigins(opencode, "OpenCode")
      test.inspectUnmanagedOrigins(custom, "Custom")
      test.done(test.failures.length === 0, test.failures.join("; "))
    })
  }
}
