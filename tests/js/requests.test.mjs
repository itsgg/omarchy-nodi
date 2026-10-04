// The one async path: when a read starts, what a provider sees meanwhile,
// and what a failed read leaves.

import { test } from "node:test";
import assert from "node:assert/strict";
import { load, plain } from "./load.mjs";

const R = load("lib/Requests.js");
const src = { parse: t => (t === "bad" ? (() => { throw "unreadable" })() : t.split(",")), maxAgeMs: 1000, retryMs: 5000 };

test("keys, and what a provider sees", () => {
  assert.equal(R.keyOf("processes"), "processes");
  assert.equal(R.keyOf("directory", "/home/u"), "directory:/home/u");
  assert.deepEqual(plain(R.view(null)), { state: "pending" });
  assert.deepEqual(plain(R.view(R.begun(null, 0))), { state: "pending" }, "a first read on its way");
});

test("a read starts when there is nothing, or it has aged, never twice at once", () => {
  assert.equal(R.due(null, src, 0), true);
  const going = R.begun(null, 0);
  assert.equal(R.due(going, src, 99999), false, "one read at a time");
  const ready = R.settled(going, src, "a,b", true, undefined, 100);
  assert.deepEqual(plain(R.view(ready)), { state: "ready", value: ["a", "b"], error: "", at: 100 });
  assert.equal(R.due(ready, src, 1099), false);
  assert.equal(R.due(ready, src, 1100), true);
  const again = R.begun(ready, 1100);
  assert.deepEqual(plain(R.view(again).value), ["a", "b"], "the last value stays on show while the next read runs");
});

test("a failed read keeps the last value and waits before trying again", () => {
  const ready = R.settled(null, src, "a", true, undefined, 0);
  const failed = R.settled(R.begun(ready, 2000), src, "bad", false, undefined, 2000);
  assert.equal(failed.state, "error");
  assert.equal(failed.error, "unreadable");
  assert.deepEqual(plain(failed.value), ["a"]);
  assert.equal(R.due(failed, src, 6999), false, "retryMs, not maxAgeMs");
  assert.equal(R.due(failed, src, 7000), true);
  assert.equal(R.settled(null, { parse: () => null }, "", true, undefined, 0).state, "error", "reading nothing is an error");
});

test("freshness can come from the value (rates say when they next change)", () => {
  const rates = { parse: t => JSON.parse(t), fresh: (v, now) => now < v.next * 1000, retryMs: 600000 };
  const e = R.settled(null, rates, '{"next": 10}', true, undefined, 0);
  assert.equal(R.due(e, rates, 9999), false);
  assert.equal(R.due(e, rates, 10000), true);
  const paced = { maxAgeMs: p => Number(p) };
  const read = { state: "ready", value: 1, at: 0 };
  assert.equal(R.due(read, paced, 999, "1000"), false, "an age set by the parameter");
  assert.equal(R.due(read, paced, 1000, "1000"), true);
  assert.equal(R.due(read, paced, 1000, "60000"), false);
  assert.deepEqual(plain(R.seeded(rates, '{"next": 10}', undefined, 5).value), { next: 10 });
  assert.equal(R.seeded(rates, "not json", undefined, 5), null);
});

test("a read replaced before it ran goes back to what it had", () => {
  assert.equal(R.dropped(R.begun(null, 0)), null);
  const ready = R.settled(null, src, "a", true, undefined, 0);
  const back = R.dropped(R.begun(ready, 1));
  assert.equal(back.pending, false);
  assert.deepEqual(plain(back.value), ["a"]);
});

test("a source is found by name among the providers that declare it", () => {
  const ps = { id: "p", sources: { processes: src } };
  assert.equal(R.sourceOf([{ id: "x" }, ps], "processes"), src);
  assert.equal(R.sourceOf([ps], "toString"), null, "own names only");
  assert.equal(R.sourceOf([ps], "nothing"), null);
});

test("the cache keeps the newest entries, never one mid-read", () => {
  const cache = {};
  for (let i = 0; i < 70; i++) cache["directory:/d" + i] = { state: "ready", value: [], at: i };
  cache["directory:/d0"].pending = true;
  const gone = R.prune(cache, 64);
  assert.equal(gone.length, 6);
  assert.ok(!gone.includes("directory:/d0"), "a read on its way stays");
  assert.deepEqual(plain(gone), ["directory:/d1", "directory:/d2", "directory:/d3", "directory:/d4", "directory:/d5", "directory:/d6"]);
  assert.deepEqual(plain(R.prune({ a: { at: 0 } }, 64)), []);
  cache.rates = { state: "ready", value: {}, at: -1 };
  assert.ok(!R.prune(cache, 64).includes("rates"), "one-entry sources are never forgotten, however old");
  assert.equal(R.prune(cache, 64).length, 6);
});
