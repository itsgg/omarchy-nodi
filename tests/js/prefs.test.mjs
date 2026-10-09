// Aliases, favourites and hidden rows: what is kept, and what it does.

import { test } from "node:test";
import assert from "node:assert/strict";
import { load, plain } from "./load.mjs";

const P = load("lib/Prefs.js");
const snap = (title, run) => ({ title, subtitle: "", icon: "", run: run || { kind: "app", id: title.toLowerCase() }, confirm: false });

test("aliases name one row each, by the word as typed", () => {
  let p = P.empty();
  p = P.withAlias(p, "  FF ", "app:firefox", snap("Firefox"));
  assert.equal(P.aliasFor(p, "ff").key, "app:firefox");
  assert.equal(P.aliasFor(p, "FF  ").key, "app:firefox");
  assert.equal(P.aliasFor(p, "f"), null);
  p = P.withAlias(p, "web", "app:firefox", snap("Firefox"));
  assert.deepEqual(plain(P.aliasesOf(p, "app:firefox")), ["ff", "web"]);
  p = P.withAlias(p, "ff", "app:foot", snap("Foot"));
  assert.equal(P.aliasFor(p, "ff").key, "app:foot", "naming another row moves the alias");
  assert.equal(P.withAlias(p, "   ", "app:x", snap("X")), null, "an empty alias is refused");
  assert.equal(P.withAlias(p, "?x", "app:x", snap("X")), null, "help answers ? first");
  assert.equal(P.withAlias(p, "Hidden", "app:x", snap("X")), null, "the hidden list answers hidden");
  assert.equal(P.aliasFor(P.withoutAlias(p, "FF"), "ff"), null);
  assert.equal(P.aliasFor(p, "constructor"), null, "no alias borrowed from a prototype");
});

test("favourites toggle, hidden rows hide and show again", () => {
  let p = P.toggledFavourite(P.empty(), "app:firefox", snap("Firefox"));
  assert.ok(P.isFavourite(p, "app:firefox"));
  assert.ok(!P.isFavourite(P.toggledFavourite(p, "app:firefox"), "app:firefox"));
  p = P.hiddenRow(p, "menu:system.reboot", snap("Reboot"));
  p = P.hiddenRow(p, "menu:system.reboot", snap("Reboot"));
  assert.equal(p.hidden.length, 1);
  assert.ok(P.isHidden(p, "menu:system.reboot"));
  assert.ok(!P.isHidden(P.shownRow(p, "menu:system.reboot"), "menu:system.reboot"));
});

test("kept as JSON, anything malformed left out", () => {
  let p = P.withAlias(P.empty(), "ff", "app:firefox", snap("Firefox"));
  p = P.toggledFavourite(p, "app:foot", snap("Foot"));
  const back = P.load(P.serialize(p));
  assert.equal(P.aliasFor(back, "ff").s.title, "Firefox");
  assert.ok(P.isFavourite(back, "app:foot"));
  const junk = P.load(JSON.stringify({ aliases: { x: { key: "k" }, "": { key: "k", s: snap("K") } }, favourites: [1, null, { key: "a", s: {} }], hidden: "no" }));
  assert.deepEqual(plain(Object.keys(junk.aliases)), []);
  assert.deepEqual(plain(junk.favourites), []); assert.deepEqual(plain(junk.hidden), []);
  assert.deepEqual(plain(P.load("not json").favourites), []);
});

import { run, services, config, Engine } from "./fixtures.mjs";
const Rows = load("lib/Rows.js");

test("in the bar: an alias names its row first, hidden rows are gone, favourites lead the home", () => {
  const firefox = run("firefox")[0];
  const fsnap = { title: firefox.title, subtitle: firefox.subtitle, icon: firefox.icon, run: firefox.run, confirm: false, provider: "apps", kind: "app" };
  let prefs = P.withAlias(P.empty(), "web", firefox.key, fsnap);
  const viaAlias = run("web", { prefs });
  assert.equal(viaAlias[0].key, firefox.key, "an alias no provider answers still finds its row");
  assert.equal(run("brave", { prefs: P.withAlias(P.empty(), "brave", firefox.key, fsnap) })[0].key, firefox.key, "an alias beats a name");
  prefs = P.hiddenRow(prefs, firefox.key, fsnap);
  assert.ok(!run("firefox", { prefs }).some(r => r.key === firefox.key), "a hidden row is not offered");
  const hidden = run("hidden", { prefs });
  assert.equal(hidden[0].key, firefox.key); assert.equal(hidden[0].nodi, "show"); assert.equal(hidden[0].actionLabel, "Show again");
  const fav = P.toggledFavourite(P.empty(), firefox.key, fsnap);
  const home = run("", { prefs: fav });
  assert.equal(home[0].key, firefox.key); assert.equal(home[0].group, "Favourites");
  assert.equal(home[0].section, "", "one favourite: no header over a group of one, the footer names it");
  assert.ok(run("hidden").every(r => r.nodi !== "show"), "with nothing hidden, \"hidden\" is an ordinary search");
});

test("Ctrl+K sets them; the alias prompt is one row", () => {
  const firefox = run("firefox")[0];
  const labels = prefs => plain(Rows.actionsFor(firefox, { prefs }).map(a => a.label));
  assert.ok(labels(P.empty()).includes("Add to favourites") && labels(P.empty()).includes("Add alias") && labels(P.empty()).includes("Hide"));
  const fsnap = { title: "Firefox", run: firefox.run };
  const p = P.toggledFavourite(P.withAlias(P.empty(), "ff", firefox.key, fsnap), firefox.key, fsnap);
  assert.ok(labels(p).includes("Remove from favourites")); assert.ok(labels(p).includes("Remove alias \"ff\""));
  assert.ok(!Rows.actionsFor(run("2+2")[0], { prefs: P.empty() }).some(a => a.label === "Hide"), "an answer is not something to keep");
  const prompt = Engine.aliasPrompt("  FF ", firefox);
  assert.equal(prompt.length, 1); assert.equal(prompt[0].title, "ff"); assert.equal(prompt[0].subtitle, "Alias for Firefox"); assert.equal(prompt[0].nodi, "saveAlias");
  assert.equal(prompt[0].actionLabel, "Save"); assert.equal(Rows.actionsFor(prompt[0], { prefs: P.empty() }).length, 0, "no Ctrl+K on Nodi's own row");
  assert.equal(Engine.aliasPrompt("", firefox)[0].nodi, "", "nothing typed, nothing to save");
});

test("hotkeys and deeplinks: one chord per row, the snapshot kept to run it", () => {
  const ff = snap("Firefox");
  let p = P.withHotkey(P.empty(), "SUPER + F", "app:firefox", ff);
  assert.equal(P.hotkeyOf(p, "app:firefox"), "SUPER + F");
  p = P.withHotkey(p, "SUPER + ALT + F", "app:firefox", ff);
  assert.equal(P.hotkeyOf(p, "app:firefox"), "SUPER + ALT + F", "a new chord replaces the old");
  assert.equal(Object.keys(p.hotkeys).length, 1);
  assert.equal(P.hotkeyOf(P.withoutHotkey(p, "app:firefox"), "app:firefox"), "");
  const linked = P.withLink(P.empty(), "menu:system.lock", snap("Lock"));
  assert.equal(P.snapshotFor(linked, "menu:system.lock", {}).title, "Lock");
  assert.equal(P.snapshotFor(P.empty(), "app:x", { "app:x": { n: 1, t: 1, s: snap("X") } }).title, "X", "or what the home keeps");
  assert.equal(P.snapshotFor(P.empty(), "constructor", {}), null);
  const back = P.load(P.serialize(P.withLink(p, "menu:system.lock", snap("Lock"))));
  assert.equal(P.hotkeyOf(back, "app:firefox"), "SUPER + ALT + F"); assert.equal(back.links["menu:system.lock"].s.title, "Lock");
});

test("the hotkey prompt says what to press, or what holds the chord", () => {
  const firefox = run("firefox")[0];
  assert.equal(Engine.hotkeyPrompt(firefox, "")[0].title, "Press the keys for Firefox");
  assert.equal(Engine.hotkeyPrompt(firefox, "SUPER + K opens Keybindings")[0].title, "SUPER + K opens Keybindings; press other keys");
  const labels = plain(Rows.actionsFor(firefox, { prefs: P.withHotkey(P.empty(), "SUPER + F", firefox.key, { title: "Firefox", run: firefox.run }) }).map(a => a.label));
  assert.ok(labels.includes("Change hotkey (SUPER + F)") && labels.includes("Remove hotkey") && labels.includes("Copy deeplink"));
  const reboot = Rows.normalize({ key: "menu:system.reboot", title: "Reboot", copy: "", confirm: true, run: { kind: "exec", argv: ["omarchy-system-reboot"] } }, { id: "menu", name: "Omarchy" }, 0, 0);
  const rl = plain(Rows.actionsFor(reboot, { prefs: P.empty() }).map(a => a.label));
  assert.ok(!rl.includes("Set hotkey") && !rl.includes("Copy deeplink"), "nothing that would run it at once");
});

test("an alias named __proto__ is saved and read back as one", () => {
  const p = P.withAlias(P.empty(), "__proto__", "app:x", snap("X"));
  assert.deepEqual(plain(Object.keys(P.load(P.serialize(p)).aliases)), ["__proto__"]);
});

test("hotkeys are read by their canonical combo: a hand-written spelling is the same key", () => {
  const p = P.load(JSON.stringify({ hotkeys: { "super+f": { key: "app:firefox", s: snap("Firefox") }, "SUPER": { key: "app:x", s: snap("X") } } }));
  assert.deepEqual(plain(Object.keys(p.hotkeys)), ["SUPER + F"], "spelled canonically; a key that is only a modifier is not kept");
  assert.equal(P.hotkeyOf(p, "app:firefox"), "SUPER + F");
});

test("a prefs.json that does not parse is a problem, never empty prefs to write over (2026-10-09)", () => {
  const P = load("lib/Prefs.js");
  const good = P.serialize(P.withAlias(P.empty(), "ff", "app:firefox", { title: "Firefox", run: { kind: "app", id: "firefox" } }) || P.empty());
  assert.equal(P.problem(good), "");
  assert.equal(P.problem(""), "", "no file yet is none");
  assert.equal(P.problem("  \n"), "");
  assert.notEqual(P.problem(good.replace(/\}\s*$/, ",}")), "", "a trailing comma");
  assert.notEqual(P.problem("{"), "");
  assert.equal(P.problem("[]"), "it holds no object");
  assert.equal(P.problem("null"), "it holds no object");
  assert.equal(P.problem("3"), "it holds no object");
});

test("a read of prefs.json: the same text again does nothing, a broken one stops the saves, a fixed one is taken (codex's review, 2026-10-09)", () => {
  const P = load("lib/Prefs.js");
  const good = P.serialize(P.empty());
  assert.equal(P.reread({ loaded: false, text: "", broken: "" }, good).act, "take", "the first read");
  assert.equal(P.reread({ loaded: true, text: good, broken: "" }, good).act, "none", "read again at an open, unchanged");
  const edited = good.replace(/\}\s*$/, ',"hidden":["app:x"]}');
  const took = plain(P.reread({ loaded: true, text: good, broken: "" }, edited));
  assert.equal(took.act, "take", "a hand edit is taken");
  const broke = plain(P.reread({ loaded: true, text: good, broken: "" }, good.replace(/\}\s*$/, ",}")));
  assert.equal(broke.act, "broken", "a hand edit that broke it stops the saves");
  assert.ok(broke.why);
  assert.equal(P.reread({ loaded: true, text: good, broken: "Unexpected token" }, good).act, "take", "fixed back as it was: taken again");
});
