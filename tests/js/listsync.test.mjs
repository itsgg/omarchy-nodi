// The result list's model kept in step with the rows by key (lib/ListSync.js):
// a row still there is moved or told, never made again.

import { test } from "node:test";
import assert from "node:assert/strict";
import { load, plain } from "./load.mjs";

const L = load("lib/ListSync.js");

const row = (key, title) => ({ key, title: title || key });
const synced = rows => plain(L.plan([], rows).items);

function step(before, rows) {
  const p = L.plan(before, rows);
  const after = L.apply(before, p.ops);
  assert.deepEqual(plain(after.map(i => i.uid)), plain(p.items.map(i => i.uid)), "the steps give the rows' order");
  return { ops: plain(p.ops), after: plain(after) };
}

test("the same rows again take no step", () => {
  const rows = [row("a"), row("b"), row("c")];
  assert.deepEqual(step(synced(rows), rows.map(r => ({ ...r }))).ops, []);
});

test("a narrowing query removes the rows gone, in runs, and keeps the rest", () => {
  const before = synced([row("a"), row("b"), row("c"), row("d"), row("e")]);
  const { ops } = step(before, [row("a"), row("e")]);
  assert.deepEqual(ops, [{ op: "remove", at: 1, n: 3 }]);
});

test("a new row is inserted where it ranks", () => {
  const { ops } = step(synced([row("a"), row("c")]), [row("a"), row("b"), row("c")]);
  assert.equal(ops.length, 1);
  assert.equal(ops[0].op, "insert");
  assert.equal(ops[0].at, 1);
  assert.equal(ops[0].item.key, "b");
});

test("a row that climbs is moved, not made again", () => {
  const { ops } = step(synced([row("a"), row("b"), row("c")]), [row("c"), row("a"), row("b")]);
  assert.deepEqual(ops, [{ op: "move", from: 2, to: 0 }]);
});

test("a row whose words changed is set in place; its preview alone does not count", () => {
  const before = synced([{ key: "a", title: "A", preview: { text: "1" } }, row("b")]);
  assert.deepEqual(step(before, [{ key: "a", title: "A", preview: { text: "2" } }, row("b")]).ops, []);
  const { ops } = step(before, [{ key: "a", title: "A2", preview: { text: "1" } }, row("b")]);
  assert.equal(ops.length, 1);
  assert.equal(ops[0].op, "set");
  assert.equal(ops[0].at, 0);
});

test("a moved row that also changed is moved and set", () => {
  const { ops } = step(synced([row("a"), row("b")]), [row("b", "B!"), row("a")]);
  assert.deepEqual(ops.map(o => o.op), ["move", "set"]);
  assert.equal(ops[1].at, 0);
});

test("two rows with one key are two entries", () => {
  const items = synced([row("x"), row("x"), row("y")]);
  assert.equal(new Set(items.map(i => i.uid)).size, 3);
  const { ops } = step(items, [row("x"), row("y")]);
  assert.deepEqual(ops, [{ op: "remove", at: 1, n: 1 }]);
});

test("a mixed change lands on the new order whatever it is", () => {
  const keys = "abcdefghij".split("");
  let before = synced(keys.map(k => row(k)));
  for (let seed = 1; seed < 60; seed++) {
    let s = seed;
    const rand = () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648;
    const next = keys.filter(() => rand() > 0.3).concat(["x" + seed, "y" + (seed % 3)]).sort(() => rand() - 0.5).map(k => row(k, rand() > 0.8 ? k + "!" : k));
    const { after } = step(before, next);
    assert.deepEqual(after.map(i => i.sig), plain(L.plan([], next).items.map(i => i.sig)));
    before = after;
  }
});

test("a row that cannot be written out is always new", () => {
  const a = { key: "a" };
  a.self = a;
  assert.notEqual(L.signature(a), L.signature(a));
});
