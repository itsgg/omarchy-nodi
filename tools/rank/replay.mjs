// His own picks replayed (ROADMAP 42): the pick log Nodi keeps as it is
// used (~/.cache/nodi/picks-log.json, lib/PickLog.js), in order, through
// the ranking and the learning Nodi runs (lib/Engine.js, History.record
// and History.pick, as Nodi.qml remember does), over this machine's lists
// (tools/bench/data.mjs), from what the bar had learned before the log's
// first pick (seed below; --fresh for no history). For each pick: the
// row's place for the query he typed, as ranked today with what the picks
// before it taught, and the letters of that query typed until the row is
// first, before the pick and after it. So a ranking change shows what it
// does to his own use, and learning is measured as it accrues (Q 1, H 1, H 5).
// No windows: which were open at each pick is not logged, and the bench's
// made-up ones (four "- Chromium" windows) outranked the apps he picked.
// Not in `make check`: the log is his, and never leaves this machine.
//   node tools/rank/replay.mjs [--since 2026-10-05T14:00] [--log FILE] [--fresh | --assume-earlier]   (make replay)

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { load, root } from "../../tests/js/load.mjs";
import { Engine, config, services } from "../../tests/js/fixtures.mjs";

const History = load("lib/History.js");
const Match = load("lib/Match.js");
const PickLog = load("lib/PickLog.js");

// What the bar had learned before the first pick of `log`, from what it
// holds now (`saved`, History.load of ~/.cache/nodi/history.json). An
// entry last run before the log began is as it was then. One run since
// holds the log's runs and maybe others the log did not record, with no
// date: before the log, or after it began (a run from the home, a pick
// while logging was off). Those are left out, and counted in `unknown`
// (runs of rows, picks for queries), unless `assumeEarlier`, which dates
// them just before the log; that looks ahead when they came later.
// Without a seed the first pick of a query he had long used ranked as if
// new: "fil" and "fi" were picked for Files in October.
export function seed(saved, log, assumeEarlier) {
  const start = log.length ? log[0].at : 0;
  const ran = Object.create(null), picked = Object.create(null);
  for (const e of log) {
    if (String(e.key).indexOf("fallback:") === 0) continue;
    ran[e.key] = (ran[e.key] || 0) + 1;
    const q = Match.normalise(e.query);
    if (q) picked[q + "\n" + e.key] = (picked[q + "\n" + e.key] || 0) + 1;
  }
  const unknown = { runs: 0, picks: 0 };
  const before = (entry, n, what) => {
    if (entry.t < start) return { n: entry.n, t: entry.t, f: typeof entry.f === "number" ? entry.f : entry.n };
    const left = entry.n - n;
    if (left <= 0) return null;
    unknown[what] += left;
    return assumeEarlier ? { n: left, t: start - 1, f: left } : null;
  };
  const history = Object.create(null), picks = Object.create(null);
  for (const k in (saved && saved.rows) || {}) {
    const e = before(saved.rows[k], ran[k] || 0, "runs");
    if (e) history[k] = e;
  }
  for (const q in (saved && saved.picks) || {}) {
    for (const k in saved.picks[q]) {
      const e = before(saved.picks[q][k], picked[q + "\n" + k] || 0, "picks");
      if (e) (picks[q] || (picks[q] = Object.create(null)))[k] = e;
    }
  }
  return { history, picks, unknown };
}

// A menu toggle shown in two rows by its `when:` ("Notifications On" while
// silenced, "Silence Notifications" while not): the bar shows the one its
// state allows, and picking it flips the state. The replay cannot ask the
// state, so both show until one is picked; after, only the other. Without
// it "not" found Notifications On a minute after it was picked for
// "notif", where the bar showed Silence Notifications instead.
function flipped(when, items, key) {
  const m = /^menu:(.+)-(on|off)$/.exec(String(key));
  if (!m) return when;
  const other = m[1] + "-" + (m[2] === "on" ? "off" : "on");
  if (!items || !items[other] || !items[m[1] + "-" + m[2]]) return when;
  return Object.assign(Object.create(null), when, { [m[1] + "-" + m[2]]: false, [other]: true });
}

// The services a replay runs over: this machine's lists from
// tools/bench/data.mjs (`d`), what was learned (`learned`, from seed), and
// no windows, files or clipboard, which the log does not say.
export function lists(d, learned) {
  return services({ apps: d.apps, history: learned.history, picks: learned.picks, omarchyCommands: d.omarchyCommands, keybindings: d.keybindings,
                    menu: Object.assign({ when: {}, checked: {} }, d.menu), toggleStates: {}, windows: [], files: [], clipboard: [],
                    emojis: d.emojis });
}

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
// History and picks start from base's (seed, or none).
export function replay(log, base, cfg) {
  let history = Object.assign(Object.create(null), base.history);
  let picks = Object.assign(Object.create(null), base.picks);
  const menu = base.menu || null;
  let when = Object.assign(Object.create(null), menu && menu.when);
  const out = [];
  for (const e of log) {
    // A fallback picked when nothing matched: never remembered by the bar,
    // so never learned here (ROADMAP 87).
    if (String(e.key).indexOf("fallback:") === 0) continue;
    const at = e.at;
    const svc = Object.assign({}, base, { history, picks, now: () => new Date(at) }, menu ? { menu: Object.assign({}, menu, { when }) } : {});
    const run = q => Engine.run(q, cfg, svc);
    const query = Match.normalise(e.query);
    const rows = run(e.query);
    const row = rows.find(r => r.key === e.key);
    if (!row) { out.push({ query: e.query, key: e.key, logged: e.rank, place: 0, before: 0, after: 0, gone: true }); continue; }
    const place = placeOf(rows, e.key);
    const before = lettersToFirst(query, e.key, run);
    history = History.record(history, e.key, at, History.snapshot(row));
    if (query) picks = History.pick(picks, query, e.key, at);
    when = flipped(when, menu && menu.items, e.key);
    const taught = Object.assign({}, svc, { history, picks }, menu ? { menu: Object.assign({}, menu, { when }) } : {});
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
  const fresh = args.includes("--fresh");
  const assumeEarlier = args.includes("--assume-earlier");
  const file = opt("--log") || join(process.env.XDG_CACHE_HOME || join(process.env.HOME || "", ".cache"), "nodi/picks-log.json");
  let log;
  try { log = PickLog.parse(readFileSync(file, "utf8")); } catch { console.log(`replay: no picks logged yet (${file})`); process.exit(0); }
  if (since !== null) log = log.filter(e => e.at >= since);
  if (!log.length) { console.log("replay: no picks to replay"); process.exit(0); }
  const d = JSON.parse(execFileSync(process.execPath, [join(root, "tools/bench/data.mjs")], { maxBuffer: 64 << 20 }).toString());
  let learned = { history: {}, picks: {} };
  if (!fresh) {
    const saved = join(process.env.XDG_CACHE_HOME || join(process.env.HOME || "", ".cache"), "nodi/history.json");
    try { learned = seed(History.load(readFileSync(saved, "utf8")), log, assumeEarlier); } catch { console.log(`replay: no history to seed from (${saved}), from none`); }
  }
  const base = lists(d, learned);
  const results = replay(log, base, config);
  const s = summary(results);
  const kept = s.picks - s.gone;
  const fell = PickLog.fallbacks(log).reduce((n, f) => n + f.n, 0);
  const u = learned.unknown;
  console.log(`replay: ${fresh ? "from no history" : "from the history learned before the log"}`
    + (u && (u.runs || u.picks) ? `; ${u.runs} runs and ${u.picks} picks the log did not record, of no known date, ${assumeEarlier ? "assumed before it (--assume-earlier)" : "left out (--assume-earlier counts them)"}` : ""));
  console.log(`replay: ${s.picks} picks, ${s.gone} of rows the replay's lists do not hold (a keyword or snippet of yours, a device, a window since closed)`
    + (fell ? `; ${fell} fallbacks picked when nothing matched, not replayed` : ""));
  console.log(`replay: first when picked, ${s.loggedFirst} of ${kept} as logged, ${s.first} of ${kept} as ranked now`);
  console.log(`replay: letters to first, a median of ${s.medianBefore} before each pick (${s.neverBefore} never) and ${s.medianAfter} after it (${s.neverAfter} never)`);
  const late = results.filter(r => !r.gone && r.place !== 1);
  // Each is a lead, not a verdict: the seed dates history older than the
  // log at its start, and a ranking may have changed since
  // ("instal" found the gate that hid Install, 2026-10-06).
  if (late.length) console.log("replay: not first now:\n  "
    + late.map(r => `"${r.query}" ${r.key} at ${r.place || "?"} (logged ${r.logged || "?"})`).join("\n  "));
}
