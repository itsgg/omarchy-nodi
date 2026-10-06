// Writes lib/GraphemeData.js, the table lib/Graphemes.js finds grapheme
// clusters with, from Unicode's own data: Qt's JavaScript engine has no
// \p{...} and no Intl.Segmenter, so the properties UAX #29 reads are
// written out. From the directory holding these four files of one
// Unicode version (https://www.unicode.org/Public/<version>/):
//   ucd/auxiliary/GraphemeBreakProperty.txt   Grapheme_Cluster_Break
//   ucd/emoji/emoji-data.txt                  Extended_Pictographic
//   ucd/DerivedCoreProperties.txt             Indic_Conjunct_Break
//   ucd/auxiliary/GraphemeBreakTest.txt       the tests, copied to
//                                             tests/js/fixtures/
//   node tools/graphemes.mjs <dir>

import { readFileSync, writeFileSync, copyFileSync } from "node:fs";
import { join } from "node:path";
import { root } from "../tests/js/load.mjs";

const dir = process.argv[2];
if (!dir) { console.error("usage: node tools/graphemes.mjs <dir with the UCD files>"); process.exit(2); }

// The codes lib/Graphemes.js reads: the break property in the low four
// bits, Extended_Pictographic as 16, Indic_Conjunct_Break in the two above.
const GCB = { CR: 1, LF: 2, Control: 3, Extend: 4, ZWJ: 5, Regional_Indicator: 6, Prepend: 7, SpacingMark: 8,
              L: 9, V: 10, T: 11, LV: 12, LVT: 13 };
const PICT = 16;
const INCB = { Consonant: 32, Linker: 64, Extend: 96 };

const code = new Uint8Array(0x110000);
let version = "";
function each(file, fn) {
  const text = readFileSync(join(dir, file), "utf8");
  // "# GraphemeBreakProperty-17.0.0.txt", or emoji-data's "# Version: 17.0".
  const v = text.match(/^# \S+-(\d+\.\d+)\.\d+\.txt/m) || text.match(/^# Version: (\d+\.\d+)$/m);
  if (!v) throw new Error(file + ": no version line");
  if (version && version !== v[1]) throw new Error(file + " is Unicode " + v[1] + ", the others " + version);
  version = v[1];
  for (const line of text.split("\n")) {
    const m = line.replace(/#.*/, "").match(/^([0-9A-F]+)(?:\.\.([0-9A-F]+))?\s*;\s*(.+?)\s*$/);
    if (!m) continue;
    const from = parseInt(m[1], 16), to = m[2] ? parseInt(m[2], 16) : from;
    fn(from, to, m[3].split(/\s*;\s*/));
  }
}
each("GraphemeBreakProperty.txt", (a, b, [p]) => {
  if (!(p in GCB)) throw new Error("unknown break property " + p);
  for (let c = a; c <= b; c++) code[c] |= GCB[p];
});
each("emoji-data.txt", (a, b, [p]) => { if (p === "Extended_Pictographic") for (let c = a; c <= b; c++) code[c] |= PICT; });
each("DerivedCoreProperties.txt", (a, b, [p, v]) => {
  if (p !== "InCB") return;
  if (!(v in INCB)) throw new Error("unknown InCB value " + v);
  for (let c = a; c <= b; c++) code[c] |= INCB[v];
});

// Hangul syllables alternate LV and LVT, one LV in 28 (U+AC00 + 28k): the
// block is written as LV, and lib/Graphemes.js works out the rest.
for (let c = 0xac00; c <= 0xd7a3; c++) {
  const want = (c - 0xac00) % 28 === 0 ? GCB.LV : GCB.LVT;
  if (code[c] !== want) throw new Error("U+" + c.toString(16) + " is not the Hangul syllable expected");
  code[c] = GCB.LV;
}
for (let c = 0; c < 0x110000; c++) if ((code[c] & 15) === GCB.LV || (code[c] & 15) === GCB.LVT) {
  if (c < 0xac00 || c > 0xd7a3) throw new Error("an LV or LVT outside the Hangul syllables: U+" + c.toString(16));
}

// Each run of one code: its start as the step from the last start, and the
// code, both base 36.
const runs = [];
let last = 0;
for (let c = 0; c < 0x110000; c++) {
  if (c === 0 || code[c] !== code[c - 1]) { runs.push((c - last).toString(36) + "." + code[c].toString(36)); last = c; }
}
const out = `.pragma library

// Written by tools/graphemes.mjs from Unicode ${version}; edit that, not this.
// What lib/Graphemes.js reads of each code point: runs of one code, each
// the step from the last run's start and the code, base 36.

var VERSION = "${version}"
var RUNS = "${runs.join(",")}"
`;
writeFileSync(join(root, "lib/GraphemeData.js"), out);
copyFileSync(join(dir, "GraphemeBreakTest.txt"), join(root, "tests/js/fixtures/GraphemeBreakTest.txt"));
console.log(`graphemes: Unicode ${version}, ${runs.length} runs, ${out.length} bytes in lib/GraphemeData.js`);
