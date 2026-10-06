// The window the bar opened over, and captures that come back to the bar
// (ROADMAP 59): providers/here.js, its rows and its scripts, run with stub
// commands in a home of their own.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { mkdtempSync, writeFileSync, mkdirSync, chmodSync, readFileSync, existsSync, rmSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { load, plain } from "./load.mjs";
import { run } from "./fixtures.mjs";

const H = load("providers/here.js");
const window = { address: "0xabc", class: "chromium", title: "Docs", pid: "4242", workspace: "2", stableId: "1a2b" };
const extra = more => Object.assign({ window, pluginId: "io.github.itsgg.nodi" }, more || {});
const mine = rows => rows.filter(r => r.provider === "here");

test("its text and a screenshot of it, by their words, with the window's own handle", () => {
  const t = mine(run("text", extra())).find(r => r.key === "here:text");
  assert.match(t.title, /^Copy the text in /);
  assert.deepEqual(plain(t.run.args), ["1a2b", "io.github.itsgg.nodi"]);
  assert.match(t.run.script, /grim -T "\$1" "\$f"/);
  const s = mine(run("screenshot window", extra())).find(r => r.key === "here:shot");
  assert.match(s.title, /^Screenshot /);
  assert.equal(s.run.args[0], "1a2b");
  const own = rows => rows.filter(r => /^here:/.test(r.key));
  assert.equal(own(run("text", extra({ window: Object.assign({}, window, { stableId: "" }) }))).length, 0, "no handle: no capture");
  assert.equal(own(run("text", extra({ window: {} }))).length, 0, "no window: none");
  assert.equal(own(run("t", extra())).length, 0, "one letter: none");
});

test("its folder in Files when a shell runs in it, by its path from home", () => {
  const f = mine(run("files", extra({ windowCwd: "/home/u/Work/GG" }))).find(r => r.key === "here:files");
  assert.deepEqual([f.title, plain(f.run)], ["Open ~/Work/GG in Files", { kind: "open", target: "/home/u/Work/GG" }]);
  assert.ok(!mine(run("files", extra({ windowCwd: "" }))).some(r => r.key === "here:files"), "no shell in it: none");
  const asked = [];
  run("files", extra({ asked }));
  assert.ok(asked.includes("window-cwd:4242"), "asked by the window's pid");
});

test("move 3 moves it to workspace 3, and nothing else answers it", () => {
  for (const q of ["move 3", "move to 3", "move to workspace 3", "move it to 3"]) {
    const rows = mine(run(q, extra())).filter(r => /^here:move/.test(r.key));
    assert.equal(rows.length, 1, q);
    assert.deepEqual(plain(rows[0].run.args), ['hl.dsp.window.move({ window = "address:0xabc", workspace = "3", follow = false })'], q);
  }
  const moves = rows => rows.filter(r => /^here:move/.test(r.key));
  assert.equal(moves(run("move 123", extra())).length, 0, "two digits at most");
  assert.equal(moves(run("move 0", extra())).length, 0, "there is no workspace 0");
  assert.equal(moves(run("move 3", extra({ window: Object.assign({}, window, { address: "0xzz\\" }) }))).length, 0, "a bad address: none");
});

test("two captures that end in the bar, offered any time", () => {
  const r = run("region text", {}).find(x => x.title === "Text from a region");
  assert.deepEqual(plain(r.run.args), ["io.github.itsgg.nodi"]);
  assert.ok(run("colour picker", {}).some(x => x.title === "Pick a colour"));
});

// The scripts with stub programs that record how they were called.
function home(stubs) {
  const dir = mkdtempSync(join(tmpdir(), "nodi-here-"));
  mkdirSync(join(dir, "bin"));
  for (const [name, body] of Object.entries(stubs)) {
    writeFileSync(join(dir, "bin", name), "#!/bin/bash\n" + body + "\n");
    chmodSync(join(dir, "bin", name), 0o755);
  }
  const sh = (script, args) => {
    try { return { out: execFileSync("/usr/bin/bash", ["-c", script, "nodi", ...args], { env: { HOME: dir, PATH: join(dir, "bin") + ":/usr/bin" }, stdio: ["ignore", "pipe", "pipe"] }).toString(), code: 0 }; }
    catch (e) { return { out: String(e.stdout || ""), err: String(e.stderr || ""), code: e.status }; }
  };
  const log = name => existsSync(join(dir, name)) ? readFileSync(join(dir, name), "utf8") : "";
  return { dir, sh, log };
}

test("its text: read, copied, and the bar again; no text says so", () => {
  const h = home({ grim: '[ -n "$GRIM_FAILS" ] && exit 1; printf PNG > "$3"', tesseract: '[ -n "$TESS_FAILS" ] && exit 1; [ -s "$1" ] && printf "%s" "$OCR"',
                   "wl-copy": 'cat > "$HOME/copied"', "omarchy-shell": 'printf "%s|" "$@" > "$HOME/summoned"' });
  const sh = more => { try { execFileSync("/usr/bin/bash", ["-c", H.TEXT, "nodi", "1a2b", "nodi.id"], { env: { HOME: h.dir, PATH: join(h.dir, "bin") + ":/usr/bin", ...more }, stdio: ["ignore", "pipe", "pipe"] }); return { code: 0, err: "" }; }
                       catch (e) { return { code: e.status, err: String(e.stderr || "").trim() }; } };
  try {
    assert.deepEqual(sh({ OCR: "" }), { code: 1, err: "no text was found in the window" });
    assert.deepEqual(sh({ GRIM_FAILS: "1" }), { code: 1, err: "the window could not be captured" }, "a capture that failed says so (Sonnet 2026-10-06)");
    assert.deepEqual(sh({ TESS_FAILS: "1" }), { code: 1, err: "tesseract could not read it" });
    assert.equal(h.log("summoned"), "", "no text: the bar stays closed");
    const ok = execFileSync("/usr/bin/bash", ["-c", H.TEXT, "nodi", "1a2b", "nodi.id"], { env: { HOME: h.dir, PATH: join(h.dir, "bin") + ":/usr/bin", OCR: "Hello there" } });
    assert.equal(h.log("copied"), "Hello there");
    assert.equal(h.log("summoned"), "shell|summon|nodi.id|{}|");
  } finally { rmSync(h.dir, { recursive: true, force: true }); }
});

test("a region's text opens the bar only when it copied something; a colour opens it on its hex", () => {
  const h = home({ "wl-paste": 'cat "$HOME/clip" 2>/dev/null', "omarchy-capture-text": 'printf "%s" "$NEW" > "$HOME/clip"',
                   "omarchy-shell": 'printf "%s|" "$@" > "$HOME/summoned"', hyprpicker: 'printf "%s" "$PICK"' });
  try {
    writeFileSync(join(h.dir, "clip"), "old");
    const env = more => ({ HOME: h.dir, PATH: join(h.dir, "bin") + ":/usr/bin", ...more });
    execFileSync("/usr/bin/bash", ["-c", H.REGION, "nodi", "nodi.id"], { env: env({ NEW: "old" }) });
    assert.equal(h.log("summoned"), "", "cancelled: nothing new, the bar stays closed");
    execFileSync("/usr/bin/bash", ["-c", H.REGION, "nodi", "nodi.id"], { env: env({ NEW: "fresh text" }) });
    assert.equal(h.log("summoned"), "shell|summon|nodi.id|{}|");
    execFileSync("/usr/bin/bash", ["-c", H.COLOUR, "nodi", "nodi.id"], { env: env({ PICK: "#ff8800" }) });
    assert.equal(h.log("summoned"), 'shell|summon|nodi.id|{"query":"#ff8800"}|');
  } finally { rmSync(h.dir, { recursive: true, force: true }); }
});

test("the folder is a shell child's, and nothing for a window with no shell in it", async () => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "nodi-cwd-")));
  const parent = spawn("/usr/bin/bash", ["-c", 'cd "$0" && bash -c "sleep 3; true" & wait', dir]);
  try {
    await new Promise(r => setTimeout(r, 300));
    const got = execFileSync("/usr/bin/bash", ["-c", H.CWD, "nodi", String(parent.pid)]).toString();
    assert.equal(got, dir);
    assert.equal(execFileSync("/usr/bin/bash", ["-c", H.CWD, "nodi", "999999"]).toString(), "", "no such window: nothing");
  } finally { parent.kill(); rmSync(dir, { recursive: true, force: true }); }
});

// Omarchy's own capture rows lead their words, these come next (Sonnet
// 2026-10-06): over the real menu, where this machine has it.
const REAL = "/usr/share/omarchy/default/omarchy/omarchy-menu.jsonc";
test("under Omarchy's own rows for their words, first for the window's", { skip: !existsSync(REAL) }, () => {
  const Menu = load("lib/Menu.js");
  const m = Menu.merge([Menu.parseItems(readFileSync(REAL, "utf8"))]);
  const svc = extra({ menu: { items: m.items, order: m.order, when: {}, checked: {} } });
  const titles = q => plain(run(q, svc).slice(0, 2).map(r => r.title));
  assert.deepEqual(titles("ocr"), ["Text", "Text from a region"]);
  assert.match(titles("window text")[0], /^Copy the text in /);
  assert.equal(titles("region text")[0], "Text from a region");
  assert.equal(titles("pick colour")[0], "Pick a colour");
});

// A floating window's place and size, typed (ROADMAP 60).
test("move 100 200 and size 1280 720 for a floating window; a tiled one says to float it", () => {
  const floating = extra({ window: Object.assign({}, window, { floating: true }) });
  const p = mine(run("move 100 200", floating)).find(r => r.key === "here:place");
  assert.match(p.title, /^Move .* to 100, 200$/);
  assert.deepEqual(plain(p.run.args), ['hl.dsp.window.move({ window = "address:0xabc", x = 100, y = 200, relative = false })']);
  const s = mine(run("resize 1280x720", floating)).find(r => r.key === "here:size");
  assert.deepEqual(plain(s.run.args), ['hl.dsp.window.resize({ window = "address:0xabc", x = 1280, y = 720, relative = false })']);
  assert.ok(mine(run("size 800, 600", floating)).some(r => r.key === "here:size"));
  const tiled = mine(run("size 800 600", extra()))[0];
  assert.deepEqual([tiled.key, tiled.run], ["here:tiled", null]);
  assert.ok(mine(run("move 3", floating)).some(r => r.key === "here:move:3"), "one number is still a workspace");
});

test("the next window of the active window's app, in the order they sit, round to the first", () => {
  const dir = mkdtempSync(join(tmpdir(), "nodi-next-"));
  mkdirSync(join(dir, "bin"));
  const clients = JSON.stringify([
    { address: "0xc", class: "foot", mapped: true, hidden: false, workspace: { id: 2 }, at: [0, 0] },
    { address: "0xa", class: "foot", mapped: true, hidden: false, workspace: { id: 1 }, at: [500, 0] },
    { address: "0xb", class: "foot", mapped: true, hidden: false, workspace: { id: 1 }, at: [0, 400] },
    { address: "0xd", class: "chromium", mapped: true, hidden: false, workspace: { id: 1 }, at: [0, 0] }]);
  writeFileSync(join(dir, "clients.json"), clients);
  writeFileSync(join(dir, "bin/hyprctl"), '#!/bin/bash\ncase "$1" in activewindow) printf \'{"class":"foot","address":"%s"}\' "$ME" ;; clients) cat "$HOME/clients.json" ;; dispatch) printf "%s" "$2" > "$HOME/focused"; echo ok ;; esac\n');
  chmodSync(join(dir, "bin/hyprctl"), 0o755);
  const next = me => { execFileSync("/usr/bin/bash", ["-c", H.NEXT], { env: { HOME: dir, ME: me, PATH: join(dir, "bin") + ":/usr/bin" } });
                       return readFileSync(join(dir, "focused"), "utf8").match(/address:(0x[0-9a-f]+)/)[1]; };
  try {
    assert.deepEqual([next("0xa"), next("0xb"), next("0xc")], ["0xb", "0xc", "0xa"], "workspace 1 top to bottom, then 2, round");
    assert.ok(run("next window", {}).some(r => r.title === "Next window of this app"));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
