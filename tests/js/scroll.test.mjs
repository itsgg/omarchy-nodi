// The selected row kept in view, clear of the fades (lib/Scroll.js), on a
// stand-in for a ListView: rows 40 high, 300 of them in view.

import { test } from "node:test";
import assert from "node:assert/strict";
import { load } from "./load.mjs";

const S = load("lib/Scroll.js");
const CONTAIN = 2;

function view(count, contentY) {
  const v = {
    count, contentY, originY: 0, height: 300, contentHeight: count * 40, calls: [],
    positionViewAtBeginning() { v.calls.push("beginning"); v.contentY = 0; },
    positionViewAtIndex(i, mode) { v.calls.push(["index", i, mode]); },
    itemAtIndex(i) { return i >= 0 && i < count ? { y: i * 40, height: 40 } : null }
  };
  return v;
}

test("the first row is the list's top, its header with it", () => {
  const v = view(20, 120);
  S.keep(v, 0, 20, CONTAIN);
  assert.deepEqual(v.calls, ["beginning"]);
  assert.equal(v.contentY, 0);
});

test("a row near the bottom edge leaves some of the next showing; the last row leaves none", () => {
  const v = view(20, 0);
  S.keep(v, 7, 20, CONTAIN);   // row 7 ends at 320, past the 300 in view
  assert.deepEqual(v.calls, [["index", 7, CONTAIN]]);
  assert.equal(v.contentY, 40, "320 - 300 + 20 of the next row's reach");
  const last = view(20, 500);
  S.keep(last, 19, 20, CONTAIN);
  assert.equal(last.contentY, 500, "the last row: nothing below it to show");
});

test("a row near the top edge leaves some of the one before showing, never above the list's start", () => {
  const v = view(20, 200);
  S.keep(v, 5, 20, CONTAIN);   // row 5 starts at 200, at the top edge
  assert.equal(v.contentY, 180);
  const near = view(20, 30);
  S.keep(near, 1, 50, CONTAIN);
  assert.equal(near.contentY, 0, "held at the list's start");
  const bottom = view(10, 0);
  S.keep(bottom, 8, 200, CONTAIN);
  assert.equal(bottom.contentY, 100, "and never below its end: 10 rows of 40 under 300");
});

test("no list, no row, or a row not yet made: nothing moves", () => {
  S.keep(null, 3, 20, CONTAIN);
  const v = view(20, 60);
  S.keep(v, -1, 20, CONTAIN);
  assert.deepEqual(v.calls, []);
  const unmade = view(20, 60);
  unmade.itemAtIndex = () => null;
  S.keep(unmade, 4, 20, CONTAIN);
  assert.deepEqual([unmade.calls, unmade.contentY], [[["index", 4, CONTAIN]], 60]);
});
