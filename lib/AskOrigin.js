.pragma library
.import "AskActions.js" as AskActions
.import "AskTools.js" as AskTools

// Where an action request to the bar's run tool came from (components/Ask.qml).
// Every check here reads a snapshot of Ask's session state, `s`:
//   { agent, program, spec, sessionId, token, channel, actionTurn, turnOpen,
//     shown, proposal, cut, actionServer, runBindings, codexTurns,
//     claudeTurns, actionBook, originRejections, runBindingLimit,
//     providerTurnBindingLimit }
// and returns what changes: a check that keeps a binding returns
// { value, runBindings | codexTurns | claudeTurns, capacity }, where
// `capacity` names the limit reached, which ends the session (Ask's
// sessionCapacityExceeded). Nothing here writes to `s`.

// ---------------------------------------------------------------- input identity

function stableInput(value) {
  if (!value || typeof value !== "object") return value
  if (Array.isArray(value)) return value.map(stableInput)
  var out = Object.create(null)
  Object.keys(value).sort().forEach(function(key) {
    out[key] = stableInput(value[key])
  })
  return out
}

function inputKey(input) {
  return JSON.stringify(stableInput(input && typeof input === "object" ? input : {}))
}

// A field as it was sent: missing, null and a value are three origins.
function identityField(object, key) {
  if (!object || typeof object !== "object"
      || !Object.prototype.hasOwnProperty.call(object, key))
    return { marker: "missing" }
  var value = object[key]
  if (value === null) return { marker: "null" }
  return { marker: "value", type: typeof value, value: stableInput(value) }
}

// ---------------------------------------------------------------- which agent proves its origin

// Codex through Nodi's pinned adapter, and Claude under the strict policy,
// carry a provider call ID and turn the relay must repeat.
function managedCodex(s) {
  return s.agent === "codex" && s.spec
}

function managedClaude(s) {
  return s.agent === "claude" && !s.program && s.spec
    && s.spec.policy === "strict"
}

function managedOrigin(s) {
  return s.spec && (s.agent === "codex"
    || (s.agent === "claude" && !s.program
        && s.spec.policy === "strict"))
}

function actionRequest(s, requestId) {
  return AskActions.requestAt(s.actionBook, AskActions.requestKey(requestId))
}

// ---------------------------------------------------------------- the relay

function relayOrigin(s, message, requestId) {
  var params = message && message.params && typeof message.params === "object"
    ? message.params : {}
  var requestInputKey = JSON.stringify(identityField(params, "arguments"))
  var isCodex = managedCodex(s)
  var isClaude = managedClaude(s)
  if (!isCodex && !isClaude) {
    return {
      valid: true, callId: String(requestId), providerTurn: "",
      requestInputKey: requestInputKey,
      adapterKey: JSON.stringify({
        adapter: "acp", requestId: {
          type: typeof requestId, value: stableInput(requestId)
        }
      })
    }
  }
  var meta = params._meta && typeof params._meta === "object"
    ? params._meta : {}
  if (isClaude) {
    var claudeCallId = typeof meta["claudecode/toolUseId"] === "string"
      && meta["claudecode/toolUseId"] ? meta["claudecode/toolUseId"] : ""
    var claudeProviderTurn = claudeRelayProviderTurn(s, claudeCallId, requestId)
    return {
      valid: !!claudeCallId && !!claudeProviderTurn,
      callId: claudeCallId,
      providerTurn: claudeProviderTurn,
      requestInputKey: requestInputKey,
      adapterKey: JSON.stringify({
        adapter: "claude",
        meta: identityField(params, "_meta"),
        callId: identityField(meta, "claudecode/toolUseId")
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
    meta: identityField(params, "_meta"),
    turnMetadata: identityField(meta, "x-codex-turn-metadata"),
    sessionId: identityField(turnObject, "session_id"),
    threadId: identityField(turnObject, "thread_id"),
    providerTurn: identityField(turnObject, "turn_id"),
    callId: identityField(meta, "callId")
  })
  return {
    valid: !!turn && typeof turn === "object"
      && turnObject.session_id === s.sessionId
      && turnObject.thread_id === s.sessionId
      && !!providerTurn && !!callId,
    callId: callId, providerTurn: providerTurn,
    requestInputKey: requestInputKey, adapterKey: adapterKey
  }
}

// The provider turn a Claude relay call belongs to: the one its
// permission bound, unless two disagree, else its accepted record's.
function claudeRelayProviderTurn(s, callId, requestId) {
  if (!callId) return ""
  var found = ""
  for (var i = s.runBindings.length - 1; i >= 0; i--) {
    var binding = s.runBindings[i]
    if (binding.adapter !== "claude" || binding.callId !== callId) continue
    if (found && found !== binding.providerTurn) return ""
    found = binding.providerTurn
  }
  if (found) return found
  var record = actionRequest(s, requestId)
  return record && record.callId === callId ? record.providerTurn : ""
}

// ---------------------------------------------------------------- provider turns

// The adapter's word that a provider turn started, bound once to the open
// Nodi turn; seen again, it must still be that turn's. `which` is "codex"
// or "claude".
function bindProviderTurn(s, which, update) {
  var codex = which === "codex"
  var eligible = codex ? s.agent === "codex" && !!s.spec : !!managedClaude(s)
  var started = codex ? "nodi_codex_turn_started" : "nodi_claude_turn_started"
  var named = codex ? "nodi_codex_turn_id" : "nodi_claude_turn_id"
  if (!eligible
      || !update || update.sessionUpdate !== "session_info_update"
      || !update._meta || update._meta[started] !== true
      || typeof update._meta[named] !== "string"
      || !update._meta[named]
      || !s.turnOpen || !s.actionTurn)
    return { value: false }
  var providerTurn = update._meta[named]
  var turns = (codex ? s.codexTurns : s.claudeTurns).slice()
  for (var i = turns.length - 1; i >= 0; i--) {
    if (turns[i].providerTurn !== providerTurn) continue
    return {
      value: turns[i].session === s.token
        && turns[i].channel === s.channel
        && turns[i].turn === s.actionTurn
    }
  }
  if (turns.length >= s.providerTurnBindingLimit)
    return { value: false, capacity: codex ? "Codex turn bindings" : "Claude turn bindings" }
  turns.push({
    providerTurn: providerTurn, session: s.token,
    channel: s.channel, turn: s.actionTurn
  })
  var out = { value: true }
  out[codex ? "codexTurns" : "claudeTurns"] = turns
  return out
}

function turnOrigin(turns, providerTurn) {
  for (var i = turns.length - 1; i >= 0; i--) {
    var turn = turns[i]
    if (turn.providerTurn === providerTurn) return turn
  }
  return null
}

// ---------------------------------------------------------------- rejections

function rejectionOrigin(s, requestId, input, server, relay) {
  return {
    id: requestId, session: s.token, channel: s.channel,
    turn: s.actionTurn,
    inputKey: relay.requestInputKey === undefined
      ? inputKey(input) : relay.requestInputKey,
    server: String(server), adapterKey: relay.adapterKey
  }
}

function sameRejectedOrigin(record, origin) {
  return record && record.id === origin.id
    && record.session === origin.session && record.channel === origin.channel
    && record.turn === origin.turn && record.inputKey === origin.inputKey
    && record.server === origin.server && record.adapterKey === origin.adapterKey
}

function rejectedOrigin(s, requestId) {
  var key = AskActions.requestKey(requestId)
  return Object.prototype.hasOwnProperty.call(s.originRejections, key)
    ? s.originRejections[key] : null
}

// ---------------------------------------------------------------- run bindings

// A permission for the bar's run binds its origin until the relay call
// that carries it arrives.
function bindRunOrigin(s, permissionId, callId, input, allowed, call) {
  if (typeof callId !== "string" || !callId) return { value: false }
  var bindings = s.runBindings.slice()
  var codexOrigin = null
  for (var i = bindings.length - 1; i >= 0; i--) {
    if (bindings[i].adapter !== "codex" || bindings[i].callId !== callId)
      continue
    var same = bindings[i].session === s.token
      && bindings[i].channel === s.channel
      && bindings[i].turn === s.actionTurn
      && bindings[i].operation === callId
      && bindings[i].server === s.actionServer
      && bindings[i].inputKey === inputKey(input)
      && bindings[i].allowed === (allowed === true)
    codexOrigin = same ? bindings[i] : null
    bindings.splice(i, 1)
    if (!same) return { value: false, runBindings: bindings }
  }
  if (s.agent === "codex" && s.spec
      && !codexOrigin)
    return { value: false }
  var claudeOrigin = null
  if (managedClaude(s)) {
    var meta = call && call._meta && typeof call._meta === "object"
      ? call._meta : {}
    var evidence = meta.nodi_claude_action_origin
    var server = evidence && evidence.server
    var provider = evidence && typeof evidence.providerTurn === "string"
      ? turnOrigin(s.claudeTurns, evidence.providerTurn) : null
    var hasInput = evidence && Object.prototype.hasOwnProperty.call(evidence,
                                                                     "input")
    if (!evidence || typeof evidence !== "object"
        || evidence.version !== 1 || evidence.adapter !== "claude"
        || evidence.acpSessionId !== s.sessionId
        || evidence.callId !== callId
        || !server || typeof server !== "object"
        || server.name !== s.actionServer || server.source !== "dynamic"
        || !hasInput
        || inputKey(evidence.input) !== inputKey(input)
        || AskTools.barTool(call, s.actionServer) !== "run"
        || !provider || provider.session !== s.token
        || provider.channel !== s.channel
        || provider.turn !== s.actionTurn)
      return { value: false }
    claudeOrigin = evidence
    for (var ci = bindings.length - 1; ci >= 0; ci--) {
      if (bindings[ci].adapter !== "claude"
          || bindings[ci].callId !== callId) continue
      var exact = bindings[ci].session === s.token
        && bindings[ci].channel === s.channel
        && bindings[ci].turn === s.actionTurn
        && bindings[ci].permissionId === String(permissionId)
        && bindings[ci].server === s.actionServer
        && bindings[ci].inputKey === inputKey(input)
        && bindings[ci].allowed === (allowed === true)
        && bindings[ci].providerTurn === evidence.providerTurn
      if (exact) return { value: true }
      bindings.splice(ci, 1)
      return { value: false, runBindings: bindings }
    }
  }
  if (bindings.length >= s.runBindingLimit)
    return { value: false, capacity: "run origin bindings" }
  bindings.push({
    session: s.token, channel: s.channel, turn: s.actionTurn,
    callId: callId,
    operation: callId,
    permissionId: String(permissionId),
    server: s.actionServer,
    inputKey: inputKey(input), allowed: allowed === true,
    providerTurn: codexOrigin ? codexOrigin.providerTurn
      : claudeOrigin ? claudeOrigin.providerTurn : "",
    adapter: codexOrigin ? "codex" : claudeOrigin ? "claude" : "acp"
  })
  return { value: true, runBindings: bindings }
}

// Codex's pinned adapter publishes the app-server's structured mcpToolCall
// start, with its generated call ID, before the MCP relay request. Bind only
// that exact current-session event. This also covers adapter versions which
// omit ACP permission; when permission is present bindRunOrigin replaces
// this provisional binding. The relay must carry the same generated ID.
function bindCodexRunOrigin(s, update) {
  if (s.agent !== "codex" || !s.spec
      || !update || update.sessionUpdate !== "tool_call"
      || typeof update.toolCallId !== "string" || !update.toolCallId
      || !update._meta || update._meta.is_mcp_tool_call !== true
      || AskTools.barTool(update, s.actionServer) !== "run"
      || !s.turnOpen || !s.actionTurn || !s.shown || s.proposal)
    return { value: false }
  var input = AskTools.input(update)
  if (!AskTools.runInput(input).ok) return { value: false }
  var providerTurn = update._meta.nodi_codex_turn_id
  if (typeof providerTurn !== "string" || !providerTurn) return { value: false }
  var providerOrigin = turnOrigin(s.codexTurns, providerTurn)
  if (!providerOrigin || providerOrigin.session !== s.token
      || providerOrigin.channel !== s.channel
      || providerOrigin.turn !== s.actionTurn)
    return { value: false }
  var bindings = s.runBindings.slice()
  for (var i = bindings.length - 1; i >= 0; i--) {
    if (bindings[i].adapter === "codex"
        && bindings[i].callId === update.toolCallId) {
      bindings.splice(i, 1)
      return { value: false, runBindings: bindings }
    }
  }
  if (bindings.length >= s.runBindingLimit)
    return { value: false, capacity: "run origin bindings" }
  bindings.push({
    session: s.token, channel: s.channel, turn: s.actionTurn,
    callId: update.toolCallId,
    operation: update.toolCallId,
    permissionId: "",
    server: s.actionServer,
    inputKey: inputKey(input), allowed: true,
    adapter: "codex", providerTurn: providerTurn
  })
  return { value: true, runBindings: bindings }
}

function asRelay(relay) {
  return relay && typeof relay === "object" ? relay
    : { valid: false, callId: String(relay || ""), providerTurn: "", adapterKey: "" }
}

// A request ID seen again must repeat the origin it was first accepted or
// rejected with, field for field.
function validateRunReplay(s, requestId, input, server, relay) {
  relay = asRelay(relay)
  var rejected = rejectedOrigin(s, requestId)
  if (rejected) {
    var replayedRejection = rejectionOrigin(s, requestId, input, server, relay)
    return sameRejectedOrigin(rejected, replayedRejection)
      ? { ok: true }
      : { ok: false, error: "The action replay does not match its recorded rejection origin" }
  }
  var record = actionRequest(s, requestId)
  if (!record) return { ok: true }
  var managed = managedOrigin(s)
  if (managed && !relay.valid)
    return { ok: false, error: "The action replay has no trusted call origin" }
  var trustedCallId = managed ? relay.callId : String(requestId)
  var parsed = AskTools.runInput(input)
  var kind = parsed.ok ? parsed.kind : "invalid"
  var value = parsed.ok ? parsed.value : null
  if (record.id !== requestId
      || record.session !== s.token || record.channel !== s.channel
      || typeof record.turn !== "string" || !record.turn
      || record.callId !== trustedCallId
      || record.providerTurn !== relay.providerTurn
      || record.adapterKey !== relay.adapterKey
      || record.inputKey !== inputKey(input)
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
function takeRunOrigin(s, requestId, input, server, relay) {
  relay = asRelay(relay)
  var record = actionRequest(s, requestId)
  var key = inputKey(input)
  var bindings = s.runBindings.slice()
  var managed = managedOrigin(s)
  var unmanagedDelivery = s.spec && s.spec.policy === "unmanaged"
    && s.agent !== "codex"
  if (managed && !relay.valid)
    return { ok: false, error: "The action request has no trusted call origin" }
  var trustedCallId = managed ? relay.callId : String(requestId)
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
    return { ok: true, runBindings: bindings, origin: {
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
    if (!s.turnOpen || !s.actionTurn
        || s.actionBook.session !== s.token
        || s.actionBook.channel !== s.channel
        || s.actionBook.turn !== s.actionTurn)
      return { ok: false, error: "The unmanaged action request is from an old turn" }
    if (!s.shown)
      return { ok: false, error: "The unmanaged action request arrived while the bar is closed" }
    return { ok: true, origin: {
      session: s.token, channel: s.channel, turn: s.actionTurn,
      callId: String(requestId), inputKey: key,
      operation: String(requestId), server: String(server), allowed: true,
      providerTurn: "", adapterKey: relay.adapterKey
    } }
  }
  var matches = []
  for (var i = 0; i < bindings.length; i++)
    if (bindings[i].callId === trustedCallId
        && bindings[i].inputKey === key
        && bindings[i].session === s.token
        && bindings[i].channel === s.channel
        && bindings[i].turn === s.actionTurn
        && bindings[i].providerTurn === relay.providerTurn
        && bindings[i].operation === trustedCallId
        && bindings[i].server === String(server)) matches.push(i)
  if (matches.length !== 1) {
    for (var mi = matches.length - 1; mi >= 0; mi--) bindings.splice(matches[mi], 1)
    return { ok: false, runBindings: bindings, error: matches.length
      ? "The action request origin is ambiguous"
      : "The action request has no permission-bound origin" }
  }
  var origin = bindings.splice(matches[0], 1)[0]
  origin.adapterKey = relay.adapterKey
  return { ok: true, runBindings: bindings, origin: origin }
}

// Why an accepted origin may not be proposed now, or "".
function proposalGate(s, origin) {
  if (!origin.allowed) return "The action permission was refused"
  if (!s.turnOpen || !s.actionTurn) return "The action request has no active turn"
  if (origin.session !== s.token || origin.channel !== s.channel
      || origin.turn !== s.actionTurn) return "The action request is from an old turn"
  if (!s.shown) return "The bar is closed"
  if (s.cut) return "The answer was cancelled"
  if (s.proposal) return "Another confirmation is already shown"
  return ""
}
