// A saved row (a favourite, an alias, a hotkey, a recent or a hidden one)
// is shown as its provider gives it now; the snapshot it was saved with
// stands only when nothing answers its key with a row that runs.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { load, root, plain } from "./load.mjs";
import { Engine, config, services, apps } from "./fixtures.mjs";

const Prefs = load("lib/Prefs.js");
const History = load("lib/History.js");
const Menu = load("lib/Menu.js");
const fixture = name => readFileSync(join(root, "tests/js/fixtures", name), "utf8");

const entry = (name, fields) => Object.assign({ id: name, name, generic: "", comment: "", keywords: [], icon: "", wmclass: "", actions: [], exec: "", terminal: false }, fields);
const netflix = entry("Netflix", { comment: "Netflix", exec: 'omarchy-launch-webapp "https://www.netflix.com"' });
// What a favourite set before the subtitle fix kept: the name twice.
const staleNetflix = { title: "Netflix", subtitle: "Netflix", icon: "", image: "netflix", kind: "app", provider: "apps", group: "Apps",
                       run: { kind: "app", id: "Netflix" }, confirm: false };
const firefoxSnap = { title: "Firefox", subtitle: "Web Browser", icon: "", image: "firefox", kind: "app", provider: "apps", group: "Apps",
                      run: { kind: "app", id: "firefox" }, confirm: false };

const homeWith = (prefs, extra) => Engine.run("", config, services(Object.assign({ prefs, history: {} }, extra)));

test("a favourite shows its app as it is now", () => {
  const prefs = Prefs.toggledFavourite(Prefs.empty(), "app:Netflix", staleNetflix);
  const row = homeWith(prefs, { apps: [netflix] }).find(r => r.key === "app:Netflix");
  assert.equal(row.subtitle, "Web app, netflix.com");
  assert.equal(row.group, "Favourites");

  const renamed = apps.map(a => a.id === "firefox" ? Object.assign({}, a, { name: "Waterfox" }) : a);
  const fav = Prefs.toggledFavourite(Prefs.empty(), "app:firefox", firefoxSnap);
  assert.equal(homeWith(fav, { apps: renamed }).find(r => r.key === "app:firefox").title, "Waterfox");
});

test("an app no longer installed keeps its saved copy", () => {
  const fav = Prefs.toggledFavourite(Prefs.empty(), "app:firefox", firefoxSnap);
  const row = homeWith(fav, { apps: apps.filter(a => a.id !== "firefox") }).find(r => r.key === "app:firefox");
  assert.equal(row.title, "Firefox");
  assert.equal(row.subtitle, "Web Browser");
});

test("a recent row, an alias and a hidden row are shown as they are now", () => {
  const history = History.record({}, "app:Netflix", Date.now(), staleNetflix);
  const recent = Engine.run("", config, services({ apps: [netflix], history, prefs: Prefs.empty() })).find(r => r.key === "app:Netflix");
  assert.equal(recent.subtitle, "Web app, netflix.com");

  const aliased = Prefs.withAlias(Prefs.empty(), "nf", "app:Netflix", staleNetflix);
  const top = Engine.run("nf", config, services({ apps: [netflix], prefs: aliased, history: {} }))[0];
  assert.equal(top.key, "app:Netflix");
  assert.equal(top.subtitle, "Web app, netflix.com");

  const hidden = Prefs.hiddenRow(Prefs.empty(), "app:Netflix", staleNetflix);
  const shown = Engine.run("hidden", config, services({ apps: [netflix], prefs: hidden, history: {} }))[0];
  assert.equal(shown.subtitle, "Web app, netflix.com");
  assert.equal(shown.nodi, "show", "Enter still shows it again rather than running it");
});

test("a provider answers only its own keys, and a disabled one none", () => {
  const svc = services({ apps: [netflix] });
  assert.equal(Engine.resolve("app:Netflix", staleNetflix, config, svc).subtitle, "Web app, netflix.com");
  assert.equal(Engine.resolve("app:Netflix", Object.assign({}, staleNetflix, { provider: "menu" }), config, svc), null);
  const noApps = Object.assign({}, config, { providers: config.providers.filter(p => p !== "apps") });
  assert.equal(Engine.resolve("app:Netflix", staleNetflix, noApps, svc), null);
});

test("an app's action and an id with a colon resolve to themselves", () => {
  const svc = services({ apps });
  const action = Engine.resolve("app:firefox:1", Object.assign({}, firefoxSnap, { run: { kind: "app", id: "firefox", action: 1 } }), config, svc);
  assert.equal(action.title, "New Private Window");
  assert.deepEqual(plain(action.run), { kind: "app", id: "firefox", action: 1 });
  const odd = [entry("tool:2", { comment: "A tool" }), entry("tool", { actions: [{ index: 0, name: "A" }, { index: 1, name: "B" }, { index: 2, name: "C" }] })];
  assert.equal(Engine.resolve("app:tool:2", firefoxSnap, config, services({ apps: odd })).title, "tool:2", "the whole id first");
  assert.equal(Engine.resolve("app:tool:1", firefoxSnap, config, services({ apps: odd })).title, "B");
});

test("a menu row takes its label as the menu has it now", () => {
  const merged = Menu.merge([Menu.parseItems(fixture("menu.jsonc"))]);
  const relabelled = Object.assign({}, merged.items, { "system.lock": Object.assign({}, merged.items["system.lock"], { label: "Lock the Screen" }) });
  const menu = { items: relabelled, order: merged.order, when: {}, checked: {} };
  const snap = { title: "Lock", subtitle: "System", icon: "", kind: "action", provider: "menu", group: "Omarchy", run: { kind: "shell", script: "omarchy-system-lock" }, confirm: false };
  const fav = Prefs.toggledFavourite(Prefs.empty(), "menu:system.lock", snap);
  assert.equal(homeWith(fav, { menu, toggleStates: {} }).find(r => r.key === "menu:system.lock").title, "Lock the Screen");
});

test("a snippet saved filled in keeps its copy; one whose text changed runs the new text", () => {
  const cfg = Object.assign({}, config, { snippets: [
    { keyword: "mt", name: "Meeting", text: 'Meet {argument name="who"}' },
    { keyword: "sig", name: "Signature", text: "Regards,\nG" }] });
  const filled = { title: "Meeting", subtitle: "Meet Ravi", icon: "", kind: "answer", provider: "snippets", group: "Snippets",
                   run: { kind: "exec", argv: ["omarchy-menu-emoji-insert", "Meet Ravi"] }, confirm: false };
  const sigOld = { title: "Signature", subtitle: "Regards, ...", icon: "", kind: "answer", provider: "snippets", group: "Snippets",
                   run: { kind: "exec", argv: ["omarchy-menu-emoji-insert", "Thanks,\nG"] }, confirm: false };
  const svc = services({ prefs: Prefs.empty(), history: {} });
  assert.equal(Engine.resolve("snippet:mt", filled, cfg, svc), null, "waiting for its argument, it does not run, so the copy stands");
  assert.deepEqual(plain(Engine.resolve("snippet:sig", sigOld, cfg, svc).run), { kind: "paste", text: "Regards,\nG" });
});

test("a saved row on the home has no pane and no argument line, and stays managed", () => {
  const cfg = Object.assign({}, config, { snippets: [{ keyword: "tdy", name: "Today", text: 'Today is {date format="EEEE"}' }] });
  const snap = { title: "Today", subtitle: "Today is Monday", icon: "", kind: "item", provider: "snippets", group: "Snippets",
                 run: { kind: "exec", argv: ["omarchy-menu-emoji-insert", "Today is Monday"] }, confirm: false };
  const fav = Prefs.toggledFavourite(Prefs.empty(), "snippet:tdy", snap);
  const row = Engine.run("", cfg, services({ prefs: fav, history: {} })).find(r => r.key === "snippet:tdy");
  assert.match(row.subtitle, /^Today is \w+day$/);
  assert.equal(row.preview, null, "the home stays 680 wide, as before");
  assert.equal(row.hint, "");
  assert.equal(row.remember, true, "its placeholder makes the provider forget it; a saved row is still managed from Ctrl+K");
});

test("a snippet that reads the clipboard keeps its copy, and the home starts no read", () => {
  const cfg = Object.assign({}, config, { snippets: [{ keyword: "cl", name: "Quote", text: "> {clipboard}" }] });
  const snap = { title: "Quote", subtitle: "> old", icon: "", kind: "item", provider: "snippets", group: "Snippets",
                 run: { kind: "exec", argv: ["omarchy-menu-emoji-insert", "> old"] }, confirm: false };
  const asked = [];
  const svc = services({ prefs: Prefs.toggledFavourite(Prefs.empty(), "snippet:cl", snap), history: {}, asked, clipboardText: "secret" });
  const row = Engine.run("", cfg, svc).find(r => r.key === "snippet:cl");
  assert.equal(row.subtitle, "> old");
  assert.deepEqual(asked, [], "nothing read for the home");
});

test("a keybinding row follows a new description, never a new command on its chord", () => {
  const binds = [{ chord: "SUPER + F", description: "Files", dispatcher: "exec", arg: "nautilus" }];
  const svc = b => services({ keybindings: b, prefs: Prefs.empty(), history: {} });
  const saved = Engine.resolve("keys:SUPER + F", { provider: "keys", title: "File manager", run: null }, config, svc(binds));
  assert.equal(saved, null, "a snapshot with another run is not replaced");
  const snap = History.snapshot(Engine.run("keys files", config, svc(binds)).find(r => r.key === "keys:SUPER + F"));
  const renamed = [Object.assign({}, binds[0], { description: "File manager" })];
  assert.equal(Engine.resolve("keys:SUPER + F", snap, config, svc(renamed)).title, "File manager");
  const rebound = [{ chord: "SUPER + F", description: "Full screen", dispatcher: "lua", arg: 'hl.dsp.window.fullscreen({ mode = "fullscreen" })' }];
  assert.equal(Engine.resolve("keys:SUPER + F", snap, config, svc(rebound)), null, "the saved File manager still runs nautilus");
});
