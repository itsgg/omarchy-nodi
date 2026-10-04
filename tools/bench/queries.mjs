// What the bench types, a key at a time: each query's every prefix is one
// keystroke's run (lib/Engine.js run and mode, what Nodi.qml recompute does).
export const queries = [
  "", "firefox", "screenshot", "lock screen", "2+2*3", "100 usd to eur", "time in tokyo", ":fire", "cb build",
  "find report", "keys full", "omarchy theme", "volume 40", "wifi", "?", "kill chrome", "snip ", "zzqx"
];

export function keystrokes() {
  const out = [];
  for (const q of queries) {
    if (q === "") { out.push(""); continue; }
    for (let i = 1; i <= q.length; i++) out.push(q.slice(0, i));
  }
  return out;
}
