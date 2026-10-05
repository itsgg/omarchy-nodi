// Golden queries: the row a person means comes first. Run against Omarchy's
// real menu and its real command list when it is installed, with apps whose
// names and keywords collide with them (taken from real desktop files), and
// a user menu entry whose description mentions "today". Each case is one the 2026-10-02 holistic
// review found ranked wrong on this machine.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { load, root, plain } from "./load.mjs";
import { Engine, config, services } from "./fixtures.mjs";

const Menu = load("lib/Menu.js");
const OmarchyCommands = load("providers/omarchy.js");
const REAL_MENU = "/usr/share/omarchy/default/omarchy/omarchy-menu.jsonc";
const OMARCHY = "/usr/share/omarchy/bin/omarchy";
const Sources = load("lib/Sources.js");
const RECORDS = (() => { try { return execFileSync("bash", ["-c", 'ls -t "$HOME/.cache/omarchy"/keybindings-*.records 2>/dev/null | head -1']).toString().trim(); } catch { return ""; } })();
const keybindings = RECORDS ? Sources.keybindings(readFileSync(RECORDS, "utf8")) : [];
const omarchyCommands = existsSync(OMARCHY) ? OmarchyCommands.parse(execFileSync(OMARCHY, ["commands", "--json"],
  { env: { PATH: "/usr/share/omarchy/bin:/usr/bin:/bin", HOME: process.env.HOME, OMARCHY_PATH: "/usr/share/omarchy" }, timeout: 20000 }).toString()) : [];
const apps = JSON.parse(readFileSync(join(root, "tests/js/fixtures/apps.json"), "utf8"));

const USER_MENU = `{
  "notes": {"label":"Notes"},
  "notes.journal": {"label":"Journal a line","description":"One line into today's journal","action":"true"}
}`;

function world() {
  const merged = Menu.merge([Menu.parseItems(readFileSync(REAL_MENU, "utf8")), Menu.parseItems(USER_MENU)]);
  // Guards as they evaluate on a laptop with none of the optional software:
  // every `when:` true, no `checked:` true. Ranking must not depend on them.
  const when = {};
  for (const id of merged.order) if (merged.items[id].when) when[id] = true;
  return services({
    // No history: the table alone must rank these right.
    apps, history: {}, omarchyCommands, keybindings,
    menu: { items: merged.items, order: merged.order, when, checked: {} },
    toggleStates: { bluetooth: { on: true, value: "1" } }
  });
}

// [query, what the first row must be, why]
const GOLDEN = [
  ["aud", r => r.title === "Audacity", "an app named by its prefix, not Update > Hardware > Audio (which restarts audio)"],
  ["pass", r => r.title === "1Password", "the password manager, not Passwordless Sudo"],
  ["term", r => r.title === "Foot", "the terminal app, not the Defaults > Terminal submenu"],
  ["time", r => r.provider === "time", "the world clock, not Update > Time"],
  ["2+2", r => r.title === "4" && r.hero, "a sum, with its answer large"],
  ["3+3", r => r.title === "6" && r.hero, "not Blender by its 3d keyword"],
  ["calc", r => r.title === "LibreOffice Calc", "the app named Calc, not a hint"],
  ["calculator", r => r.title === "Omacalc", "the calculator app, not the hint that fills in a sum"],
  ["update", r => r.run && r.run.kind !== "exec" || (r.run && r.run.argv && r.run.argv[0] !== "omarchy-menu"), "an update that runs, not the Update submenu"],
  ["today", r => r.provider === "time", "today's date, not a user menu row by its description"],
  ["lock screen", r => /^Lock/.test(r.title) && r.provider === "menu", "Omarchy's Lock"],
  ["log out", r => r.title === "Logout", "Omarchy's Logout"],
  ["power off", r => r.title === "Shutdown", "Omarchy's Shutdown, not LibreOffice Impress"],
  ["sleep", r => r.title === "Suspend", "Omarchy's Suspend, not the toggle that hides it"],
  ["screnshot", r => r.title === "Screenshot", "a typo still finds it"],
  ["bluetoth", r => r.title === "Bluetooth", "a typo still finds it"],
  ["firefox", (r, rows) => !rows.some(x => x.provider === "menu" && x.kind === "setting"), "a browser name never lands on a default-browser setting"],
  ["settings", r => r.provider === "menu", "Omarchy's settings, not Nodi's own"],
  ["nodi settings", r => r.title === "Nodi settings", "Nodi's own settings when named"]
];

test("golden queries: the meant row comes first", { skip: !existsSync(REAL_MENU) }, () => {
  const svc = world();
  const failures = [];
  for (const [q, ok, why] of GOLDEN) {
    const rows = Engine.run(q, config, svc);
    const top = rows[0];
    if (!(ok.length > 1 ? ok(top, rows) : top && ok(top))) failures.push(`${JSON.stringify(q)}: ${why}; got ${top ? top.provider + ": " + top.title : "nothing"}`);
  }
  assert.deepEqual(failures, []);
});

test("learning: a row picked for a query comes first for it after two picks", { skip: !existsSync(REAL_MENU) }, () => {
  const svc = world();
  const now = svc.now().getTime();
  const Hist = load("lib/History.js");
  for (const q of ["sound", "term", "screen"]) {
    const before = Engine.run(q, config, svc);
    const second = before[1];
    assert.ok(second, q + " has a second row");
    // One pick is worth a kind or a tier gap; two pass an app named well.
    svc.picks = Hist.pick(Hist.pick({}, q, second.key, now), q, second.key, now);
    assert.equal(Engine.run(q, config, svc)[0].key, second.key, q + ": after two picks of " + second.title);
    svc.picks = {};
    assert.equal(Engine.run(q, config, svc)[0].key, before[0].key, q + ": reset puts it back");
  }
});

test("a group named like an Object method still groups, and a hidden favourite does not lengthen Recent", () => {
  assert.equal(Engine.group([{ group: "constructor", title: "x" }, { group: "toString", title: "y" }]).length, 2);
  const P = load("lib/Prefs.js");
  const snapOf = (id) => ({ title: id, subtitle: "", icon: "", run: { kind: "app", id }, confirm: false });
  let prefs = P.toggledFavourite(P.empty(), "app:fav", snapOf("fav"));
  prefs = P.hiddenRow(prefs, "app:fav", snapOf("fav"));
  assert.ok(P.isFavourite(prefs, "app:fav") && P.isHidden(prefs, "app:fav"));
  const history = {};
  for (let i = 0; i < 12; i++) history["app:a" + i] = { n: 12 - i, t: Date.now(), s: snapOf("a" + i) };
  const rows = Engine.home(config, services({ history, prefs, reminders: [] }));
  assert.equal(rows.filter(r => r.group === "Recent").length, 8, "eight recent rows, the hidden favourite not counted");
});

test("a group leads by three rows at most before a stronger row of another group (ROADMAP 39)", () => {
  const r = (key, group, score) => ({ key, group, score, provider: "x", providerName: group });
  // Sorted best first, as the search path sorts them before grouping.
  const rows = [r("m1", "Menu", 90), r("m2", "Menu", 80), r("m3", "Menu", 70), r("a1", "Apps", 65), r("m4", "Menu", 60), r("m5", "Menu", 50), r("a2", "Apps", 40)];
  const led = plain(Engine.group(rows.map(x => Object.assign({}, x)), 3));
  assert.deepEqual(led.map(x => x.key), ["m1", "m2", "m3", "a1", "a2", "m4", "m5"], "the fourth menu row waits for the stronger app");
  assert.deepEqual(led.map(x => x.section), ["Menu", "", "", "Apps", "", "Menu", ""], "each run under its header, the menu's twice");
  const whole = plain(Engine.group(rows.map(x => Object.assign({}, x))));
  assert.deepEqual(whole.map(x => x.key), ["m1", "m2", "m3", "m4", "m5", "a1", "a2"], "without a lead, each group whole as before (help, the home view)");
  const tail = plain(Engine.group([r("m1", "Menu", 90), r("m2", "Menu", 80), r("m3", "Menu", 70), r("a1", "Apps", 65), r("a2", "Apps", 55), r("m4", "Menu", 50)], 3));
  assert.deepEqual(tail.map(x => x.key + ":" + x.section), ["m1:Menu", "m2:", "m3:", "a1:Apps", "a2:", "m4:Menu"], "a tail of one row under its own header, not the apps' (Fable 2026-10-05)");
  const lone = plain(Engine.group([r("m1", "Menu", 90), r("m2", "Menu", 80), r("x1", "Other", 70)], 3));
  assert.equal(lone[2].section, "", "a group of one row still has no header");
  const weak = [r("m1", "Menu", 90), r("m2", "Menu", 80), r("m3", "Menu", 70), r("m4", "Menu", 60), r("a1", "Apps", 55)];
  assert.deepEqual(plain(Engine.group(weak.map(x => Object.assign({}, x)), 3)).map(x => x.key), ["m1", "m2", "m3", "m4", "a1"], "no stronger row: the group goes on");
});
