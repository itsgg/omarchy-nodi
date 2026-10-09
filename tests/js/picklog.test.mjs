// The log of what was picked (lib/PickLog.js, ROADMAP 42): the trail of
// queries, the row's place, keys only, a cap, a damaged file as none.

import { test } from "node:test";
import assert from "node:assert/strict";
import { load, plain } from "./load.mjs";

const PickLog = load("lib/PickLog.js");

test("an entry: the trail, the row picked, its place, the first rows as keys", () => {
  let trail = PickLog.typed([], "");
  for (const q of ["s", "sp", "sp", "spo"]) trail = PickLog.typed(trail, q);
  assert.deepEqual(plain(trail), ["s", "sp", "spo"], "a repeat dropped, an empty field not kept");
  const rows = ["app:slack", "app:spotify", "menu:x"].map(key => ({ key, title: "secret title" }));
  const e = plain(PickLog.entry(5, trail, "spo", "app:spotify", rows));
  assert.deepEqual(e, { at: 5, trail: ["s", "sp", "spo"], query: "spo", key: "app:spotify", rank: 2, shown: ["app:slack", "app:spotify", "menu:x"] });
  assert.ok(!JSON.stringify(e).includes("secret"), "no title kept");
  assert.equal(PickLog.entry(5, [], "x", "gone", rows).rank, 0, "not on the list: place 0");
});

test("fallbacks picked when nothing matched: counted apart, never in the ranking's measures (ROADMAP 87)", () => {
  const list = [{ at: 1, query: "fire", key: "app:firefox", rank: 1 }, { at: 2, query: "zzqx", key: "fallback:ask", rank: 3 },
                { at: 3, query: "zzqy", key: "fallback:g", rank: 1 }, { at: 4, query: "zzqz", key: "fallback:ask", rank: 3 }];
  assert.deepEqual(plain(PickLog.ranked(list)).map(e => e.key), ["app:firefox"]);
  assert.deepEqual(plain(PickLog.fallbacks(list)), [{ key: "fallback:ask", n: 2 }, { key: "fallback:g", n: 1 }]);
  assert.equal(PickLog.summary(PickLog.ranked(list)).picks, 1);
});

test("the last MAX kept, a damaged file read as none, the summary", () => {
  let list = [];
  for (let i = 0; i < PickLog.MAX + 3; i++) list = PickLog.add(list, PickLog.entry(i, [], "q", "k", [{ key: "k" }]));
  assert.equal(list.length, PickLog.MAX);
  assert.deepEqual(plain(PickLog.parse("nope")), []);
  assert.deepEqual(plain(PickLog.parse('[{"at": 1}, {"at": 2, "key": "k"}]')).map(e => e.at), [2]);
  const s = plain(PickLog.summary([PickLog.entry(1, [], "fire", "a", [{ key: "a" }]), PickLog.entry(2, [], "sp", "b", [{ key: "x" }, { key: "b" }]),
                                   PickLog.entry(3, [], "lo c", "c", [{ key: "x" }, { key: "y" }, { key: "c" }])]));
  assert.deepEqual(s, { picks: 3, medianRank: 2, first: 1, medianLetters: 3 });
});

test("the log as it is written: JSON, and none is an empty list", () => {
  const P = load("lib/PickLog.js");
  assert.equal(P.serialize(null), "[]");
  assert.equal(P.serialize([{ at: 1 }]), '[{"at":1}]');
});
