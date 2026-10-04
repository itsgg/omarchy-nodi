// nodi.json over the defaults: what a typo does, and how keywords merge.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { load, root, plain } from "./load.mjs";

const Config = load("lib/Config.js");
const defaults = JSON.parse(readFileSync(join(root, "config.default.json"), "utf8"));

test("a file that does not parse is an error, never settings", () => {
  const bad = Config.read('{ "hotkey": "SUPER + SPACE" ');
  assert.equal(bad.config, null);
  assert.ok(bad.error.length > 0);
  assert.equal(Config.read("[1, 2]").error, "not an object of settings");
  assert.deepEqual(plain(Config.read("")), { config: {}, error: "" }, "an empty file is no settings");
  assert.deepEqual(plain(Config.read('{ "hotkey": "SUPER + SPACE", } // mine')), { config: { hotkey: "SUPER + SPACE" }, error: "" });
});

test("an error says its line, whatever the engine", () => {
  const J = load("lib/Jsonc.js");
  assert.equal(Config.read('{\n  "hotkey": "SUPER + SPACE"\n  "emoji": {}\n}').error, "line 3: expected , or }");
  assert.equal(Config.read('/* a\n comment */\n{ "a": tru }').error, "line 3: expected a value", "lines inside a block comment count");
  assert.equal(Config.read('{ "a": "b }').error, "line 1: a string is not closed");
  assert.equal(Config.read('{ "a": 1 } x').error, "line 1: text after the end");
  assert.equal(Config.read('{ a: 1 }').error, "line 1: expected a quoted name");
  assert.equal(Config.read('{ "a": [1, 2 }').error, "line 1: expected , or ]");
  assert.equal(Config.read('{ "a":').error, "line 1: the text ends early");
  assert.deepEqual(plain(Config.read('\uFEFF{ "hotkey": "SUPER + SPACE" }')), { config: { hotkey: "SUPER + SPACE" }, error: "" }, "a byte-order mark is not an error");
  assert.equal(Config.read('{ "a":\u00A01 }').error, "line 1: expected a value", "a no-break space is, as in JSON");
  assert.ok(Config.read("[".repeat(200000)).error.length > 0, "nesting past the stack still reads as an error");
  // Everything JSON.parse accepts, the locator accepts.
  for (const ok of ['{"a": [1, -2.5e3, true, null, "x\\"y"], "b": {}}', "[]", '"s"', "  ", '{ "u": "http://x" // c\n, }'])
    assert.equal(J.locate(ok), "", ok);
});

test("keywords merge by keyword", () => {
  const words = c => plain(c.keywords.map(k => k.keyword));
  assert.deepEqual(words(Config.merge(defaults, {})), ["g", "yt", "gh", "wiki"], "the defaults alone");
  const mine = Config.merge(defaults, { keywords: [
    { keyword: "g", title: "Search DuckDuckGo", open: "https://duckduckgo.com/?q={q}" },
    { keyword: "say", run: "notify-send {q}" },
    { keyword: "WIKI", disabled: true }
  ] });
  assert.deepEqual(words(mine), ["g", "yt", "gh", "say"]);
  assert.equal(mine.keywords[0].title, "Search DuckDuckGo", "the user's entry replaces the default of its keyword");
  assert.equal(Config.merge(defaults, { hotkey: "SUPER + SPACE" }).hotkey, "SUPER + SPACE");
  assert.equal(Config.merge(defaults, { keywords: "nonsense" }).keywords, "nonsense", "a value that is not a list replaces, as any setting does");
});

test("a comment never closed is an error, and a comment separates what it sits between", () => {
  const r = Config.read('/* unfinished\n{ "hotkey": "SUPER + X" }');
  assert.equal(r.config, null, "the last good settings stay");
  assert.match(r.error, /never closed/);
  assert.equal(Config.read('{ "a": 1/* note */2 }').config, null, "1/* */2 is not 12");
  assert.deepEqual(plain(Config.read('{ "a": 1 /* x\n y */, "b": 2 }').config), { a: 1, b: 2 });
});
