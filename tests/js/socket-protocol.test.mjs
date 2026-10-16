import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { load, plain } from "./load.mjs";

const P = load("lib/SocketProtocol.js");
const reader = readFileSync(new URL("../../components/SocketReader.qml", import.meta.url), "utf8");

test("query ids are opaque, bounded, and unique for successive requests", () => {
  const a = P.queryId(17, "8fa2");
  const b = P.queryId(18, "8fa2");
  assert.match(a, /^[A-Za-z0-9_-]{1,64}$/);
  assert.notEqual(a, b);
  assert.equal(P.queryId(1, "../../ secret").includes("/"), false);
});

test("request and cancellation frames carry only bounded protocol data", () => {
  const frame = JSON.parse(P.requestFrame("17-8fa2", {
    keyword: "search",
    query: "words",
    window: { class: "foot", title: "private", address: "0x1", pid: "42", workspace: "2", ignored: "x" }
  }));
  assert.deepEqual(plain(frame), {
    version: 1, id: "17-8fa2", q: "words", keyword: "search",
    window: { class: "foot" }
  });
  assert.equal(P.requestFrame("id", { keyword: "k", query: "x".repeat(P.LIMITS.query + 20) }).endsWith("\n"), true);
  assert.equal(JSON.parse(P.requestFrame("id", { keyword: "k", query: "x".repeat(P.LIMITS.query + 20) })).q.length, P.LIMITS.query);
  assert.deepEqual(plain(JSON.parse(P.cancelFrame("17-8fa2"))), { version: 1, cancel: "17-8fa2" });
});

test("incremental JSONL accepts matching rows and done, discarding stale ids and malformed lines", () => {
  const state = P.parser("new", { maxRows: 3 });
  let got = P.feed(state,
    '{"id":"old","row":{"title":"stale"}}\nnot json\n' +
    '{"id":"new","row":{"title":"one"}}\n{"id":"new","r');
  assert.deepEqual(plain(got), { rows: [{ title: "one" }], done: false, error: "" });
  got = P.feed(state, 'ow":{"title":"two"}}\n{"id":"old","done":true}\n{"id":"new","done":true}\n');
  assert.deepEqual(plain(got), { rows: [{ title: "two" }], done: true, error: "" });
  assert.equal(state.done, true);
});

test("responses use ASCII JSON framing so decoded chunks cannot split UTF-8", () => {
  let state = P.parser("id");
  assert.match(P.feed(state, '{"id":"id","row":{"title":"café"}}\n').error,
               /ASCII JSON/);
  state = P.parser("id");
  const got = P.feed(state, '{"id":"id","row":{"title":"caf\\u00e9"}}\n');
  assert.deepEqual(plain(got.rows), [{ title: "café" }]);
});

test("incremental JSONL enforces bytes, line, rows, fields, and nesting bounds", () => {
  let state = P.parser("id", { maxBytes: 20 });
  assert.match(P.feed(state, "x".repeat(21)).error, /byte limit/);

  state = P.parser("id", { maxLineBytes: 20 });
  assert.match(P.feed(state, '{"id":"id","row":' + "x".repeat(20)).error, /line limit/);

  state = P.parser("id", { maxRows: 1 });
  assert.equal(P.feed(state, '{"id":"id","row":{"title":"a"}}\n').rows.length, 1);
  assert.match(P.feed(state, '{"id":"id","row":{"title":"b"}}\n').error, /row limit/);

  state = P.parser("id");
  const nested = { title: "deep" };
  let at = nested;
  for (let i = 0; i < P.LIMITS.depth + 1; i++) at = at.child = {};
  assert.equal(P.feed(state, JSON.stringify({ id: "id", row: nested }) + "\n").rows.length, 0, "over-nested rows are unsafe");
});

test("an incomplete final line and frames after done never become rows", () => {
  const state = P.parser("id");
  P.feed(state, '{"id":"id","row":{"title":"cut"}}');
  assert.match(P.finish(state).error, /incomplete/);
  const ended = P.parser("id");
  P.feed(ended, '{"id":"id","done":true}\n');
  assert.deepEqual(plain(P.feed(ended, '{"id":"id","row":{"title":"late"}}\n').rows), []);
});

test("active query replacement returns the prior id for explicit cancellation", () => {
  const active = P.active();
  assert.equal(P.activate(active, "a"), "");
  assert.equal(P.activate(active, "b"), "a");
  assert.equal(P.isActive(active, "a"), false);
  assert.equal(P.isActive(active, "b"), true);
  P.complete(active, "a");
  assert.equal(P.isActive(active, "b"), true, "a stale completion cannot clear the current query");
  P.complete(active, "b");
  assert.equal(active.id, "");
});

test("the socket transport feeds bounded chunks and fails interrupted requests", () => {
  assert.match(reader, /splitMarker:\s*""/,
               "newline buffering would bypass the incremental line limit");
  assert.match(reader, /sentId === reader\.queryId[\s\S]{0,200}reader\.end\(false,\s*"socket disconnected"\)/,
               "an in-flight disconnect must fail instead of retrying an already-sent ID");
});
