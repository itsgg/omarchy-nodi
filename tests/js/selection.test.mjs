// The text selected in the window you came from (ROADMAP 47):
// providers/selection.js, the home view it leads, {selection}, and what
// Nodi.qml makes of wl-paste's output (lib/Sources.js selection).
import { test } from "node:test";
import assert from "node:assert/strict";
import { load, plain } from "./load.mjs";
import { config, run, top } from "./fixtures.mjs";

const Sources = load("lib/Sources.js");
const Placeholders = load("lib/Placeholders.js");
const fresh = text => ({ selection: { text, fresh: true } });
const stale = text => ({ selection: { text, fresh: false } });

test("a fresh selection leads the empty bar with five rows on it; a stale one does not", () => {
  const rows = run("", fresh("teh quick brown fox"));
  assert.deepEqual(plain(rows.slice(0, 5).map(r => r.title)),
                   ["Fix spelling and grammar", "Rewrite...", "Translate to English", "Change case...", "Search Google for the selection"]);
  assert.ok(rows.slice(0, 5).every(r => r.group === "Selected: teh quick brown fox"), "the group names what they act on");
  assert.ok(!run("", stale("teh quick brown fox")).some(r => r.provider === "selection"), "selected long ago: the usual home");
  assert.ok(!run("", fresh("")).some(r => r.provider === "selection"));
  const other = { ...config, translate: { language: "Tamil" } };
  assert.equal(run("", fresh("hello"), other)[2].title, "Translate to Tamil", "the language from nodi.json");
});

test("Claude's rows carry the question the bar shows and the text, fenced", () => {
  const fix = top("", fresh("teh fox"));
  assert.equal(fix.nodi, "askWith");
  assert.equal(fix.ask.context, "selection");
  assert.equal(fix.ask.question, "Fix the spelling and grammar of the selection");
  assert.match(fix.ask.message, /^Fix the spelling and grammar of the text below\..*Reply with the result only.*\n\n<text>\nteh fox\n<\/text>$/s);
  assert.equal(fix.remember, false, "a moment's action is not learned");
  const rw = top("rewrite more formal", stale("hey whats up"));
  assert.deepEqual([rw.title, rw.nodi, rw.ask.question], ["Rewrite: more formal", "askWith", "Rewrite the selection: more formal"]);
  assert.match(rw.ask.message, /as asked: more formal\./);
  assert.equal(top("rewrite ", stale("x")).hint, "rewrite <how>", "no instruction yet: it asks for one");
  assert.notEqual(top("rewrite shorter", fresh("")).provider, "selection");
});

test("by name while the selection is fresh; never on a stale one, which is nearly always there", () => {
  assert.equal(top("fix spelling", fresh("teh")).title, "Fix spelling and grammar");
  assert.equal(top("translate", fresh("bonjour")).title, "Translate to English");
  assert.equal(top("summarize", fresh("long text")).title, "Summarize");
  for (const q of ["fix spelling", "google", "title", "small", "edit"])
    assert.ok(!run(q, stale("some words")).some(r => r.provider === "selection"), q + " (Fable 2026-10-06)");
  assert.ok(!run("fix spelling", {}).some(r => r.provider === "selection"));
  assert.ok(!run("translate", fresh("")).some(r => r.provider === "selection"));
});

test("rewrite and case with nothing selected leave the words to the rest of the bar", () => {
  for (const q of ["rewrite my resume", "case study"]) {
    const rows = run(q, fresh(""));
    assert.ok(!rows.some(r => r.provider === "selection"), q);
    assert.ok(rows.some(r => r.provider === "fallback"), q + ": the fallbacks (Fable 2026-10-06)");
  }
});

test("a case is changed here and pasted over the selection", () => {
  const rows = run("case ", stale("hello World-wide webApp"));
  const by = Object.fromEntries(rows.map(r => [r.title, r]));
  assert.equal(by["UPPER CASE"].copy, "HELLO WORLD-WIDE WEBAPP");
  assert.equal(by["lower case"].copy, "hello world-wide webapp");
  assert.equal(by["Title Case"].copy, "Hello World-Wide Webapp");
  assert.equal(run("case title", stale("it's a dog's life"))[0].copy, "It's A Dog's Life", "an apostrophe starts no word (Fable 2026-10-06)");
  assert.equal(run("case title", stale("'hello' world, 'yes'"))[0].copy, "'Hello' World, 'Yes'", "an opening quote still does");
  assert.equal(by["snake_case"].copy, "hello_world_wide_web_app");
  assert.equal(by["kebab-case"].copy, "hello-world-wide-web-app");
  assert.equal(by["camelCase"].copy, "helloWorldWideWebApp");
  assert.equal(run("case ", stale("one. two! three"))[3].copy, "One. Two! Three", "sentence case");
  assert.deepEqual(plain(by["UPPER CASE"].run), { kind: "exec", argv: ["omarchy-menu-emoji-insert", "HELLO WORLD-WIDE WEBAPP"] });
  assert.equal(by["UPPER CASE"].actionLabel, "Paste");
  assert.deepEqual(plain(run("case snake", stale("a b")).map(r => r.title)), ["snake_case"], "filtered by what follows");
  assert.equal(top("uppercase", fresh("abc")).copy, "ABC", "a case by its name, at root");
});

test("search goes to the first keyword that searches, with the selection as its words", () => {
  const s = run("", fresh("nodi launcher")).find(r => r.key === "selection:search");
  assert.deepEqual(plain(s.run), { kind: "open", target: "https://www.google.com/search?q=nodi%20launcher" });
});

test("{selection} in a keyword's link and a snippet", () => {
  const cfg = { ...config, keywords: [{ keyword: "def", title: "Define it", open: "https://example.com/define/{selection}" }],
                snippets: [{ keyword: "quote", text: "> {selection}" }] };
  assert.equal(top("def", stale("a b"), cfg).run.target, "https://example.com/define/a%20b", "encoded in a link");
  assert.equal(Placeholders.fill("> {selection}", "", { selection: "line" }).text, "> line", "as written in a snippet");
  assert.equal(Placeholders.fill("[{selection}]", "", {}).text, "[]", "nothing selected: empty");
});

test("wl-paste's output as a selection: line ends, control characters, spaces only", () => {
  assert.equal(Sources.selection("abc\n"), "abc", "the newline the Reader ends its last line with (Fable 2026-10-06)");
  assert.equal(Sources.selection("a\nb\n"), "a\nb");
  assert.equal(Sources.selection("abc\r\n"), "abc", "a CRLF selection's end too (Fable 2026-10-06)");
  assert.equal(Sources.selection("a\r\nb\rc"), "a\nb\nc");
  assert.equal(Sources.selection("x\u0000y\u001b[31mz\tw"), "xy[31mz\tw");
  assert.equal(Sources.selection("  \n\t "), "");
  assert.equal(Sources.selection(undefined), "");
});
