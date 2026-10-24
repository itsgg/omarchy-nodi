// The icons Nodi.qml holds so the rows find them decoded (warmIcons) are
// held at exactly the sizes the rows draw them: a picture is cached by its
// address and its size, so a size that drifts holds pictures no row asks
// for, and the rows decode theirs again on every open.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const root = new URL("../../", import.meta.url);
const read = (f) => readFileSync(new URL(f, root), "utf8");

test("the icons held are held at the rows' own sizes", () => {
  const row = read("components/ResultRow.qml").match(/size: rowItem\.hero \? (.+) : (.+)\n/);
  assert.ok(row, "ResultRow.qml draws its tile at a hero size and a plain one");
  const heroRow = row[1].replace(/nodi\./g, "");
  const plainRow = row[2].trim().replace(/nodi\./g, "");
  const nodi = read("Nodi.qml");
  const warm = nodi.slice(nodi.indexOf("readonly property var warmIcons"), nodi.indexOf("function iconSource("));
  const sizes = [...warm.matchAll(/IconTile \{ imageSource: root\.iconSource\(modelData, false, true\); size: (.+?) \}/g)].map((m) => m[1].replace(/root\./g, ""));
  assert.deepEqual(sizes.sort(), [heroRow, plainRow].sort());
});
