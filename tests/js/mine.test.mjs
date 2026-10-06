// Everything you set, in one place (ROADMAP 75): "?mine".
import { test } from "node:test";
import assert from "node:assert/strict";
import { load, plain } from "./load.mjs";
import { Engine, config, services } from "./fixtures.mjs";

const P = load("lib/Prefs.js");
const History = load("lib/History.js");
const row = q => Engine.run(q, config, services({}))[0];
const snap = r => History.snapshot(r);

function prefs() {
  const ff = row("firefox"), term = row("alacritty"), sig = row("signal");
  let p = P.empty();
  p = P.withAlias(p, "ff", ff.key, snap(ff));
  p = P.withAlias(p, "web", ff.key, snap(ff));
  p = P.withHotkey(p, "SUPER + F", ff.key, snap(ff));
  p = P.toggledFavourite(p, term.key, snap(term));
  p = P.toggledFavourite(p, ff.key, snap(ff));
  p = P.withAlias(p, "sig", sig.key, snap(sig));
  p = P.hiddenRow(p, sig.key, snap(sig));
  return p;
}

test("?mine: each saved row once, what is set on it under it; the hidden apart, shown again by Enter", () => {
  const rows = Engine.run("?mine", config, services({ prefs: prefs() }));
  assert.deepEqual(plain(rows.map(r => [r.title, r.subtitle, r.group])), [
    ["Alacritty", "Favourite; Terminal", "Yours"],
    ["Firefox", "Favourite, alias ff, alias web, hotkey SUPER + F; Web Browser", "Yours"],
    ["Signal", "Hidden, alias sig; Messenger", "Hidden"]
  ]);
  assert.equal(rows[1].run.kind, "app", "Enter runs it");
  assert.deepEqual([rows[2].nodi, rows[2].actionLabel], ["show", "Show again"], "a hidden row: Enter shows it again");
  assert.equal(new Set(rows.map(r => r.key)).size, rows.length, "no row twice");
  // Saved from here (Ctrl+K, or Enter into history), a row keeps its own
  // words, never what ?mine says of it (Sonnet 2026-10-06).
  assert.deepEqual(plain([History.snapshot(rows[1]).subtitle, History.snapshot(rows[1]).group]), ["Web Browser", "Apps"]);
  assert.equal(History.snapshot(rows[2]).subtitle, "Messenger");
});

test("?mine: its line in help counts what there is; nothing set says how", () => {
  const help = Engine.run("?", config, services({ prefs: prefs() })).find(r => r.title === "Yours");
  assert.equal(help.subtitle, "3 aliases, 1 hotkey, 2 favourites, 1 hidden");
  assert.equal(help.complete, "?mine");
  const none = Engine.run("?mine", config, services({ prefs: P.empty() }));
  assert.deepEqual(plain(none.map(r => r.title)), ["Nothing set yet"]);
  assert.equal(Engine.mode("?mine", config).label, "Help: Yours");
  assert.ok(Engine.run("aliases", config, services({})).some(r => r.title === "Yours" && r.complete === "?mine"), "found by the words for it");
  for (const q of ["?mi", "?hidden", "?yours"])
    assert.ok(Engine.run(q, config, services({ prefs: prefs() })).some(r => r.complete === "?mine"), q + " finds it");
  const topics = Engine.run("?", config, services({})).map(r => r.title);
  assert.deepEqual(plain(topics.slice(0, 2)), ["Keys", "Yours"], "second in help, after the keys");
});
