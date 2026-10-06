// His picks replayed through the ranking and the learning (ROADMAP 42,
// tools/rank/replay.mjs), on a made-up log over the test fixtures: his own
// log never leaves the machine.
import { test } from "node:test";
import assert from "node:assert/strict";
import { replay, summary } from "../../tools/rank/replay.mjs";
import { config, services } from "./fixtures.mjs";

const t = Date.UTC(2026, 9, 6, 8);
const base = () => services({ history: {}, picks: {} });

test("each pick teaches the next: letters to first before and after, in order", () => {
  const log = [{ at: t, query: "Firefox", key: "app:firefox", rank: 2 },
               { at: t + 60000, query: "fire", key: "app:firefox", rank: 2 },
               { at: t + 120000, query: "zz", key: "window:0xdead", rank: 1 }];
  const r = replay(log, base(), config);
  assert.deepEqual(r.map(x => [x.place, x.before, x.after, x.gone]), [[1, 3, 1, false], [1, 1, 1, false], [0, 0, 0, true]],
                   "Files leads at f until Firefox is picked once; then f is enough, and the next pick starts there");
  assert.deepEqual(summary(r), { picks: 3, gone: 1, loggedFirst: 0, first: 2, medianBefore: 3, medianAfter: 1, neverBefore: 0, neverAfter: 0 },
                   "the upper median, as tools/rank takes it");
});

test("a row these lists lack teaches nothing, and the services handed in are left as they were", () => {
  const svc = base();
  const r = replay([{ at: t, query: "zz", key: "window:0xdead", rank: 1 }, { at: t + 1, query: "Firefox", key: "app:firefox", rank: 2 }], svc, config);
  assert.equal(r[1].before, 3, "the gone pick taught nothing");
  assert.deepEqual([Object.keys(svc.history).length, Object.keys(svc.picks).length], [0, 0]);
});
