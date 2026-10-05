// The open times Nodi keeps (lib/Opens.js): a phase is stamped once, after
// the start; the list keeps the last MAX; a damaged file reads as none.

import { test } from "node:test";
import assert from "node:assert/strict";
import { load, plain } from "./load.mjs";

const Opens = load("lib/Opens.js");

test("each phase is the first time it is seen, in ms after the start", () => {
  const r = Opens.start(1000, "key", true);
  Opens.stamp(r, "ranked", 1012);
  Opens.stamp(r, "frame", 1050);
  Opens.stamp(r, "frame", 1066);
  Opens.stamp(r, "layer", 990);
  assert.deepEqual(plain(r), { at: 1000, how: "key", held: true, ranked: 12, frame: 50, layer: -1 }, "a later frame is not the open's; an event before the start is not either");
  assert.equal(Opens.stamp(null, "frame", 5), null, "no open, nothing stamped");
});

test("the last MAX opens are kept, and a file that is not a list reads as none", () => {
  let list = [];
  for (let i = 0; i < Opens.MAX + 5; i++) list = Opens.add(list, Opens.start(i, "call", false));
  assert.equal(list.length, Opens.MAX);
  assert.equal(list[0].at, 5);
  assert.deepEqual(plain(Opens.parse(Opens.serialize(list.slice(0, 2)))).map(r => r.at), [5, 6]);
  assert.deepEqual(plain(Opens.parse("{")), []);
  assert.deepEqual(plain(Opens.parse('{"at": 1}')), []);
  assert.deepEqual(plain(Opens.parse('[{"at": "x"}, null, {"at": 3, "frame": 40}]')).map(r => r.at), [3]);
});

test("the summary is each phase's median and 90th percentile over the opens that saw it", () => {
  const list = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100].map((f, i) => Object.assign(Opens.start(i, "key", false), { ranked: 5, frame: f }));
  const s = plain(Opens.summary(list));
  assert.equal(s.opens, 10);
  assert.deepEqual(s.frame, { seen: 10, p50: 60, p90: 100 });
  assert.deepEqual(s.ranked, { seen: 10, p50: 5, p90: 5 });
  assert.deepEqual(s.layer, { seen: 0, p50: -1, p90: -1 }, "never seen: -1");
});
