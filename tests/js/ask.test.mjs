// Ask: what a stream-json line means, and the command that holds a session.

import { test } from "node:test";
import assert from "node:assert/strict";
import { load, plain } from "./load.mjs";
import { run } from "./fixtures.mjs";

const A = load("lib/AskStream.js");

test("a stream-json line, as Ask needs it", () => {
  assert.deepEqual(plain(A.parse('{"type":"system","subtype":"init","tools":[]}')), { kind: "ready" });
  assert.deepEqual(plain(A.parse('{"type":"stream_event","event":{"type":"content_block_delta","delta":{"type":"text_delta","text":"Canb"}}}')), { kind: "text", text: "Canb" });
  assert.deepEqual(plain(A.parse('{"type":"stream_event","event":{"type":"content_block_delta","delta":{"type":"thinking_delta","thinking":"hm"}}}')), { kind: "other" });
  assert.deepEqual(plain(A.parse('{"type":"result","subtype":"success","is_error":false,"result":"Canberra"}')), { kind: "done", text: "Canberra", error: "" });
  assert.equal(A.parse('{"type":"result","subtype":"error_during_execution","is_error":true,"result":"x"}').error, "x");
  assert.deepEqual(plain(A.parse("not json")), { kind: "other" });
});

test("a question is one JSON line; the session has no tools, no MCP, no user settings", () => {
  const m = A.message('say "hi"\nthen go');
  assert.ok(m.endsWith("\n") && m.split("\n").length === 2, "one line");
  assert.equal(JSON.parse(m).message.content, 'say "hi"\nthen go');
  const argv = A.argv("haiku");
  for (const flag of ["--strict-mcp-config", "--no-session-persistence", "--safe-mode"]) assert.ok(argv.includes(flag), flag);
  assert.equal(argv[argv.indexOf("--tools") + 1], "");
  assert.equal(argv[argv.indexOf("--setting-sources") + 1], "local");
  assert.equal(argv[argv.indexOf("--model") + 1], "haiku");
});

test("Ask acts through the bar's rows: its tools, its handshake, what may run (ROADMAP 44)", () => {
  const S = load("lib/AskStream.js");
  const a = plain(S.argv("haiku", true));
  assert.deepEqual(a.slice(-4), ["--permission-prompt-tool", "stdio", "--permission-mode", "default"]);
  assert.equal(a[a.indexOf("--tools") + 1], "", "no built-in tool: Claude Code runs some shell commands without asking");
  assert.ok(!plain(S.argv("haiku", false)).includes("--permission-prompt-tool"), "without acts, as before");
  assert.deepEqual(JSON.parse(S.initialize()), { type: "control_request", request_id: "nodi-init", request: { subtype: "initialize", sdkMcpServers: ["nodi"] } });
  assert.deepEqual(plain(S.parse(JSON.stringify({ type: "control_request", request_id: "r1", request: { subtype: "can_use_tool", tool_name: "mcp__nodi__run", input: { key: "app:x" } } }))),
    { kind: "control", id: "r1", request: { subtype: "can_use_tool", tool_name: "mcp__nodi__run", input: { key: "app:x" } } });
  assert.deepEqual(plain(S.parse(JSON.stringify({ type: "control_response", response: { subtype: "success", request_id: "nodi-init" } }))), { kind: "controlDone", id: "nodi-init" });
  assert.equal(S.permission({ tool_name: "mcp__nodi__search", input: { query: "x" } }).behavior, "allow", "a search at once");
  assert.equal(S.permission({ tool_name: "mcp__nodi__run", input: { key: "k" } }), undefined, "a run: him");
  assert.equal(S.permission({ tool_name: "Bash", input: {} }).behavior, "deny", "anything else never");
  assert.deepEqual(JSON.parse(S.reply("r1", { behavior: "deny", message: "no" })), { type: "control_response", response: { subtype: "success", request_id: "r1", response: { behavior: "deny", message: "no" } } });
});

test("the bar's server answers initialize, tools/list and tools/call", () => {
  const S = load("lib/AskStream.js");
  const h = { search: q => [{ key: "app:" + q }], run: k => "Ran: " + k };
  assert.equal(plain(S.mcp({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18" } }, h)).result.serverInfo.name, "nodi");
  assert.deepEqual(plain(S.mcp({ jsonrpc: "2.0", id: 2, method: "tools/list" }, h)).result.tools.map(t => t.name), ["search", "run"]);
  assert.equal(plain(S.mcp({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "search", arguments: { query: "firefox" } } }, h)).result.content[0].text, '[{"key":"app:firefox"}]');
  assert.equal(plain(S.mcp({ jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "run", arguments: { key: "app:x" } } }, h)).result.content[0].text, "Ran: app:x");
  assert.equal(plain(S.mcp({ jsonrpc: "2.0", id: 5, method: "tools/call", params: { name: "rm" } }, h)).error.code, -32601);
  const bad = plain(S.mcp({ jsonrpc: "2.0", id: 6, method: "tools/call", params: { name: "search", arguments: {} } }, { search: () => { throw "boom"; } }));
  assert.ok(bad.result.isError && /boom/.test(bad.result.content[0].text), "a handler that throws is a tool error, not a dead session");
  assert.deepEqual(plain(S.mcp({ jsonrpc: "2.0", method: "notifications/initialized" }, h)), { jsonrpc: "2.0", id: 0, result: {} });
});

test("a proposed run: two rows, the exact command in the pane, Escape refuses", () => {
  const Pane = load("lib/Pane.js");
  const Run = load("lib/Run.js");
  const Keys = load("lib/Keys.js");
  const proposal = { key: "menu:system.reboot", title: "Reboot", subtitle: "System", run: Run.exec(["systemctl", "reboot"]), risk: "", confirmWord: "" };
  const rows = plain(run("ask restart the machine", { ask: { phase: "proposing", question: "restart the machine", answer: "", model: "haiku", proposal } }));
  assert.deepEqual(rows.map(r => [r.title, r.nodi]), [["Run Reboot", "askAllow"], ["Refuse", "askDeny"]]);
  const pane = plain(Pane.choose({ proposal }));
  assert.deepEqual([pane.title, pane.text, pane.subtitle], ["Reboot", "systemctl reboot", "Claude asks to run it: Enter runs it, Esc refuses"]);
  assert.deepEqual(plain(Keys.decide({ name: "Escape" }, { proposing: true })), { do: "refuse" });
});
