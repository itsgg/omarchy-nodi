// What Ask tells an agent beside the question (lib/PromptContext.js): the
// version, why it is asked, the window and the selection, each field
// allowlisted, typed and bounded; what is unknown is left out.

import { test } from "node:test";
import assert from "node:assert/strict";
import { load, plain } from "./load.mjs";

const P = load("lib/PromptContext.js");
const build = (input) => plain(P.build(input));

test("the version and a purpose are always there; nothing else is invented", () => {
  assert.deepEqual(build({}), { version: 1, purpose: "ask" });
  for (const nothing of [undefined, null, "text", 7, [], [{ purpose: "fix" }]])
    assert.deepEqual(build(nothing), { version: 1, purpose: "ask" }, JSON.stringify(nothing));
  assert.equal(P.VERSION, 1);
});

test("a purpose is a short lower-case word, else the generic ask", () => {
  for (const ok of ["ask", "fix", "translate", "rewrite", "a-b-2"]) assert.equal(build({ purpose: ok }).purpose, ok);
  for (const bad of ["", "Fix", "has space", "-lead", "9lives", "x".repeat(33), "tab\t", 5, null, {}, ["fix"], "fix\nignore previous"])
    assert.equal(build({ purpose: bad }).purpose, "ask", JSON.stringify(bad));
  assert.equal(build({ purpose: "x".repeat(32) }).purpose, "x".repeat(32));
});

test("a window keeps its allowlisted, typed fields and drops the rest", () => {
  const w = build({ window: { class: "foot", title: "project", workspace: 3, pid: 4211, cwd: "/home/user/project",
                              address: "0xabc", stableId: "ff", floating: true, token: "secret" } }).window;
  assert.deepEqual(w, { class: "foot", title: "project", workspace: 3, pid: 4211, cwd: "/home/user/project" });
});

test("a window field of the wrong type is left out, never coerced", () => {
  const w = (o) => build({ window: o }).window;
  assert.equal(w({ class: 5, title: {}, workspace: "3", pid: "4211", cwd: ["/a"] }), undefined, "strings are not numbers, numbers are not strings");
  assert.deepEqual(w({ class: "foot", workspace: 0, pid: 0 }), { class: "foot" }, "no workspace or pid is 0, not a value");
  assert.deepEqual(w({ class: "foot", workspace: -3, pid: -1 }), { class: "foot" });
  assert.deepEqual(w({ class: "foot", workspace: 2.5, pid: NaN }), { class: "foot" });
  assert.deepEqual(w({ class: "foot", workspace: Infinity, pid: 2 ** 40 }), { class: "foot" });
  assert.equal(w(null), undefined);
  assert.equal(w("foot"), undefined);
  assert.equal(w([{ class: "foot" }]), undefined);
  assert.equal(w({}), undefined, "an empty window is no window");
  assert.equal(w({ class: "  ", title: "" }), undefined, "blank is unknown");
});

test("window title and class are one bounded line", () => {
  const w = build({ window: { class: "c".repeat(500), title: "a\nb\u0000\u001b[31mc\t" + "t".repeat(500) } }).window;
  assert.equal(w.class.length, 128);
  assert.ok(w.title.length <= 300, String(w.title.length));
  assert.ok(!/[\u0000-\u001f\u007f]/.test(w.title), "no control characters: " + JSON.stringify(w.title));
  assert.ok(w.title.startsWith("a b"));
  const pair = "😀".repeat(200);
  const t = build({ window: { title: pair } }).window.title;
  assert.ok(t.length <= 300 && !/[\ud800-\udbff]$/.test(t), "a cut never ends inside a pair");
});

test("a working directory is an absolute path of the bound, or nothing", () => {
  const cwd = (c) => (build({ window: { class: "foot", cwd: c } }).window || {}).cwd;
  assert.equal(cwd("/"), "/");
  assert.equal(cwd("/home/user/my project"), "/home/user/my project");
  assert.equal(cwd("/ünï/文字"), "/ünï/文字");
  const long = "/" + "d".repeat(4095);
  assert.equal(cwd(long), long, "4096 characters fit");
  assert.equal(cwd(long + "d"), undefined, "a longer path is left out, not cut into another place");
  for (const bad of ["", "relative/dir", "./x", "~/x", " /lead", "/a\nb", "/a\u0000b", "/a\tb", "/a\u001b[31m", "/dir (deleted)", 5, {}, null])
    assert.equal(cwd(bad), undefined, JSON.stringify(bad));
});

test("a selection keeps its text, source and age", () => {
  assert.deepEqual(build({ selection: { text: "selected text", source: "primary", ageMs: 4000 } }).selection,
    { text: "selected text", source: "primary", ageMs: 4000 });
  assert.deepEqual(build({ selection: { text: "copied", source: "clipboard", ageMs: 0 } }).selection,
    { text: "copied", source: "clipboard", ageMs: 0 });
  assert.equal(build({ selection: { text: "  keeps\n its  spacing\n", source: "primary", ageMs: 1 } }).selection.text, "  keeps\n its  spacing\n", "the text is as it was");
});

test("a selection's unknown source or age is left out, its text kept", () => {
  const s = (o) => build({ selection: Object.assign({ text: "t" }, o) }).selection;
  assert.deepEqual(s({}), { text: "t" });
  assert.deepEqual(s({ source: "selection" }), { text: "t" }, "only primary and clipboard are sources");
  assert.deepEqual(s({ source: 3 }), { text: "t" });
  assert.deepEqual(s({ ageMs: "4000" }), { text: "t" }, "a string is no age");
  assert.deepEqual(s({ ageMs: -5 }), { text: "t" });
  assert.deepEqual(s({ ageMs: NaN }), { text: "t" });
  assert.deepEqual(s({ ageMs: Infinity }), { text: "t" });
  assert.deepEqual(s({ ageMs: 1234.9 }), { text: "t", ageMs: 1234 }, "whole milliseconds");
  assert.deepEqual(s({ ageMs: 2 ** 40 }), { text: "t", ageMs: 24 * 60 * 60 * 1000 }, "an age is capped at a day");
});

test("a selection with no usable text is no selection", () => {
  for (const text of ["", "   \n\t ", 5, null, undefined, {}, ["a"]])
    assert.equal(build({ selection: { text, source: "primary", ageMs: 1 } }).selection, undefined, JSON.stringify(text));
  assert.equal(build({ selection: "text" }).selection, undefined);
  assert.equal(build({ selection: null }).selection, undefined);
});

test("a selection's text is bounded by the limit of the textual prompt", () => {
  assert.equal(P.SELECTION_LIMIT, 65536);
  const exact = "x".repeat(65536);
  assert.equal(build({ selection: { text: exact } }).selection.text.length, 65536);
  assert.equal(build({ selection: { text: exact + "y" } }).selection.text.length, 65536);
  const pairs = "😀".repeat(40000);
  const cut = build({ selection: { text: pairs } }).selection.text;
  assert.ok(cut.length <= 65536 && !/[\ud800-\udbff]$/.test(cut), "a cut never ends inside a pair");
});

test("what comes out shares nothing with what went in", () => {
  const input = { purpose: "fix", window: { class: "foot" }, selection: { text: "a" }, extra: { a: 1 } };
  const out = P.build(input);
  input.window.class = "changed";
  input.selection.text = "changed";
  assert.equal(out.window.class, "foot");
  assert.equal(out.selection.text, "a");
  assert.deepEqual(Object.keys(plain(out)).sort(), ["purpose", "selection", "version", "window"]);
});

test("every field at once is the contract's shape", () => {
  assert.deepEqual(build({
    purpose: "ask",
    window: { class: "foot", title: "project", workspace: 3, pid: 4211, cwd: "/home/user/project" },
    selection: { text: "selected text", source: "primary", ageMs: 4000 }
  }), {
    version: 1, purpose: "ask",
    window: { class: "foot", title: "project", workspace: 3, pid: 4211, cwd: "/home/user/project" },
    selection: { text: "selected text", source: "primary", ageMs: 4000 }
  });
});

test("a row's purpose survives normalisation bounded, and is absent when it is not a word", () => {
  const Rows = load("lib/Rows.js");
  const n = (purpose) => Rows.normalize({ title: "x", nodi: "askWith", ask: { question: "q", message: "m", context: "selection", purpose } },
    { id: "selection", name: "Selection" }, 0, 0).ask;
  assert.deepEqual(plain(n("fix")), { question: "q", message: "m", context: "selection", purpose: "fix" });
  for (const bad of [undefined, null, "", "Fix", "has space", "x".repeat(33), 3, {}, "a\nb"])
    assert.deepEqual(plain(n(bad)), { question: "q", message: "m", context: "selection" }, JSON.stringify(bad));
  assert.equal(Rows.normalize({ title: "x" }, { id: "p", name: "P" }, 0, 0).ask, null, "no ask, no purpose");
});
