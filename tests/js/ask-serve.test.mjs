// The bar's side of `nodi mcp --ask` (lib/AskServe.js), over a stand-in Ask.

import { test } from "node:test";
import assert from "node:assert/strict";
import { load, plain } from "./load.mjs";

const S = load("lib/AskServe.js");
const A = load("lib/AskActions.js");

const live = { token: "tok", channel: "chan", recycling: false };
const env = o => JSON.stringify({ token: "tok", channel: "chan", ...o });

test("an envelope is authenticated before it is dispatched", () => {
  assert.match(S.envelope("nope", {}, live).reply, /not a message for Ask/);
  assert.match(S.envelope(JSON.stringify({ token: "tok" }), {}, live).reply, /not a message for Ask/);
  assert.deepEqual(plain(S.envelope(env({ op: "poll", ticket: "t" }), {}, live)), { op: "poll", ticket: "t" });
  assert.deepEqual(plain(S.envelope(env({ op: "cancel", ticket: "t" }), {}, live)), { op: "cancel", ticket: "t" });
  assert.deepEqual(plain(S.envelope(env({ op: "call", line: "{}" }), {}, live)),
    { op: "call", token: "tok", channel: "chan", line: "{}" });
  assert.match(S.envelope(env({ op: "call" }), {}, live).reply, /not a message for Ask/);
  assert.match(S.envelope(env({ op: "other" }), {}, live).reply, /not a message for Ask/);
  for (const other of [{ token: "x" }, { channel: "x" }]) {
    const call = env({ op: "call", line: JSON.stringify({ id: 4, method: "tools/call" }), ...other });
    assert.deepEqual(JSON.parse(S.envelope(call, {}, live).reply).error.message, "This question's session has ended");
    assert.equal(S.envelope(env({ op: "call", line: JSON.stringify({ method: "n" }), ...other }), {}, live).reply, "");
    assert.equal(S.envelope(env({ op: "poll", ticket: "t", ...other }), {}, live).reply, "");
  }
  assert.equal(S.envelope(env({ op: "poll", ticket: "t" }), {}, { ...live, recycling: true }).reply, "");
});

test("a dead session's ticket is answered once, to the token and channel it was issued to", () => {
  const retired = { "old:1": { token: "old", channel: "oc", response: "R" } };
  const ask = o => S.envelope(JSON.stringify({ token: "old", channel: "oc", ticket: "old:1", ...o }), retired, live);
  assert.deepEqual(plain(ask({ op: "poll" })), { retired: "old:1", reply: "R" });
  assert.deepEqual(plain(ask({ op: "cancel" })), { retired: "old:1", reply: "ok" });
  assert.deepEqual(plain(ask({ op: "poll", channel: "x" })), { reply: "" });
  // A call is never served from a retired ticket.
  assert.equal(ask({ op: "call", line: "{}" }).retired, undefined);
});

// A stand-in Ask with the steps serve takes, each recorded.
function host(over = {}) {
  const log = [];
  const h = {
    token: "tok", channel: "chan", recycling: false, actionServer: "nodi-chan",
    capacityFailure: "", actionTurn: "t1", toolRequests: {}, responses: {},
    searcher: (q, turn) => [{ key: "app:" + q, turn }],
    toolRequestKey: id => typeof id + ":" + String(id),
    relayOrigin: (m, id) => ({ valid: true, callId: String(id), providerTurn: "", adapterKey: "k" }),
    actionRequest: id => h.records && h.records[String(id)] || null,
    validateRunReplay: () => ({ ok: true }),
    takeRunOrigin: () => ({ ok: true, origin: { allowed: true } }),
    pendingToolResponse: id => { log.push(["pending", id]); return h.full ? "" : "tok:1" },
    toolResponseFor: id => h.responses[String(id)] || null,
    rememberOriginRejection: id => log.push(["reject", id]),
    publishAction: (id, outcome, isError) => log.push(["publish", id, outcome, isError]),
    runTool: (id, input, origin) => log.push(["run", id, input, origin]),
    actionResponse: (id, outcome, isError) => ({ jsonrpc: "2.0", id, result: { content: [{ type: "text", text: JSON.stringify(outcome) }], isError } }),
    ...over
  };
  h.log = log;
  return h;
}
const call = (id, args = { query: "lock" }) => JSON.stringify({ jsonrpc: "2.0", id, method: "tools/call", params: { name: "run", arguments: args } });
const text = reply => JSON.parse(JSON.parse(reply).result.content[0].text);

test("serve refuses a message from another session and a line that is not JSON", () => {
  const h = host();
  assert.equal(JSON.parse(S.serve(h, "tok", "chan", "{")).error.code, -32700);
  assert.match(S.serve(h, "x", "chan", call(1)), /This question's session has ended/);
  assert.equal(S.serve(h, "x", "chan", JSON.stringify({ method: "notify" })), "");
  assert.match(S.serve(host({ recycling: true }), "tok", "chan", call(1)), /session has ended/);
  assert.equal(h.log.length, 0);
});

test("a first run takes its origin, opens a ticket and runs the tool", () => {
  const h = host();
  assert.equal(S.serve(h, "tok", "chan", call(1)), JSON.stringify({ nodiPending: "tok:1" }));
  assert.deepEqual(plain(h.log.map(x => x[0])), ["pending", "run"]);
  assert.deepEqual(plain(h.log[1][2]), { ok: true, kind: "query", value: "lock" });
});

test("a refused origin is remembered and published, never run", () => {
  const h = host({ takeRunOrigin: () => ({ ok: false, error: "no origin" }) });
  assert.equal(S.serve(h, "tok", "chan", call(1)), JSON.stringify({ nodiPending: "tok:1" }));
  assert.deepEqual(plain(h.log), [["pending", 1], ["reject", 1], ["publish", 1, { status: "error", message: "no origin" }, true]]);
});

test("a full mailbox answers with the session's end, or why it ended", () => {
  const h = host({ full: true, capacityFailure: "limit" });
  assert.deepEqual(plain(text(S.serve(h, "tok", "chan", call(1)))), { status: "error", message: "limit" });
  const ended = host({ full: true, responses: { 1: { id: 1, done: true } } });
  assert.deepEqual(JSON.parse(S.serve(ended, "tok", "chan", call(1))), { id: 1, done: true });
  assert.equal(ended.log.some(x => x[0] === "run"), false);
});

test("a duplicate of a live request joins its mailbox only with its own origin", () => {
  const pending = { toolRequests: { "number:1": { state: "pending" } } };
  const none = host(pending);
  assert.equal(text(S.serve(none, "tok", "chan", call(1))).message, "The pending action request has no accepted origin");
  const joined = host({ ...pending, records: { 1: {} } });
  assert.equal(S.serve(joined, "tok", "chan", call(1)), JSON.stringify({ nodiPending: "tok:1" }));
  assert.deepEqual(plain(joined.log.map(x => x[0])), ["pending"]);
  const forged = host({ ...pending, records: { 1: {} }, validateRunReplay: () => ({ ok: false, error: "bad" }) });
  assert.equal(text(S.serve(forged, "tok", "chan", call(1))).message, "bad");
  assert.equal(forged.log.length, 0);
});

test("a replay of a finished request is answered from its mailbox after the same check", () => {
  const done = { responses: { 1: { id: 1, result: "R" } } };
  const h = host(done);
  assert.equal(S.serve(h, "tok", "chan", call(1)), JSON.stringify({ nodiPending: "tok:1" }));
  assert.deepEqual(JSON.parse(S.serve(host({ ...done, full: true }), "tok", "chan", call(1))), { id: 1, result: "R" });
  assert.equal(text(S.serve(host({ ...done, validateRunReplay: () => ({ ok: false, error: "no" }) }), "tok", "chan", call(1))).message, "no");
});

test("anything but run is the bar's MCP server, search scoped to the turn", () => {
  const h = host();
  const search = JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "search", arguments: { query: "fire" } } });
  assert.deepEqual(JSON.parse(JSON.parse(S.serve(h, "tok", "chan", search)).result.content[0].text), [{ key: "app:fire", turn: "t1" }]);
  assert.equal(S.serve(h, "tok", "chan", JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" })), "");
  assert.equal(h.log.length, 0);
});

// A stand-in Ask for runTool.
function runner(over = {}) {
  const log = [];
  const h = {
    token: "tok", nextProposal: 0, proposal: null, phase: "streaming",
    actionBook: A.create("tok", "t1", "chan"),
    proposalGate: () => "",
    resolver: (kind, value) => ({ ok: true, snapshot: { key: "menu:" + value, title: "Lock", run: {} } }),
    publishAction: (id, outcome, isError) => log.push(["publish", id, outcome, isError]),
    preProposalFailure: (id, message) => log.push(["pre", id, message]),
    sessionCapacityExceeded: kind => log.push(["capacity", kind]),
    ...over
  };
  h.log = log;
  return h;
}
const origin = { session: "tok", turn: "t1", channel: "chan", callId: "c", inputKey: "{}", operation: "c", server: "nodi-chan", allowed: true };
const input = { ok: true, kind: "query", value: "lock" };

test("an accepted run becomes the one proposal, its snapshot bound to the turn", () => {
  const h = runner();
  S.runTool(h, 1, input, origin);
  assert.equal(h.phase, "proposing");
  assert.equal(h.nextProposal, 1);
  assert.deepEqual(plain({ ...h.proposal, at: 0 }), {
    kind: "action", id: "tok:proposal:1", requestId: 1, at: 0,
    snapshot: { key: "menu:lock", title: "Lock", run: {}, id: "tok:proposal:1", session: "tok", turn: "t1", operation: "c" }
  });
  assert.equal(h.log.length, 0);
});

test("a run fails before its proposal on bad input, a closed gate or no row", () => {
  const bad = runner();
  S.runTool(bad, 1, { ok: false, error: "run needs one" }, origin);
  assert.deepEqual(plain(bad.log), [["pre", 1, "run needs one"]]);
  const gated = runner({ proposalGate: () => "The bar is closed" });
  S.runTool(gated, 1, input, origin);
  assert.deepEqual(plain(gated.log), [["pre", 1, "The bar is closed"]]);
  const missing = runner({ resolver: () => ({ ok: false }) });
  S.runTool(missing, 1, input, origin);
  assert.deepEqual(plain(missing.log), [["pre", 1, "No matching row"]]);
  const thrown = runner({ resolver: () => { throw new Error("boom") } });
  S.runTool(thrown, 1, input, origin);
  assert.deepEqual(plain(thrown.log), [["pre", 1, "Error: boom"]]);
  const none = runner({ resolver: null });
  S.runTool(none, 1, input, origin);
  assert.deepEqual(plain(none.log), [["pre", 1, "The bar cannot resolve rows here."]]);
  for (const h of [bad, gated, missing, thrown, none]) assert.equal(h.proposal, null);
});

test("the gate is asked again after the bar resolved the row", () => {
  let asked = 0;
  const h = runner({ proposalGate: () => (++asked === 2 ? "The answer was cancelled" : "") });
  S.runTool(h, 1, input, origin);
  assert.equal(asked, 2);
  assert.deepEqual(plain(h.log), [["pre", 1, "The answer was cancelled"]]);
  assert.equal(h.proposal, null);
});

test("a run already begun joins it, and a full book ends the session", () => {
  const h = runner();
  S.runTool(h, 1, input, origin);
  const again = runner({ actionBook: h.actionBook });
  S.runTool(again, 1, input, origin);
  assert.equal(again.log.length, 0, "the duplicate joins the open proposal");
  const book = A.create("tok", "t1", "chan");
  book.requestCount = A.requestLimit();
  const full = runner({ actionBook: book });
  S.runTool(full, 2, input, origin);
  assert.deepEqual(plain(full.log), [["capacity", "action request records"]]);
});
