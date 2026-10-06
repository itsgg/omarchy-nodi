// His own picks replayed (ROADMAP 42): the pick log Nodi keeps as it is
// used (~/.cache/nodi/picks-log.json, lib/PickLog.js), in order, through
// the ranking and the learning Nodi runs (lib/Engine.js, History.record
// and History.pick, as Nodi.qml remember does), over this machine's lists
// (tools/bench/data.mjs), from no history. For each pick: the row's place
// for the query he typed, as ranked today with what the picks before it
// taught, and the letters of that query typed until the row is first,
// before the pick and after it. So a ranking change shows what it does to
// his own use, and learning is measured as it accrues (Q 1, H 1, H 5).
// Not in `make check`: the log is his, and never leaves this machine.
//   node tools/rank/replay.mjs [--since 2026-10-05T14:00] [--log FILE]   (make replay)

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { load, root } from "../../tests/js/load.mjs";
import { Engine, config, services } from "../../tests/js/fixtures.mjs";

const History = load("lib/History.js");
const Match = load("lib/Match.js");
const PickLog = load("lib/PickLog.js");

const placeOf = (rows, key) => { const i = rows.findIndex(r => r.key === key); return i === -1 ? 0 : i + 1; };

// The letters of `query` typed until `key` is first (0: not even whole).
function lettersToFirst(query, key, run) {
  for (let n = 1; n <= query.length; n++) {
    const p = query.slice(0, n);
    if (p.endsWith(" ")) continue;
    if (placeOf(run(p), key) === 1) return n;
  }
  return 0;
}

// Replays `log` (PickLog entries, oldest first) over the services `base`
// (its lists; history and picks start empty). One result per entry:
//   { query, key, logged, place, before, after, gone }
// logged: the place the log says it had; place: its place now, with what
// came before; before, after: letters to first around the pick; gone: the
// row is not in these lists, which hold this machine's apps, menu, Omarchy
// commands and keybindings with the tests' config: a keyword or snippet,
// an audio device, a window since closed, an app removed.
export function replay(log, base, cfg) {
  let history = Object.create(null);
  let picks = Object.create(null);
  const out = [];
  for (const e of log) {
    const at = e.at;
    const svc = Object.assign({}, base, { history, picks, now: () => new Date(at) });
    const run = q => Engine.run(q, cfg, svc);
    const query = Match.normalise(e.query);
    const rows = run(e.query);
    const row = rows.find(r => r.key === e.key);
    if (!row) { out.push({ query: e.query, key: e.key, logged: e.rank, place: 0, before: 0, after: 0, gone: true }); continue; }
    const place = placeOf(rows, e.key);
    const before = lettersToFirst(query, e.key, run);
    history = History.record(history, e.key, at, History.snapshot(row));
    if (query) picks = History.pick(picks, query, e.key, at);
    const taught = Object.assign({}, svc, { history, picks });
    const after = lettersToFirst(query, e.key, q => Engine.run(q, cfg, taught));
    out.push({ query: e.query, key: e.key, logged: e.rank, place, before, after, gone: false });
  }
  return out;
}

const median = a => { const s = a.slice().sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0; };

export function summary(results) {
  const kept = results.filter(r => !r.gone);
  const reached = (k) => kept.filter(r => r[k] > 0).map(r => r[k]);
  return {
    picks: results.length, gone: results.length - kept.length,
    loggedFirst: kept.filter(r => r.logged === 1).length, first: kept.filter(r => r.place === 1).length,
    medianBefore: median(reached("before")), medianAfter: median(reached("after")),
    neverBefore: kept.filter(r => !r.before).length, neverAfter: kept.filter(r => !r.after).length
  };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const opt = name => { const i = args.indexOf(name); return i === -1 ? null : args[i + 1]; };
  const since = opt("--since") ? Date.parse(opt("--since")) : null;
  if (since !== null && Number.isNaN(since)) { console.error("replay: --since takes a time, as 2026-10-05T14:00"); process.exit(2); }
  const file = opt("--log") || join(process.env.XDG_CACHE_HOME || join(process.env.HOME || "", ".cache"), "nodi/picks-log.json");
  let log;
  try { log = PickLog.parse(readFileSync(file, "utf8")); } catch { console.log(`replay: no picks logged yet (${file})`); process.exit(0); }
  if (since !== null) log = log.filter(e => e.at >= since);
  if (!log.length) { console.log("replay: no picks to replay"); process.exit(0); }
  const d = JSON.parse(execFileSync(process.execPath, [join(root, "tools/bench/data.mjs")], { maxBuffer: 64 << 20 }).toString());
  const base = services({ apps: d.apps, history: {}, picks: {}, omarchyCommands: d.omarchyCommands, keybindings: d.keybindings,
                          menu: Object.assign({ when: {}, checked: {} }, d.menu), toggleStates: {}, windows: d.windows, files: [], clipboard: [],
                          emojis: d.emojis });
  const results = replay(log, base, config);
  const s = summary(results);
  const kept = s.picks - s.gone;
  console.log(`replay: ${s.picks} picks, ${s.gone} of rows the replay's lists do not hold (a keyword or snippet of yours, a device, a window since closed)`);
  console.log(`replay: first when picked, ${s.loggedFirst} of ${kept} as logged, ${s.first} of ${kept} as ranked now`);
  console.log(`replay: letters to first, a median of ${s.medianBefore} before each pick (${s.neverBefore} never) and ${s.medianAfter} after it (${s.neverAfter} never)`);
  const late = results.filter(r => !r.gone && r.place !== 1);
  // Each is a lead, not a verdict: history older than the log is not
  // replayed ("dis" for Discord), and a ranking may have changed since
  // ("instal" found the gate that hid Install, 2026-10-06).
  if (late.length) console.log("replay: not first now:\n  "
    + late.map(r => `"${r.query}" ${r.key} at ${r.place || "?"} (logged ${r.logged || "?"})`).join("\n  "));
}
