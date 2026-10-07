// How his picks went, from the log Nodi keeps as it is used
// (~/.cache/nodi/picks-log.json, lib/PickLog.js): how many, the median
// place of the row picked, how many were first, and the median letters
// typed before the pick, the two measures Mozilla ships on (Q E1).
//   node tools/picks.mjs [--since 2026-10-05T14:00]   (make picks)

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { load } from "../tests/js/load.mjs";

const PickLog = load("lib/PickLog.js");
const args = process.argv.slice(2);
const i = args.indexOf("--since");
const since = i === -1 ? null : Date.parse(args[i + 1]);
if (i !== -1 && Number.isNaN(since)) { console.error("picks: --since takes a time, as 2026-10-05T14:00"); process.exit(2); }
const file = join(process.env.XDG_CACHE_HOME || join(process.env.HOME || "", ".cache"), "nodi/picks-log.json");
let text;
try { text = readFileSync(file, "utf8"); } catch { console.log(`picks: none logged yet (${file})`); process.exit(0); }
let all = PickLog.parse(text);
if (since !== null) all = all.filter(e => e.at >= since);
// Fallbacks picked when nothing matched measure no ranking (ROADMAP 87).
const list = PickLog.ranked(all);
const fell = PickLog.fallbacks(all);
if (fell.length) console.log("picks: when nothing matched: " + fell.map(f => `${f.key} ${f.n}`).join(", "));
if (!list.length) { console.log("picks: none in that range"); process.exit(0); }
const s = PickLog.summary(list);
console.log(`picks: ${s.picks}, ${s.first} first (${Math.round(100 * s.first / s.picks)}%), the picked row at a median place of ${s.medianRank}, after a median of ${s.medianLetters} letters`);
// Whether the keys shown after a run by hand teach them (lib/Teach.js).
const Teach = load("lib/Teach.js");
let taught = {};
try { taught = Teach.parse(readFileSync(join(file, "../taught.json"), "utf8")); } catch {}
for (const m of Teach.measure(taught, PickLog.parse(text), Date.now()))
  console.log(`picks: ${m.key} (${m.keys}) shown ${m.shown}x; picked from a typed query ${m.before} times in the 14 days before, ${m.after} in the ${m.daysAfter} days since`);
const late = list.filter(e => e.rank !== 1).slice(-10);
if (late.length) console.log("picks: the last not picked first:\n  " + late.map(e => `"${e.query}" ${e.key} at ${e.rank || "?"}`).join("\n  "));
