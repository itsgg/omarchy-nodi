// Secondary text under higher contrast (ROADMAP 73): 7:1 on the card and
// on the selected row, in every theme Omarchy ships.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { load } from "./load.mjs";

const C = load("lib/Contrast.js");
const dir = (process.env.OMARCHY_PATH || "/usr/share/omarchy") + "/themes";
const hex = h => ({ r: parseInt(h.slice(1, 3), 16) / 255, g: parseInt(h.slice(3, 5), 16) / 255, b: parseInt(h.slice(5, 7), 16) / 255 });
const colours = file => {
  const out = {};
  for (const m of readFileSync(file, "utf8").matchAll(/^\s*([\w-]+)\s*=\s*"(#[0-9a-fA-F]{6})/gm)) out[m[1]] = hex(m[2]);
  return out;
};

test("secondary text reads at 7:1 under higher contrast, on the card and on the selection, in each theme", { skip: !existsSync(dir) }, () => {
  let n = 0;
  for (const t of readdirSync(dir)) {
    const f = join(dir, t, "colors.toml");
    if (!existsSync(f)) continue;
    const c = colours(f);
    if (!c.background || !c.foreground) continue;
    // The menu's selection as Omarchy's template makes it: the text at 0.08.
    const fill = C.over(c.foreground, 0.08, c.background);
    const muted = c.color8 || c.foreground;
    const card = C.secondary(c.foreground, muted, c.background, 7);
    const selected = C.atLeast(c.foreground, fill, 7);
    assert.ok(C.ratio(card, c.background) >= 7, t + " on the card: " + C.ratio(card, c.background).toFixed(2));
    assert.ok(C.ratio(selected, fill) >= 7, t + " on the selection: " + C.ratio(selected, fill).toFixed(2));
    // And without it, as before: the muted colour or a mix at 4.5:1.
    assert.ok(C.ratio(C.secondary(c.foreground, muted, c.background), c.background) >= 4.5 || C.ratio(c.foreground, c.background) < 4.5, t);
    n++;
  }
  assert.ok(n >= 10, "themes read: " + n);
});
