// The text selected in the window you came from (ROADMAP 47):
// providers/selection.js, the home view it leads, {selection}, and what
// Nodi.qml makes of wl-paste's output (lib/Sources.js selection).
import { test } from "node:test";
import assert from "node:assert/strict";
import { load, plain } from "./load.mjs";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
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
  const presets = run("rewrite ", stale("x"));
  assert.deepEqual(plain(presets.map(r => r.title)), ["Improve the writing", "Shorter", "More formal", "Friendlier", "Simpler"],
                   "no instruction yet: ready rewrites, so Enter does one (his screenshot 2026-10-06)");
  assert.ok(presets.every(r => r.nodi === "askWith" && r.ask.context === "selection"));
  assert.equal(presets[0].ask.question, "Rewrite the selection: clearer and more natural, keeping its meaning");
  assert.deepEqual(plain(run("rewrite sh", stale("x")).map(r => r.title)), ["Rewrite: sh", "Shorter"], "his words, then a preset he started");
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

test("a text to act on: line ends, control characters, spaces only", () => {
  assert.equal(Sources.clean("a\r\nb\rc"), "a\nb\nc");
  assert.equal(Sources.clean("x\u0000y\u001b[31mz\tw"), "xy[31mz\tw");
  assert.equal(Sources.clean("  \n\t "), "");
  assert.equal(Sources.clean(undefined), "");
  assert.equal(Sources.clean("ends\n\n"), "ends\n\n", "its own line ends kept: the read no longer guesses at the Reader's");
});

// The read itself (Sources.SELECTION_READ), run by bash against a stand-in
// wl-paste, its output taken as the Reader takes it (Fable 2026-10-06).
test("the selection read: both texts exact, 64 KB in bytes, a password manager's copy never read", () => {
  const dir = mkdtempSync(join(tmpdir(), "nodi-sel-"));
  writeFileSync(join(dir, "wl-paste"), `#!/usr/bin/bash
case "$*" in
  *list-types*) printf '%s\n' $FAKE_TYPES ;;
  *--primary*) [ -f "$FAKE_PRIMARY" ] && cat "$FAKE_PRIMARY" ;;
  *) [ -f "$FAKE_CLIP" ] && cat "$FAKE_CLIP" ;;
esac
`, { mode: 0o755 });
  const read = (primary, clip, types = "text/plain") => {
    if (primary !== null) writeFileSync(join(dir, "p"), primary); else rmSync(join(dir, "p"), { force: true });
    if (clip !== null) writeFileSync(join(dir, "c"), clip); else rmSync(join(dir, "c"), { force: true });
    const out = execFileSync("/usr/bin/bash", ["-c", Sources.SELECTION_READ], { env: { PATH: dir + ":/usr/bin:/bin", LANG: "C.UTF-8",
      FAKE_PRIMARY: join(dir, "p"), FAKE_CLIP: join(dir, "c"), FAKE_TYPES: types } }).toString();
    // The Reader hands back each line with "\n", the last one too.
    return plain(Sources.selections(out.endsWith("\n") ? out : out + "\n"));
  };
  try {
    assert.deepEqual(read("sel", "copied"), { primary: "sel", clipboard: "copied" });
    assert.deepEqual(read("x\n\n", "y\n"), { primary: "x\n\n", clipboard: "y\n" }, "trailing line ends kept, so the bar's own copy matches");
    assert.deepEqual(read(null, null), { primary: "", clipboard: "" });
    assert.deepEqual(read("s", "secret", "text/plain x-kde-passwordManagerHint"), { primary: "s", clipboard: "" }, "never a password manager's");
    assert.equal(read("a".repeat(65536), null).primary.length, 65536, "64 KB kept");
    assert.equal(read("a".repeat(65537), "c").primary, "", "a byte past: dropped");
    assert.equal(read("a".repeat(65537), "c").clipboard, "c", "without the other");
    assert.equal(read("a".repeat(65536) + "\ntail", null).primary, "", "cut at a newline: still dropped, not passed as whole");
    assert.equal(read("த".repeat(22000), null).primary, "", "66000 bytes in 22000 letters: dropped");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("text copied with Ctrl+C stands in when nothing fresh is selected, named as copied, pasted at the cursor (his report 2026-10-06)", () => {
  const copied = { selection: { text: "teh fox", fresh: true, source: "clipboard" } };
  const rows = run("", copied);
  assert.equal(rows[0].group, "Copied: teh fox");
  assert.deepEqual([rows[0].ask.question, rows[0].ask.context], ["Fix the spelling and grammar of the copied text", "copied"]);
  assert.equal(rows.find(r => r.key === "selection:search").title, "Search Google for the copied text");
  const rw = plain(run("rewrite ", copied))[0];
  assert.deepEqual([rw.ask.question, rw.ask.context], ["Rewrite the copied text: clearer and more natural, keeping its meaning", "copied"]);
  const tr = plain(run("tr tamil", copied))[0];
  assert.deepEqual([tr.ask.question, tr.ask.context], ["Translate to Tamil: the copied text", "copied"]);
  const done = { ask: { phase: "done", question: "Fix the spelling and grammar of the copied text", answer: "the fox", model: "haiku", context: "copied" } };
  assert.equal(plain(run("ask Fix the spelling and grammar of the copied text", done))[0].title, "Paste the answer", "not over a selection: there is none");
  assert.equal(plain(run("g ", copied))[0].subtitle, "The copied text");
});

test("one read gives the selection and the clipboard, split at a U+001E line", () => {
  assert.deepEqual(plain(Sources.selections("sel\n\u001e\ncopied\n\u001e\n")), { primary: "sel", clipboard: "copied" });
  assert.deepEqual(plain(Sources.selections("\n\u001e\ncopied\n\u001e\n")), { primary: "", clipboard: "copied" });
  assert.deepEqual(plain(Sources.selections("sel\n\u001e\n")), { primary: "", clipboard: "" }, "cut off: nothing");
});

test("typed alone with nothing selected, tr and b64 take the clipboard's text, shown on the row (Fable 2026-10-06)", () => {
  const clip = { selection: { text: "", fresh: false, source: "selection", clipboard: "bonjour" } };
  const tr = plain(run("tr ", clip))[0];
  assert.deepEqual([tr.title, tr.subtitle, tr.ask.question, tr.ask.context], ["Translate to English", "bonjour", "Translate to English: the copied text", "copied"]);
  assert.equal(plain(run("b64 ", clip))[0].copy, "Ym9uam91cg==");
  assert.equal(plain(run("tr ", { selection: { text: "", fresh: false, clipboard: "" } }))[0].hint, "tr <language> <text>", "nothing anywhere: the hint");
});

test("a keyword whose words make the site opens no site of its own", () => {
  const cfg = { ...config, keywords: [{ keyword: "pages", title: "Pages", open: "https://{q}.github.io/" },
                                      { keyword: "port", title: "Local port", open: "http://localhost:{q}/" }] };
  assert.equal(top("pages ", {}, cfg).run, null);
  assert.equal(top("port ", {}, cfg).run, null);
});
