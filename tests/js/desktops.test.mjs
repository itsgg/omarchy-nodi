// Saved desktops (ROADMAP 60): which app is on which workspace, saved by a
// name in prefs.json, and opened again on their workspaces.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, mkdirSync, chmodSync, readFileSync, existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { load, plain } from "./load.mjs";
import { run, apps } from "./fixtures.mjs";

const D = load("providers/desktops.js");
const P = load("lib/Prefs.js");
const windows = [
  { address: "0x1", cls: "firefox", title: "Docs", workspace: "1", focus: 0 },
  { address: "0x2", cls: "firefox", title: "Mail", workspace: "1", focus: 1 },
  { address: "0x3", cls: "code", title: "nodi", workspace: "2", focus: 2 },
  { address: "0x4", cls: "Alacritty", title: "~", workspace: "special:scratch", focus: 3 },
  { address: "0x5", cls: "unknown-thing", title: "?", workspace: "3", focus: 4 }
];

test("save: the apps on the workspaces now, one an app and workspace, never a special one", () => {
  const row = run("save desktop Work", { windows, prefs: P.empty() }).find(r => r.provider === "desktops");
  assert.deepEqual([row.title, row.nodi], ["Save this desktop as \"Work\"", "saveDesktop"]);
  assert.deepEqual(plain(row.data), { name: "Work", apps: [{ id: "firefox", cls: "firefox", name: "Firefox", workspace: "1" },
                                                        { id: "code", cls: "code", name: "Visual Studio Code", workspace: "2" }] });
  assert.equal(row.subtitle, "Firefox on 1, Visual Studio Code on 2");
  const p = P.withDesktop(P.empty(), row.data.name, row.data.apps, 5);
  assert.equal(run("save desktop work", { windows, prefs: p }).find(r => r.provider === "desktops").title, "Replace desktop \"work\"", "a name in any case is the one saved");
  assert.equal(run("save desktop x", { windows: [], prefs: P.empty() }).find(r => r.provider === "desktops").title, "No app to save");
  assert.equal(run("save desktop " + "x".repeat(41), { windows, prefs: P.empty() }).find(r => r.provider === "desktops").title, "A desktop's name is up to 40 characters");
});

test("kept in prefs.json, round, junk and specials dropped", () => {
  const p = P.withDesktop(P.empty(), " Work ", [{ id: "firefox", cls: "firefox", name: "Firefox", workspace: "1" }, { id: "x", workspace: "special:s" }, { id: "../x", workspace: "2" }], 5);
  assert.deepEqual(plain(P.load(P.serialize(p)).desktops), [{ name: "Work", at: 5, apps: [{ id: "firefox", cls: "firefox", name: "Firefox", workspace: "1" }] }]);
  assert.equal(P.desktopFor(p, "WORK").name, "Work");
  assert.deepEqual(plain(P.withoutDesktop(p, "work").desktops), []);
  assert.equal(P.withDesktop(p, "empty", [], 1), null, "nothing to save");
  assert.deepEqual(plain(P.load("{}").desktops), [], "an older file has none");
});

test("open: by the desktop's name, its own or the word desktop; forget by its name", () => {
  const p = P.withDesktop(P.withDesktop(P.empty(), "Home", [{ id: "firefox", cls: "firefox", name: "Firefox", workspace: "1" }], 4),
                          "Work", [{ id: "firefox", cls: "firefox", name: "Firefox", workspace: "1" }], 5);
  const row = run("work", { prefs: p }).find(r => r.provider === "desktops");
  assert.equal(row.title, "Open desktop \"Work\"");
  assert.deepEqual(plain(row.run.args), ["Work"], "only its name: the apps are read when it runs (Sonnet 2026-10-06)");
  assert.equal(run("desktop", { prefs: p }).filter(r => r.provider === "desktops").length, 2);
  for (const q of ["wo", "open", "layout", "op"]) assert.ok(!run(q, { prefs: p }).some(r => r.title === "Open desktop \"Home\""), q + ": no wider word");
  const forget = run("forget desktop work", { prefs: p }).find(r => r.provider === "desktops");
  assert.deepEqual([forget.nodi, plain(forget.data)], ["forgetDesktop", { name: "Work" }]);
  assert.ok(!run("save desktop x", { windows: [{ address: "0x9", cls: "firefox", workspace: "code" }], prefs: P.empty() })[0].data, "a named workspace is not saved");
});

test("open reads the desktop as saved now, starts only what has no window, once, and says when it cannot", () => {
  const dir = mkdtempSync(join(tmpdir(), "nodi-desk-"));
  mkdirSync(join(dir, "bin"));
  mkdirSync(join(dir, ".local/state/nodi"), { recursive: true });
  const save = desktops => writeFileSync(join(dir, ".local/state/nodi/prefs.json"), JSON.stringify({ version: 1, desktops }));
  writeFileSync(join(dir, "bin/hyprctl"), '#!/bin/bash\nif [ "$1" = clients ]; then [ -n "$NOCLIENTS" ] && exit 1; printf \'[{"class":"firefox"}]\'; exit; fi\nprintf "%s\\n" "$2" >> "$HOME/dispatched"; [ -n "$REFUSE" ] && { echo "error: no"; exit 0; }; echo ok\n');
  chmodSync(join(dir, "bin/hyprctl"), 0o755);
  const sh = (name, more) => { try { execFileSync("/usr/bin/bash", ["-c", D.OPEN, "nodi", name], { env: { HOME: dir, PATH: join(dir, "bin") + ":/usr/bin", ...more }, stdio: ["ignore", "pipe", "pipe"] }); return 0; }
                               catch (e) { return [e.status, String(e.stderr).trim()]; } };
  const sent = () => existsSync(join(dir, "dispatched")) ? readFileSync(join(dir, "dispatched"), "utf8").trim().split("\n") : [];
  try {
    save([{ name: "Work", apps: [{ id: "firefox", cls: "firefox", workspace: "1" }, { id: "code", cls: "code", workspace: "2" },
                                 { id: "code", cls: "code", workspace: "3" }, { id: "Weird ]] 'app'", cls: "weird", workspace: "4" },
                                 { id: "nocls", cls: "", workspace: "5" }, { id: "back", cls: "a\\b", workspace: "6" }] }]);
    assert.equal(sh("work"), 0, "its name in any case");
    assert.deepEqual(sent(), ['hl.dsp.exec_cmd([[uwsm-app -- gtk-launch code.desktop]], { workspace = "2 silent" })',
      'hl.dsp.exec_cmd([[uwsm-app -- gtk-launch Weird\\ \\]\\]\\ \\\'app\\\'.desktop]], { workspace = "4 silent" })',
      'hl.dsp.exec_cmd([[uwsm-app -- gtk-launch nocls.desktop]], { workspace = "5 silent" })',
      'hl.dsp.exec_cmd([[uwsm-app -- gtk-launch back.desktop]], { workspace = "6 silent" })'],
      "firefox is open; code starts once, on its first workspace; an odd name quoted for the shell, which escapes each ] so no ]] can close the Lua bracket");
    assert.deepEqual(sh("gone"), [1, "no desktop named gone is saved"], "forgotten: nothing starts");
    assert.deepEqual(sh("work", { NOCLIENTS: "1" }), [1, "the open windows could not be read"], "no window list: nothing starts");
    assert.deepEqual(sh("work", { REFUSE: "1" }), [1, "error: no"]);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
