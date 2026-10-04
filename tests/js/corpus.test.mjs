// A corpus of queries through every provider at once: no provider throws, no
// row carries a run the contract rejects, and every Ctrl+K action is
// runnable. Normalize drops a bad run with a warning, so any warning fails.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { load, root, warnings } from "./load.mjs";
import { Engine, config, services, windows } from "./fixtures.mjs";

const Run = load("lib/Run.js");
const Rows = load("lib/Rows.js");
const Menu = load("lib/Menu.js");

const merged = Menu.merge([Menu.parseItems(readFileSync(join(root, "tests/js/fixtures/menu.jsonc"), "utf8"))]);
const full = services({
  windows, activeWorkspace: 2,
  menu: { items: merged.items, order: merged.order, when: {}, checked: {} },
  toggleStates: { "window-gaps": { on: true, value: "1" }, volume: { on: null, value: "30" } },
  themes: { current: "Nord", list: [{ name: "Nord", preview: "" }, { name: "Gruvbox", preview: "" }] },
  clipboard: [{ type: "text", text: "hello" }, { type: "image", path: "/tmp/a.png", mime: "image/png" }],
  files: [{ path: "/home/u/a.txt", name: "a.txt" }],
  directory: { path: "/home/u", entries: [{ name: "Downloads", dir: true }, { name: "x.txt", dir: false }] }
});

const QUERIES = [
  "a", "b", "f", "w", "s", "lo", "lock", "brave", "firefox", "term", "vsc", "frfx", "settings", "setup", "dns", "font", "theme", "theme nord",
  "themes gr", "gaps", "dnd", "caffeine", "bluetooth", "wifi", "mic", "sound", "volume", "vol 50", "vol +5", "vol -200", "vol mute",
  "bright", "brightness 70", "bright -10", "bright off", "remind", "remind 10 tea", "remind me in 2h to stretch", "reminders", "reminders clear",
  "shutdown", "reboot", "install zed", "remove", "uninstall x", "screenshot", "screenshot region", "record", "reload hyprland",
  ":fire", ":", "emoji party", "kill", "kill chrome", "kill -9 node", "cb", "cb hello", "cb clear", "f ", "f a", "recent", "~/", "~/Do", "/",
  "uuid", "b64 hello", "b64 aGVsbG8=", "epoch", "epoch 1790000000", "#abc", "rgb(1,2,3)", "2+2", "15% of 200", "100 usd to eur", "$5",
  "5 km to mi", "72f", "time", "time in tokyo", "3pm to tokyo", "days until dec 25", "next friday", "g cats", "g", "yt x", "?", "?units", "?money",
  "w ", "w git", "netflix", "restart shell", "default browser firefox", "toggle", "trigger", "capture", "monitors", "hibernate"
];

test("every row from every query is well formed", () => {
  warnings.length = 0;
  let rows = 0, runs = 0, actions = 0;
  for (const q of QUERIES) {
    const result = Engine.run(q, config, full);
    for (const row of result) {
      rows++;
      assert.equal(typeof row.title, "string", q);
      assert.equal(typeof row.key, "string", q);
      if (row.run) { runs++; assert.equal(Run.problem(row.run), "", `${q}: ${row.title}`); assert.ok(Run.command(row.run, () => ["x"]), `${q}: ${row.title}`); }
      for (const a of Rows.actionsFor(row, { activeWorkspace: 2 })) { actions++; assert.equal(Run.problem(a.run), "", `${q}: ${row.title}: ${a.label}`); }
    }
    Engine.mode(q, config);
  }
  assert.deepEqual(warnings.slice(), [], "no provider failed and no run was dropped");
  assert.ok(rows > 200 && runs > 150 && actions > 400, `${rows} rows, ${runs} runs, ${actions} actions`);
});
