// Clipboard, files, developer tools, the hotkey plan and JSONC.

import { test } from "node:test";
import assert from "node:assert/strict";
import { load, plain } from "./load.mjs";
import { run, top, now, config } from "./fixtures.mjs";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const Hotkey = load("lib/Hotkey.js");
const Jsonc = load("lib/Jsonc.js");

const clipboard = [
  { type: "text", text: "omarchy plugin add https://github.com/itsgg/omarchy-nodi --enable" },
  { type: "text", text: "--copy-only $(rm -rf ~)" },
  { type: "image", path: "/home/u/.local/state/omarchy/clipboard-images/a.png", mime: "image/png", capturedAt: "Friday 10:29" }
];

test("clipboard: pasted and copied by history index, never by text", () => {
  const rows = run("cb", { clipboard });
  assert.equal(rows.length, 3);
  assert.deepEqual(plain(rows[0].run.argv), ["omarchy-clipboard-paste-text", "--shift-insert", "--history-index", "0"]);
  assert.deepEqual(plain(rows[1].run.argv), ["omarchy-clipboard-paste-text", "--shift-insert", "--history-index", "1"]);
  assert.deepEqual(plain(rows[1].actions[0].run.argv), ["omarchy-clipboard-paste-text", "--copy-only", "--history-index", "1"]);
  assert.deepEqual(plain(rows[2].run.argv), ["omarchy-clipboard-paste-file", "image/png", "/home/u/.local/state/omarchy/clipboard-images/a.png"]);
  assert.equal(top("clip github", { clipboard }).title, clipboard[0].text);
  assert.equal(top("cb image", { clipboard }).title, "Image, Friday 10:29");
  assert.match(top("cb zzz", { clipboard }).title, /^Nothing in the history matches/);
  assert.equal(top("cb", { clipboard: [] }).title, "The clipboard history is empty");
});

test("clipboard: clear asks Omarchy's clipboard manager, after a second Enter", () => {
  const c = top("cb clear", { clipboard });
  assert.equal(c.confirm, true);
  assert.deepEqual(plain(c.run.argv), ["omarchy-shell", "shell", "call", "omarchy.clipboard", "confirmClearHistory", ""]);
});

const files = [
  { path: "/home/u/Downloads/demo.mp4", name: "demo.mp4" },
  { path: "/home/u/Downloads/report.pdf", name: "report.pdf" },
  { path: "/home/u/Pictures/shot.png", name: "shot.png" }
];

test("files: recent, by name", () => {
  assert.equal(top("f ", { files }).title, "demo.mp4");
  assert.equal(top("f report", { files }).title, "report.pdf");
  assert.equal(top("recent", { files }).title, "demo.mp4");
  assert.equal(top("f report", { files }).subtitle, "~/Downloads");
  assert.deepEqual(plain(top("f report", { files }).run), { kind: "open", target: "/home/u/Downloads/report.pdf" });
  assert.equal(top("f shot", { files }).image, "/home/u/Pictures/shot.png");
  assert.equal(top("f", { files }).provider !== "files", true, "a bare f is a normal search");
});

test("files: a path lists its directory, Tab goes into a folder", () => {
  const asked = [];
  const directory = { path: "/home/u", entries: [{ name: "Downloads", dir: true }, { name: "Documents", dir: true }, { name: ".config", dir: true }, { name: "notes.md", dir: false }] };
  const extra = { files, directory, asked };
  const home = run("~/", extra);
  assert.equal(home[0].title, "Open ~");
  assert.deepEqual(plain(home.map(r => r.title)), ["Open ~", "Downloads", "Documents", "notes.md"], "dotfiles only when asked");
  const d = top("~/Do", extra);
  assert.equal(d.title, "Downloads"); assert.equal(d.complete, "~/Downloads/");
  assert.equal(run("~/.c", extra)[0].title, ".config");
  assert.equal(asked[0], "directory:/home/u");
  assert.equal(top("~/Downloads/").title, "Reading ~/Downloads...");
  assert.equal(top("~/x", { directory: { path: "/home/u", error: "Permission denied", entries: [] } }).title, "Cannot read ~");
});

test("developer tools", () => {
  assert.match(top("uuid").title, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.equal(top("b64 hello").title, "aGVsbG8=");
  assert.equal(top("b64 aGVsbG8=").title, "hello");
  // UTF-8 both ways: the old bar encoded each UTF-16 unit as a byte.
  assert.equal(top("b64 encode வணக்கம்").title, "4K614K6j4K6V4K+N4K6V4K6u4K+N");
  assert.equal(top("b64 4K614K6j4K6V4K+N4K6V4K6u4K+N").title, "வணக்கம்");
  assert.equal(top("b64 encode 🔥").title, "8J+UpQ==");
  assert.equal(run("b64 test").filter(r => r.subtitle === "Decoded from Base64").length, 0, "bytes that are not UTF-8 are not shown as text");
  const sec = String(Math.floor(now().getTime() / 1000));
  assert.equal(top("epoch").title, sec);
  assert.equal(top("epoch 0").subtitle, "Local time, from seconds");
  assert.equal(run("epoch 0")[1].title, "1970-01-01T00:00:00.000Z");
  assert.equal(top("#ff5722").title, "#FF5722"); assert.equal(top("#ff5722").swatch, "#FF5722");
  assert.equal(run("#ff5722")[2].title, "hsl(14, 100%, 57%)");
  assert.equal(top("rgb(255, 87, 34)").title, "#FF5722");
});

test("hotkey plan", () => {
  const cmd = "io.github.itsgg.nodi:toggle";
  const other = { modmask: 64, key: "K", description: "Keybindings", dispatcher: "__lua" };
  const mine = { modmask: 64, key: "SPACE", description: "Nodi", dispatcher: "__lua" };
  const old = { modmask: 64, key: "SPACE", description: "Command bar", dispatcher: "__lua" };
  const j = a => JSON.stringify(a);
  assert.deepEqual(plain(Hotkey.parseCombo("super + alt + c")), { mask: 72, key: "C" });
  assert.equal(Hotkey.parseCombo(""), null); assert.equal(Hotkey.parseCombo("C + SUPER"), null);
  for (const c of ["SUPER", "SUPER +", "SUPER + +", "SUPER + SHIFT", "CTRL + ALT"]) assert.equal(Hotkey.parseCombo(c), null, c + " has no key but a modifier");
  const free = Hotkey.plan(j([other]), "SUPER + SPACE", cmd);
  assert.ok(free.bound);
  assert.equal(free.lua[0], 'hl.bind("SUPER + SPACE", hl.dsp.global("' + cmd + '"), { description = "Nodi" })', "a global shortcut, no process per press");
  assert.equal(free.lua[1], 'hl.layer_rule({ match = { namespace = "^nodi$" }, no_anim = true, animation = "none", blur = true, ignore_alpha = 0.72 })');
  assert.equal(Hotkey.plan(j([other, mine]), "SUPER + SPACE", cmd).lua.length, 0);
  const moved = Hotkey.plan(j([mine]), "SUPER + PERIOD", cmd);
  assert.equal(moved.lua[0], 'hl.unbind("SUPER + SPACE")'); assert.match(moved.lua[1], /^hl\.bind\("SUPER \+ PERIOD"/);
  const taken = Hotkey.plan(j([old]), "SUPER + SPACE", cmd);
  assert.equal(taken.bound, false); assert.equal(taken.conflict, "Command bar"); assert.equal(taken.lua.length, 0);
  assert.equal(Hotkey.plan(j([other, mine]), "", cmd).lua.join(), 'hl.unbind("SUPER + SPACE")');
  assert.equal(Hotkey.luaString('a"b\\c'), '"a\\"b\\\\c"');
  assert.equal(Hotkey.luaString("a\r\nb\u0007"), '"a\\013\\010b\\007"', "every control character escaped (codex 2026-10-04)");
  // Hyprland reads code: and mouse: in lower case (codex 2026-10-04).
  assert.deepEqual(plain(Hotkey.parseCombo("SUPER + code:20")), { mask: 64, key: "code:20" });
  assert.deepEqual(plain(Hotkey.parseCombo("super + MOUSE:272")), { mask: 64, key: "mouse:272" });
  assert.match(Hotkey.plan(j([]), "SUPER + code:20", cmd).lua[0], /^hl\.bind\("SUPER \+ code:20"/);
  // A bind of another submap is no conflict; one of every submap is.
  const resize = { modmask: 64, key: "SPACE", description: "Grow", submap: "resize" };
  assert.ok(Hotkey.plan(j([resize]), "SUPER + SPACE", cmd).bound);
  assert.equal(Hotkey.plan(j([Object.assign({}, resize, { submap_universal: "true" })]), "SUPER + SPACE", cmd).conflict, "Grow");
  // A chord Nodi left is not unbound while something else holds it too.
  const stale = { modmask: 64, key: "PERIOD", description: "Nodi" }, sharing = { modmask: 64, key: "PERIOD", description: "Other" };
  assert.ok(!Hotkey.plan(j([stale, sharing]), "SUPER + SPACE", cmd).lua.some(l => /unbind\("SUPER \+ PERIOD"\)/.test(l)));
  assert.ok(Hotkey.plan("not json", "SUPER + SPACE", cmd).bound);
  // A Nodi that has just loaded binds its key again: an older Nodi's bind may
  // start a process for every press, and a bind cannot be read back.
  const fresh = Hotkey.plan(j([other, mine]), "SUPER + SPACE", cmd, undefined, true);
  assert.equal(fresh.lua[0], 'hl.unbind("SUPER + SPACE")'); assert.match(fresh.lua[1], /^hl\.bind\("SUPER \+ SPACE", hl\.dsp\.global/);
  const shared = { modmask: 64, key: "SPACE", description: "Other app", dispatcher: "__lua" };
  assert.equal(Hotkey.plan(j([mine, shared]), "SUPER + SPACE", cmd, undefined, true).lua.length, 0, "never unbind a key something else holds too");
});

test("JSONC", () => {
  assert.deepEqual(plain(Jsonc.parse('{ // a comment\n "a": "http://x", /* block */ "b": [1, 2,], }')), { a: "http://x", b: [1, 2] });
  assert.deepEqual(plain(Jsonc.parse('{"s": "a, }"}')), { s: "a, }" }, "a comma inside a string stays");
  assert.deepEqual(plain(Jsonc.parse("")), {});
  assert.throws(() => Jsonc.parse("{ nope"));
  assert.deepEqual(plain(Jsonc.merge({ a: { b: 1, c: 2 }, l: [1] }, { a: { c: 3 }, l: [2] })), { a: { b: 1, c: 3 }, l: [2] });
});

test("rows that name a moment are not learned from", () => {
  const h = { "clip:0": { n: 50, t: Date.now() } };
  const a = run("cb", { clipboard, history: h });
  assert.equal(a[0].remember, false);
  assert.equal(a[0].score, run("cb", { clipboard, history: {} })[0].score, "no habit for a clipboard position");
});

test("hotkey plan: a key bound twice by a race is bound once again", () => {
  const cmd = "io.github.itsgg.nodi:toggle";
  const mine = { modmask: 64, key: "SPACE", description: "Nodi", dispatcher: "__lua" };
  const p = Hotkey.plan(JSON.stringify([mine, mine]), "SUPER + SPACE", cmd);
  assert.ok(p.bound);
  assert.equal(p.lua[0], 'hl.unbind("SUPER + SPACE")');
  assert.match(p.lua[1], /^hl\.bind\("SUPER \+ SPACE"/);
  const other = { modmask: 64, key: "SPACE", description: "Other app", dispatcher: "__lua" };
  const kept = Hotkey.plan(JSON.stringify([mine, other, mine]), "SUPER + SPACE", cmd);
  assert.equal(kept.lua.length, 0, "never unbind a key something else holds too");
});

test("the key is released on unload only when no Nodi took this one's place", () => {
  const dir = mkdtempSync(join(tmpdir(), "nodi-release-"));
  try {
    const log = join(dir, "hyprctl.log");
    const hyprctl = join(dir, "hyprctl");
    // Answers `binds -j` with the binds in ${dir}/binds.json; logs evals.
    writeFileSync(join(dir, "binds.json"), JSON.stringify([{ modmask: 64, key: "SPACE", description: "Nodi" }]));
    writeFileSync(hyprctl, `#!/bin/bash\n[ "$1" = binds ] && { cat "${dir}/binds.json"; exit 0; }\nprintf '%s\\n' "$*" >> "${log}"\n`, { mode: 0o755 });
    const shell = answer => { const p = join(dir, "shell-" + answer); writeFileSync(p, `#!/bin/bash\n[ "$1 $2 $3" = "shell call io.github.itsgg.nodi" ] && [ "$4" = ping ] && echo ${answer}\n`, { mode: 0o755 }); return p; };
    const combo = Hotkey.parseCombo("SUPER + SPACE");
    const release = answer => { const a = Hotkey.releaseArgv(combo, "io.github.itsgg.nodi", shell(answer), hyprctl, 0); execFileSync(a[0], a.slice(1)); };
    release("ok");
    assert.ok(!existsSync(log), "a successor answered: the key stays");
    release("unknown");
    assert.equal(readFileSync(log, "utf8"), 'eval hl.unbind("SUPER + SPACE")\n', "none loaded: released");
    // Something else bound the chord since: the unbind would take it too.
    rmSync(log);
    writeFileSync(join(dir, "binds.json"), JSON.stringify([{ modmask: 64, key: "SPACE", description: "Nodi" }, { modmask: 64, key: "SPACE", description: "Launcher" }]));
    release("unknown");
    assert.ok(!existsSync(log), "a chord another bind holds is left alone");
    // A bind of another submap holds nothing in the default one.
    writeFileSync(join(dir, "binds.json"), JSON.stringify([{ modmask: 64, key: "SPACE", description: "Nodi" }, { modmask: 64, key: "SPACE", description: "Resize", submap: "resize" }]));
    release("unknown");
    assert.equal(readFileSync(log, "utf8"), 'eval hl.unbind("SUPER + SPACE")\n');
    assert.equal(Hotkey.releaseArgv(null, "x", "y"), null, "nothing bound, nothing to release");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("row hotkeys: bound to the row's deeplink, never over another bind", () => {
  const firefox = { key: "app:firefox", s: { title: "Firefox", run: { kind: "app", id: "firefox" } } };
  const odd = { key: "file:/home/u/it's a file.txt", s: { title: "it's a file", run: { kind: "open", target: "/home/u/it's a file.txt" } } };
  const j = a => JSON.stringify(a);
  const p = Hotkey.planRows(j([{ modmask: 64, key: "K", description: "Keybindings" }]), { "SUPER + F": firefox, "SUPER + K": odd }, "io.github.itsgg.nodi");
  assert.deepEqual(plain(p.conflicts), ["SUPER + K"], "a chord Omarchy holds is refused");
  assert.equal(p.lua.length, 1);
  assert.equal(p.lua[0], 'hl.bind("SUPER + F", hl.dsp.exec_cmd("omarchy-shell shell call io.github.itsgg.nodi runRow \'app:firefox\'"), { description = "Nodi: Firefox" })');
  const stale = Hotkey.planRows(j([{ modmask: 64, key: "G", description: "Nodi: Old" }, { modmask: 64, key: "F", description: "Nodi: Firefox" }]), { "SUPER + F": firefox }, "x");
  assert.deepEqual(plain(stale.lua.slice(0, 1)), ['hl.unbind("SUPER + G")'], "a row bind no longer wanted goes");
  const known = Hotkey.planRows(j([{ modmask: 64, key: "F", description: "Nodi: Firefox" }]), { "SUPER + F": firefox }, "x", { "SUPER + F": "app:firefox" });
  assert.deepEqual(plain(known.lua), [], "one this Nodi bound to that row stays");
  const written = Hotkey.planRows(j([{ modmask: 64, key: "F", description: "Nodi: Firefox" }]), { "super+f": firefox }, "x", { "SUPER + F": "app:firefox" });
  assert.deepEqual(plain(written.lua), [], "a key written by hand as super+f is the same bind, left alone");
  const moved = Hotkey.planRows(j([{ modmask: 64, key: "F", description: "Nodi: Firefox" }]), { "SUPER + F": { key: "app:chromium", s: { title: "Chromium", run: {} } } }, "x", { "SUPER + F": "app:firefox" });
  assert.equal(moved.lua[0], 'hl.unbind("SUPER + F")', "a chord moved to another row is bound again");
  assert.match(moved.lua[1], /runRow 'app:chromium'.*Nodi: Chromium/);
  assert.deepEqual(plain(moved.bound), { "SUPER + F": "app:chromium" });
  assert.match(Hotkey.captureStartLua(), /define_submap\("nodi-capture", "reset", function\(\) hl\.unbind\("ESCAPE"\); hl\.bind\("ESCAPE".*non_consuming = true/);
  assert.equal(Hotkey.captureEndLua(), 'hl.dispatch(hl.dsp.submap("reset"))');
  // The deeplink keeps an awkward key whole through the shell.
  const dir = mkdtempSync(join(tmpdir(), "nodi-link-"));
  try {
    const shell = join(dir, "omarchy-shell");
    writeFileSync(shell, '#!/bin/bash\nprintf "%s|" "$@"\n', { mode: 0o755 });
    const out = execFileSync("bash", ["-c", Hotkey.deeplink("io.github.itsgg.nodi", odd.key)], { env: { PATH: dir + ":/usr/bin:/bin" } }).toString();
    assert.equal(out, "shell|call|io.github.itsgg.nodi|runRow|file:/home/u/it's a file.txt|");
  } finally { rmSync(dir, { recursive: true, force: true }); }
  assert.ok(Hotkey.releaseArgv([Hotkey.parseCombo("SUPER + SPACE"), Hotkey.parseCombo("SUPER + F")], "x", "y").at(-1).includes('hl.unbind("SUPER + F")'));
});

test("a chord being set: what holds it, or nothing", () => {
  const j = a => JSON.stringify(a);
  const binds = j([{ modmask: 64, key: "K", description: "Keybindings" }, { modmask: 64, key: "F", description: "Nodi: Firefox" }, { modmask: 64, key: "SPACE", description: "Nodi" }]);
  assert.equal(Hotkey.holder(binds, "SUPER + K"), "Keybindings");
  assert.equal(Hotkey.holder(binds, "SUPER + F"), "", "a row's own bind is replaced, not a holder");
  assert.equal(Hotkey.holder(binds, "SUPER + SPACE"), "Nodi", "Nodi's own key is taken");
  assert.equal(Hotkey.holder(binds, "SUPER + Q"), "");
});

test("find: every file under home by name, the closer name first", () => {
  const F = load("providers/files.js");
  const list = F.parseFound("/home/u/a/old-report.pdf\n/home/u/report/\n/home/u/x/report.txt\nnot a path\n", true, "report");
  assert.deepEqual(plain(list.map(f => [f.name, f.dir, f.rank])), [["report", true, 0], ["report.txt", false, 1], ["old-report.pdf", false, 2]]);
  const rows = run("find report", { found: { q: "report", list } });
  assert.equal(rows[0].title, "report"); assert.equal(rows[0].complete, "~/report/");
  assert.deepEqual(plain(rows[1].run), { kind: "open", target: "/home/u/x/report.txt" });
  assert.equal(top("find zzz", { found: { q: "zzz", list: [] } }).title, "No file named \"zzz\"");
  assert.equal(top("find report", {}).title, "Searching for report...");
  assert.equal(top("f report", { files }).provider, "files", "f stays recent files");
  // The query reaches fd as fixed text, after --.
  const argv = F.provider.sources.find.argv("-rf *", { home: "/home/u" });
  assert.deepEqual(plain(argv.slice(-3)), ["--", "-rf *", "/home/u"]); assert.ok(argv.includes("--fixed-strings"));
});

test("fallbacks: what nothing answers can still be searched", () => {
  const rows = run("zzqx frobnicate");
  assert.deepEqual(plain(rows.map(r => r.title)), ["Search Google: zzqx frobnicate", "Search YouTube: zzqx frobnicate", "Search GitHub: zzqx frobnicate",
    "Wikipedia: zzqx frobnicate", "Find files named zzqx frobnicate", "Ask: zzqx frobnicate"]);
  assert.equal(rows[5].complete, "ask zzqx frobnicate", "asking takes a second Enter");
  assert.equal(rows[0].run.target, "https://www.google.com/search?q=zzqx%20frobnicate");
  assert.equal(rows[4].complete, "find zzqx frobnicate");
  assert.equal(rows[0].section, "Search instead");
  assert.equal(run("zzqx", {}, { ...config, fallbacks: [] }).length, 0, "[] offers nothing");
  assert.ok(!run("firefox").some(r => r.provider === "fallback"), "only when nothing answers");
});

test("find leaves out a name holding a newline, and says when it could not search", () => {
  const F = load("providers/files.js");
  assert.throws(() => F.parseFound("", false, "x"));
  assert.deepEqual(plain(F.parseFound("/home/u/notes \n", true, "notes").map(f => f.path)), ["/home/u/notes "], "a trailing space is part of the name");
  const dir = mkdtempSync(join(tmpdir(), "nodi-find-"));
  try {
    writeFileSync(join(dir, "report one.txt"), ""); writeFileSync(join(dir, "bad\nreport.txt"), ""); writeFileSync(join(dir, "report.md"), "");
    const argv = F.provider.sources.find.argv("report", { home: dir });
    const out = execFileSync(argv[0], argv.slice(1)).toString();
    assert.deepEqual(plain(F.parseFound(out, true, "report").map(f => f.name).sort()), ["report one.txt", "report.md"]);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("the frost sits between the theme's scrim and card alphas, or is left out", () => {
  const rule = a => Hotkey.frostRule(a);
  assert.equal(rule({ scrim: 0.5, card: 0.93 }), ", blur = true, ignore_alpha = 0.72");
  assert.equal(rule({ scrim: 0.7, card: 0.95 }), ", blur = true, ignore_alpha = 0.83", "a darker scrim still stays plain");
  assert.equal(rule({ scrim: 0.95, card: 0.93 }), "", "a card no more opaque than its scrim: no blur");
});
