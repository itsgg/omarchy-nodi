// His picks replayed through the ranking and the learning (ROADMAP 42,
// tools/rank/replay.mjs), on a made-up log over the test fixtures: his own
// log never leaves the machine.
import { test } from "node:test";
import assert from "node:assert/strict";
import { replay, summary, seed, lists } from "../../tools/rank/replay.mjs";
import { load } from "./load.mjs";
import { config, services } from "./fixtures.mjs";

const Menu = load("lib/Menu.js");

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

test("a fallback picked when nothing matched is not replayed: the bar learns nothing from it (ROADMAP 87)", () => {
  const log = [{ at: t, query: "zzqx", key: "fallback:ask", rank: 3 }, { at: t + 1, query: "Firefox", key: "app:firefox", rank: 2 }];
  const r = replay(log, base(), config);
  assert.deepEqual(r.map(x => x.key), ["app:firefox"]);
});

test("the seed is what was learned before the log: runs the log replays taken off, entries untouched since kept as they were", () => {
  const before = t - 30 * 86400000;
  const saved = {
    rows: { "app:firefox": { n: 5, t: t + 60000, f: 4.2 }, "app:signal": { n: 2, t: before, f: 1.5 }, "app:code": { n: 1, t: t } },
    picks: { fire: { "app:firefox": { n: 3, t: t + 60000 }, "app:signal": { n: 1, t: before } }, code: { "app:code": { n: 1, t: t } } }
  };
  const log = [{ at: t, query: "Code", key: "app:code", rank: 1 },
               { at: t + 60000, query: "fire", key: "app:firefox", rank: 1 },
               { at: t + 90000, query: "zzqx", key: "fallback:ask", rank: 3 }];
  const s = seed(saved, log);
  assert.deepEqual({ ...s.history }, { "app:firefox": { n: 4, t: t - 1, f: 4 }, "app:signal": { n: 2, t: before, f: 1.5 } },
                   "Firefox ran 4 times before the log, dated just before it; Signal not since, as it was; Code only in the log");
  assert.deepEqual(Object.keys(s.picks), ["fire"], "a query whose picks are all in the log is not seeded");
  assert.deepEqual({ ...s.picks.fire }, { "app:firefox": { n: 2, t: t - 1, f: 2 }, "app:signal": { n: 1, t: before, f: 1 } });
});

test("a replay starts from the history handed in: a query picked before the log is first at its first logged pick", () => {
  const log = [{ at: t, query: "f", key: "app:firefox", rank: 1 }];
  assert.equal(replay(log, base(), config)[0].place, 2, "Files leads at f with nothing learned");
  const svc = services({ history: {}, picks: { f: { "app:firefox": { n: 3, t: t - 86400000 } } } });
  assert.equal(replay(log, svc, config)[0].place, 1);
});

test("a menu toggle picked shows its other state's row after, as its when: has the bar do", () => {
  const merged = Menu.merge([Menu.parseItems('{ "quiet-on": {"label":"Quiet On","action":"true"}, "quiet-off": {"label":"Quiet Off","action":"true"} }')]);
  const svc = services({ history: {}, picks: {}, menu: { items: merged.items, order: merged.order, when: {}, checked: {} } });
  const log = [{ at: t, query: "quiet on", key: "menu:quiet-on", rank: 1 }, { at: t + 60000, query: "quiet", key: "menu:quiet-off", rank: 1 }];
  const r = replay(log, svc, config);
  assert.deepEqual(r.map(x => x.place), [1, 1], "Quiet On, picked for a longer query, is hidden at the next pick, not lifted over Quiet Off");
});

test("a replay lists no windows: which were open at each pick is not logged", () => {
  const svc = lists({ apps: [], omarchyCommands: [], keybindings: [], menu: { items: {}, order: [] }, emojis: [], windows: [{ address: "0xe0", cls: "chromium", title: "x" }] },
                    { history: {}, picks: {} });
  assert.deepEqual(svc.windows, []);
});
