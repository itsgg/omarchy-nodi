.pragma library

// One line of `claude -p --output-format stream-json --include-partial-
// messages`, as what Ask needs of it:
//
//   { kind: "ready" }                 the session is up (system init)
//   { kind: "text", text }            a piece of the answer
//   { kind: "done", text, error }     the answer is complete (result)
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
  return { kind: "other" }
}

// The message that asks a question on the session's stdin.
function message(question) {
  return JSON.stringify({ type: "user", message: { role: "user", content: String(question) } }) + "\n"
}

// What the session is told about where its answers go.
var SYSTEM = "You answer questions typed into a desktop command bar on Arch Linux (Omarchy, Hyprland). "
  + "Answer directly and briefly: plain text, no markdown headings, no preamble, at most a few short paragraphs. "
  + "When the answer is a command, give the command on its own line. Plain ASCII: no em dashes, no curly quotes."

// The command that holds a session open: a login shell for the user's PATH
// and Claude's own credentials; no tools, no MCP servers (so no plugin, the
// Telegram one included, starts), no user settings or hooks, nothing saved.
// --safe-mode also leaves out CLAUDE.md, auto memory and skills: without it
// a one-line question carried 7,302 input tokens of his rules and profile,
// with it 409, the login unchanged (measured 2026-10-02, Fable's finding).
function argv(model) {
  return ["bash", "-lc", 'exec claude "$@"', "nodi-ask",
          "-p", "--input-format", "stream-json", "--output-format", "stream-json", "--verbose", "--include-partial-messages",
          "--model", String(model || "haiku"), "--tools", "", "--strict-mcp-config", "--setting-sources", "local",
          "--settings", '{"alwaysThinkingEnabled":false}', "--no-session-persistence", "--safe-mode", "--system-prompt", SYSTEM]
}
