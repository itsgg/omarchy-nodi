.pragma library

// One line of `claude -p --output-format stream-json --include-partial-
// messages`, as what Ask needs of it:
//
//   { kind: "ready" }                 the session is up (system init)
//   { kind: "text", text }            a piece of the answer
//   { kind: "done", text, error }     the answer is complete (result)
//   { kind: "control", id, request }  the session asks the bar: may a tool
//                                     run (can_use_tool), or a message for
//                                     the bar's own tools (mcp_message)
//   { kind: "controlDone", id }       the session answers the bar's request
//   { kind: "other" }                 anything else (thinking, status, limits)
//
// Only text deltas are the answer; thinking and signatures are not shown.
function parse(line) {
  var e
  try { e = JSON.parse(line) } catch (err) { return { kind: "other" } }
  if (!e || typeof e !== "object") return { kind: "other" }
  if (e.type === "system" && e.subtype === "init") return { kind: "ready" }
  if (e.type === "stream_event" && e.event && e.event.type === "content_block_delta" && e.event.delta && e.event.delta.type === "text_delta")
    return { kind: "text", text: String(e.event.delta.text || "") }
  if (e.type === "result") return { kind: "done", text: typeof e.result === "string" ? e.result : "", error: e.is_error ? String(e.result || e.subtype || "error") : "" }
  if (e.type === "control_request" && e.request && typeof e.request_id === "string") return { kind: "control", id: e.request_id, request: e.request }
  if (e.type === "control_response") return { kind: "controlDone", id: String((e.response && e.response.request_id) || "") }
  return { kind: "other" }
}

// ---------------------------------------------------------------- rows as tools

// Ask acts through the bar's rows (ROADMAP 44): the session has no tools
// of its own, only these two, served by the bar over the pipe it already
// reads (the Agent SDK's control channel: an `initialize` naming an
// in-process server, then `can_use_tool` before each call and the server's
// JSON-RPC as `mcp_message`; ran end to end on this machine with Claude
// Code 2.1.289, the research's ecosystem/ccproto.py). A search runs at
// once; a run is shown in the bar, armed, with its risk and command, and
// runs only on his Enter. Claude can do nothing the bar cannot.
var SERVER = "nodi"
var TOOLS = [
  { name: "search", description: "Search the command bar for rows: apps, settings, Omarchy's menu and commands, windows, files, "
      + "snippets and the rest of what the bar holds. Returns up to 8 rows, best first, each with a key to run it by.",
    inputSchema: { type: "object", properties: { query: { type: "string", description: "What a person would type in the bar" } }, required: ["query"] },
    annotations: { readOnlyHint: true } },
  { name: "run", description: "Run one row by its key, from search. The person sees it in the bar first, with what it will do, "
      + "and runs it with Enter or refuses with Escape; say what you are about to run before calling this.",
    inputSchema: { type: "object", properties: { key: { type: "string" } }, required: ["key"] },
    annotations: { readOnlyHint: false } }
]

// The bar's request that names its server, sent before the first question.
function initialize() {
  return JSON.stringify({ type: "control_request", request_id: "nodi-init", request: { subtype: "initialize", sdkMcpServers: [SERVER] } }) + "\n"
}

// The bar's answer to a request of the session's.
function reply(id, response) {
  return JSON.stringify({ type: "control_response", response: { subtype: "success", request_id: String(id), response: response || {} } }) + "\n"
}

// What the session may do: the bar's search at once, a run only as the
// bar says (undefined: ask him), anything else never.
// A tool of a server he named (`names`, servers()) is his to allow too,
// each call (ROADMAP 49).
function permission(request, names) {
  var tool = String((request && request.tool_name) || "")
  if (tool === "mcp__" + SERVER + "__search") return { behavior: "allow", updatedInput: (request && request.input) || {} }
  if (tool === "mcp__" + SERVER + "__run") return undefined
  if (serverOf(tool, names)) return undefined
  return { behavior: "deny", message: "Only the bar's own search and run, and the servers he named, are allowed here." }
}

// The named server a tool belongs to ("mcp__github__search" is github's), or "".
function serverOf(tool, names) {
  var list = Array.isArray(names) ? names : []
  for (var i = 0; i < list.length; i++) if (String(tool).indexOf("mcp__" + list[i] + "__") === 0) return list[i]
  return ""
}

// A tool's input on one line, for the row that asks him (300 characters).
function inputLine(input) {
  var t = ""
  try { t = JSON.stringify(input || {}) } catch (e) { t = String(input) }
  t = t.replace(/\s+/g, " ")
  return t.length > 300 ? t.slice(0, 297) + "..." : t
}

// The MCP servers he named in nodi.json, "ask": { "mcpServers": { name:
// config } } in Claude Code's own format, kept when the name is a plain
// word other than the bar's own and the config names a command or a url.
function servers(config) {
  var out = {}
  var given = config && typeof config === "object" && !Array.isArray(config) ? config : {}
  for (var name in given) {
    // No "__": Claude Code names a tool mcp__<server>__<tool> and splits at
    // the first, so such a name is ambiguous (Fable 2026-10-06).
    if (!Object.prototype.hasOwnProperty.call(given, name) || !/^[A-Za-z0-9_-]{1,64}$/.test(name) || name.indexOf("__") !== -1 || name === SERVER) continue
    var c = given[name]
    if (c && typeof c === "object" && (typeof c.command === "string" || typeof c.url === "string")) out[name] = c
  }
  return out
}

// The server's JSON-RPC answer to one message (initialize, tools/list,
// tools/call; a notification gets an empty one), given `search(query)`,
// which returns rows, and `run(key)`, which returns what happened.
function mcp(message, handlers) {
  var m = message || {}
  var id = m.id === undefined ? 0 : m.id
  var ok = function(result) { return { jsonrpc: "2.0", id: id, result: result } }
  if (m.method === "initialize")
    return ok({ protocolVersion: (m.params && m.params.protocolVersion) || "2025-06-18", capabilities: { tools: {} }, serverInfo: { name: SERVER, version: "1" } })
  if (m.method === "tools/list") return ok({ tools: TOOLS })
  if (m.method === "tools/call") {
    var p = m.params || {}
    var args = p.arguments || {}
    var text
    try {
      if (p.name === "search") text = JSON.stringify(handlers.search(String(args.query || "")))
      else if (p.name === "run") text = String(handlers.run(String(args.key || "")))
      else return { jsonrpc: "2.0", id: id, error: { code: -32601, message: "no tool " + p.name } }
    } catch (e) {
      return ok({ content: [{ type: "text", text: "Failed: " + e }], isError: true })
    }
    return ok({ content: [{ type: "text", text: text }] })
  }
  return ok({})
}

// The message that asks a question on the session's stdin; with `image`
// ({ mediaType, data }, base64), the picture goes first, as a content
// block the held session takes (probed with Claude Code 2.1.289,
// 2026-10-06).
function message(question, image) {
  var content = String(question)
  if (image && image.data) content = [{ type: "image", source: { type: "base64", media_type: String(image.mediaType || "image/png"), data: String(image.data) } },
                                      { type: "text", text: String(question) }]
  return JSON.stringify({ type: "user", message: { role: "user", content: content } }) + "\n"
}

// What the session is told about where its answers go.
// A text sent to be fixed, rewritten or translated (providers/selection.js,
// translate.js) comes back whole and in its own script (Fable 2026-10-06).
var SYSTEM = "You answer questions typed into a desktop command bar on Arch Linux (Omarchy, Hyprland). "
  + "Answer directly and briefly: plain text, no markdown headings, no preamble, at most a few short paragraphs. "
  + "When the answer is a command, give the command on its own line. Plain ASCII: no em dashes, no curly quotes. "
  + "A text you are given to fix, rewrite or translate comes back whole, in the script its language uses."

// With the bar's tools: what they are for.
var ACTS = " You can also act through the bar: its search tool finds rows (apps, settings, Omarchy's menu and commands, "
  + "windows), and its run tool runs one, which the person confirms in the bar. When asked to do something the bar can do, "
  + "search for it and run the best row; say in one line what you ran. Never invent a key: run only one search returned."

var MCP_NOTE = " You also have the tools of the servers he named; each call is shown to him first, and runs only on his Enter."

// The command that holds a session open: a login shell for the user's PATH
// and Claude's own credentials; no tools, no MCP servers (so no plugin, the
// Telegram one included, starts), no user settings or hooks, nothing saved.
// --safe-mode also leaves out CLAUDE.md, auto memory and skills: without it
// a one-line question carried 7,302 input tokens of his rules and profile,
// with it 409, the login unchanged (measured 2026-10-02, Fable's finding).
//
// With `acts`, the session asks the bar before any tool runs
// (--permission-prompt-tool stdio) and has the bar's two tools only: no
// built-in tool, since Claude Code runs some read-only shell commands
// without asking (the research's probe).
//
// With servers he named (`mcp`, servers(), only with `acts`, so each call
// is his to allow): --mcp-config gives them, and --safe-mode goes, since
// it turns off every MCP server; CLAUDE.md and auto memory stay out by
// CLAUDE_CODE_DISABLE_CLAUDE_MDS and _AUTO_MEMORY, which Ask.qml sets
// (probed with Claude Code 2.1.289: about 2,700 input tokens, as in safe
// mode, against 8,000 without them). Skills, plugins, commands and agents
// stay out too (Fable's probe); what safe mode alone kept out is a hook in
// the bar's own ~/.cache/nodi/ask/.claude/settings.local.json, which
// nothing writes. The servers' config, an env token included, goes on
// claude's command line.
function argv(model, acts, mcp) {
  var named = acts && mcp && Object.keys(mcp).length > 0
  var out = ["bash", "-lc", 'exec "${NODI_ASK_PROGRAM:-claude}" "$@"', "nodi-ask",
             "-p", "--input-format", "stream-json", "--output-format", "stream-json", "--verbose", "--include-partial-messages",
             "--model", String(model || "haiku"), "--tools", "", "--strict-mcp-config", "--setting-sources", "local",
             "--settings", '{"alwaysThinkingEnabled":false}', "--no-session-persistence"]
  if (named) out.push("--mcp-config", JSON.stringify({ mcpServers: mcp }))
  else out.push("--safe-mode")
  out.push("--system-prompt", acts ? SYSTEM + ACTS + (named ? MCP_NOTE : "") : SYSTEM)
  if (acts) out.push("--permission-prompt-tool", "stdio", "--permission-mode", "default")
  return out
}
