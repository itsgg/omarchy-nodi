// How long the bar's opens took, from the times Nodi keeps as it is used
// (~/.cache/nodi/opens.json, lib/Opens.js): per phase, the median and the
// 90th percentile in ms after the open's start, for opens by the hotkey and
// by a call, and for opens on a kept query against an empty field.
//   node tools/opens.mjs [--since 2026-10-05T14:00] [--last N]   (make opens)

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { load } from "../tests/js/load.mjs";

const Opens = load("lib/Opens.js");
const args = process.argv.slice(2);
const opt = name => { const i = args.indexOf(name); return i === -1 ? null : args[i + 1]; };
const file = join(process.env.XDG_CACHE_HOME || join(process.env.HOME || "", ".cache"), "nodi/opens.json");
const since = opt("--since");
if (args.includes("--since") && Number.isNaN(Date.parse(since))) { console.error("opens: --since takes a time, as 2026-10-05T14:00"); process.exit(2); }
const last = Number(opt("--last"));
if (args.includes("--last") && !(last > 0)) { console.error("opens: --last takes a number of opens"); process.exit(2); }
let text;
try { text = readFileSync(file, "utf8"); } catch { console.log(`opens: none kept yet (${file})`); process.exit(0); }
let list = Opens.parse(text);
if (!list.length) { console.log(`opens: ${file} holds no opens${text.trim() && text.trim() !== "[]" ? " it can read" : ""}`); process.exit(0); }
if (since) list = list.filter(r => r.at >= Date.parse(since));
if (last > 0) list = list.slice(-last);
if (!list.length) { console.log("opens: none in that range"); process.exit(0); }

const row = (name, sub) => {
  const s = Opens.summary(sub);
  if (!s.opens) return;
  const cell = p => s[p].seen ? `${p} ${s[p].p50}/${s[p].p90} ms (${s[p].seen})` : `${p} not seen`;
  const moved = s.moved.counted ? `, rows moved after the first frame in ${s.moved.opens} of ${s.moved.counted}` : "";
  console.log(`opens: ${name}, ${s.opens}: ` + Opens.PHASES.map(cell).join(", ") + moved);
};
console.log(`opens: ${list.length} from ${new Date(list[0].at).toISOString()} to ${new Date(list[list.length - 1].at).toISOString()}; median/p90 after the start`);
row("all", list);
row("by the hotkey", list.filter(r => r.how === "key"));
row("by a call", list.filter(r => r.how !== "key"));
row("on a kept query", list.filter(r => r.held));
row("on an empty field", list.filter(r => !r.held));
