// Times lib/Engine.js on node over the bench's data (data.mjs) and
// keystrokes (queries.mjs): per keystroke, and per provider. Node's JIT is
// faster than Qt's; Bench.qml runs the same in the engine the bar runs in.
//   node tools/bench/engine.mjs [rounds]

import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { load, root } from "../../tests/js/load.mjs";
import { keystrokes } from "./queries.mjs";

const Engine = load("lib/Engine.js");
const data = JSON.parse(execFileSync(process.execPath, [join(root, "tools/bench/data.mjs")], { maxBuffer: 64 << 20 }).toString());
const rounds = Number(process.argv[2] || 20);

function request(name, param) {
  const value = { processes: [], rates: data.rates, "omarchy-commands": data.omarchyCommands, keybindings: data.keybindings,
                  "clipboard-text": "the build is green", find: [], directory: undefined }[name];
  return value === undefined ? { state: "pending" } : { state: "ready", value, error: "", at: 0 };
}
const services = () => ({
  zones: data.zones, localZone: "Asia/Kolkata", emojis: data.emojis, apps: data.apps, windows: data.windows, history: data.history,
  picks: {}, reminders: [], activeWorkspace: { id: 1, name: "1" }, clipboard: data.clipboard, files: data.files, menu: data.menu,
  toggleStates: {}, themes: { list: [], current: "" }, home: "/home/u", request, prefs: undefined,
  ask: { phase: "idle" }, desktop: {}, now: () => new Date(data.now)
});

// Each provider's match, timed.
const spent = {};
for (const p of Engine.providers()) {
  if (typeof p.match !== "function") continue;
  const match = p.match;
  spent[p.id] = 0;
  p.match = function() { const t = performance.now(); try { return match.apply(this, arguments); } finally { spent[p.id] += performance.now() - t; } };
}

const keys = keystrokes();
for (const q of keys) { Engine.run(q, data.config, services()); Engine.mode(q, data.config); }   // warm
for (const id in spent) spent[id] = 0;

const per = keys.map(() => 0);
const t0 = performance.now();
for (let r = 0; r < rounds; r++) {
  for (let i = 0; i < keys.length; i++) {
    const t = performance.now();
    Engine.run(keys[i], data.config, services());
    Engine.mode(keys[i], data.config);
    per[i] += performance.now() - t;
  }
}
const total = performance.now() - t0;
const ms = per.map(v => v / rounds);
const sorted = ms.slice().sort((a, b) => a - b);
const pct = p => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))].toFixed(2);
console.log(`node: ${keys.length} keystrokes x ${rounds}: median ${pct(0.5)} ms, p95 ${pct(0.95)} ms, max ${sorted[sorted.length - 1].toFixed(2)} ms, total ${(total / rounds).toFixed(1)} ms a round`);
console.log("slowest: " + keys.map((k, i) => [k, ms[i]]).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => JSON.stringify(k) + " " + v.toFixed(2)).join(", "));
console.log("by provider (ms a round): " + Object.entries(spent).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([id, v]) => id + " " + (v / rounds).toFixed(1)).join(", "));
