// Every top-level function of lib/ and providers/ is used by something
// other than its tests: one only a test calls is dead code kept alive.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { root } from "./load.mjs";

function files(dir, out = []) {
  for (const n of readdirSync(dir)) {
    if (n.startsWith(".") || n === "node_modules") continue;
    const p = join(dir, n);
    if (statSync(p).isDirectory()) files(p, out);
    else if (/\.(js|qml|mjs)$/.test(n)) out.push(p);
  }
  return out;
}

test("no library function is called only from the tests", () => {
  const texts = files(root).map(f => [relative(root, f), readFileSync(f, "utf8")]).filter(([r]) => !r.startsWith("tests/"));
  const unused = [];
  for (const [rel, text] of texts.filter(([r]) => /^(lib|providers)\/[^/]+\.js$/.test(r))) {
    for (const m of text.matchAll(/^function (\w+)\(/gm)) {
      const re = new RegExp("\\b" + m[1] + "\\b", "g");
      let uses = 0;
      for (const [r, t] of texts) uses += (t.match(re) || []).length - (r === rel ? 1 : 0);
      if (uses === 0) unused.push(rel + " " + m[1]);
    }
  }
  assert.deepEqual(unused, []);
});
