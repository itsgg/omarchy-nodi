// Where an action request to the bar's run tool came from (lib/AskOrigin.js).

import { test } from "node:test";
import assert from "node:assert/strict";
import { load, plain } from "./load.mjs";

const O = load("lib/AskOrigin.js");
const A = load("lib/AskActions.js");

const SERVER = "nodi-chan";
const state = (over = {}) => ({
  agent: "opencode", program: null, spec: { policy: "unmanaged" },
  sessionId: "acp-1", token: "tok", channel: "chan", actionTurn: "t1",
  turnOpen: true, shown: true, proposal: null, cut: false,
  actionServer: SERVER, runBindings: [], codexTurns: [], claudeTurns: [],
  actionBook: A.create("tok", "t1", "chan"), originRejections: {},
  runBindingLimit: 512, providerTurnBindingLimit: 1024, ...over
});
const codexCall = (id, args, turn = "p1") => ({
  sessionUpdate: "tool_call", toolCallId: id,
  rawInput: { server: SERVER, tool: "run", arguments: args },
  _meta: { is_mcp_tool_call: true, nodi_codex_turn_id: turn }
});

test("input keys ignore key order and keep missing, null and value apart", () => {
  assert.equal(O.inputKey({ b: 1, a: { d: 2, c: 3 } }), O.inputKey({ a: { c: 3, d: 2 }, b: 1 }));
  assert.equal(O.inputKey(null), "{}");
  assert.deepEqual(plain(O.identityField({}, "x")), { marker: "missing" });
  assert.deepEqual(plain(O.identityField({ x: null }, "x")), { marker: "null" });
  assert.deepEqual(plain(O.identityField({ x: "1" }, "x")), { marker: "value", type: "string", value: "1" });
  assert.notEqual(JSON.stringify(O.identityField({ x: 1 }, "x")), JSON.stringify(O.identityField({ x: "1" }, "x")));
});

test("an unmanaged relay's origin is its own request ID, typed", () => {
  const r = O.relayOrigin(state(), { params: { arguments: { query: "lock" } } }, 7);
  assert.equal(r.valid, true);
  assert.equal(r.callId, "7");
  assert.notEqual(r.adapterKey, O.relayOrigin(state(), {}, "7").adapterKey);
});

test("a Codex relay is valid only for this session's thread with a call and turn", () => {
  const s = state({ agent: "codex", spec: { policy: "strict" } });
  const message = (session, thread) => ({ params: { _meta: {
    callId: "c1", "x-codex-turn-metadata": { session_id: session, thread_id: thread, turn_id: "p1" } } } });
  const good = O.relayOrigin(s, message("acp-1", "acp-1"), 3);
  assert.deepEqual([good.valid, good.callId, good.providerTurn], [true, "c1", "p1"]);
  assert.equal(O.relayOrigin(s, message("acp-2", "acp-1"), 3).valid, false);
  assert.equal(O.relayOrigin(s, message("acp-1", "acp-2"), 3).valid, false);
  assert.equal(O.relayOrigin(s, { params: {} }, 3).valid, false);
});

test("a Claude relay takes its provider turn from one agreeing binding", () => {
  const msg = { params: { _meta: { "claudecode/toolUseId": "u1" } } };
  const bound = turn => ({ adapter: "claude", callId: "u1", providerTurn: turn });
  const s = bindings => state({ agent: "claude", spec: { policy: "strict" }, runBindings: bindings });
  assert.equal(O.relayOrigin(s([bound("p1")]), msg, 1).providerTurn, "p1");
  assert.equal(O.relayOrigin(s([bound("p1"), bound("p2")]), msg, 1).valid, false);
  assert.equal(O.relayOrigin(s([]), msg, 1).valid, false);
  // A stand-in program is not the managed adapter.
  assert.equal(O.relayOrigin({ ...s([]), program: ["x"] }, msg, 1).callId, "1");
});

test("a provider turn binds once to the open turn and is refused from another", () => {
  const update = { sessionUpdate: "session_info_update", _meta: { nodi_codex_turn_started: true, nodi_codex_turn_id: "p1" } };
  const s = state({ agent: "codex", spec: {} });
  const first = O.bindProviderTurn(s, "codex", update);
  assert.equal(first.value, true);
  assert.equal(first.codexTurns.length, 1);
  assert.equal(s.codexTurns.length, 0, "the snapshot is not written");
  assert.deepEqual(plain(O.bindProviderTurn({ ...s, codexTurns: first.codexTurns }, "codex", update)), { value: true });
  assert.equal(O.bindProviderTurn({ ...s, codexTurns: first.codexTurns, actionTurn: "t2" }, "codex", update).value, false);
  assert.equal(O.bindProviderTurn({ ...s, turnOpen: false }, "codex", update).value, false);
  assert.equal(O.bindProviderTurn(s, "claude", update).value, false);
  const full = O.bindProviderTurn({ ...s, providerTurnBindingLimit: 0 }, "codex", update);
  assert.deepEqual(plain(full), { value: false, capacity: "Codex turn bindings" });
  const claude = state({ agent: "claude", spec: { policy: "strict" } });
  const cu = { sessionUpdate: "session_info_update", _meta: { nodi_claude_turn_started: true, nodi_claude_turn_id: "q" } };
  assert.equal(O.bindProviderTurn(claude, "claude", cu).claudeTurns[0].providerTurn, "q");
  assert.equal(O.bindProviderTurn({ ...claude, providerTurnBindingLimit: 0 }, "claude", cu).capacity, "Claude turn bindings");
});

test("a permission binds an ACP run origin, and a full table is a capacity end", () => {
  const s = state();
  const r = O.bindRunOrigin(s, 9, "call-1", { query: "lock" }, true, {});
  assert.equal(r.value, true);
  assert.deepEqual(plain(r.runBindings[0]), {
    session: "tok", channel: "chan", turn: "t1", callId: "call-1", operation: "call-1",
    permissionId: "9", server: SERVER, inputKey: O.inputKey({ query: "lock" }), allowed: true,
    providerTurn: "", adapter: "acp"
  });
  assert.deepEqual(plain(O.bindRunOrigin(s, 9, "", {}, true, {})), { value: false });
  assert.deepEqual(plain(O.bindRunOrigin({ ...s, runBindingLimit: 0 }, 9, "c", {}, true, {})),
    { value: false, capacity: "run origin bindings" });
});

test("Codex needs its structured start before a permission binds, and the same input", () => {
  const s = state({ agent: "codex", spec: {}, codexTurns: [{ providerTurn: "p1", session: "tok", channel: "chan", turn: "t1" }] });
  assert.deepEqual(plain(O.bindRunOrigin(s, 1, "c1", { query: "lock" }, true, {})), { value: false });
  const started = O.bindCodexRunOrigin(s, codexCall("c1", { query: "lock" }));
  assert.equal(started.value, true);
  const held = { ...s, runBindings: started.runBindings };
  const bound = O.bindRunOrigin(held, 1, "c1", { query: "lock" }, true, {});
  assert.equal(bound.value, true);
  assert.equal(bound.runBindings.length, 1);
  assert.equal(bound.runBindings[0].providerTurn, "p1");
  assert.equal(bound.runBindings[0].permissionId, "1");
  const changed = O.bindRunOrigin(held, 1, "c1", { query: "reboot" }, true, {});
  assert.deepEqual(plain(changed), { value: false, runBindings: [] });
  // A second structured start for the same call drops the first.
  assert.deepEqual(plain(O.bindCodexRunOrigin(held, codexCall("c1", { query: "lock" }))), { value: false, runBindings: [] });
  // A start from another provider turn, or while a card waits, binds nothing.
  assert.equal(O.bindCodexRunOrigin(s, codexCall("c2", { query: "x" }, "p9")).value, false);
  assert.equal(O.bindCodexRunOrigin({ ...s, proposal: {} }, codexCall("c2", { query: "x" })).value, false);
  assert.equal(O.bindCodexRunOrigin(s, codexCall("c2", { query: "x", key: "y" })).value, false);
});

test("Claude's permission binds only with evidence naming this session, server, call and turn", () => {
  const s = state({ agent: "claude", spec: { policy: "strict" },
    claudeTurns: [{ providerTurn: "p1", session: "tok", channel: "chan", turn: "t1" }] });
  const call = (over = {}) => ({
    _meta: {
      claudeCode: { mcpServer: { name: SERVER }, toolName: "mcp__" + SERVER + "__run" },
      nodi_claude_action_origin: { version: 1, adapter: "claude", acpSessionId: "acp-1", callId: "u1",
        server: { name: SERVER, source: "dynamic" }, input: { query: "lock" }, providerTurn: "p1", ...over }
    }
  });
  const ok = O.bindRunOrigin(s, "perm", "u1", { query: "lock" }, true, call());
  assert.equal(ok.value, true);
  assert.equal(ok.runBindings[0].adapter, "claude");
  assert.deepEqual(plain(O.bindRunOrigin({ ...s, runBindings: ok.runBindings }, "perm", "u1", { query: "lock" }, true, call())), { value: true });
  assert.deepEqual(plain(O.bindRunOrigin({ ...s, runBindings: ok.runBindings }, "other", "u1", { query: "lock" }, true, call())),
    { value: false, runBindings: [] });
  for (const bad of [{ acpSessionId: "acp-2" }, { callId: "u2" }, { input: { query: "x" } },
                     { providerTurn: "p9" }, { server: { name: SERVER, source: "static" } }, { version: 2 }])
    assert.equal(O.bindRunOrigin(s, "perm", "u1", { query: "lock" }, true, call(bad)).value, false, JSON.stringify(bad));
});

test("a replay must repeat its rejection or its accepted record exactly", () => {
  const relay = { valid: true, callId: "5", providerTurn: "", adapterKey: "k", requestInputKey: undefined };
  const s = state();
  const rejection = O.rejectionOrigin(s, 5, { query: "x" }, SERVER, relay);
  const rejected = { ...s, originRejections: { "number:5": rejection } };
  assert.deepEqual(plain(O.validateRunReplay(rejected, 5, { query: "x" }, SERVER, relay)), { ok: true });
  assert.equal(O.validateRunReplay(rejected, 5, { query: "y" }, SERVER, relay).ok, false);
  assert.equal(O.validateRunReplay(rejected, 5, { query: "x" }, "nodi-other", relay).ok, false);
  assert.deepEqual(plain(O.validateRunReplay(s, 5, {}, SERVER, relay)), { ok: true }, "unknown is not a replay");

  const book = A.begin(s.actionBook, {
    id: 5, session: "tok", turn: "t1", channel: "chan", callId: "5", providerTurn: "",
    adapterKey: "k", inputKey: O.inputKey({ query: "x" }), operation: "5", server: SERVER,
    kind: "query", value: "x"
  }).book;
  const held = { ...s, actionBook: book };
  assert.deepEqual(plain(O.validateRunReplay(held, 5, { query: "x" }, SERVER, relay)), { ok: true });
  assert.equal(O.validateRunReplay(held, "5", { query: "y" }, SERVER, relay).ok, true, "a string ID is another request");
  assert.equal(O.validateRunReplay(held, 5, { query: "x" }, SERVER, { ...relay, adapterKey: "j" }).ok, false);
  assert.equal(O.validateRunReplay({ ...held, token: "other" }, 5, { query: "x" }, SERVER, relay).ok, false);
  const managed = { ...held, agent: "codex", spec: {} };
  assert.equal(O.validateRunReplay(managed, 5, { query: "x" }, SERVER, { ...relay, valid: false }).error,
    "The action replay has no trusted call origin");
});

test("a first delivery takes exactly one binding; none or two refuse it", () => {
  const binding = { session: "tok", channel: "chan", turn: "t1", callId: "c1", operation: "c1",
    permissionId: "", server: SERVER, inputKey: O.inputKey({ query: "x" }), allowed: true,
    providerTurn: "p1", adapter: "codex" };
  const s = state({ agent: "codex", spec: {}, runBindings: [binding] });
  const relay = { valid: true, callId: "c1", providerTurn: "p1", adapterKey: "k" };
  const one = O.takeRunOrigin(s, 1, { query: "x" }, SERVER, relay);
  assert.equal(one.ok, true);
  assert.equal(one.origin.adapterKey, "k");
  assert.deepEqual(plain(one.runBindings), []);
  const two = O.takeRunOrigin({ ...s, runBindings: [binding, { ...binding }] }, 1, { query: "x" }, SERVER, relay);
  assert.deepEqual(plain(two), { ok: false, runBindings: [], error: "The action request origin is ambiguous" });
  const none = O.takeRunOrigin({ ...s, runBindings: [] }, 1, { query: "x" }, SERVER, relay);
  assert.equal(none.error, "The action request has no permission-bound origin");
  assert.equal(O.takeRunOrigin(s, 1, { query: "x" }, SERVER, { ...relay, valid: false }).runBindings, undefined);
  assert.equal(O.takeRunOrigin(s, 1, { query: "x" }, SERVER, "c1").error, "The action request has no trusted call origin");
});

test("an unmanaged delivery is its own origin, only in the open turn with the bar shown", () => {
  const s = state();
  const relay = { valid: true, callId: "4", providerTurn: "", adapterKey: "k" };
  const ok = O.takeRunOrigin(s, 4, { query: "x" }, SERVER, relay);
  assert.deepEqual(plain(ok.origin), { session: "tok", channel: "chan", turn: "t1", callId: "4",
    inputKey: O.inputKey({ query: "x" }), operation: "4", server: SERVER, allowed: true,
    providerTurn: "", adapterKey: "k" });
  assert.equal(ok.runBindings, undefined);
  assert.equal(O.takeRunOrigin({ ...s, turnOpen: false }, 4, {}, SERVER, relay).error, "The unmanaged action request is from an old turn");
  assert.equal(O.takeRunOrigin({ ...s, actionBook: A.create("tok", "t0", "chan") }, 4, {}, SERVER, relay).ok, false);
  assert.equal(O.takeRunOrigin({ ...s, shown: false }, 4, {}, SERVER, relay).error,
    "The unmanaged action request arrived while the bar is closed");
});

test("a proposal gate says the first reason in order", () => {
  const origin = { allowed: true, session: "tok", channel: "chan", turn: "t1" };
  assert.equal(O.proposalGate(state(), origin), "");
  assert.equal(O.proposalGate(state({ shown: false, cut: true }), { ...origin, allowed: false }), "The action permission was refused");
  assert.equal(O.proposalGate(state({ turnOpen: false }), origin), "The action request has no active turn");
  assert.equal(O.proposalGate(state(), { ...origin, turn: "t0" }), "The action request is from an old turn");
  assert.equal(O.proposalGate(state({ shown: false, cut: true }), origin), "The bar is closed");
  assert.equal(O.proposalGate(state({ cut: true, proposal: {} }), origin), "The answer was cancelled");
  assert.equal(O.proposalGate(state({ proposal: {} }), origin), "Another confirmation is already shown");
});
