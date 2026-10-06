// Search suggestions after a search keyword (ROADMAP 63): DuckDuckGo's
// autocomplete, under what is typed.
import { test } from "node:test";
import assert from "node:assert/strict";
import { load, plain } from "./load.mjs";
import { run, config } from "./fixtures.mjs";

const K = load("providers/keywords.js");

test("under what is typed, up to five, each a search of its own", () => {
  const suggest = ["omarchy hyprland", "omarchy hy", "omarchy hyper v", "omarchy hermes", "monarchy", "omarchy how to", "one more"];
  const rows = run("g omarchy hy", { suggest }).filter(r => r.provider === "keywords");
  assert.deepEqual(plain(rows.map(r => r.title)), ["Search Google: omarchy hy", "Search Google: omarchy hyprland", "Search Google: omarchy hyper v",
    "Search Google: omarchy hermes", "Search Google: monarchy", "Search Google: omarchy how to"], "what is typed first, once; five more");
  assert.deepEqual(plain(rows[1].run), { kind: "open", target: "https://www.google.com/search?q=omarchy%20hyprland" });
  assert.deepEqual([rows[1].subtitle, rows[1].remember], ["Suggested by DuckDuckGo", false]);
});

test("asked from the second letter, only for a keyword that says so", () => {
  const asked = [];
  run("g o", { asked });
  assert.ok(!asked.some(k => k.startsWith("suggest")), "one letter: none");
  run("g om", { asked });
  assert.ok(asked.includes("suggest:om"));
  const mine = [];
  run("gh nodi", { asked: mine });
  assert.ok(!mine.some(k => k.startsWith("suggest")), "GitHub's search has no suggest");
  assert.deepEqual(plain(config.keywords.filter(k => k.suggest).map(k => k.keyword)), ["g", "yt", "wiki"]);
});

test("DuckDuckGo's answer read, and the request it is", () => {
  const src = K.provider.sources.suggest;
  assert.deepEqual(plain(src.parse('["nodi",["nodi launcher","nodi meaning"]]', true)), ["nodi launcher", "nodi meaning"]);
  assert.deepEqual(plain(src.parse('["om",["Omega","omega"," omni  ","Omega",""]]', true)), ["Omega", "omni"], "trimmed, once each in any case (Sonnet 2026-10-06)");
  assert.equal(src.transient, true, "its entries go first when the cache is full");
  assert.throws(() => src.parse("<html>", true));
  assert.throws(() => src.parse("", false));
  assert.equal(src.argv("a b&c").at(-1), "https://duckduckgo.com/ac/?type=list&q=a%20b%26c", "the words encoded");
  assert.equal(src.supersede, true, "each keystroke ends the read before it");
});


test("while the next are read, the last that still begin with what is typed; no repeat of what is typed", () => {
  run("g omarchy", { suggest: ["omarchy hyprland", "omarchy themes", "monarchy"] });
  const pending = run("g omarchy h", {}).filter(r => r.provider === "keywords").map(r => r.title);
  assert.deepEqual(plain(pending), ["Search Google: omarchy h", "Search Google: omarchy hyprland"], "only those that still fit");
  const typed = run("g Omarchy  hy", { suggest: ["omarchy hy", "omarchy hyprland"] }).filter(r => r.provider === "keywords").map(r => r.title);
  assert.deepEqual(plain(typed), ["Search Google: Omarchy  hy", "Search Google: omarchy hyprland"], "what is typed, in any case and spacing, once");
});

test("a cache full of suggestions lets them go first", async () => {
  const { load } = await import("./load.mjs");
  const R = load("lib/Requests.js");
  const cache = {};
  for (let i = 0; i < 64; i++) cache["suggest:q" + i] = { state: "ready", value: [], at: 100 + i };
  cache["directory:/home/u"] = { state: "ready", value: {}, at: 1 };
  const gone = R.prune(cache, 64, null, k => k.indexOf("suggest:") === 0);
  assert.deepEqual(plain(gone), ["suggest:q0"], "the oldest suggestion, not the older folder listing");
});
