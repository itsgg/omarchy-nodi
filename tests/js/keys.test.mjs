// The selection as the results change under it.

import { test } from "node:test";
import assert from "node:assert/strict";
import { load, plain } from "./load.mjs";
import { run, windows } from "./fixtures.mjs";

const Keys = load("lib/Keys.js");

test("a new query starts at the top", () => {
  const rows = [{ key: "a" }, { key: "b" }];
  assert.equal(Keys.reselect({ query: "x", key: "b", index: 1 }, rows, "xy"), 0);
  assert.equal(Keys.reselect(null, rows, "x"), 0, "nothing shown yet");
  assert.equal(Keys.reselect({ query: "x", key: "b", index: 1 }, [], "x"), 0);
});

test("the same query re-ranked keeps the selected row", () => {
  const before = { query: "x", key: "b", index: 1 };
  assert.equal(Keys.reselect(before, [{ key: "c" }, { key: "a" }, { key: "b" }], "x"), 2, "followed to where it moved");
  assert.equal(Keys.reselect(before, [{ key: "a" }, { key: "c" }, { key: "d" }], "x"), 1, "gone: its place");
  assert.equal(Keys.reselect({ query: "x", key: "z", index: 5 }, [{ key: "a" }, { key: "c" }], "x"), 1, "within the list");
});

test("windows landing after open do not move Enter off the row that was seen", () => {
  // Opened on "brave": the window list has not landed, so Brave the app is first.
  const first = run("brave", { windows: [] });
  assert.equal(first[0].run.kind, "app");
  const before = { query: "brave", key: first[0].key, index: 0 };
  // The windows land and rank Brave's windows above the app.
  const after = run("brave", { windows });
  assert.equal(after[0].run.kind, "window");
  const i = Keys.reselect(before, after, "brave");
  assert.equal(after[i].key, first[0].key);
  assert.equal(after[i].run.kind, "app");
});

const view = extra => Object.assign({ palette: null, armed: false, helpTopic: false, backToTopics: false, text: "fire", rows: 3, selected: 1 }, extra || {});
const d = (name, extra, ctrl) => plainDo(Keys.decide({ name, ctrl: !!ctrl }, view(extra)));
function plainDo(r) { return r === null ? null : JSON.parse(JSON.stringify(r)); }

test("keys in the list", () => {
  assert.deepEqual(d("Down"), { do: "move", by: 1 });
  assert.deepEqual(d("N", {}, true), { do: "move", by: 1 });
  assert.deepEqual(d("Up"), { do: "move", by: -1 });
  assert.deepEqual(d("P", {}, true), { do: "move", by: -1 });
  assert.deepEqual(d("Return"), { do: "activate", index: 1 });
  assert.deepEqual(d("Enter"), { do: "activate", index: 1 });
  assert.deepEqual(d("Return", {}, true), { do: "copy", index: 1 }, "Ctrl+Enter copies");
  assert.deepEqual(d("Tab"), { do: "complete" });
  assert.deepEqual(d("K", {}, true), { do: "palette" });
  assert.deepEqual(d("2", {}, true), { do: "activate", index: 1 });
  assert.deepEqual(d("9", {}, true), { do: "nothing" }, "Ctrl+9 with three rows does nothing, and the field does not get a 9");
  assert.equal(d("K"), null, "a plain letter is typing");
  assert.equal(d("N"), null);
  assert.equal(d("2"), null);
  assert.equal(d("Backspace"), null, "Backspace edits the text");
});

test("Escape steps back from what is open, then closes the bar in one press", () => {
  assert.deepEqual(d("Escape", { armed: true, helpTopic: true }), { do: "disarm" }, "first a second Enter that was waiting");
  assert.deepEqual(d("Escape", { helpTopic: true }), { do: "helpBack" }, "then a help topic");
  assert.deepEqual(d("Escape"), { do: "dismiss" }, "then the bar, text or not: the query stays for next time");
  assert.deepEqual(d("Escape", { text: "" }), { do: "dismiss" });
  assert.deepEqual(d("Backspace", { backToTopics: true }), { do: "helpBack" });
  assert.deepEqual(d("Escape", { prompting: true, armed: true }), { do: "cancelPrompt" }, "a prompt being typed (an alias, a confirm word) goes first");
  // The bar reopens on the last query, selected: one Escape closes it until
  // something is typed (his report 2026-10-05).
  assert.deepEqual(d("Escape", { text: "firefox", typed: false }), { do: "dismiss" });
  assert.deepEqual(d("Escape", { text: "?units", helpTopic: true, typed: false }), { do: "dismiss" });
  assert.deepEqual(d("Escape", { text: "firefox", typed: true }), { do: "dismiss" }, "typed too: one press (his report 2026-10-05)");
  assert.deepEqual(d("Escape", { text: "x", typed: false, armed: true }), { do: "disarm" }, "an armed row is disarmed first");
});

test("keys in Ctrl+K", () => {
  const pal = { palette: { count: 3, index: 2 } };
  assert.deepEqual(d("Down", pal), { do: "paletteMove", to: 0 }, "wraps");
  assert.deepEqual(d("Up", { palette: { count: 3, index: 0 } }), { do: "paletteMove", to: 2 });
  assert.deepEqual(d("N", pal, true), { do: "paletteMove", to: 0 });
  assert.deepEqual(d("Return", pal), { do: "paletteRun", index: 2 });
  assert.deepEqual(d("Escape", pal), { do: "paletteClose" });
  assert.deepEqual(d("K", pal, true), { do: "paletteClose" });
  assert.equal(d("Tab", pal), null);
  assert.equal(d("a", pal), null, "typing goes to the field");
  assert.deepEqual(d("Down", { palette: { count: 0, index: 0 } }), { do: "nothing" }, "an empty palette never divides by zero");
});

test("a key press as Hyprland names a chord", () => {
  const M = { shift: 0x02000000, ctrl: 0x04000000, alt: 0x08000000, meta: 0x10000000 };
  assert.equal(Keys.chord(0x46, M.meta), "SUPER + F");
  assert.equal(Keys.chord(0x46, M.meta | M.shift), "SUPER + SHIFT + F");
  assert.equal(Keys.chord(0x21, M.meta | M.shift), "SUPER + SHIFT + 1", "Shift+1 arrives as !");
  assert.equal(Keys.chord(0x01000031, M.ctrl | M.alt), "CTRL + ALT + F2");
  assert.equal(Keys.chord(0x20, M.alt), "ALT + SPACE");
  assert.equal(Keys.chord(0x46, 0), "", "a letter alone is typing");
  assert.equal(Keys.chord(0x46, M.shift), "", "and with Shift");
  assert.equal(Keys.chord(0x01000022, M.meta), "", "Super on its own is not a chord yet");
  assert.ok(Keys.isModifier(0x01000022) && Keys.isModifier(0x01000020) && !Keys.isModifier(0x46));
});

test("a held key moves the selection and does nothing else: Enter held never confirms", () => {
  const view = { palette: null, armed: true, helpTopic: false, backToTopics: false, text: "shutdown", rows: 3, selected: 0 };
  const held = (name, ctrl, v) => Keys.decide({ name, ctrl: !!ctrl, repeat: true }, v || view);
  for (const [name, ctrl] of [["Return"], ["Enter"], ["Return", true], ["K", true], ["Tab"], ["Escape"], ["1", true]])
    assert.deepEqual(JSON.parse(JSON.stringify(held(name, ctrl))), { do: "nothing" }, name + (ctrl ? " with Ctrl" : ""));
  assert.deepEqual(JSON.parse(JSON.stringify(held("Down"))), { do: "move", by: 1 });
  assert.deepEqual(JSON.parse(JSON.stringify(held("Up"))), { do: "move", by: -1 });
  const palette = Object.assign({}, view, { palette: { count: 3, index: 0 } });
  assert.deepEqual(JSON.parse(JSON.stringify(held("Return", false, palette))), { do: "nothing" }, "a palette action is not run by a held Enter");
  assert.deepEqual(JSON.parse(JSON.stringify(held("Down", false, palette))), { do: "paletteMove", to: 1 });
  assert.equal(held("Backspace"), null, "a held Backspace still deletes text");
  assert.deepEqual(JSON.parse(JSON.stringify(Keys.decide({ name: "Return", ctrl: false }, view))), { do: "activate", index: 0 }, "a press still activates");
});

test("the pane scrolls with Shift, the list pages with PageUp and PageDown", () => {
  const v = (extra) => Object.assign({ palette: null, armed: false, helpTopic: false, backToTopics: false, text: "x", prompting: false, rows: 30, selected: 10, page: 8, pane: true }, extra || {});
  const k = (name, shift, extra, repeat) => JSON.parse(JSON.stringify(Keys.decide({ name, ctrl: false, shift: !!shift, repeat: !!repeat }, v(extra))));
  assert.deepEqual(k("Down", true), { do: "paneScroll", lines: 3 });
  assert.deepEqual(k("Up", true), { do: "paneScroll", lines: -3 });
  assert.deepEqual(k("PageDown", true), { do: "panePage", by: 1 });
  assert.deepEqual(k("PageUp", true), { do: "panePage", by: -1 });
  assert.deepEqual(JSON.parse(JSON.stringify(Keys.decide({ name: "Down", shift: true }, v({ pane: false })))), { do: "move", by: 1 }, "no pane: Shift+Down moves the list, as before");
  assert.deepEqual(JSON.parse(JSON.stringify(Keys.decide({ name: "Return", shift: true }, v()))), { do: "activate", index: 10 }, "Shift+Enter runs the row, pane or not");
  assert.deepEqual(k("PageDown"), { do: "select", index: 17 }, "a page is the rows shown, less one kept for context");
  assert.deepEqual(k("PageUp"), { do: "select", index: 3 });
  assert.deepEqual(k("PageDown", false, { selected: 27 }), { do: "select", index: 29 }, "no wrap at the end");
  assert.deepEqual(k("PageUp", false, { selected: 2 }), { do: "select", index: 0 });
  assert.deepEqual(k("PageDown", false, { rows: 0 }), { do: "nothing" });
  assert.deepEqual(k("Down", true, {}, true), { do: "paneScroll", lines: 3 }, "held, it keeps scrolling");
  assert.deepEqual(k("PageDown", false, {}, true), { do: "select", index: 17 }, "held, it keeps paging");
  assert.deepEqual(k("Down", false), { do: "move", by: 1 }, "Down alone still moves");
  const ctrl = (name, extra) => JSON.parse(JSON.stringify(Keys.decide({ name, ctrl: true }, v(extra))));
  assert.deepEqual(ctrl("D"), { do: "panePage", by: 0.5 }, "vim's Ctrl+D, half a page");
  assert.deepEqual(ctrl("U"), { do: "panePage", by: -0.5 });
  assert.equal(Keys.decide({ name: "U", ctrl: true }, v({ pane: false })), null, "no pane: Ctrl+U clears the field, as it does");
  assert.equal(Keys.decide({ name: "D", ctrl: true }, v({ pane: false })), null);
  const pal = { palette: { count: 3, index: 1 } };
  assert.deepEqual(k("Down", true, pal), { do: "paneScroll", lines: 3 }, "under Ctrl+K the pane scrolls too");
  assert.deepEqual(k("PageUp", true, pal), { do: "panePage", by: -1 });
  assert.deepEqual(ctrl("D", pal), { do: "panePage", by: 0.5 });
  assert.deepEqual(k("Down", true, Object.assign({ pane: false }, pal)), { do: "paletteMove", to: 2 }, "no pane: Shift+Down moves the actions");
  assert.deepEqual(k("Down", false, pal), { do: "paletteMove", to: 2 });
});

test("readline keys in the field: Ctrl+W, Ctrl+E, Ctrl+F, Ctrl+B (ROADMAP 51)", () => {
  assert.deepEqual(d("W", {}, true), { do: "edit", how: "word" });
  assert.deepEqual(d("E", { palette: { count: 3, index: 0 } }, true), { do: "edit", how: "end" }, "under Ctrl+K too (Ctrl+W, which changes the text, closes it, as typing does)");
  assert.equal(Keys.decide({ name: "W", ctrl: true, shift: true }, view()), null, "Ctrl+Shift+W is not one");
  assert.deepEqual(plain(Keys.decide({ name: "W", ctrl: true, repeat: true }, view())), { do: "edit", how: "word" }, "held, it keeps deleting");
  const e = (how, text, at, s, f) => plain(Keys.edited(how, text, at, s === undefined ? at : s, f === undefined ? at : f));
  assert.deepEqual(e("word", "open the  door", 14), { text: "open the  ", at: 10 });
  assert.deepEqual(e("word", "open the  ", 10), { text: "open ", at: 5 }, "back over spaces, then the word");
  assert.deepEqual(e("word", "firefox", 7, 0, 7), { text: "", at: 0 }, "the selected kept query goes whole");
  assert.deepEqual(e("word", "", 0), { text: "", at: 0 });
  assert.deepEqual(e("end", "abc", 1), { text: "abc", at: 3 });
  assert.deepEqual(e("right", "abc", 3), { text: "abc", at: 3 }, "not past the end");
  assert.deepEqual(e("left", "abc", 0), { text: "abc", at: 0 });
  assert.deepEqual(e("left", "abcdef", 6, 2, 5), { text: "abcdef", at: 2 }, "back from a selection: its start");
});

