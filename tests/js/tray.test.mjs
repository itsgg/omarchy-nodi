// The tray's menus as rows (ROADMAP 58): providers/tray.js over the
// records components/Tray.qml reads.
import { test } from "node:test";
import assert from "node:assert/strict";
import { plain } from "./load.mjs";
import { run } from "./fixtures.mjs";

const tray = [
  { key: "tray:dropbox:Pause syncing", app: "Dropbox", text: "Pause syncing", path: "Pause syncing", icon: "image://qsimage/dropbox", checked: false },
  { key: "tray:dropbox:Preferences...", app: "Dropbox", text: "Preferences...", path: "Preferences...", icon: "", checked: false },
  { key: "tray:op:Lock", app: "1Password", text: "Lock", path: "Lock", icon: "/usr/share/icons/1p.png", checked: false },
  { key: "tray:op:Settings > Start at login", app: "1Password", text: "Start at login", path: "Settings > Start at login", icon: "", checked: true }
];
const mine = rows => rows.filter(r => r.provider === "tray");

test("an entry by its words or its app's, named with the app, Enter Nodi's own", () => {
  const p = mine(run("pause", { tray }))[0];
  assert.deepEqual([p.title, p.subtitle, p.nodi, p.key, p.remember], ["Dropbox: Pause syncing", "In Dropbox's tray menu", "tray", "tray:dropbox:Pause syncing", false]);
  assert.equal(p.image, "image://qsimage/dropbox", "the tray's own picture");
  assert.deepEqual(plain(mine(run("dropbox pause", { tray })).map(r => r.title)), ["Dropbox: Pause syncing"], "the app and the entry's words");
  assert.deepEqual(plain(mine(run("dropbox", { tray })).map(r => r.title)).sort(), ["Dropbox: Pause syncing", "Dropbox: Preferences..."]);
  assert.deepEqual(plain(mine(run("start at login", { tray })).map(r => [r.title, r.badge])), [["1Password: Settings > Start at login", "ON"]], "a submenu's entry, and its check");
  assert.deepEqual(plain(mine(run("settings start", { tray })).map(r => r.title)), ["1Password: Settings > Start at login"], "by the submenu's name too");
  assert.equal(mine(run("p", { tray })).length, 0, "one letter: none");
  assert.equal(mine(run("pause", {})).length, 0, "no tray read: none");
  assert.equal(mine(run("zzzz", { tray })).length, 0);
});

test("Ctrl+K offers nothing on a tray row: the menu is the app's", async () => {
  const { load } = await import("./load.mjs");
  const Rows = load("lib/Rows.js");
  assert.deepEqual(plain(Rows.actionsFor(mine(run("lock", { tray }))[0], {})), []);
});
