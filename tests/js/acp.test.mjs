// Ask over ACP (lib/Acp.js): what a line from the agent is, what Nodi
// sends, and what an update or a permission request comes to.

import { test } from "node:test";
import assert from "node:assert/strict";
import { load, plain } from "./load.mjs";

const A = load("lib/Acp.js");

test("a line from the agent: a request, a notification, a response, or not a message", () => {
  assert.deepEqual(plain(A.parse('{"jsonrpc":"2.0","id":"perm-1","method":"session/request_permission","params":{"sessionId":"s"}}')),
    { kind: "request", id: "perm-1", method: "session/request_permission", params: { sessionId: "s" } });
  assert.deepEqual(plain(A.parse('{"jsonrpc":"2.0","method":"session/update","params":{"sessionId":"s","update":{}}}\r')),
    { kind: "notification", method: "session/update", params: { sessionId: "s", update: {} } }, "a CR before the newline is the agent's line ending");
  assert.deepEqual(plain(A.parse('{"jsonrpc":"2.0","id":0,"result":{"protocolVersion":1}}')), { kind: "response", id: 0, result: { protocolVersion: 1 } });
  assert.deepEqual(plain(A.parse('{"jsonrpc":"2.0","id":3,"error":{"code":-32000,"message":"Authentication required"}}')),
    { kind: "response", id: 3, error: { code: -32000, message: "Authentication required" } });
  assert.deepEqual(plain(A.parse('{"jsonrpc":"2.0","id":4,"result":null}')), { kind: "response", id: 4, result: null }, "a null result is an answer");
  for (const l of ["", "   ", "Starting agent v1.2...", "[1,2]", '[{"jsonrpc":"2.0","id":1,"result":{}}]', "null", '{"jsonrpc":"2.0"}', '{"id":{"x":1},"result":{}}'])
    assert.equal(A.parse(l).kind, "bad", JSON.stringify(l));
});

test("what Nodi sends is one line each, JSON-RPC 2.0", () => {
  for (const l of [A.initialize(0, "0.3.0"), A.newSession(1, "/c", []), A.prompt(2, "s", "a\nb"), A.cancel("s"), A.close(3, "s"),
                   A.result("perm-1", { outcome: { outcome: "cancelled" } }), A.failure(7, A.NOT_FOUND, "no")]) {
    assert.ok(l.endsWith("\n") && l.indexOf("\n") === l.length - 1, "one line: " + l);
    assert.equal(JSON.parse(l).jsonrpc, "2.0");
  }
  const init = JSON.parse(A.initialize(0, "0.3.0"));
  assert.deepEqual(init.params.clientCapabilities, { fs: { readTextFile: false, writeTextFile: false }, terminal: false }, "no files, no terminal");
  assert.equal(init.params.protocolVersion, 1);
  assert.deepEqual(JSON.parse(A.cancel("s")), { jsonrpc: "2.0", method: "session/cancel", params: { sessionId: "s" } }, "a notification has no id");
  assert.deepEqual(JSON.parse(A.failure(7, A.NOT_FOUND, "no")).error, { code: -32601, message: "no" });
});

test("what the agent can do: what it leaves out, it cannot", () => {
  const c = plain(A.capabilities({ protocolVersion: 1, agentInfo: { name: "claude-agent-acp", title: "Claude Agent", version: "0.86.0" },
    agentCapabilities: { promptCapabilities: { image: true }, sessionCapabilities: { close: {} } },
    authMethods: [{ id: "login", name: "Log in" }, { name: "no id" }] }));
  assert.deepEqual(c, { version: 1, image: true, embedded: false, close: true, http: false, name: "Claude Agent",
    auth: [{ id: "login", name: "Log in", description: "", type: "agent" }] });
  const none = plain(A.capabilities({}));
  assert.equal(none.image, false);
  assert.equal(none.close, false);
  assert.deepEqual(none.auth, []);
  assert.equal(A.capabilities({ protocolVersion: 2 }).version, 2);
});

test("MCP servers as session/new takes them: stdio always, http only when the agent takes it", () => {
  assert.deepEqual(plain(A.stdioServer("nodi", "/bin/nodi", ["mcp", "--ask"], { NODI_ASK: "t" })),
    { name: "nodi", command: "/bin/nodi", args: ["mcp", "--ask"], env: [{ name: "NODI_ASK", value: "t" }] });
  const named = { github: { command: "gh-mcp", args: ["stdio"], env: { TOKEN: "x" } }, web: { type: "http", url: "https://m/mcp", headers: { A: "b" } },
                  old: { type: "sse", url: "https://m/sse" }, broken: { args: [] }, odd: null };
  assert.deepEqual(plain(A.servers(named, false)), [{ name: "github", command: "gh-mcp", args: ["stdio"], env: [{ name: "TOKEN", value: "x" }] }]);
  assert.deepEqual(plain(A.servers(named, true)).map(s => s.name), ["github", "web"], "sse never: deprecated in v1, gone in v2");
  assert.deepEqual(plain(A.servers(named, true))[1], { type: "http", name: "web", url: "https://m/mcp", headers: [{ name: "A", value: "b" }] });
  assert.deepEqual(plain(JSON.parse(A.newSession(1, "/c", [])).params), { cwd: "/c", mcpServers: [] }, "no _meta unless given");
});

test("a question as a prompt: instructions when not given before, the picture, then the text", () => {
  assert.deepEqual(JSON.parse(A.prompt(2, "s", "hi")).params, { sessionId: "s", prompt: [{ type: "text", text: "hi" }] });
  assert.deepEqual(JSON.parse(A.prompt(2, "s", "what is this", { mediaType: "image/png", data: "AAA" })).params.prompt,
    [{ type: "image", mimeType: "image/png", data: "AAA" }, { type: "text", text: "what is this" }]);
  assert.deepEqual(JSON.parse(A.prompt(2, "s", "hi", null, "You answer briefly.")).params.prompt,
    [{ type: "text", text: "You answer briefly." }, { type: "text", text: "hi" }], "an agent that took no instructions with the session gets them first");
  assert.equal(A.capabilities({ agentCapabilities: { mcpCapabilities: { http: true } } }).http, true);
});

test("an update: the answer's text, a tool call, the context used, or nothing Ask shows", () => {
  const up = u => plain(A.update({ sessionId: "s", update: u }));
  assert.deepEqual(up({ sessionUpdate: "agent_message_chunk", content: { type: "text", text: "Canb" } }), { kind: "text", text: "Canb", messageId: "" });
  assert.deepEqual(up({ sessionUpdate: "agent_message_chunk", content: { type: "text", text: "x" }, messageId: "m2" }).messageId, "m2");
  assert.deepEqual(up({ sessionUpdate: "agent_message_chunk", content: { type: "image", data: "A" } }), { kind: "other" }, "only text is the answer");
  assert.deepEqual(up({ sessionUpdate: "agent_thought_chunk", content: { type: "text", text: "hm" } }), { kind: "thought" }, "what it thinks is not kept");
  assert.equal(up({ sessionUpdate: "tool_call", toolCallId: "t1", title: "Read" }).kind, "tool");
  assert.equal(up({ sessionUpdate: "tool_call_update", status: "completed" }).kind, "other", "no id, nothing to update");
  assert.deepEqual(up({ sessionUpdate: "usage_update", used: 1364, size: 200000, cost: { amount: 0.001, currency: "USD" } }), { kind: "usage", used: 1364, size: 200000 });
  for (const k of ["plan", "available_commands_update", "current_mode_update", "config_option_update", "session_info_update", "notice", "compaction_update", "a_kind_from_the_future"])
    assert.deepEqual(up({ sessionUpdate: k }), { kind: "other" }, k);
  assert.deepEqual(plain(A.update({})), { kind: "other" });
});

test("a tool call kept across its updates: null leaves a field, content replaces", () => {
  let c = A.mergeCall(null, { sessionUpdate: "tool_call", toolCallId: "t1", title: "mcp__nodi__run", status: "pending", rawInput: {}, content: [{ type: "content" }] });
  c = A.mergeCall(c, { sessionUpdate: "tool_call_update", toolCallId: "t1", title: null, rawInput: { key: "menu:system.lock" } });
  c = A.mergeCall(c, { sessionUpdate: "tool_call_update", toolCallId: "t1", status: "completed", content: [] });
  assert.deepEqual(plain(c), { toolCallId: "t1", title: "mcp__nodi__run", status: "completed", rawInput: { key: "menu:system.lock" }, content: [] });
});

test("his answer to a permission request: once, never always; no option to refuse is a cancel", () => {
  const claude = [{ optionId: "allow-once", name: "Yes", kind: "allow_once" },
                  { optionId: "allow-with-updates", name: "Yes, and don't ask again", kind: "allow_always" },
                  { optionId: "reject", name: "No", kind: "reject_once" }];
  assert.deepEqual(plain(A.choose(claude, true)), { outcome: { outcome: "selected", optionId: "allow-once" } });
  assert.deepEqual(plain(A.choose(claude, false)), { outcome: { outcome: "selected", optionId: "reject" } });
  const always = [{ optionId: "a", kind: "allow_always" }, { optionId: "r", kind: "reject_always" }];
  assert.deepEqual(plain(A.choose(always, true)), { outcome: { outcome: "cancelled" } }, "only always to allow: he is asked again next time, so no");
  assert.deepEqual(plain(A.choose(always, false)), { outcome: { outcome: "selected", optionId: "r" } });
  assert.deepEqual(plain(A.choose(undefined, true)), { outcome: { outcome: "cancelled" } });
});

test("a tool call's name and input on one line", () => {
  assert.equal(A.title({ title: "Run\n  ls -la" }), "Run ls -la");
  assert.equal(A.title({ _meta: { claudeCode: { toolName: "mcp__nodi__run" } } }), "mcp__nodi__run");
  assert.equal(A.title({}), "a tool");
  assert.equal(A.inputLine({ key: "a\nb" }), '{"key":"a\\nb"}');
  assert.equal(A.inputLine({ t: "x".repeat(400) }).length, 300);
});

test("why a prompt ended, when it is not the answer's own end", () => {
  assert.equal(A.stopped("end_turn"), "");
  assert.equal(A.stopped("cancelled"), "");
  assert.match(A.stopped("max_tokens"), /length/);
  assert.match(A.stopped("refusal"), /refused/);
});

test("a sign-in asked for by its method; a turn's end Ask has no words for says nothing", () => {
  const A = load("lib/Acp.js");
  assert.deepEqual(plain(JSON.parse(A.authenticate(7, "chatgpt"))), { jsonrpc: "2.0", id: 7, method: "authenticate", params: { methodId: "chatgpt" } });
  assert.equal(A.stopped("something_new"), "");
});
