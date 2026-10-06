// Omarchy's menu tree: reading, merging, guards, and how its rows rank
// against apps and answers.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, rmSync, mkdtempSync, writeFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { load, root, plain } from "./load.mjs";
import { config, run, top, apps } from "./fixtures.mjs";

const Menu = load("lib/Menu.js");
const fixture = name => readFileSync(join(root, "tests/js/fixtures", name), "utf8");

const merged = Menu.merge([Menu.parseItems(fixture("menu.jsonc")), Menu.parseItems(fixture("user-menu.jsonc"))]);

// The guards of the fixture, evaluated as the shell would: hibernate's
// `false` hides it, the DNS and browser `checked:` mark the current choice.
function guarded() {
  const script = Menu.guardScript(merged);
  const out = execFileSync("bash", ["-c", script], { env: { PATH: "/usr/bin:/bin", HOME: "/nonexistent" } }).toString();
  return Menu.parseGuards(out, merged);
}

const guards = guarded();
const menu = { items: merged.items, order: merged.order, when: guards.when, checked: guards.checked };
const withMenu = extra => Object.assign({ menu, toggleStates: {} }, extra || {});

test("files merge by id, user over default, tree from dotted ids", () => {
  assert.equal(merged.items["system.lock"].label, "Lock Screen", "the user's label wins");
  assert.equal(merged.items["system.lock"].action, "omarchy-system-lock", "and the default's action stays");
  assert.equal(merged.items["notes.today"].parent, "notes");
  assert.equal(Menu.breadcrumb(merged.items, "setup.network.dns.dhcp"), "Setup > Network > DNS");
  assert.equal(merged.items["style.font"].kind, "menu");
  assert.equal(merged.order[0], "apps");
});

test("a file that does not parse adds nothing", () => {
  assert.equal(Menu.parseItems("{ not json").length, 0);
  assert.equal(Menu.parseItems("").length, 0);
});

test("guards: one batch, ids never in the script", () => {
  const script = Menu.guardScript(merged);
  assert.ok(!script.includes("notes.odd"), "an id never reaches the script");
  rmSync("/tmp/nodi-pwned", { force: true });
  guarded();
  assert.ok(!existsSync("/tmp/nodi-pwned"));
  assert.equal(guards.when["system.hibernate"], false);
  assert.equal(guards.when["install.editor.zed"], true);
  assert.equal(guards.checked["setup.network.dns.dhcp"], true);
  assert.equal(guards.checked["setup.network.dns.cloudflare"], false);
  assert.equal(Menu.visible(merged.items, "system.hibernate", guards.when), false);
});

test("menu rows: found by label, alias, place, and toggles named by what they do", () => {
  assert.equal(top("screenshot", withMenu()).title, "Screenshot");
  assert.equal(top("lock", withMenu()).title, "Lock Screen");
  // "lo" names Lock Screen and LocalSend alike; what he picks decides (learning).
  assert.ok(run("lo", withMenu()).slice(0, 3).some(r => r.title === "Lock Screen"));
  assert.equal(top("dns", withMenu()).title, "DNS");
  const dns = run("dns", withMenu());
  const dhcp = dns.find(r => r.title === "DHCP");
  assert.equal(dhcp.badge, "Current"); assert.equal(dhcp.subtitle, "Setup > Network > DNS");
  assert.equal(dns.find(r => r.title === "Cloudflare").badge, "");
  assert.equal(top("dnd", withMenu()).title, "Notifications");
  assert.equal(top("caffeine", withMenu()).title, "Stay Awake");
  assert.ok(run("settings", withMenu()).some(r => r.title === "Monitors"), "Setup's alias reaches its rows");
  const settingsApp = [{ id: "system-config-printer", name: "Print Settings", generic: "", comment: "", keywords: [], icon: "", wmclass: "", actions: [] }];
  assert.equal(top("settings", withMenu({ apps: settingsApp })).title, "Setup", "an exact alias outranks an app that merely contains the word");
  assert.equal(top("restart shell", withMenu()).title, "Shell");
  assert.ok(!run("hibernate", withMenu()).some(r => r.title === "Hibernate"), "a failed when: hides the row");
});

test("a submenu or a provider list opens Omarchy's menu there", () => {
  const font = run("font", withMenu()).find(r => r.title === "Font");
  assert.deepEqual(plain(font.run), { kind: "exec", argv: ["omarchy-menu", "summon", "style.font"] });
  assert.equal(font.actionLabel, "Open menu");
  const action = top("monitors", withMenu());
  assert.deepEqual(plain(action.run), { kind: "shell", script: "omarchy-launch-config-editor \"$HOME/.config/hypr/monitors.lua\"" });
});

test("power rows ask twice", () => {
  assert.equal(top("shutdown", withMenu()).confirm, true);
  assert.equal(top("lock", withMenu()).confirm, false);
});

test("an app query never lands on a setting", () => {
  const f = run("firefox", withMenu({ apps }));
  assert.equal(f[0].title, "Firefox"); assert.equal(f[0].run.kind, "app");
  const pick = top("default browser firefox", withMenu({ apps }));
  assert.equal(pick.title, "Firefox"); assert.equal(pick.run.kind, "shell");
});

test("installers answer only when asked", () => {
  assert.ok(!run("zed", withMenu()).some(r => r.title === "Zed"));
  const z = top("install zed", withMenu());
  assert.equal(z.title, "Zed"); assert.equal(z.subtitle, "Install > Editor");
  assert.equal(top("remove zed", withMenu()).subtitle, "Remove > Editor");
  // The word alone: its submenu first, then what is in it (2026-10-06:
  // it answered nothing but the web's searches); the submenu by the start
  // of its name too.
  const alone = run("install", withMenu()).filter(r => r.provider === "menu");
  assert.equal(alone[0].key, "menu:install");
  assert.ok(alone.length > 1 && alone.slice(1).every(r => r.subtitle.startsWith("Install")), alone.map(r => r.subtitle).join());
  assert.equal(run("instal", withMenu()).find(r => r.provider === "menu").key, "menu:install");
  assert.equal(run("uninstall", withMenu()).find(r => r.provider === "menu").key, "menu:remove", "uninstall is Remove's word");
  assert.ok(!run("inst", withMenu()).some(r => r.title === "Zed"), "the submenu answers, its installers do not");
  // Each word sees only its own tree, the package-free installers included.
  const where = q => run(q, withMenu()).filter(r => r.provider === "menu").map(r => r.subtitle);
  assert.ok(where("install web").length > 0 && where("install web").every(s => s.startsWith("Install")), where("install web").join());
  assert.ok(where("remove web").length > 0 && where("remove web").every(s => s.startsWith("Remove")), where("remove web").join());
  assert.ok(where("install zed").every(s => !s.startsWith("Remove")));
  assert.ok(where("web app").every(s => s === "Install" || s === "Remove"), "without the word, only the package-free ones");
});

test("a guard that exits ends itself, not the batch", () => {
  const m = Menu.merge([Menu.parseItems('{ "a": {"label":"A","when":"exit 0"}, "b": {"label":"B","when":"false"}, "c": {"label":"C","checked":"exit 1"} }')]);
  const out = execFileSync("bash", ["-c", Menu.guardScript(m)], { env: { PATH: "/usr/bin:/bin", HOME: "/nonexistent" } }).toString();
  const g = Menu.parseGuards(out, m);
  assert.equal(g.when.a, true); assert.equal(g.when.b, false); assert.equal(g.checked.c, false);
});

test("a menu id may be any string, a prototype name too", () => {
  const m = Menu.merge([Menu.parseItems('{ "constructor": {"label":"Ctor","action":"true"}, "toString": {"label":"Str","action":"true"}, "__proto__": {"label":"Proto","action":"true"} }')]);
  assert.deepEqual(plain(m.order), ["constructor", "toString", "__proto__"]);
  assert.equal(m.items.constructor.label, "Ctor"); assert.equal(m.items["__proto__"].label, "Proto");
  assert.equal(m.items.toString.action, "true");
  const g = Menu.parseGuards("", m);
  assert.equal(g.when.constructor, undefined, "an unanswered guard is not a function");
  const menu2 = { items: m.items, order: m.order, when: g.when, checked: g.checked };
  const ctor = run("ctor", { menu: menu2, toggleStates: {} }).find(r => r.title === "Ctor");
  assert.ok(ctor && !ctor.confirm, "no confirm borrowed from Object.prototype");
});

test("toggle rows carry their state", () => {
  const states = { "window-gaps": { on: false, value: "0" }, "workspace-layout": { on: null, value: "scrolling" }, notifications: { on: true, value: "1" } };
  const gaps = top("gaps", withMenu({ toggleStates: states }));
  assert.equal(gaps.title, "Window Gaps"); assert.equal(gaps.badge, "OFF"); assert.equal(gaps.toggle, "window-gaps"); assert.equal(gaps.actionLabel, "Toggle");
  assert.equal(top("workspace layout", withMenu({ toggleStates: states })).badge, "Scrolling");
  const n = top("notifications", withMenu({ toggleStates: states }));
  assert.equal(n.badge, "ON"); assert.equal(n.badgeTone, "on");
  assert.equal(top("gaps", withMenu()).badge, "", "an unknown state shows no badge");
});

test("Omarchy's real menu parses, and its guards run in one batch", { skip: !existsSync("/usr/share/omarchy/default/omarchy/omarchy-menu.jsonc") }, () => {
  const real = Menu.merge([Menu.parseItems(readFileSync("/usr/share/omarchy/default/omarchy/omarchy-menu.jsonc", "utf8"))]);
  assert.ok(real.order.length > 200, "read " + real.order.length + " items");
  for (const id of ["system.shutdown", "trigger.toggle.window-gaps", "setup.network.dns", "style.font", "update.process.shell"]) assert.ok(real.items[id], id);
  const cache = mkdtempSync(join(tmpdir(), "nodi-cache-"));
  let out;
  try {
    out = execFileSync("bash", ["-c", Menu.guardScript(real)], { env: { PATH: "/usr/share/omarchy/bin:/usr/bin:/bin", HOME: process.env.HOME, XDG_CACHE_HOME: cache, OMARCHY_PATH: "/usr/share/omarchy" }, timeout: 20000 }).toString();
  } finally { rmSync(cache, { recursive: true, force: true }); }
  const g = Menu.parseGuards(out, real);
  assert.ok(Object.keys(g.when).length > 50, "answered " + Object.keys(g.when).length + " when: guards");
  assert.ok(Object.values(g.checked).filter(Boolean).length >= 1, "at least one current choice is marked");
});

test("guards: the package list is kept until the package database changes, the readers run side by side", () => {
  const dir = mkdtempSync(join(tmpdir(), "nodi-guards-"));
  try {
    const bin = join(dir, "bin"), cache = join(dir, "cache");
    rmSync(bin, { recursive: true, force: true });
    execFileSync("mkdir", ["-p", bin]);
    const pacman = answer => writeFileSync(join(bin, "pacman"), answer
      ? '#!/bin/bash\ncase "$1" in -Qq) echo gvim;; -Qi) printf "Name : gvim\\nProvides : vim=9.1 vi\\n";; *) exit 1;; esac\n'
      : "#!/bin/bash\nexit 1\n", { mode: 0o755 });
    writeFileSync(join(bin, "omarchy-dns"), "#!/bin/bash\nsleep 0.4; echo Cloudflare\n", { mode: 0o755 });
    writeFileSync(join(bin, "omarchy-default-browser"), "#!/bin/bash\nsleep 0.4; echo chromium\n", { mode: 0o755 });
    writeFileSync(join(bin, "omarchy-default-terminal"), "#!/bin/bash\nsleep 0.4; echo foot\n", { mode: 0o755 });
    const m = Menu.merge([Menu.parseItems(JSON.stringify({
      vim: { label: "Vim", when: "omarchy-pkg-present vim", action: "true" },
      dns: { label: "DNS", checked: '[[ "$(omarchy-dns)" == "Cloudflare" ]]', action: "true" },
      web: { label: "Web", checked: '[[ "$(omarchy-default-browser)" == "chromium" ]]', action: "true" },
      term: { label: "Term", checked: '[[ "$(omarchy-default-terminal)" == "foot" ]]', action: "true" }
    }))]);
    const runGuards = () => {
      const started = Date.now();
      const out = execFileSync("bash", ["-c", Menu.guardScript(m)], { env: { PATH: bin + ":/usr/bin:/bin", HOME: dir, XDG_CACHE_HOME: cache } }).toString();
      return { g: Menu.parseGuards(out, m), ms: Date.now() - started };
    };
    pacman(true);
    const first = runGuards();
    assert.equal(first.g.when.vim, true, "vim is provided by gvim");
    assert.equal(first.g.checked.dns, true); assert.equal(first.g.checked.web, true);
    assert.equal(first.g.checked.term, true);
    assert.ok(first.ms < 1000, "three 0.4 s readers, one after another at least 1.2 s, took " + first.ms + " ms");
    assert.equal(readdirSync(join(cache, "nodi")).filter(f => f.startsWith("packages-")).length, 1);
    pacman(false);
    assert.equal(runGuards().g.when.vim, true, "the second run reads the kept list, not pacman");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
