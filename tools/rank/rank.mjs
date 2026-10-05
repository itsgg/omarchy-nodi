// The ranking harness. Over a frozen corpus of what an Omarchy install
// ships (tests/js/fixtures/rank/corpus.json, tools/rank/freeze.mjs), with
// no history or picks, it measures three things:
//   intended  each query in tools/rank/queries.mjs: the rank of the first
//             row that answers it (0: not shown)
//   reach     every app, and one menu row per label that the whole label
//             finds, its name typed a letter at a time: the letters typed
//             when it is first (0: never, typed whole)
//   noise     how many rows past the fallbacks some queries show: a count
//             to watch, since a row there may be right
//   learning  every app, picked once for its whole name: the letters then
//             typed until it is first (Q H 5; three picks would be the
//             most a pick can give, PICK_MAX, and measure that ceiling)
// and compares them with tools/rank/baseline.json. Any difference fails,
// gains as well as losses, each named, so a ranking change lands with its
// baseline's diff in the commit (Q 1, H 8).
//   node tools/rank/rank.mjs            compare (make rank, make check)
//   node tools/rank/rank.mjs --update   write the baseline (make rank-update)
//   node tools/rank/rank.mjs --live     this machine's own lists, summary only

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { root, load } from "../../tests/js/load.mjs";
import { Engine, config, services } from "../../tests/js/fixtures.mjs";
import { intended, noise } from "./queries.mjs";

const Match = load("lib/Match.js");
const args = process.argv.slice(2);
const live = args.includes("--live");
const update = args.includes("--update");
const baselineFile = join(root, "tools/rank/baseline.json");

function corpus() {
  if (!live) return JSON.parse(readFileSync(join(root, "tests/js/fixtures/rank/corpus.json"), "utf8"));
  const d = JSON.parse(execFileSync(process.execPath, [join(root, "tools/bench/data.mjs")], { maxBuffer: 64 << 20 }).toString());
  return { apps: d.apps, menu: d.menu, omarchyCommands: d.omarchyCommands, keybindings: d.keybindings, windows: d.windows };
}

const c = corpus();
const svc = services({ apps: c.apps, history: {}, picks: {}, omarchyCommands: c.omarchyCommands, keybindings: c.keybindings,
                       menu: Object.assign({ when: {}, checked: {} }, c.menu), toggleStates: {}, windows: c.windows, files: [], clipboard: [],
                       // One emoji, so the picker's row is there with Omarchy's list or without it (CI).
                       emojis: [{ e: "🔥", k: "fire burn hot flame" }] });
const rows = q => Engine.run(q, config, svc);
const rankOf = (list, want) => { const i = list.findIndex(r => want.indexOf(r.key) !== -1); return i === -1 ? 0 : i + 1; };
// An app's open window answers for the app: the bar puts it first, so
// Enter goes to the window instead of starting another.
function answers(key) {
  if (!key.startsWith("app:")) return [key];
  const app = c.apps.find(a => "app:" + a.id === key);
  const names = app ? [app.id, app.wmclass].filter(Boolean).map(s => s.toLowerCase()) : [];
  return [key].concat(c.windows.filter(w => w.focus !== 0 && names.indexOf(String(w.cls).toLowerCase()) !== -1).map(w => "window:" + w.address));
}

// ---------- intended ----------
const ranks = {};
const classes = {};
for (const [q, want, kind] of intended) {
  const r = rankOf(rows(q), [].concat(want).flatMap(answers));
  ranks[q] = r;
  const k = classes[kind] || (classes[kind] = { queries: 0, first: 0 });
  k.queries++;
  if (r === 1) k.first++;
}

// ---------- reach ----------
function lettersToFirst(name, key) {
  const q = name.toLowerCase();
  for (let n = 1; n <= q.length; n++) {
    const p = q.slice(0, n);
    if (p.endsWith(" ")) continue;
    if (rankOf(rows(p), answers(key)) === 1) return n;
  }
  return 0;
}
const reach = { apps: {}, menu: {} };
for (const a of c.apps) {
  // Two entries of one name (Foot under two ids) are one target.
  const name = a.name in reach.apps ? a.name + " (" + a.id + ")" : a.name;
  reach.apps[name] = lettersToFirst(a.name, "app:" + a.id);
}
const seen = new Set();
for (const id of c.menu.order) {
  const it = c.menu.items[id];
  if (!it || !it.label || !it.action || seen.has(it.label.toLowerCase())) continue;
  // Only a row the whole label finds: a submenu's entry the bar does not
  // list is no target, and a later row of the same label may be.
  if (rankOf(rows(it.label), ["menu:" + id]) === 0) continue;
  seen.add(it.label.toLowerCase());
  reach.menu[it.label] = lettersToFirst(it.label, "menu:" + id);
}

// ---------- learning ----------
// Each app on its own, as if it had been picked once by its whole name a
// moment ago, stored as Nodi stores a query (Match.normalise): what one
// pick teaches the shorter queries.
const learning = { apps: {} };
const nowMs = svc.now().getTime();
for (const a of c.apps) {
  const name = a.name in learning.apps ? a.name + " (" + a.id + ")" : a.name;
  const taught = Object.assign({}, svc, { picks: { [Match.normalise(a.name)]: { ["app:" + a.id]: { n: 1, t: nowMs } } } });
  const q = a.name.toLowerCase();
  let first = 0;
  for (let n = 1; n <= q.length && !first; n++) {
    const p = q.slice(0, n);
    if (!p.endsWith(" ") && rankOf(Engine.run(p, config, taught), answers("app:" + a.id)) === 1) first = n;
  }
  learning.apps[name] = first;
}

// ---------- noise ----------
const noisy = {};
for (const q of noise) noisy[q] = rows(q).filter(r => r.provider !== "fallback").length;

// ---------- summary ----------
const ranked = Object.values(ranks);
const median = a => { const s = a.slice().sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0; };
function reachSummary(m) {
  const v = Object.values(m), got = v.filter(n => n > 0);
  return { targets: v.length, neverFirst: v.length - got.length, median: median(got),
           mean: Math.round(got.reduce((a, b) => a + b, 0) / Math.max(1, got.length) * 100) / 100 };
}
const result = {
  summary: {
    intended: { queries: ranked.length, first: ranked.filter(r => r === 1).length, topThree: ranked.filter(r => r >= 1 && r <= 3).length,
                notShown: ranked.filter(r => r === 0).length,
                mrr: Math.round(ranked.reduce((a, r) => a + (r ? 1 / r : 0), 0) / ranked.length * 1000) / 1000 },
    classes,
    reach: { apps: reachSummary(reach.apps), menu: reachSummary(reach.menu) },
    learning: { apps: reachSummary(learning.apps) },
    noise: Object.values(noisy).reduce((a, b) => a + b, 0)
  },
  intended: ranks, reach, learning, noise: noisy
};

function show(s) {
  const i = s.intended;
  console.log(`rank: ${i.first} of ${i.queries} queries first, ${i.topThree} in the top three, ${i.notShown} not shown, MRR ${i.mrr}`);
  console.log("rank: first by kind " + Object.entries(s.classes).map(([k, v]) => `${k} ${v.first}/${v.queries}`).join(", "));
  for (const t of ["apps", "menu"]) {
    const r = s.reach[t];
    console.log(`rank: ${t} ${r.targets} targets, first after a median of ${r.median} letters (mean ${r.mean}), ${r.neverFirst} never first`);
  }
  const l = s.learning.apps;
  console.log(`rank: apps picked once, first after a median of ${l.median} letters (mean ${l.mean}), ${l.neverFirst} never first`);
  console.log(`rank: ${s.noise} rows of noise`);
}

if (live) { show(result.summary); process.exit(0); }
const text = JSON.stringify(result, null, 1) + "\n";
if (update) { writeFileSync(baselineFile, text); show(result.summary); console.log("rank: baseline written"); process.exit(0); }
if (!existsSync(baselineFile)) { console.log("rank: no baseline; make rank-update"); process.exit(1); }
const base = JSON.parse(readFileSync(baselineFile, "utf8"));
if (JSON.stringify(base) === JSON.stringify(result)) { show(result.summary); process.exit(0); }

// What moved, worse first. A rank or letter count of 0 is "not reached",
// worse than any number.
const worse = [], better = [];
const cmp = (was, now) => (now || Infinity) - (was || Infinity);
const note = (what, was, now) => (cmp(was, now) > 0 ? worse : better).push(`${what}: was ${was || "never"}, now ${now || "never"}`);
const keys = (a, b) => [...new Set([...Object.keys(a || {}), ...Object.keys(b || {})])];
for (const q of keys(base.intended, result.intended)) {
  const was = (base.intended || {})[q], now = result.intended[q];
  if (was === undefined || now === undefined) { (now === undefined ? worse : better).push(`"${q}": ${now === undefined ? "dropped from" : "added to"} the queries`); continue; }
  if (was !== now) note(`"${q}" rank`, was, now);
}
for (const t of ["apps", "menu"]) for (const n of keys((base.reach || {})[t], result.reach[t])) {
  const was = ((base.reach || {})[t] || {})[n], now = result.reach[t][n];
  // A target that goes is a row the whole label no longer finds: worse.
  if (was === undefined || now === undefined) { (now === undefined ? worse : better).push(`${t} "${n}": ${now === undefined ? "no longer" : "now"} a target`); continue; }
  if (was !== now) note(`${t} "${n}" letters to first`, was, now);
}
for (const n of keys((base.learning || {}).apps, result.learning.apps)) {
  const was = ((base.learning || {}).apps || {})[n], now = result.learning.apps[n];
  if (was === undefined || now === undefined) { (now === undefined ? worse : better).push(`learning "${n}": ${now === undefined ? "no longer" : "now"} a target`); continue; }
  if (was !== now) note(`learning "${n}" letters to first after a pick`, was, now);
}
for (const q of keys(base.noise, result.noise)) {
  const was = (base.noise || {})[q], now = result.noise[q];
  if (was === undefined || now === undefined) { better.push(`noise "${q}": ${now === undefined ? "dropped from" : "added to"} the queries`); continue; }
  if (was !== now) (now > was ? worse : better).push(`noise "${q}": was ${was}, now ${now}`);
}
show(result.summary);
if (!worse.length && !better.length) console.log("rank: nothing named moved: the summary or the order of the queries differs from the baseline");
if (worse.length) console.log("rank: worse\n  " + worse.join("\n  "));
if (better.length) console.log("rank: better\n  " + better.join("\n  "));
console.log("rank: the ranking differs from tools/rank/baseline.json; if this is meant, make rank-update and commit the baseline");
process.exit(1);
