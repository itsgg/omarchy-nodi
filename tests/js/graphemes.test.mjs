// lib/Graphemes.js against Unicode's own tests for the version its table
// was written from (tools/graphemes.mjs).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { load, root, plain } from "./load.mjs";

const G = load("lib/Graphemes.js");
const Data = load("lib/GraphemeData.js");
const file = readFileSync(join(root, "tests/js/fixtures/GraphemeBreakTest.txt"), "utf8");

test("every case of Unicode's GraphemeBreakTest.txt splits as it says", () => {
  assert.ok(file.startsWith("# GraphemeBreakTest-" + Data.VERSION + "."), "the tests are of the table's Unicode version");
  let cases = 0;
  for (const line of file.split("\n")) {
    const body = line.replace(/#.*/, "").trim();
    if (!body) continue;
    // "÷ 0020 × 0308 ÷ 0020 ÷": a cluster ends at each ÷.
    const want = [];
    let text = "", cluster = "";
    for (const t of body.split(/\s+/)) {
      if (t === "÷") { if (cluster) want.push(cluster); cluster = ""; }
      else if (t !== "×") { const ch = String.fromCodePoint(parseInt(t, 16)); cluster += ch; text += ch; }
    }
    assert.deepEqual(plain(G.split(text)), want, line);
    cases++;
  }
  assert.ok(cases > 700, cases + " cases");
});

test("places a cursor moves over: marks, conjuncts, emoji, flags", () => {
  for (const [text, n] of [["", 0], ["abc", 3], ["e\u0301", 1], ["\r\n", 1], ["கொ", 1], ["நன்றி", 3], ["அஃது", 3], ["হঠাৎ", 3],
                           ["සිංහල", 3], ["ਪੰਜਾਬੀ", 3], ["क्ष", 1], ["हिन्दी", 2], ["مرحبًا", 5], ["👍🏽", 1], ["👨‍👩‍👧", 1],
                           ["🇮🇳🇱🇰", 2], ["🏴󠁧󠁢󠁥󠁮󠁧󠁿", 1], ["각", 1], ["각", 1]]) {
    assert.equal(G.count(text), n, text);
  }
});
