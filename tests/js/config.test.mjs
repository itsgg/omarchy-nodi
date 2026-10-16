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

test("home sources expand approved paths and normalize bounded settings", () => {
  const env = { home: "/home/person", runtimeDir: "/run/user/1000" };
  const got = Config.homeSources([
    { id: "runtime", file: "$XDG_RUNTIME_DIR/example/home.jsonl", title: "Example\nFeed\u0000", icon: "view-list", max: 4, priority: 20, trustedActions: true },
    { id: "home", file: "~/feeds/home.jsonl", max: 10000, priority: -10000 },
    { id: "plain", file: "/var/lib/example/home.jsonl" }
  ], env);
  assert.deepEqual(plain(got), [
    { id: "runtime", file: "/run/user/1000/example/home.jsonl", title: "Example Feed", icon: "view-list", max: 4, priority: 20, trustedActions: true },
    { id: "home", file: "/home/person/feeds/home.jsonl", title: "home", max: 100, priority: -1000, trustedActions: false },
    { id: "plain", file: "/var/lib/example/home.jsonl", title: "plain", max: 8, priority: 0, trustedActions: false }
  ]);
});

test("home source config rejects relative, unexpanded, duplicate and malformed entries and caps source count", () => {
  const env = { home: "/home/person", runtimeDir: "/run/user/1000" };
  const valid = Array.from({ length: Config.MAX_HOME_SOURCES + 4 }, (_, i) => ({ id: "s" + i, file: "/tmp/s" + i + ".jsonl" }));
  const got = Config.homeSources([
    null,
    { id: "", file: "/tmp/a" },
    { id: "bad/id", file: "/tmp/b" },
    { id: "relative", file: "tmp/c" },
    { id: "unknown", file: "$OTHER/c" },
    { id: "missing-runtime", file: "$XDG_RUNTIME_DIR/c" },
    { id: "same", file: "/tmp/one" },
    { id: "same", file: "/tmp/two" },
    ...valid
  ], { home: env.home, runtimeDir: "" });
  assert.equal(got[0].id, "same");
  assert.equal(got.filter(s => s.id === "same").length, 1);
  assert.equal(got.length, Config.MAX_HOME_SOURCES);
  assert.ok(got.every(s => s.file.startsWith("/")));
});

test("merged config always carries normalized home sources and defaults to none", () => {
  assert.deepEqual(plain(defaults.home), []);
  const merged = Config.merge(defaults, {
    home: [{ id: "feed", file: "${HOME}/feed.jsonl", trustedActions: "yes" }]
  }, "", { home: "/home/person", runtimeDir: "/run/user/1000" });
  assert.deepEqual(plain(merged.home), [{
    id: "feed", file: "/home/person/feed.jsonl", title: "feed", max: 8, priority: 0, trustedActions: false
  }]);
});

test("socket filters expand an explicit absolute path and bound their options", () => {
  const merged = Config.merge(defaults, { filters: [
    { keyword: "search", title: "Search", socket: "$XDG_RUNTIME_DIR/example/search.sock", timeoutMs: 99999, max: 5000 },
    { keyword: "home", socket: "${HOME}/.local/run/home.sock", timeoutMs: 1, max: 0 }
  ] }, "", { home: "/home/person", runtimeDir: "/run/user/1000" });
  assert.deepEqual(plain(merged.filters), [
    { keyword: "search", title: "Search", socket: "/run/user/1000/example/search.sock", timeoutMs: 10000, max: 1000 },
    { keyword: "home", socket: "/home/person/.local/run/home.sock", timeoutMs: 500, max: 1 }
  ]);
});

test("filters require exactly one valid command or socket and reject unsafe socket paths", () => {
  const filters = Config.filters([
    { keyword: "command", command: ["program"] },
    { keyword: "both", command: ["program"], socket: "/run/user/1000/both.sock" },
    { keyword: "neither" },
    { keyword: "relative", socket: "relative.sock" },
    { keyword: "traversal", socket: "$XDG_RUNTIME_DIR/example/../other.sock" },
    { keyword: "unknown", socket: "$OTHER/example.sock" },
    { keyword: "control", socket: "/run/user/1000/a\u0000b" },
    { keyword: "missing", socket: "$XDG_RUNTIME_DIR/example.sock" },
    { keyword: "valid", socket: "/run/user/1000/valid.sock" }
  ], { home: "/home/person", runtimeDir: "" });
  assert.deepEqual(plain(filters.map(f => f.keyword)), ["command", "valid"]);
  assert.deepEqual(plain(filters[0]), { keyword: "command", command: ["program"] }, "command filters retain their existing shape");
});
