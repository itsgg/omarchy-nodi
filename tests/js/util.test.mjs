// lib/Util.js: the helpers every library shares, one copy each.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { load, root } from "./load.mjs";

const Util = load("lib/Util.js");

test("tilde, pad, own, has, ago", () => {
  assert.equal(Util.tilde("/home/u/x", "/home/u"), "~/x");
  assert.equal(Util.tilde("/home/u", "/home/u"), "~", "home itself");
  assert.equal(Util.tilde("/home/user2/x", "/home/u"), "/home/user2/x");
  assert.equal(Util.tilde("/etc", ""), "/etc");
  assert.equal(Util.pad(7), "07"); assert.equal(Util.pad(12), "12"); assert.equal(Util.pad(99, 4), "0099");
  assert.equal(Util.own({ a: 1 }, "a"), 1);
  assert.equal(Util.own({}, "constructor"), undefined);
  assert.equal(Util.own(null, "a"), undefined);
  assert.equal(Util.has({ a: 0 }, "a"), true); assert.equal(Util.has({}, "toString"), false); assert.equal(Util.has(null, "a"), false);
  assert.deepEqual([-5, 0, 59999, 60000, 3599999, 3600000, 86399999, 86400000 * 2].map(Util.ago),
    ["just now", "just now", "just now", "1 min ago", "59 min ago", "1 h ago", "23 h ago", "2 d ago"]);
});

test("no library keeps its own copy of them", () => {
  const dirs = ["lib", "providers"];
  for (const dir of dirs) for (const name of readdirSync(join(root, dir)).filter(n => n.endsWith(".js") && n !== "Util.js")) {
    const text = readFileSync(join(root, dir, name), "utf8");
    for (const fn of ["tilde", "pad", "own", "ago"]) assert.doesNotMatch(text, new RegExp("^function " + fn + "\\(", "m"), dir + "/" + name + " " + fn);
  }
});
