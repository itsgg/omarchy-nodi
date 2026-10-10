.pragma library
.import "Acp.js" as Acp

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
  { name: "run", description: "Run one row by its key, from search. The person sees it in the bar first, with what it will do, "
      + "and runs it with Enter or refuses with Escape; say what you are about to run before calling this.",
    inputSchema: { type: "object", properties: { key: { type: "string" } }, required: ["key"] },
    annotations: { readOnlyHint: false } }
]

// Which of the bar's own tools a tool call the agent asks about is:
// "search", "run", or "" for any other. Claude's adapter names the server
// in _meta (claudeCode.mcpServer); else the name or title, as each agent
// gives an MCP tool's: mcp__nodi__run (Claude Code), nodi__run (Gemini's
// name, Grok), "run (nodi MCP Server)" (Gemini's title), "nodi: run"
// (Cursor), mcp.nodi.run (Codex), nodi_run (OpenCode); the research of
// 2026-10-07, Gemini's mcp-tool.ts 525.
var NAMED = new RegExp("^(?:mcp(?:__|\\.))?" + SERVER + "(?:__|\\.|_|: ?|/)(search|run)$")
var TITLED = new RegExp("^(search|run) \\(" + SERVER + " MCP Server\\)")
function barTool(call) {
  var c = call && typeof call === "object" ? call : {}
  var meta = c._meta && c._meta.claudeCode && typeof c._meta.claudeCode === "object" ? c._meta.claudeCode : null
  if (meta && meta.mcpServer && typeof meta.mcpServer === "object") {
    if (meta.mcpServer.name !== SERVER) return ""
    var own = String(meta.toolName || "").match(/__(search|run)$/)
    return own ? own[1] : ""
  }
  var names = [c.name, c.title, meta && meta.toolName]
  for (var i = 0; i < names.length; i++) {
    if (typeof names[i] !== "string") continue
    var m = names[i].trim().match(NAMED) || names[i].trim().match(TITLED)
    if (m) return m[1]
  }
  return ""
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
var USER_PROGRAMS = { filter: true, "filter-list": true, "filter-step": true, "script-output": true }

// `request` (a provider's ctx.request) for an agent's search: the user's
// programs answer that they are not for it, so nothing of his starts.
function forAgent(request) {
  return function(name) {
    if (USER_PROGRAMS[String(name)]) return { state: "error", value: null, error: "not for an agent's search", at: 0 }
    // Every argument as it came: { fetch: false } asks only for what is held.
    return request ? request.apply(null, arguments) : { state: "pending", value: null, error: "", at: 0 }
  }
}

function doing(call) {
  var own = barTool(call)
  var input = call && call.rawInput && typeof call.rawInput === "object" ? call.rawInput : {}
  if (own === "search") {
    var q = String(input.query || "").replace(/\s+/g, " ").trim()
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
      else if (p.name === "run") text = String(handlers.run(String(args.key || "")))
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
  + "windows), and its run tool runs one, which the person confirms in the bar. When asked to do something the bar can do, "
  + "search for it and run the best row; say in one line what you ran. Never invent a key: run only one search returned."

var MCP_NOTE = " You also have the tools of the servers he named; each call is shown to him first, and runs only on his Enter."

function instructions(acts, named) {
  return SYSTEM + (acts ? ACTS + (named ? MCP_NOTE : "") : "")
}
