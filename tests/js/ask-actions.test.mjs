import { test } from "node:test";
import assert from "node:assert/strict";
import { load, plain } from "./load.mjs";

const A = load("lib/AskActions.js");
const request = (id, kind, value, turn = "t1") => ({
  id, session: "s", turn, channel: "channel",
  operation: "op-" + id, callId: "call-" + id, server: "nodi-channel",
  inputKey: JSON.stringify({ [kind]: value }), kind, value
});
const record = (book, id) => Object.values(book.requests).find(x => Object.is(x.id, id));
const snapshot = {
  key: "menu:system.lock", title: "Lock", session: "s", turn: "t1",
  operation: "op-r1", run: { kind: "exec", argv: ["loginctl", "lock-session"] }
};

test("run input requires exactly one non-whitespace string", () => {
  assert.deepEqual(plain(A.input({ query: " lock " })), { ok: true, kind: "query", value: " lock " });
  assert.deepEqual(plain(A.input({ key: "menu:system.lock" })), { ok: true, kind: "key", value: "menu:system.lock" });
  for (const x of [{}, { query: "" }, { query: " \t" }, { query: null },
                   { key: 4 }, { query: "lock", key: "menu:system.lock" }])
    assert.equal(A.input(x).ok, false);
});

test("a pre-proposal error tombstones its request but frees a fresh request", () => {
  let book = A.create("s", "t1", "channel");
  const first = A.begin(book, request("r1", "query", "missing"));
  const resolving = first.book;
  const failed = A.preProposalError(resolving, "r1", "No match");
  book = failed.book;
  assert.equal(first.effect.type, "resolve");
  assert.deepEqual(plain(failed.effect.result), { status: "error", message: "No match" });
  assert.equal(A.begin(book, request("r1", "query", "missing")).effect.type, "replay");
  assert.equal(A.begin(book, request("r2", "key", "menu:system.lock")).effect.type, "resolve");
  assert.equal(record(resolving, "r1").phase, "resolving", "the prior book was not mutated");
});

test("action request tombstones stop at the explicit session limit and keep exact replay", () => {
  assert.equal(A.requestLimit(), 1024);
  let book = A.create("s", "t1", "channel");
  for (let i = 0; i < A.requestLimit(); i++) {
    const started = A.begin(book, request("bounded-" + i, "query", "missing"));
    assert.equal(started.effect.type, "resolve", "accepted request " + i);
    if (i === 0)
      assert.equal(Object.getPrototypeOf(started.book.requests), book.requests,
                   "request insertion uses a constant-work persistent overlay");
    book = A.preProposalError(started.book, "bounded-" + i, "No match").book;
  }
  assert.equal(A.requestCount(book), A.requestLimit());
  const firstReplay = A.begin(book, request("bounded-0", "query", "missing"));
  assert.equal(firstReplay.effect.type, "replay");
  assert.deepEqual(plain(firstReplay.effect.result), { status: "error", message: "No match" });
  const overflow = A.begin(book, request("overflow", "query", "missing"));
  assert.equal(overflow.effect.type, "capacity");
  assert.equal(record(overflow.book, "overflow"), undefined);
  assert.equal(A.requestCount(overflow.book), A.requestLimit());
});

test("a duplicate pending request joins one lifecycle", () => {
  const empty = A.create("s", "t1", "channel");
  const first = A.begin(empty, request("r1", "query", "lock"));
  const duplicate = A.begin(first.book, request("r1", "query", "lock"));
  assert.equal(duplicate.effect.type, "join");
  assert.equal(Object.keys(duplicate.book.requests).length, 1);
  assert.equal(empty.active, null);
  assert.deepEqual(plain(empty.requests), {});
});

test("a duplicate ID cannot change its permission-bound action origin", () => {
  const firstRequest = request("r1", "query", "lock");
  const book = A.begin(A.create("s", "t1", "channel"), firstRequest).book;
  for (const changed of [
    { ...firstRequest, callId: "forged" },
    { ...firstRequest, inputKey: '{"query":"logout"}' },
    { ...firstRequest, providerTurn: "other-provider-turn" },
    { ...firstRequest, adapterKey: "other-adapter-origin" },
    { ...firstRequest, session: "other-session" },
    { ...firstRequest, turn: "other-turn" },
    { ...firstRequest, channel: "other-channel" },
    { ...firstRequest, operation: "other-operation" },
    { ...firstRequest, server: "nodi-other" }
  ]) assert.equal(A.begin(book, changed).effect.type, "stale");
});

test("request identity preserves JSON-RPC types and prototype-named strings", () => {
  let book = A.begin(A.create("s", "t1", "channel"), request(1, "query", "lock")).book;
  assert.equal(record(book, 1)?.id, 1);
  assert.equal(A.begin(book, request("1", "query", "logout")).effect.type, "busy");
  book = A.preProposalError(book, 1, "No match").book;
  const stringId = A.begin(book, request("1", "query", "lock"));
  assert.equal(stringId.effect.type, "resolve");
  assert.equal(stringId.effect.requestId, "1");

  for (const id of ["toString", "__proto__"]) {
    const first = A.begin(A.create("s", "t1", "channel"), request(id, "query", "lock"));
    assert.equal(first.effect.type, "resolve", id);
    assert.equal(record(first.book, id)?.id, id);
    assert.equal(A.begin(first.book, request(id, "query", "lock")).effect.type, "join", id);
  }
});

test("a competing request is busy throughout the active action", () => {
  let book = A.begin(A.create("s", "t1", "channel"), request("r1", "query", "lock")).book;
  assert.equal(A.begin(book, request("r2", "query", "logout")).effect.type, "busy", "resolving");
  book = A.resolve(book, "r1", snapshot, "p1").book;
  assert.equal(A.begin(book, request("r2", "query", "logout")).effect.type, "busy", "awaiting confirmation");
  book = A.commit(book, "p1").book;
  assert.equal(A.begin(book, request("r2", "query", "logout")).effect.type, "busy", "executing");
});

test("one immutable proposal has one successful compare-and-swap commit", () => {
  let book = A.begin(A.create("s", "t1", "channel"), request("r1", "query", "lock")).book;
  const before = book;
  const proposed = A.resolve(book, "r1", snapshot, "p1");
  book = proposed.book;
  snapshot.run.argv[1] = "poweroff";
  assert.equal(proposed.effect.type, "confirm");
  assert.equal(record(before, "r1").phase, "resolving");
  assert.equal(record(book, "r1").phase, "awaiting_confirmation");
  const committed = A.commit(book, "p1");
  assert.equal(committed.committed, true);
  assert.deepEqual(plain(committed.snapshot.run.argv), ["loginctl", "lock-session"]);
  assert.equal(record(committed.book, "r1").phase, "executing");
  assert.equal(book.proposal.status, "pending", "commit did not mutate the proposal it consumed");
  assert.equal(A.commit(committed.book, "p1").committed, false);
  assert.equal(A.commit(book, "another").committed, false);
});

test("commit rejects a proposal whose trusted channel is stale", () => {
  const pending = A.resolve(
    A.begin(A.create("s", "t1", "channel"), request("r1", "query", "lock")).book,
    "r1", snapshot, "p1"
  ).book;
  const stale = { ...pending, channel: "other" };
  assert.equal(A.commit(stale, "p1").committed, false);
  assert.equal(stale.proposal.status, "pending");
  assert.equal(record(stale, "r1").phase, "awaiting_confirmation");
});

test("close and cancel race safely with Enter", () => {
  const pending = A.resolve(
    A.begin(A.create("s", "t1", "channel"), request("r1", "query", "lock")).book,
    "r1", snapshot, "p1"
  ).book;
  for (const status of ["dismissed", "cancelled"]) {
    const ended = A.finish(pending, "r1", { status }).book;
    assert.equal(A.commit(ended, "p1").committed, false, status + " won before Enter");
    assert.equal(record(ended, "r1").terminal.status, status);
  }
  const entered = A.commit(pending, "p1").book;
  const lateCancel = A.finish(entered, "r1", { status: "cancelled" });
  assert.equal(lateCancel.finished, false, "cancellation cannot claim to stop a committed action");
  assert.equal(record(lateCancel.book, "r1").phase, "executing");
  assert.equal(lateCancel.book.proposal.status, "committed");
});

test("only the committed request replays its executed result", () => {
  let book = A.resolve(
    A.begin(A.create("s", "t1", "channel"), request("r1", "query", "lock")).book,
    "r1", snapshot, "p1"
  ).book;
  book = A.commit(book, "p1").book;
  book = A.finish(book, "r1", {
    status: "executed", proposalId: "p1", key: "menu:system.lock", title: "Lock"
  }).book;
  const replay = A.begin(book, request("r1", "query", "lock"));
  assert.equal(replay.effect.type, "replay");
  assert.equal(replay.effect.result.status, "executed");
  const distinct = A.begin(book, request("r2", "query", "lock"));
  assert.equal(distinct.effect.type, "terminal");
  assert.notEqual(distinct.effect.result && distinct.effect.result.status, "executed");
  assert.equal(record(distinct.book, "r2"), undefined);
});

test("refusal locks the turn for distinct requests", () => {
  let book = A.resolve(
    A.begin(A.create("s", "t1", "channel"), request("r1", "query", "lock")).book,
    "r1", snapshot, "p1"
  ).book;
  book = A.finish(book, "r1", { status: "refused", proposalId: "p1" }).book;
  assert.equal(A.begin(book, request("r1", "query", "lock")).effect.type, "replay");
  assert.equal(A.begin(book, request("r2", "query", "lock")).effect.type, "terminal");
});

test("delayed old-turn IDs replay terminal results or return stale", () => {
  let book = A.begin(A.create("s", "t1", "channel"), request("done", "query", "missing")).book;
  book = A.preProposalError(book, "done", "No match").book;
  book = A.begin(book, request("pending", "query", "lock")).book;
  const next = { ...book, turn: "t2", active: null, proposal: null, terminal: null };
  assert.equal(A.begin(next, request("done", "query", "missing", "t1")).effect.type, "replay");
  assert.equal(A.begin(next, request("pending", "query", "lock", "t1")).effect.type, "stale");
});

test("an unseen request from an old trusted turn is rejected before registration", () => {
  const book = A.create("s", "t2", "channel");
  const stale = A.begin(book, request("old", "query", "lock", "t1"));
  assert.equal(stale.effect.type, "stale");
  assert.equal(record(stale.book, "old"), undefined);
  assert.deepEqual(plain(book), plain(A.create("s", "t2", "channel")));
});

test("action activity outranks the newest read-only activity", () => {
  const reads = {
    a: { turn: "t1", text: "Searching old", seq: 1 },
    b: { turn: "t1", text: "Searching newest", seq: 9 },
    stale: { turn: "t0", text: "Wrong turn", seq: 20 }
  };
  let book = A.create("s", "t1", "channel");
  assert.equal(A.display(book, reads), "Searching newest");
  book = A.begin(book, request("r1", "query", "lock")).book;
  assert.equal(A.display(book, reads), "Resolving a bar action");
  book = A.resolve(book, "r1", snapshot, "p1").book;
  assert.equal(A.display(book, reads), "Waiting for confirmation");
  book = A.commit(book, "p1").book;
  assert.equal(A.display(book, reads), "Running a bar action");
  book = A.finish(book, "r1", { status: "executed" }).book;
  assert.equal(A.display(book, reads), "Searching newest");
});
