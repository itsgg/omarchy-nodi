// Keybindings as rows: found by what they do, the keys beside them, run as
// Omarchy's keybindings menu runs them.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { load, root, plain } from "./load.mjs";
import { Engine, config, services } from "./fixtures.mjs";

const S = load("lib/Sources.js");
const Menu = load("lib/Menu.js");
const binds = S.keybindings(readFileSync(join(root, "tests/js/fixtures/keybindings.records"), "utf8"));
const svc = extra => { const d = services(Object.assign({ toggleStates: {} }, extra || {})); d.request = (n, p, o) => n === "keybindings" ? { state: "ready", value: binds } : { state: "pending" }; return d; };
const run = (q, extra) => Engine.run(q, config, svc(extra));
const keyRows = (q, extra) => run(q, extra).filter(r => r.provider === "keys");

test("the records parse into keys, a name, a dispatcher and its argument", () => {
  assert.equal(binds.length, 13);
  assert.deepEqual(plain(binds[0]), { chord: "SUPER + RETURN", description: "Terminal", dispatcher: "exec", arg: "omarchy-launch-terminal" });
  assert.deepEqual(plain(binds[7]), { chord: "SUPER + C", description: "Universal copy", dispatcher: "", arg: "" });
  assert.deepEqual(plain(S.keybindings("garbage\n\nno arrow here\tx")), []);
});

test("found by what they do, the keys beside them, run as the keys run them", () => {
  const fs = keyRows("full screen")[0];
  assert.equal(fs.title, "Full screen"); assert.equal(fs.badge, "SUPER + F");
  assert.equal(fs.keys, "SUPER + F", "a binding that runs has its keys to teach");
  assert.equal(keyRows("universal copy")[0].keys, "", "one that only copies its keys teaches none");
  assert.deepEqual(plain(fs.run), { kind: "exec", argv: ["hyprctl", "dispatch", 'hl.dsp.window.fullscreen({ mode = "fullscreen" })'] });
  const term = keyRows("terminal")[0];
  assert.deepEqual(plain(term.run), { kind: "exec", argv: ["hyprctl", "dispatch", 'hl.dsp.exec_cmd("omarchy-launch-terminal")'] });
  assert.equal(keyRows("workspace 3")[0].title, "Switch to workspace 3", "the closer name first");
  assert.equal(keyRows("close")[0].title, "Close window");
});

test("what closes everything asks twice; what runs nothing copies its keys, below", () => {
  assert.equal(keyRows("close all")[0].confirm, true);
  assert.ok(!keyRows("close window")[0].confirm);
  const copy = keyRows("universal copy")[0];
  assert.deepEqual(plain(copy.run), { kind: "copy", text: "SUPER + C" }); assert.equal(copy.actionLabel, "Copy keys");
  const zoom = keyRows("zoom")[0];
  assert.ok(zoom.score < keyRows("close window")[0].score - 3, "a keys-only row ranks under one that runs");
  assert.equal(keyRows("odd")[0].run.kind, "copy", "a Lua record that is not a Hyprland dispatcher runs nothing");
});

test("Nodi's own key is not offered, and an app named as well comes first", () => {
  assert.ok(!run("keys ").some(r => r.title === "Nodi"));
  const all = run("keys ").filter(r => r.provider === "keys");
  assert.equal(all.length, 12);
  assert.deepEqual(plain(all.slice(0, 3).map(r => r.title)), ["Terminal", "Full screen", "Close window"], "in Omarchy's order");
  const t = run("terminal");
  assert.equal(t[0].provider, "apps", "Alacritty by its generic name, then the binding");
  assert.ok(t.some(r => r.provider === "keys" && r.badge === "SUPER + RETURN"));
});

test("a binding the menu runs is left to the menu row, which shows its keys", () => {
  const merged = Menu.merge([Menu.parseItems(readFileSync(join(root, "tests/js/fixtures/menu.jsonc"), "utf8"))]);
  const menu = { items: merged.items, order: merged.order, when: {}, checked: {} };
  const rows = run("screenshot", { menu });
  assert.equal(rows[0].provider, "menu");
  assert.match(rows[0].subtitle, /, keys PRINT$/);
  assert.equal(rows[0].keys, "PRINT", "its keys, to show when it is run from the bar (lib/Teach.js)");
  assert.equal(run("theme", { menu }).find(r => r.provider === "menu").keys, "", "a menu row with no binding has none");
  assert.ok(!rows.some(r => r.provider === "keys" && r.title === "Screenshot"));
  assert.ok(run("keys screenshot", { menu }).some(r => r.provider === "keys" && r.title === "Screenshot"), "keys lists it still");
  // Only the exact command: a menu that runs one omarchy-shell call leaves
  // the bindings that run other omarchy-shell calls alone.
  const shellMenu = Menu.merge([Menu.parseItems('{ "power": {"label":"Battery","action":"omarchy-shell omarchy.power togglePercentage"} }')]);
  const pause = run("pause", { menu: { items: shellMenu.items, order: shellMenu.order, when: {}, checked: {} } });
  assert.ok(pause.some(r => r.provider === "keys" && r.title === "Pause"), pause.map(r => r.title).join());
});

test("the records as Omarchy writes them: its own command run, the newest records read; and a saved key that is gone", async () => {
  const { mkdtempSync, mkdirSync, writeFileSync, chmodSync, rmSync, copyFileSync } = await import("node:fs");
  const { execFileSync } = await import("node:child_process");
  const { tmpdir } = await import("node:os");
  const K = load("providers/keys.js");
  const t = mkdtempSync(join(tmpdir(), "nodi-keys-"));
  try {
    mkdirSync(join(t, "bin")); mkdirSync(join(t, "cache/omarchy"), { recursive: true });
    // Omarchy's own: it writes the records file, which is then read.
    writeFileSync(join(t, "bin/omarchy-menu-keybindings"), '#!/bin/bash\n[ "$1" = --print ] && cp "$NODI_FIXTURE" "$XDG_CACHE_HOME/omarchy/keybindings-1.records"\n');
    // An older file of one record beside it: the newest is the one read
    // (Cursor's review, 2026-10-10).
    const { utimesSync, readFileSync } = await import("node:fs");
    const older = join(t, "cache/omarchy/keybindings-9.records");
    writeFileSync(older, readFileSync(join(root, "tests/js/fixtures/keybindings.records"), "utf8").split("\n").slice(0, 1).join("\n") + "\n");
    utimesSync(older, new Date(2020, 0, 1), new Date(2020, 0, 1));
    chmodSync(join(t, "bin/omarchy-menu-keybindings"), 0o755);
    const argv = K.provider.sources.keybindings.argv();
    const out = execFileSync(argv[0], argv.slice(1), { env: { PATH: join(t, "bin") + ":/usr/bin:/bin", HOME: t, XDG_CACHE_HOME: join(t, "cache"),
                                                              NODI_FIXTURE: join(root, "tests/js/fixtures/keybindings.records") } }).toString();
    assert.deepEqual(plain(K.provider.sources.keybindings.parse(out, true)).length, binds.length);
    assert.throws(() => K.provider.sources.keybindings.parse("", false), /no keybinding records/);
    const ctx = { request: () => ({ state: "ready", value: binds }) };
    assert.equal(K.provider.resolve("keys:NO + SUCH", ctx, null), null);
  } finally { rmSync(t, { recursive: true, force: true }); }
});
