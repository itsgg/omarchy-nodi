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

test("Ask continues: about the selection, about the window, a new question (ROADMAP 43)", () => {
  const idle = { ask: { phase: "idle", question: "", answer: "", model: "haiku" } };
  let rows = plain(run("ask what is this", idle));
  assert.deepEqual(rows.map(r => r.key), ["ask:new"], "nothing selected, no window: the plain question");
  rows = plain(run("ask what is this", { ...idle, selection: { text: "E = mc^2", fresh: false },
                                         window: { address: "0x1", class: "foot", title: "notes", stableId: "180000b1", width: 1512 } }));
  assert.deepEqual(rows.map(r => r.key), ["ask:new", "ask:selection", "ask:window"]);
  const sel = rows[1];
  assert.deepEqual([sel.nodi, sel.ask.question, sel.ask.context], ["askWith", "what is this", "selection"]);
  assert.equal(sel.ask.message, "what is this\n\nThe text it is about:\n<text>\nE = mc^2\n</text>");
  const win = rows[2];
  assert.deepEqual([win.nodi, win.ask.question, win.ask.context, win.subtitle], ["askWindow", "what is this", "window", "notes"]);
  assert.match(win.ask.message, /^what is this\n\nThe picture is the window the question is about, titled "notes"\.$/);
  const done = { ask: { phase: "done", question: "what is this", answer: "a formula", model: "haiku" } };
  const fresh = plain(run("ask what is this", done)).find(r => r.key === "ask:fresh");
  assert.deepEqual([fresh.title, fresh.nodi], ["New question", "askNew"]);
  // A proposal waits on him whatever the field holds (Fable 2026-10-06).
  const prop = { ask: { phase: "proposing", question: "lock my screen", answer: "", model: "haiku",
                        proposal: { key: "menu:system.lock", title: "Lock", subtitle: "System", run: { kind: "exec", argv: ["x"] } } } };
  const edited = plain(run("ask something else", prop));
  assert.deepEqual(edited.map(r => r.key), ["ask:deny", "ask:allow"], "on another question, Refuse leads: a stray Enter says no");
  assert.equal(edited[1].subtitle, "Claude asks to run it for: lock my screen");
  assert.deepEqual(plain(run("ask lock my screen", prop)).map(r => r.key), ["ask:allow", "ask:deny"], "on its own question, Run leads");
  assert.deepEqual(plain(run("ask ", prop)).map(r => r.key), ["ask:deny", "ask:allow"], "an empty question shows it too");
  const copiedQ = plain(run("ask what is this", { ...idle, selection: { text: "x", fresh: true, source: "clipboard" } })).find(r => r.key === "ask:selection");
  assert.deepEqual([copiedQ.title, copiedQ.ask.context], ["Ask about the copied text: what is this", "copied"]);
  // Enter would do nothing: a row says why (Fable 2026-10-06).
  assert.equal(plain(run("ask what time is it", { ask: { phase: "streaming", question: "lock my screen", answer: "", model: "haiku" } }))[0].title,
               "Claude is still on: lock my screen");
  assert.equal(plain(run("ask what is this", { ask: { phase: "idle", question: "", answer: "", model: "haiku", capturing: true } }))[0].title,
               "Taking a picture of the window...");
  const pic = { ask: { phase: "done", question: "what is this", answer: "a chart", model: "haiku", context: "window" } };
  assert.equal(plain(run("ask what is this", pic)).find(r => r.key === "ask:again").subtitle, "what is this, with the same picture");
});

test("a question with a picture: the image block first, as the held session takes it (probed 2026-10-06)", () => {
  const m = JSON.parse(A.message("what is this", { mediaType: "image/jpeg", data: "AAAA" }));
  assert.deepEqual(m.message.content, [{ type: "image", source: { type: "base64", media_type: "image/jpeg", data: "AAAA" } },
                                       { type: "text", text: "what is this" }]);
  assert.equal(JSON.parse(A.message("plain")).message.content, "plain", "without one, as before");
});

test("MCP servers he names, for Ask: given to the session, each call his to allow (ROADMAP 49)", () => {
  const s = A.servers({ github: { command: "gh-mcp" }, nodi: { command: "x" }, "bad name": { command: "y" }, web: { url: "https://x" }, junk: { foo: 1 },
                        "a__b": { command: "z" } });
  assert.deepEqual(Object.keys(s), ["github", "web"], "a plain name, not the bar's own, no __, with a command or a url");
  const named = plain(A.argv("sonnet", true, s));
  assert.ok(!named.includes("--safe-mode"), "safe mode would turn every server off");
  assert.deepEqual(JSON.parse(named[named.indexOf("--mcp-config") + 1]), { mcpServers: plain(s) });
  assert.ok(named.includes("--strict-mcp-config"), "no other server");
  assert.ok(plain(A.argv("sonnet", true, {})).includes("--safe-mode"), "none named: as before");
  assert.ok(plain(A.argv("sonnet", false, s)).includes("--safe-mode"), "without acts, no servers: no call could be asked");
  assert.equal(A.permission({ tool_name: "mcp__github__search_issues", input: {} }, ["github"]), undefined, "his to allow");
  assert.equal(A.permission({ tool_name: "mcp__other__x", input: {} }, ["github"]).behavior, "deny");
  assert.equal(A.serverOf("mcp__github__search_issues", ["git", "github"]), "github");
  assert.equal(A.serverOf("mcp__github__x", ["git"]), "", "a prefix of another's name is not it");
  const prop = { ask: { phase: "proposing", question: "find my issues", answer: "", model: "sonnet",
                        proposal: { key: "tool:github:search_issues", title: "github: search_issues", subtitle: '{"q":"is:open"}', tool: true, input: { q: "is:open" } } } };
  const rows = plain(run("ask find my issues", prop));
  assert.deepEqual([rows[0].title, rows[0].actionLabel, rows[0].nodi], ["Allow github: search_issues", "Allow", "askAllow"]);
  const Pane = load("lib/Pane.js");
  const pane = plain(Pane.choose({ proposal: prop.ask.proposal }));
  assert.match(pane.markdown, /"q": "is:open"/, "the pane shows what it is given");
});
