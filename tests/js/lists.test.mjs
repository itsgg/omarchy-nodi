// The menu's own lists as rows: fonts and power profiles, the current one
// marked, set with the command Omarchy's menu runs.

import { test } from "node:test";
import assert from "node:assert/strict";
import { load, plain } from "./load.mjs";
import { run, top } from "./fixtures.mjs";

const L = load("providers/lists.js");
const fonts = { current: "JetBrainsMono Nerd Font", list: ["Adwaita Mono", "iA Writer Mono S", "JetBrainsMono Nerd Font"] };
const powerProfiles = { current: "balanced", list: ["power-saver", "balanced", "performance"] };

test("a list reads as its current entry and its names", () => {
  assert.deepEqual(plain(L.parseList("@current\tbalanced\npower-saver\nbalanced\n\nperformance\n", true)), { current: "balanced", list: ["power-saver", "balanced", "performance"] });
  assert.throws(() => L.parseList("", false));
});

test("fonts: every one, or those named so, the current marked, set as the menu sets it", () => {
  const all = run("font ", { fonts });
  assert.deepEqual(plain(all.map(r => r.title)), ["JetBrainsMono Nerd Font", "Adwaita Mono", "iA Writer Mono S"], "the current first");
  assert.equal(all[0].badge, "Current");
  assert.deepEqual(plain(top("font writer", { fonts }).run), { kind: "exec", argv: ["omarchy-font-set", "iA Writer Mono S"] });
  assert.ok(!run("font zzz", { fonts }).some(r => r.provider === "lists"), "no font of that name: the rest of Nodi answers");
  assert.equal(top("font ", {}).title, "Reading fonts...");
});

test("power profiles: by name, the current marked, set as the menu sets it", () => {
  const p = run("performance", { powerProfiles }).find(r => r.key === "power-profile:performance");
  assert.ok(p, "performance finds the profile");
  assert.deepEqual(plain(p.run), { kind: "exec", argv: ["omarchy-powerprofiles-set", "autodetect", "performance"] });
  const listed = run("power profile", { powerProfiles }).filter(r => r.key && r.key.indexOf("power-profile:") === 0);
  assert.equal(listed.length, 3);
  assert.equal(listed.find(r => r.title === "Balanced").badge, "Current");
  assert.equal(top("power saver", { powerProfiles }).title, "Power saver");
  assert.equal(run("performance", {}).find(r => r.provider === "lists").title, "Reading power profiles...", "named before the list landed");
  const custom = { current: "balanced", list: ["balanced", "quiet"] };
  assert.ok(run("quiet", { powerProfiles: custom }).some(r => r.key === "power-profile:quiet"), "a fourth profile by its own name, once read");
});

test("only a query that names a profile reads them", () => {
  const asked = [];
  run("firefox", { asked }); run("lock screen", { asked }); run("2+2", { asked });
  assert.ok(!asked.includes("power-profiles"), asked.join());
  run("balanced", { asked });
  assert.ok(asked.includes("power-profiles"));
});
