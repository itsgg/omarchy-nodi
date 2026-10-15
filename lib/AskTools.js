.pragma library
.import "Acp.js" as Acp
.import "AskActions.js" as AskActions

// What Ask gives the agent it holds (components/Ask.qml, ROADMAP 84): the
// bar's rows as two tools, what it is told about where its answers go, and
// the MCP servers he named. lib/Acp.js is how they are said.

// ---------------------------------------------------------------- rows as tools

// Ask acts through the bar's rows (ROADMAP 44): the agent has these two
// tools, served by the bar through `nodi mcp --ask`, which hands each
// message to the shell. A search runs at once; a run runs only a row he
// allowed, else it is shown in the bar for his Enter. The agent can do
// nothing the bar cannot.
var SERVER = "nodi"
var TOOLS = [
  { name: "search", description: "Search the command bar for rows: apps, settings, Omarchy's menu and commands, windows, files, "
      + "snippets and the rest of what the bar holds. Returns up to 8 rows, best first, each with a key to run it by.",
    inputSchema: { type: "object", properties: { query: { type: "string", description: "What a person would type in the bar" } }, required: ["query"] },
    annotations: { readOnlyHint: true } },
  { name: "run",
    description: "Resolve and propose one bar action. Use query directly for an obvious action; use key only after search when alternatives had to be inspected.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "What a person would type in the bar" },
        key: { type: "string", description: "A key returned by search in this turn" }
      },
      additionalProperties: false
    },
    annotations: { readOnlyHint: false } }
]

function runInput(args) {
  return AskActions.input(args)
}

// Which of this session's bar tools a permission call is for. Display
// names and titles are untrusted: another server may choose the same text.
// Claude and Codex expose the originating server as adapter metadata.
function barTool(call, expectedServer) {
  var c = call && typeof call === "object" ? call : {}
  var expected = String(expectedServer || "")
  if (!expected) return ""
  var meta = c._meta && c._meta.claudeCode && typeof c._meta.claudeCode === "object" ? c._meta.claudeCode : null
  if (meta && meta.mcpServer && typeof meta.mcpServer === "object") {
    if (meta.mcpServer.name !== expected) return ""
    var prefix = "mcp__" + expected + "__"
    var name = String(meta.toolName || "")
    return name === prefix + "search" ? "search" : name === prefix + "run" ? "run" : ""
  }
  var raw = c.rawInput && typeof c.rawInput === "object" ? c.rawInput : {}
  if (c._meta && c._meta.is_mcp_tool_call === true && raw.server === expected) {
    if (raw.tool === "search" || raw.tool === "run") return raw.tool
  }
  return ""
}

// An MCP call's arguments as the tool itself receives them. Codex carries
// the server, tool and arguments together; the other adapters carry the
// arguments directly.
function input(call) {
  var raw = call && call.rawInput && typeof call.rawInput === "object" ? call.rawInput : {}
  if (call && call._meta && call._meta.is_mcp_tool_call === true
      && typeof raw.server === "string" && typeof raw.tool === "string"
      && raw.arguments && typeof raw.arguments === "object" && !Array.isArray(raw.arguments))
    return raw.arguments
  return raw
}

// What a tool call the agent is making does, said to him while he waits:
// the bar's own in words, any other by the agent's title for it.
// What an agent's run at once (`nodi mcp`'s `run`, which no Enter of his
// answers) may take: rows of these providers only, whose command no word
// of the agent's reaches (an app, a window, Omarchy's menu and toggles,
// the desktop's media and devices, a saved desktop, a plugin), and of
// those no reminder's row: setting one takes the agent's
// words, and the list copies them or clears his (Nodi's own, 2026-10-10).
// Any other row, a command line typed after `>`, a keyword or a script
// filter given the agent's words, a snippet or a paste that could type a
// command into a terminal, runs only as `propose` shows it, on his Enter
// (codex's reviews, 2026-10-09: the agent's words were a command through a
// keyword's `run`, a filter's actions, a paste and a reminder).
// Not a keybinding: it runs whatever it is bound to, a toggle, a lock or
// a shutdown with no confirmation (Fable 2026-10-10: `keys idle` flipped
// Stay Awake at once).
var AT_ONCE = { apps: true, windows: true, menu: true, system: true, desktop: true, desktops: true, plugins: true }

// And of those, none that changes a setting or installs: Omarchy's Setup,
// Style, Install, Remove and Update, a toggle, a theme, a Bluetooth device,
// a Wi-Fi network, an audio device, the next background. Each runs as
// `propose` shows it, on his Enter (his word, 2026-10-10, after the
// marketplace's review: an agent could set DNS, a font or Stay Awake with
// no Enter of his).
var CHANGES = /^(menu:(setup|style|install|remove|update)(\.|$)|menu:trigger\.toggle\.|toggle:|theme:|bluetooth:|wifi:|output:|input:|system:bg-next$)/

// Why the row `key`, of the provider `provider`, may not run at once for an
// agent, or "".
function refusedAtOnce(key, provider) {
  var k = String(key || "")
  if (/^shell:/.test(k)) return "it runs a command line; propose it, and he runs it from the bar"
  if (CHANGES.test(k)) return "it changes a setting or installs; propose it, and he runs it from the bar"
  if (/^keys:/.test(k) || String(provider || "") === "keys") return "a keybinding runs whatever it is bound to; propose it, and he runs it from the bar"
  if (AT_ONCE[String(provider || "")] !== true || /^remind:/.test(k))
    return "only a row that runs nothing of your words runs at once; propose it, and he runs it from the bar"
  return ""
}

// The reads an agent's search may not start: the user's own programs
// (script filters, their lists and steps, and inline script commands),
// which its words would reach as their query.
var USER_PROGRAMS = { filter: true, "filter-list": true, "filter-step": true, "filter-socket": true, "script-output": true }

// `request` (a provider's ctx.request) for an agent's search: the user's
// programs answer that they are not for it, so nothing of his starts.
function forAgent(request) {
  return function(name) {
    if (USER_PROGRAMS[String(name)]) return { state: "error", value: null, error: "not for an agent's search", at: 0 }
    // Every argument as it came: { fetch: false } asks only for what is held.
    return request ? request.apply(null, arguments) : { state: "pending", value: null, error: "", at: 0 }
  }
}

function doing(call, expectedServer) {
  var own = barTool(call, expectedServer)
  var given = input(call)
  if (own === "search") {
    var q = String(given.query || "").replace(/\s+/g, " ").trim()
    return q ? "Searching the bar for " + (q.length > 60 ? q.slice(0, 57) + "..." : q) : "Searching the bar"
  }
  if (own === "run") return "Running a row of the bar"
  return "Using " + Acp.title(call)
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

// The server's JSON-RPC answer to one message (initialize, ping,
// tools/list, tools/call; a notification gets none: null), given
// `search(query)`, which returns rows, and `run(key)`, which says what
// happened.
function mcp(message, handlers) {
  var m = message || {}
  if (m.id === undefined || typeof m.method !== "string") return null
  var id = m.id
  var ok = function(result) { return { jsonrpc: "2.0", id: id, result: result } }
  if (m.method === "initialize")
    return ok({ protocolVersion: (m.params && m.params.protocolVersion) || "2025-06-18", capabilities: { tools: {} }, serverInfo: { name: SERVER, version: "1" } })
  if (m.method === "ping") return ok({})
  if (m.method === "tools/list") return ok({ tools: TOOLS })
  if (m.method === "tools/call") {
    var p = m.params || {}
    var args = p.arguments && typeof p.arguments === "object" ? p.arguments : {}
    var text
    try {
      if (p.name === "search") text = JSON.stringify(handlers.search(String(args.query || "")))
      else if (p.name === "run") {
        var parsed = runInput(args)
        if (!parsed.ok)
          return ok({ content: [{ type: "text", text: "Failed: " + parsed.error }], isError: true })
        text = String(handlers.run(parsed))
      }
      else return { jsonrpc: "2.0", id: id, error: { code: -32602, message: "no tool " + p.name } }
    } catch (e) {
      return ok({ content: [{ type: "text", text: "Failed: " + e }], isError: true })
    }
    return ok({ content: [{ type: "text", text: text }] })
  }
  return { jsonrpc: "2.0", id: id, error: { code: -32601, message: "no method " + m.method } }
}

// ---------------------------------------------------------------- instructions

// What the agent is told about where its answers go.
// A text sent to be fixed, rewritten or translated (providers/selection.js,
// translate.js) comes back whole and in its own script (Fable 2026-10-06).
var SYSTEM = "You answer questions typed into a desktop command bar on Arch Linux (Omarchy, Hyprland). "
  + "Answer directly and briefly: plain text, no markdown headings, no preamble, at most a few short paragraphs. "
  + "When the answer is a command, give the command on its own line. Plain ASCII: no em dashes, no curly quotes. "
  + "A text you are given to fix, rewrite or translate comes back whole, in the script its language uses."

// With the bar's tools: what they are for.
var ACTS = " You can also act through the bar: its search tool finds rows (apps, settings, Omarchy's menu and commands, "
  + "windows), and its run tool proposes one, which the person confirms in the bar. For an obvious action, call run with its "
  + "query directly. Use search only when you need to inspect alternatives, then call run with a key it returned. "
  + "Say in one line what you ran, and never invent a key."

var MCP_NOTE = " You also have the tools of the servers he named; each call is shown to him first, and runs only on his Enter."

function instructions(acts, named) {
  return SYSTEM + (acts ? ACTS + (named ? MCP_NOTE : "") : "")
}
