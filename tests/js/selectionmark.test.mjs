// A selection cue that reads (ROADMAP 72): the selected row gets a bar of
// its own where the theme leaves it the faint fill alone.
import { test } from "node:test";
import assert from "node:assert/strict";
import { load } from "./load.mjs";

const C = load("lib/Contrast.js");
const hex = h => ({ r: parseInt(h.slice(1, 3), 16) / 255, g: parseInt(h.slice(3, 5), 16) / 255, b: parseInt(h.slice(5, 7), 16) / 255 });

test("needsMark: where the selected title is like every other, and the theme draws no border", () => {
  // Rose Pine Dawn-like: a light card, a pale accent that fails on the fill.
  const fill = hex("#ebe5df"), text = hex("#575279");
  assert.equal(C.needsMark(hex("#d7827e"), fill, text, false, false), true, "the accent swapped for the text: the fill is all");
  assert.equal(C.needsMark(text, fill, text, false, false), true, "a theme whose selected text is its text");
  assert.equal(C.needsMark(hex("#286983"), fill, text, false, false), false, "an accent that reads marks the row itself");
  assert.equal(C.needsMark(hex("#d7827e"), fill, text, true, false), false, "a theme's selected border marks it");
  assert.equal(C.needsMark(hex("#286983"), fill, text, true, true), true, "higher contrast: always");
  assert.equal(C.needsMark(hex("#585279"), fill, text, false, false), true, "a selected text one step off the text is the text");
  assert.ok(C.ratio(text, hex("#faf4ed")) >= 4.5, "the bar, in the text colour, reads on the card");
});
