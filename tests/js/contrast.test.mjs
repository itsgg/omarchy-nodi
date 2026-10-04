// The dim text colour, chosen per theme by contrast on the card.

import { test } from "node:test";
import assert from "node:assert/strict";
import { load, plain } from "./load.mjs";

const C = load("lib/Contrast.js");
const hex = h => ({ r: parseInt(h.slice(1, 3), 16) / 255, g: parseInt(h.slice(3, 5), 16) / 255, b: parseInt(h.slice(5, 7), 16) / 255 });

test("WCAG ratios: black on white is 21, a colour on itself 1", () => {
  assert.equal(Math.round(C.ratio(hex("#000000"), hex("#ffffff")) * 100) / 100, 21);
  assert.equal(C.ratio(hex("#758a96"), hex("#758a96")), 1);
});

test("secondary text: the theme's muted where it reads at 4.5, else the faintest text mix that does", () => {
  // Dark Knight: muted #758a96 reads at 5.3 on its card.
  assert.equal(Math.round(C.secondary(hex("#cccfd1"), hex("#758a96"), hex("#0a1014")).r * 255), 0x75);
  // Catppuccin Latte: muted #acb0be reads at 1.9; the mix reaches 4.5 and no more than it needs.
  const s = C.secondary(hex("#4c4f69"), hex("#acb0be"), hex("#eff1f5"));
  const r = C.ratio(s, hex("#eff1f5"));
  assert.ok(r >= 4.5 && r < 4.9, String(r));
});

test("an accent stays only where it reads on its fill", () => {
  assert.equal(Math.round(C.guard(hex("#99c1dc"), hex("#182228"), hex("#cccfd1")).r * 255), 0x99, "his theme keeps its accent");
  assert.equal(Math.round(C.guard(hex("#56949f"), hex("#e4dfd9"), hex("#575279")).r * 255), 0x57, "rose-pine's teal falls back");
});
