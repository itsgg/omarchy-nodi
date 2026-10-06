// Every Omarchy command as a row, and the run mode.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { load, root, plain } from "./load.mjs";
import { Engine, config, services } from "./fixtures.mjs";

const Omarchy = load("providers/omarchy.js");
const Run = load("lib/Run.js");
const commands = Omarchy.parse(readFileSync(join(root, "tests/js/fixtures/omarchy-commands.json"), "utf8"));
const run = q => Engine.run(q, config, services({ omarchyCommands: commands }));
const top = q => run(q)[0];

test("helpers Omarchy's scripts call are left out", () => {
  const routes = commands.map(c => c.route);
  assert.ok(!routes.includes("omarchy hw laptop") && !routes.includes("omarchy cmd present"), "helper groups");
  assert.ok(!routes.includes("omarchy power present") && !routes.includes("omarchy update available"), "exit-status probes");
  assert.ok(!routes.includes("omarchy network status") && !routes.includes("omarchy restart btop"), "what Omarchy says serves the shell or a theme switch");
  assert.ok(routes.includes("omarchy default editor"), "\"the editor used by\" is a person's command");
  assert.ok(routes.includes("omarchy agent") && routes.includes("omarchy capture text") && routes.includes("omarchy version"));
  assert.deepEqual(plain(Omarchy.parse("not json")), []);
});

test("the catalog sits under the menu", () => {
  // A menu that runs the screenshot command and has a submenu named Agent.
  const menu = { order: ["trigger.capture.screenshot", "agent"], items: {
    "trigger.capture.screenshot": { id: "trigger.capture.screenshot", parent: "root", kind: "action", label: "Screenshot", action: "omarchy-capture-screenshot smart", aliases: [], icon: "", iconFont: "", title: "", target: "", description: "", provider: "", when: "", checked: "" },
    "agent": { id: "agent", parent: "root", kind: "menu", label: "Agent", action: "", aliases: [], icon: "", iconFont: "", title: "", target: "", description: "", provider: "", when: "", checked: "" } }, when: {}, checked: {} };
  const withMenu = q => Engine.run(q, config, services({ omarchyCommands: commands, menu, toggleStates: {} }));
  assert.ok(!withMenu("screenshot").some(r => r.provider === "omarchy" && r.subtitle.startsWith("omarchy capture screenshot")), "a command the menu runs is left to the menu row");
  assert.ok(run("screenshot").some(r => r.provider === "omarchy" && r.subtitle.startsWith("omarchy capture screenshot")), "and is there without that menu");
  assert.ok(withMenu("omarchy screenshot").some(r => r.subtitle.startsWith("omarchy capture screenshot")), "the omarchy prefix shows it");
  const agent = withMenu("agent");
  assert.equal(agent[0].provider, "menu", "a submenu named as well wins");
  assert.equal(agent[1].provider, "omarchy");
});

test("a catalog route is named by whole words", () => {
  assert.ok(!run("aim").some(r => r.provider === "omarchy" && /mute/.test(r.title)), "no initials: aim is not audio input mute");
  assert.ok(!run("dio").some(r => r.provider === "omarchy"), "nothing inside a word");
  assert.equal(top("input mute").subtitle, "omarchy audio input mute");
});

test("installers answer only when asked, the destructive ask twice", () => {
  assert.ok(!run("chatgpt").some(r => r.provider === "omarchy"));
  assert.equal(run("install").filter(r => r.provider === "omarchy").length, 0);
  assert.equal(top("install chatgpt").subtitle, "omarchy install ai chatgpt");
  assert.equal(top("uninstall chatgpt").subtitle, "omarchy remove ai chatgpt");
  assert.equal(top("remove chatgpt").confirm, true);
  assert.equal(top("reinstall pkgs").confirm, true);
  assert.ok(!top("capture text").confirm);
});

test("what closes, removes or powers off asks twice, judged by Omarchy's words", () => {
  for (const q of ["close all", "omarchy reboot", "webapp remove all", "refresh sddm"]) assert.equal(top(q).confirm, true, q);
  assert.equal(top("close all").run.argv[0], "omarchy-hyprland-window-close-all");
  assert.ok(!top("omarchy version").confirm && !top("disk speedtest").confirm);
});

test("the omarchy prefix lists the whole catalog", () => {
  const all = run("omarchy ");
  assert.equal(all.length, commands.length);
  assert.ok(all.every(r => r.provider === "omarchy"));
  assert.equal(run("omarchy").filter(r => r.provider === "omarchy").length, 0, "the bare word is not the mode");
});

test("what prints opens where it can be read, and only the desktop's own run bare", () => {
  const v = top("omarchy version");
  assert.deepEqual(plain(v.run.argv), ["omarchy-launch-floating-terminal-with-presentation", "omarchy-version"]);
  assert.equal(top("disk speedtest").run.argv[0], "omarchy-launch-floating-terminal-with-presentation", "a benchmark's numbers are seen");
  assert.equal(top("plugin add").run.argv[0], "omarchy-launch-floating-terminal-with-presentation", "a bare run that prompts has a terminal");
  assert.deepEqual(plain(top("capture text").run.argv), ["omarchy-capture-text"], "a desktop action runs as it is");
  const pick = top("omarchy menu select");
  assert.equal(pick.run, null, "a bare positional is a required argument");
  assert.equal(pick.complete, "> omarchy menu select ");
});

test("found by route, summary and group; run as Omarchy's menu runs them", () => {
  const ocr = top("capture text");
  assert.equal(ocr.title, "Extract text from a screenshot region with OCR");
  assert.equal(ocr.subtitle, "omarchy capture text");
  assert.deepEqual(plain(ocr.run), { kind: "exec", argv: ["omarchy-capture-text"] });
  assert.equal(top("omarchy capture text").title, ocr.title, "the omarchy prefix is optional");
  assert.ok(run("ocr").some(r => r.subtitle === "omarchy capture text"), "found by its summary");
  const agent = top("agent");
  assert.equal(agent.subtitle, "omarchy agent [--inline] [--pick]");
  assert.deepEqual(plain(agent.run.argv), ["omarchy-agent"], "optional arguments are left off");
});

test("sudo and interactive commands open in Omarchy's floating terminal", () => {
  const upd = run("update").find(r => r.provider === "omarchy" && r.subtitle.startsWith("omarchy update"));
  assert.deepEqual(plain(upd.run.argv), ["omarchy-launch-floating-terminal-with-presentation", "omarchy-update"]);
  assert.equal(upd.badge, "sudo");
  assert.equal(upd.actionLabel, "Run in terminal");
  const sddm = top("refresh sddm");
  assert.equal(sddm.run.argv[0], "omarchy-launch-floating-terminal-with-presentation");
  assert.equal(Rows().actionsFor(sddm, {})[1].label, "Run without a terminal");
});

test("a command that needs an argument fills in the run mode", () => {
  // "theme set" alone is the theme picker's; the omarchy prefix reaches the command.
  assert.equal(top("theme set").provider, "system");
  const set = top("omarchy theme set");
  assert.equal(set.run, null);
  assert.equal(set.complete, "> omarchy theme set ");
  assert.equal(set.actionLabel, "Fill in");
  assert.equal(top("install app").complete, "> omarchy install app ");
});

test("the run mode runs a command line in a terminal, or without one", () => {
  const r = top("> htop");
  assert.equal(r.provider, "shell");
  assert.deepEqual(plain(r.run.argv), ["omarchy-launch-floating-terminal-with-presentation", "htop"]);
  assert.deepEqual(plain(r.actions[0].run), { kind: "shell", script: "htop" });
  assert.equal(r.remember, false, "a command line is not offered again from the home");
  assert.equal(run(">").length, 1);
  assert.equal((Engine.mode("> x", config) || {}).label, "Run");
  assert.ok(run("> capture text").every(x => x.provider === "shell"), "the run mode owns its query");
});

test("Omarchy's real command list parses", { skip: !existsSync("/usr/share/omarchy/bin/omarchy") }, () => {
  const out = execFileSync("/usr/share/omarchy/bin/omarchy", ["commands", "--json"], { env: { PATH: "/usr/share/omarchy/bin:/usr/bin:/bin", HOME: process.env.HOME, OMARCHY_PATH: "/usr/share/omarchy" }, timeout: 20000 }).toString();
  const all = Omarchy.parse(out);
  assert.ok(all.length > 250, "parsed " + all.length);
  assert.ok(all.every(c => /^omarchy-[a-z0-9-]+$/.test(c.binary)));
  for (const c of all) assert.equal(Run.problem(Omarchy.rowFor(c, "exact").run || Run.copy("x")), "", c.route);
});

function Rows() { return load("lib/Rows.js"); }
