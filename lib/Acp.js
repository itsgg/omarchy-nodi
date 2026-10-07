.pragma library

// The Agent Client Protocol, client side, as Ask speaks it (ROADMAP 84):
// JSON-RPC 2.0, one message a line on the agent's stdin and stdout
// (agentclientprotocol.com/protocol/v1, schema v1.24.1, read 2026-10-07).
// Nodi asks; the agent answers in session/update notifications while a
// session/prompt request is open, and asks Nodi before a tool runs
// (session/request_permission). Nodi offers no files and no terminal, so
// an agent works through its own tools, each shown and asked about, and
// the bar's two tools, a stdio MCP server the agent starts.

var VERSION = 1

// What one line from the agent is:
//   { kind: "request", id, method, params }       the agent asks Nodi
//   { kind: "notification", method, params }       the agent tells Nodi
//   { kind: "response", id, result | error }       an answer to Nodi's request
//   { kind: "bad" }                                not a message (a banner, a
//                                                  batch, broken JSON)
// A blank line is not a message either; a trailing CR is the agent's
// line ending, not the message's.
function parse(line) {
  var s = String(line)
  if (s.charAt(s.length - 1) === "\r") s = s.slice(0, -1)
  if (!s.trim()) return { kind: "bad" }
  var m
  try { m = JSON.parse(s) } catch (e) { return { kind: "bad" } }
  if (!m || typeof m !== "object" || Array.isArray(m)) return { kind: "bad" }
  var hasId = m.id !== undefined && (m.id === null || typeof m.id === "number" || typeof m.id === "string")
  if (typeof m.method === "string") {
    var params = m.params && typeof m.params === "object" ? m.params : {}
    return hasId ? { kind: "request", id: m.id, method: m.method, params: params } : { kind: "notification", method: m.method, params: params }
  }
  if (hasId && m.error && typeof m.error === "object")
    return { kind: "response", id: m.id, error: { code: Number(m.error.code) || 0, message: String(m.error.message || "") } }
  if (hasId && m.result !== undefined) return { kind: "response", id: m.id, result: m.result }
  return { kind: "bad" }
}

function line(o) { return JSON.stringify(o) + "\n" }
function request(id, method, params) { return line({ jsonrpc: "2.0", id: id, method: method, params: params || {} }) }
function notification(method, params) { return line({ jsonrpc: "2.0", method: method, params: params || {} }) }
function result(id, value) { return line({ jsonrpc: "2.0", id: id, result: value === undefined ? {} : value }) }
function failure(id, code, message) { return line({ jsonrpc: "2.0", id: id, error: { code: code, message: String(message) } }) }

var NOT_FOUND = -32601
var AUTH_REQUIRED = -32000
var CANCELLED = -32800

// Nodi's side of the handshake: no files, no terminal, nothing else.
function initialize(id, version) {
  return request(id, "initialize", {
    protocolVersion: VERSION,
    clientCapabilities: { fs: { readTextFile: false, writeTextFile: false }, terminal: false },
    clientInfo: { name: "nodi", title: "Nodi", version: String(version || "") }
  })
}

// What the agent said it can do, every field there: what it leaves out it
// cannot do (initialization: "treat all capabilities omitted ... as
// UNSUPPORTED").
function capabilities(res) {
  var r = res && typeof res === "object" ? res : {}
  var a = r.agentCapabilities && typeof r.agentCapabilities === "object" ? r.agentCapabilities : {}
  var p = a.promptCapabilities && typeof a.promptCapabilities === "object" ? a.promptCapabilities : {}
  var s = a.sessionCapabilities && typeof a.sessionCapabilities === "object" ? a.sessionCapabilities : {}
  var info = r.agentInfo && typeof r.agentInfo === "object" ? r.agentInfo : {}
  var methods = Array.isArray(r.authMethods) ? r.authMethods : []
  return {
    version: Number(r.protocolVersion),
    image: p.image === true,
    embedded: p.embeddedContext === true,
    close: !!s.close && typeof s.close === "object",
    http: !!(a.mcpCapabilities && a.mcpCapabilities.http === true),
    name: String(info.title || info.name || ""),
    auth: methods.filter(function(m) { return m && typeof m.id === "string" })
                 .map(function(m) { return { id: m.id, name: String(m.name || m.id), description: String(m.description || ""), type: String(m.type || "agent") } })
  }
}

// A stdio MCP server as session/new takes it: env as a list of pairs.
function stdioServer(name, command, args, env) {
  var pairs = []
  var e = env && typeof env === "object" ? env : {}
  for (var k in e) if (Object.prototype.hasOwnProperty.call(e, k)) pairs.push({ name: k, value: String(e[k]) })
  return { name: String(name), command: String(command), args: (args || []).map(String), env: pairs }
}

// The servers he named in nodi.json, in Claude Code's own format ({ name:
// { command, args, env } or { type: "http", url, headers } }), as ACP's
// list; an http one only when the agent takes http (`http`), sse never
// (deprecated in v1, gone in v2).
function servers(named, http) {
  var out = []
  var given = named && typeof named === "object" ? named : {}
  for (var name in given) {
    if (!Object.prototype.hasOwnProperty.call(given, name)) continue
    var c = given[name]
    if (!c || typeof c !== "object") continue
    if (typeof c.command === "string") out.push(stdioServer(name, c.command, Array.isArray(c.args) ? c.args : [], c.env))
    else if (typeof c.url === "string" && http && (c.type === undefined || c.type === "http")) {
      var headers = []
      var h = c.headers && typeof c.headers === "object" ? c.headers : {}
      for (var k in h) if (Object.prototype.hasOwnProperty.call(h, k)) headers.push({ name: k, value: String(h[k]) })
      out.push({ type: "http", name: String(name), url: c.url, headers: headers })
    }
  }
  return out
}

function newSession(id, cwd, mcpServers, meta) {
  var p = { cwd: String(cwd), mcpServers: mcpServers || [] }
  if (meta) p._meta = meta
  return request(id, "session/new", p)
}

// A question as a prompt: what the agent is told first, when it took
// nothing with the session (`preface`), then the picture when there is one,
// then the text.
function prompt(id, sessionId, text, image, preface) {
  var blocks = []
  if (preface) blocks.push({ type: "text", text: String(preface) })
  if (image && image.data) blocks.push({ type: "image", mimeType: String(image.mediaType || "image/png"), data: String(image.data) })
  blocks.push({ type: "text", text: String(text) })
  return request(id, "session/prompt", { sessionId: sessionId, prompt: blocks })
}

function cancel(sessionId) { return notification("session/cancel", { sessionId: sessionId }) }
function close(id, sessionId) { return request(id, "session/close", { sessionId: sessionId }) }
function authenticate(id, methodId) { return request(id, "authenticate", { methodId: methodId }) }

// What a session/update means to Ask:
//   { kind: "text", text, messageId }     the answer, as it is written
//   { kind: "tool", call }                a tool call begins or changes
//                                         (call: toolCallId and what came)
//   { kind: "thought" }                   it is thinking (what it thinks is
//                                         not shown)
//   { kind: "usage", used, size }         the context window filled so far
//   { kind: "other" }                     anything else: plans, commands,
//                                         modes, kinds not known
// Only text is the answer.
function update(params) {
  var u = params && params.update && typeof params.update === "object" ? params.update : null
  if (!u) return { kind: "other" }
  var k = u.sessionUpdate
  if (k === "agent_message_chunk") {
    var c = u.content || {}
    if (c.type !== "text") return { kind: "other" }
    return { kind: "text", text: String(c.text || ""), messageId: u.messageId === undefined || u.messageId === null ? "" : String(u.messageId) }
  }
  if (k === "agent_thought_chunk") return { kind: "thought" }
  if ((k === "tool_call" || k === "tool_call_update") && u.toolCallId !== undefined) return { kind: "tool", call: u }
  if (k === "usage_update") return { kind: "usage", used: Number(u.used) || 0, size: Number(u.size) || 0 }
  return { kind: "other" }
}

// A tool call as Ask keeps it, from its first notice and every update:
// omitted or null leaves a field as it was, content replaces (tool-calls).
function mergeCall(old, u) {
  var out = {}
  var k
  if (old) for (k in old) out[k] = old[k]
  for (k in u) if (Object.prototype.hasOwnProperty.call(u, k) && u[k] !== null && u[k] !== undefined && k !== "sessionUpdate") out[k] = u[k]
  return out
}

// His answer to a permission request, from the options the agent offered:
// yes is the one-time allow, no the one-time refusal; never "always", which
// would let the agent stop asking. With no such option, the request is
// cancelled, which the agent takes as no.
function choose(options, allow) {
  var list = Array.isArray(options) ? options : []
  var want = allow ? ["allow_once"] : ["reject_once", "reject_always"]
  for (var w = 0; w < want.length; w++)
    for (var i = 0; i < list.length; i++)
      if (list[i] && list[i].kind === want[w] && typeof list[i].optionId === "string")
        return { outcome: { outcome: "selected", optionId: list[i].optionId } }
  return { outcome: { outcome: "cancelled" } }
}

// The name a permission request goes by: the tool call's title, else its
// tool's name, as the agent gave it, on one line.
function title(call) {
  var c = call || {}
  var t = String(c.title || c.name || (c._meta && c._meta.claudeCode && c._meta.claudeCode.toolName) || "a tool")
  return t.replace(/\s+/g, " ").trim().slice(0, 200)
}

// The input a tool call carries, on one line (300 characters).
function inputLine(input) {
  var t = ""
  try { t = JSON.stringify(input === undefined ? {} : input) } catch (e) { t = String(input) }
  t = String(t).replace(/\s+/g, " ")
  return t.length > 300 ? t.slice(0, 297) + "..." : t
}

// Why a prompt ended, said to him when it is not the answer's own end.
function stopped(reason) {
  if (reason === "end_turn" || reason === "cancelled") return ""
  if (reason === "max_tokens") return "The answer reached its length limit"
  if (reason === "max_turn_requests") return "The agent reached its limit of steps for one question"
  if (reason === "refusal") return "The agent refused to answer"
  return ""
}

// What to set after session/new: the mode Ask needs (`mode`, by id) and
// the model asked for (`model`, matched to an option's value, its name, or
// a value that starts with it and a bracket, as Cursor's do), through the
// session's config options, else its modes. Returns { requests: [{ method,
// params, what }], error }: an error when the agent has no such mode or
// model, which ends the start; never a quiet fall back.
function configure(sessionId, res, mode, model) {
  var r = res && typeof res === "object" ? res : {}
  var opts = Array.isArray(r.configOptions) ? r.configOptions.filter(function(o) { return o && typeof o.id === "string" }) : []
  var out = []
  var flat = function(o) {
    var list = []
    ;(Array.isArray(o.options) ? o.options : []).forEach(function(x) {
      if (x && Array.isArray(x.options)) x.options.forEach(function(y) { if (y && typeof y.value === "string") list.push(y) })
      else if (x && typeof x.value === "string") list.push(x)
    })
    return list
  }
  var byCategory = function(cat) { return opts.filter(function(o) { return o.category === cat || o.id === cat })[0] || null }
  if (mode) {
    var mo = byCategory("mode")
    var modes = r.modes && Array.isArray(r.modes.availableModes) ? r.modes.availableModes : []
    if (mo && flat(mo).some(function(x) { return x.value === mode })) {
      if (mo.currentValue !== mode) out.push({ method: "session/set_config_option", params: { sessionId: sessionId, configId: mo.id, value: mode }, what: "mode" })
    } else if (modes.some(function(x) { return x && x.id === mode })) {
      if (r.modes.currentModeId !== mode) out.push({ method: "session/set_mode", params: { sessionId: sessionId, modeId: mode }, what: "mode" })
    } else return { requests: [], error: "it has no " + mode + " mode" }
  }
  if (model) {
    var me = byCategory("model")
    var want = String(model).toLowerCase()
    var all = me ? flat(me) : []
    var hit = all.filter(function(x) { return x.value.toLowerCase() === want })[0]
           || all.filter(function(x) { return String(x.name || "").toLowerCase() === want })[0]
           || all.filter(function(x) { return x.value.toLowerCase().indexOf(want + "[") === 0 })[0]
    if (!hit) return { requests: [], error: "it has no model " + model + (all.length ? "; it offers " + all.slice(0, 6).map(function(x) { return x.name || x.value }).join(", ") : "") }
    if (me.currentValue !== hit.value) out.push({ method: "session/set_config_option", params: { sessionId: sessionId, configId: me.id, value: hit.value }, what: "model" })
  }
  return { requests: out, error: "" }
}
