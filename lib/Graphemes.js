.pragma library
.import "GraphemeData.js" as Data

// A text's grapheme clusters, the places a cursor moves between, by
// Unicode's rules (UAX #29, extended clusters), from the table in
// lib/GraphemeData.js. Chromium, Electron and GTK move this way; Qt's
// fields do not join an Indic conjunct (no rule GB9c in Qt 6.11), so "क्ष"
// is one place here and two there.

var CR = 1, LF = 2, CONTROL = 3, EXTEND = 4, ZWJ = 5, RI = 6, PREPEND = 7, SPACING = 8, L = 9, V = 10, T = 11, LV = 12, LVT = 13
var PICT = 16
var CONSONANT = 1, LINKER = 2, CB_EXTEND = 3

// Each run's first code point, and its code, read once.
var starts = []
var codes = []
var runs = Data.RUNS.split(",")
for (var r = 0, at = 0; r < runs.length; r++) {
  var dot = runs[r].indexOf(".")
  at += parseInt(runs[r].slice(0, dot), 36)
  starts.push(at)
  codes.push(parseInt(runs[r].slice(dot + 1), 36))
}

function code(cp) {
  var lo = 0, hi = starts.length - 1
  while (lo < hi) {
    var mid = (lo + hi + 1) >> 1
    if (starts[mid] <= cp) lo = mid
    else hi = mid - 1
  }
  var c = codes[lo]
  // The Hangul syllables are written as LV; one in 28 is.
  if ((c & 15) === LV && (cp - 0xac00) % 28 !== 0) c = (c & ~15) | LVT
  return c
}

// Whether a cluster ends between a code point of break property `a` and
// one of `b`, given what came before: `ri` regional indicators in a row
// up to `a`, `emoji` 2 after a pictograph, its extenders and a ZWJ
// (GB11), and `conjunct` 2 after a consonant and a linker (GB9c).
function breaksBetween(a, b, bCode, ri, emoji, conjunct) {
  if (a === CR && b === LF) return false                                       // GB3
  if (a === CR || a === LF || a === CONTROL) return true                        // GB4
  if (b === CR || b === LF || b === CONTROL) return true                        // GB5
  if (a === L && (b === L || b === V || b === LV || b === LVT)) return false   // GB6
  if ((a === LV || a === V) && (b === V || b === T)) return false              // GB7
  if ((a === LVT || a === T) && b === T) return false                          // GB8
  if (b === EXTEND || b === ZWJ || b === SPACING) return false                 // GB9, GB9a
  if (a === PREPEND) return false                                              // GB9b
  if (conjunct === 2 && (bCode >> 5) === CONSONANT) return false               // GB9c
  if (emoji === 2 && (bCode & PICT)) return false                              // GB11
  if (a === RI && b === RI && ri % 2 === 1) return false                       // GB12, GB13
  return true                                                                  // GB999
}

// The clusters, in order.
function split(text) {
  var s = String(text || "")
  var out = []
  var start = 0, a = -1, ri = 0, emoji = 0, conjunct = 0
  for (var i = 0; i < s.length; ) {
    var cp = s.codePointAt(i)
    var c = code(cp), b = c & 15, cb = c >> 5
    if (a !== -1 && breaksBetween(a, b, c, ri, emoji, conjunct)) { out.push(s.slice(start, i)); start = i }
    ri = b === RI ? ri + 1 : 0
    emoji = (c & PICT) ? 1 : emoji === 1 && b === EXTEND ? 1 : emoji === 1 && b === ZWJ ? 2 : 0
    conjunct = cb === CONSONANT ? 1 : conjunct && cb === LINKER ? 2 : conjunct && cb === CB_EXTEND ? conjunct : 0
    a = b
    i += cp > 0xffff ? 2 : 1
  }
  if (start < s.length) out.push(s.slice(start))
  return out
}

function count(text) { return split(text).length }
