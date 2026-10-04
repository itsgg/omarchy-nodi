// What providers keep between keystrokes (the match fields of a list, the
// menu's index, the modes of a config) is kept per object: a new list, menu
// or config is read afresh, never answered from the last one.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { load, root } from "./load.mjs";
import { Engine, config, services, apps, windows } from "./fixtures.mjs";

const Menu = load("lib/Menu.js");
const Match = load("lib/Match.js");
const Sources = load("lib/Sources.js");
const Omarchy = load("providers/omarchy.js");
const fixture = name => readFileSync(join(root, "tests/js/fixtures", name), "utf8");
const keys = (rows) => rows.map(r => r.key);

test("a new app list is matched, not the last one", () => {
  assert.equal(Engine.run("firefox", config, services({ apps }))[0].title, "Firefox");
  const renamed = apps.map(a => a.id === "firefox" ? Object.assign({}, a, { name: "Waterfox" }) : a);
  assert.equal(Engine.run("waterfox", config, services({ apps: renamed }))[0].title, "Waterfox");
  assert.ok(!keys(Engine.run("firefox", config, services({ apps: apps.filter(a => a.id !== "firefox") }))).includes("app:firefox"));
});

test("a new menu, such as one a guard's answer hides a row in, is indexed again", () => {
  const merged = Menu.merge([Menu.parseItems(fixture("menu.jsonc"))]);
  const open = { items: merged.items, order: merged.order, when: {}, checked: {} };
  assert.ok(keys(Engine.run("lock", config, services({ menu: open, toggleStates: {} }))).includes("menu:system.lock"));
  const hidden = { items: merged.items, order: merged.order, when: { "system.lock": false }, checked: {} };
  assert.ok(!keys(Engine.run("lock", config, services({ menu: hidden, toggleStates: {} }))).includes("menu:system.lock"));
});

test("a catalog or keybindings read again is matched as read", () => {
  const commands = Omarchy.parse(fixture("omarchy-commands.json"));
  const ask = q => Engine.run(q, config, services({ omarchyCommands: commands })).map(r => r.title);
  assert.ok(ask("omarchy agent").some(t => /agent/i.test(t)));
  const renamed = commands.map(c => c.binary === "omarchy-agent" ? Object.assign({}, c, { route: "omarchy helper", aliases: [] }) : c);
  const again = Engine.run("omarchy helper", config, services({ omarchyCommands: renamed }));
  assert.ok(again.some(r => r.key === "omarchy:omarchy-agent"), "the renamed command is found by its new route");

  const binds = Sources.keybindings(fixture("keybindings.records"));
  assert.ok(keys(Engine.run("full screen", config, services({ keybindings: binds }))).some(k => /full/i.test(k)));
  const changed = binds.map(b => b.description === "Full screen" ? Object.assign({}, b, { description: "Whole display" }) : b);
  const rows = Engine.run("whole display", config, services({ keybindings: changed }));
  assert.ok(rows.some(r => r.title === "Whole display"), "the renamed binding is found by its new name");
});

test("a new emoji list and a new window list are searched as given", () => {
  const one = [{ e: "🔥", k: "fire flame" }];
  const two = [{ e: "💧", k: "fire water drop" }];
  assert.equal(Engine.run(":fire", config, services({ emojis: one }))[0].copy, "🔥");
  assert.equal(Engine.run(":fire", config, services({ emojis: two }))[0].copy, "💧");

  assert.ok(Engine.run("netflix", config, services({ apps, windows })).some(r => r.key === "window:0xb1"));
  const retitled = windows.map(w => w.address === "0xb1" ? Object.assign({}, w, { title: "Prime Video - Brave" }) : w);
  const rows = Engine.run("netflix", config, services({ apps, windows: retitled }));
  assert.ok(!rows.some(r => r.key === "window:0xb1"), "the old title no longer names the window");
  assert.ok(Engine.run("prime video", config, services({ apps, windows: retitled })).some(r => r.key === "window:0xb1"));
});

test("a window list kept while the apps change names its windows by the new apps", () => {
  const renamed = apps.map(a => a.id === "brave-browser" ? Object.assign({}, a, { name: "Brave Beta" }) : a);
  assert.match(Engine.run("w ", config, services({ apps, windows })).find(r => r.key === "window:0xb1").subtitle, /^Brave,/);
  assert.match(Engine.run("w ", config, services({ apps: renamed, windows })).find(r => r.key === "window:0xb1").subtitle, /^Brave Beta,/);
});

test("a config with other providers is answered by those", () => {
  assert.ok(keys(Engine.run("firefox", config, services({ apps }))).includes("app:firefox"));
  const noApps = Object.assign({}, config, { providers: config.providers.filter(p => p !== "apps") });
  assert.ok(!keys(Engine.run("firefox", noApps, services({ apps }))).includes("app:firefox"));
});

test("a new config's modes are its own", () => {
  const withSnippet = Object.assign({}, config, { snippets: [{ keyword: "mt", name: "Meeting", text: 'Meet {argument name="who"}' }] });
  assert.equal(Engine.mode("mt Ravi", withSnippet).label, "Meeting");
  assert.equal(Engine.mode("mt Ravi", Object.assign({}, config, { snippets: [] })), null);
});

test("the kept words start over past their limit and stay right", () => {
  assert.ok(Match.WORDS_KEPT > 0);
  const first = Match.words("VSCodium Editor");
  for (let i = 0; i <= Match.WORDS_KEPT; i++) Match.words("filler text " + i);
  assert.ok(Match.wordsCount <= Match.WORDS_KEPT, "the store is bounded");
  assert.deepEqual([...Match.words("VSCodium Editor")], [...first]);
  assert.deepEqual([...Match.words("org.gnome.Nautilus")], ["org", "gnome", "nautilus"]);
  assert.deepEqual([...Match.words("__proto__")], ["proto"]);
});
