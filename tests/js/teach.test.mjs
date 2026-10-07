// The keys for what was run by hand (lib/Teach.js, ROADMAP 86): which keys
// a row has, how often they are shown, what shows them, and the measure
// of whether they teach.

import { test } from "node:test";
import assert from "node:assert/strict";
import { load, plain } from "./load.mjs";

const T = load("lib/Teach.js");

test("a row's keys: its own binding, else a hotkey of his that Nodi holds for it, else none", () => {
  assert.equal(T.keysFor({ key: "menu:system.lock", keys: "SUPER CTRL + L" }, {}), "SUPER CTRL + L");
  const bound = { "SUPER + F2": "app:firefox" };
  assert.equal(T.keysFor({ key: "app:firefox", keys: "" }, bound), "SUPER + F2");
  assert.equal(T.keysFor({ key: "app:foot", keys: "" }, bound), "");
  // Saved but not held: something else has the combo, so it was never bound
  // (Fable 2026-10-07: it would teach keys that do another thing).
  assert.equal(T.keysFor({ key: "app:firefox", keys: "" }, {}), "", "a hotkey Nodi could not bind is not taught");
  assert.equal(T.keysFor(null, bound), "");
});

test("shown the first three times a row, counted afresh when its keys change, then never", () => {
  let t = {};
  for (let i = 0; i < 3; i++) { assert.ok(T.due(t, "k", "SUPER + L"), "showing " + (i + 1)); t = T.noted(t, "k", "SUPER + L", 1000 + i); }
  assert.ok(!T.due(t, "k", "SUPER + L"), "a fourth: never");
  assert.deepEqual(plain(t.k), { keys: "SUPER + L", count: 3, first: 1000, last: 1002 });
  assert.ok(T.due(t, "k", "SUPER + K"), "bound to other keys: shown again");
  assert.deepEqual(plain(T.noted(t, "k", "SUPER + K", 5000).k), { keys: "SUPER + K", count: 1, first: 5000, last: 5000 });
  assert.ok(!T.due(t, "k", ""), "no keys, nothing to show");
  assert.ok(!T.due(t, "", "SUPER + L"));
  assert.ok(T.due(t, "other", "SUPER + L"), "each row its own count");
});

test("Omarchy's own on-screen display shows them, its keyboard glyph and the keys", () => {
  assert.deepEqual(plain(T.osdArgs("SUPER CTRL + L")), ["-i", "keyboard", "-m", "SUPER CTRL + L", "-d", "2000"]);
});

test("the record survives a round trip; a damaged one is none", () => {
  const t = T.noted({}, "menu:x", "PRINT", 7);
  assert.deepEqual(plain(T.parse(T.serialize(t))), plain(t));
  for (const bad of ["", "nope", "[1]", '{"a":{"keys":3,"count":1}}', '{"a":{"keys":"K","count":0}}'])
    assert.deepEqual(plain(T.parse(bad)), {}, bad);
});

test("the measure: a taught row's picks from the bar before its first hint and after", () => {
  const day = 864e5;
  const taught = { "menu:lock": { keys: "SUPER CTRL + L", count: 3, first: 20 * day, last: 21 * day } };
  const picks = [5, 10, 19.9, 20, 21, 25].map(d => ({ key: "menu:lock", at: d * day }))
    .concat([{ key: "app:foot", at: 22 * day }, { key: "menu:lock", at: 40 * day }]);
  assert.deepEqual(plain(T.measure(taught, picks, 26 * day)),
    [{ key: "menu:lock", keys: "SUPER CTRL + L", shown: 3, first: 20 * day, before: 3, after: 2, daysAfter: 6 }],
    "two weeks either side (day 5 is outside); the pick that showed the hint, at the same millisecond, counts before it; another row's not at all");
  assert.equal(T.measure(taught, picks, 60 * day)[0].daysAfter, 14, "the days after stop at the window");
  assert.deepEqual(plain(T.measure({}, picks, 0)), []);
});
