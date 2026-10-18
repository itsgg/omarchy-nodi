// The readers' parsers, on hand-made output and, where the program is here,
// on its real output.

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, writeFileSync, mkdirSync, rmSync, readdirSync, symlinkSync, readFileSync, chmodSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { load, plain } from "./load.mjs";

const S = load("lib/Sources.js");

test("windows: mapped, visible ones, and the active workspace", () => {
  const clients = [
    { address: "0xa", mapped: true, hidden: false, class: "firefox", title: "Docs", workspace: { name: "2" }, focusHistoryID: 1 },
    { address: "0xb", mapped: false, class: "x", title: "unmapped", workspace: { name: "1" }, focusHistoryID: 2 },
    { address: "0xc", mapped: true, hidden: true, class: "y", title: "hidden", workspace: { name: "1" }, focusHistoryID: 3 }
  ];
  const r = plain(S.windowsFrom(clients, { id: 4 }));
  // A record with no workspace id: no number to always open on (ROADMAP 79).
  assert.deepEqual(r, { list: [{ address: "0xa", cls: "firefox", title: "Docs", workspace: "2", workspaceId: 0, focus: 1, pid: 0, floating: false }], activeWorkspace: 4 });
  assert.deepEqual(plain(S.windowsFrom("garbage", "x")), { list: [], activeWorkspace: null });
  assert.equal(S.windowsFrom([], { id: -1337, name: "code" }).activeWorkspace, "name:code", "a named workspace, never its negative id");
  assert.equal(S.windowsFrom([], { id: -98, name: "special:scratch" }).activeWorkspace, "special:scratch");
});

test("windows: Hyprland's real records read", { skip: !process.env.HYPRLAND_INSTANCE_SIGNATURE }, () => {
  const clients = JSON.parse(execFileSync("hyprctl", ["clients", "-j"]).toString());
  const r = S.windowsFrom(clients, JSON.parse(execFileSync("hyprctl", ["activeworkspace", "-j"]).toString()));
  assert.equal(typeof r.activeWorkspace, "number");
  assert.ok(r.list.every(w => /^0x[0-9a-f]+$/.test(w.address)));
});

test("the window you came from: Hyprland's active window, filled in from the list", () => {
  const list = [{ address: "0x5b8f", cls: "foot", title: "vim notes.md", workspace: "2", focus: 0, pid: 5438 }];
  const ipc = { address: "0x5b8f", class: "foot", title: "old title", pid: 5438, workspace: { id: 2, name: "2" } };
  // Quickshell gives the address without 0x.
  assert.deepEqual(plain(S.windowContext({ address: "5b8f", title: "vim notes.md", ipc, workspace: "2" }, [])),
    { address: "0x5b8f", class: "foot", title: "vim notes.md", pid: "5438", workspace: "2", stableId: "", monitor: -1, width: 0, floating: false }, "the live title, not the record's");
  assert.deepEqual(plain(S.windowContext({ address: "5b8f", title: "", ipc: {}, workspace: "" }, list)),
    { address: "0x5b8f", class: "foot", title: "vim notes.md", pid: "5438", workspace: "2", stableId: "", monitor: -1, width: 0, floating: false }, "an empty record is filled from the list");
  assert.deepEqual(plain(S.windowContext({ address: "5b8f", title: "t", ipc: null }, [])),
    { address: "0x5b8f", class: "", title: "t", pid: "", workspace: "", stableId: "", monitor: -1, width: 0, floating: false }, "what is not known is empty");
  const none = { address: "", class: "", title: "", pid: "", workspace: "", stableId: "", monitor: -1, width: 0, floating: false };
  const shot = S.windowContext({ address: "5b8f", title: "t", ipc: { stableId: "180000b1", size: [1512, 910] } }, []);
  assert.deepEqual([shot.stableId, shot.width], ["180000b1", 1512], "what grim -T captures it by, and its width (ROADMAP 43)");
  assert.equal(S.windowContext({ address: "5b8f", ipc: { monitor: 1 } }, []).monitor, 1, "its own monitor, for the capture's scale");
  assert.equal(S.windowContext({ address: "5b8f", ipc: { stableId: "18; rm -rf ~" } }, []).stableId, "", "a stable id is hex or nothing");
  assert.equal(S.windowContext({ address: "5b8f", ipc: { floating: true } }, []).floating, true, "whether it floats (ROADMAP 60)");
  assert.equal(S.windowContext({ address: "5b8f", ipc: {} }, [{ address: "0x5b8f", floating: true }]).floating, true, "from the list when the record lacks it");
  assert.equal(S.windowContext({ address: "5b8f", ipc: { floating: false } }, [{ address: "0x5b8f", floating: true }]).floating, true,
               "the list, read again while the bar is open, over the open's record (Sonnet 2026-10-06)");
  assert.deepEqual(plain(S.windowContext(null, list)), none, "no window had the focus");
  assert.deepEqual(plain(S.windowContext({ address: "0xzz;rm" }, list)), none, "an address that is not one");
  assert.equal(S.windowContext({ address: "1", title: "x".repeat(1000) }, []).title.length, 300);
  assert.equal(S.windowContext({ address: "5b8f", workspace: "2", ipc: { workspace: { name: "1" } } }, list).workspace, "2",
               "moved since its record: where it is now (Fable 2026-10-05)");
  assert.equal(S.windowContext({ address: "5b8f", ipc: { workspace: { name: "1" } } }, list).workspace, "2", "the list before the record");
});

test("processes: names with spaces, ps itself left out", () => {
  const pad = s => s.padEnd(40);
  const text = ["  101  400000 12.5 " + pad("chrome") + " /opt/chrome", "  103   50000  0.1 " + pad("Web Content") + " /usr/lib/firefox -contentproc", "  9 10 0.0 " + pad("ps") + " ps -u x"].join("\n");
  assert.deepEqual(plain(S.processes(text)), [
    { pid: 101, rss: 400000, cpu: 12.5, name: "chrome", args: "/opt/chrome" },
    { pid: 103, rss: 50000, cpu: 0.1, name: "Web Content", args: "/usr/lib/firefox -contentproc" }
  ]);
});

test("zones", () => {
  assert.deepEqual(plain(S.zones("@local Asia/Kolkata\nAsia/Kolkata +0530 IST\nAmerica/New_York -0400 EDT\nbad line")),
    { zones: { "Asia/Kolkata": { offset: 330, abbr: "IST" }, "America/New_York": { offset: -240, abbr: "EDT" } }, local: "Asia/Kolkata" });
});

test("themes: named as omarchy theme list names them, user first, sorted", () => {
  const text = "@current\tTokyo Night\ndark-knight\t/home/u/.config/omarchy/themes/dark-knight/preview.png\ndark-knight\t/usr/share/omarchy/themes/dark-knight/preview.png\ntokyo-night\t/usr/share/omarchy/themes/tokyo-night/preview.png\ncatppuccin-latte\t\n../evil\tx";
  assert.deepEqual(plain(S.themes(text)), { current: "Tokyo Night", list: [
    { name: "Catppuccin Latte", preview: "" },
    { name: "Dark Knight", preview: "/home/u/.config/omarchy/themes/dark-knight/preview.png" },
    { name: "Tokyo Night", preview: "/usr/share/omarchy/themes/tokyo-night/preview.png" }
  ] });
  assert.equal(S.themes("@current\tUnknown").current, "");
});

test("themes: the names match omarchy theme list", { skip: !existsSync("/usr/share/omarchy/bin/omarchy-theme-list") }, () => {
  const listed = execFileSync("/usr/share/omarchy/bin/omarchy-theme-list", { env: { HOME: process.env.HOME, OMARCHY_PATH: "/usr/share/omarchy", PATH: "/usr/bin:/bin" } }).toString().trim().split("\n");
  const slugs = execFileSync("bash", ["-c", 'for d in "$HOME/.config/omarchy/themes"/*/ /usr/share/omarchy/themes/*/; do [ -d "$d" ] && basename "$d"; done']).toString().trim().split("\n");
  const ours = [...new Set(slugs.map(S.themeName))].sort();
  assert.deepEqual(ours, [...listed].sort());
});

test("directory: folders first, by name", () => {
  assert.deepEqual(plain(S.directory("f\tzeta.txt\nd\tbeta\nf\tAlpha.md\nd\tAlpha\nl\tlink\n\nbad")), [
    { name: "Alpha", dir: true }, { name: "beta", dir: true }, { name: "Alpha.md", dir: false }, { name: "link", dir: false }, { name: "zeta.txt", dir: false }
  ]);
});

test("recent files: local, decoded, newest first, once each", () => {
  const xml = `<?xml version="1.0"?><xbel>
    <bookmark href="file:///home/u/a%20b.pdf" added="2026-09-01T10:00:00Z" modified="2026-09-01T10:00:00Z" visited="x"/>
    <bookmark href="https://example.com/x" modified="2026-09-30T10:00:00Z"/>
    <bookmark href="file:///home/u/new.md" modified="2026-09-30T10:00:00Z"></bookmark>
    <bookmark href="file:///home/u/a%20b.pdf" modified="2026-08-01T10:00:00Z"/>
    <bookmark href="file:///home/u/q%26a.txt" modified="2026-09-15T10:00:00Z"/>
  </xbel>`;
  assert.deepEqual(plain(S.recentFiles(xml).map(f => f.path)), ["/home/u/new.md", "/home/u/q&a.txt", "/home/u/a b.pdf"]);
  assert.equal(S.recentFiles(xml, 1).length, 1);
});

test("clipboard and launcher hides", () => {
  assert.equal(S.clipboard("[{\"type\":\"text\",\"text\":\"x\"}]").length, 1);
  assert.deepEqual(plain(S.clipboard("{}")), []);
  assert.deepEqual(plain(S.clipboard("not json")), []);
  assert.deepEqual(plain(S.hidden("a.desktop\n# comment\n\nb\n")), { a: true, b: true });
});

test("an explicit paste reads text only when it is requested", () => {
  assert.deepEqual(plain(S.pasteArgv()), ["/usr/bin/wl-paste", "--no-newline", "--type", "text"]);
});

test("directory: a name with a newline is left out, not misread", () => {
  const dir = mkdtempSync(join(tmpdir(), "nodi-dir-"));
  try {
    writeFileSync(join(dir, "plain.txt"), "");
    writeFileSync(join(dir, "a\nd\tb"), "");
    mkdirSync(join(dir, "folder"));
    const argv = S.directoryArgv(dir);
    const out = execFileSync(argv[0], argv.slice(1)).toString();
    assert.deepEqual(plain(S.directory(out)), [{ name: "folder", dir: true }, { name: "plain.txt", dir: false }]);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("readers: the cap and the deadline hold outside Quickshell", () => {
  const go = (argv, ms, max) => {
    const a = S.limited(argv, ms, max);
    const r = spawnSync(a[0], a.slice(1));
    return { out: r.stdout.toString(), status: r.status };
  };
  assert.deepEqual(go(["printf", "abc"], 2000, 3), { out: "abc", status: 0 }, "exactly the cap is whole");
  assert.deepEqual(go(["printf", "abcd"], 2000, 3), { out: "abc", status: S.OVERFLOW }, "one byte past is an overflow");
  const long = go(["bash", "-c", "head -c 5000000 /dev/zero | tr '\\0' x"], 2000, 1000);
  assert.equal(long.out.length, 1000); assert.equal(long.status, S.OVERFLOW, "one long line without a newline is cut too");
  const started = Date.now();
  assert.equal(go(["sleep", "30"], 1000, 100).status, S.TIMEOUT);
  assert.ok(Date.now() - started < 5000, "the deadline kills the program");
  assert.equal(go(["false"], 1000, 100).status, 1, "the program's own failure comes through");
});

test("readers bound a continuous error stream before Qt's parser sees it", () => {
  const argv = S.limited(["/usr/bin/bash", "-c", "head -c 5000000 /dev/zero >&2; printf done"], 2000, 100);
  const result = spawnSync(argv[0], argv.slice(1), { timeout: 5000 });
  assert.equal(result.status, 0);
  assert.equal(result.stdout.toString(), "done");
  assert.equal(result.stderr.length, 65536);
});

test("windows from Quickshell's records, null and junk skipped (ROADMAP 32)", () => {
  const recs = [{ address: "0xa", class: "foot", title: "~", workspace: { id: 2, name: "2" }, focusHistoryID: 1, pid: 42, mapped: true, hidden: false },
                { address: "0xb", class: "x", title: "hid", workspace: { id: 1, name: "1" }, focusHistoryID: 0, mapped: true, hidden: true }, null, "junk"];
  const r = plain(S.windowsFrom(recs, { id: 2, name: "2" }));
  assert.deepEqual(r, { list: [{ address: "0xa", cls: "foot", title: "~", workspace: "2", workspaceId: 2, focus: 1, pid: 42, floating: false }], activeWorkspace: 2 });
  assert.equal(S.windowsFrom([], { id: -98, name: "special:scratch" }).activeWorkspace, "special:scratch");
  assert.deepEqual(plain(S.windowsFrom(null, null)), { list: [], activeWorkspace: null });
});

test("the selection and the clipboard's text read at an open, each ended by its marker", () => {
  const S = load("lib/Sources.js");
  const dir = mkdtempSync(join(tmpdir(), "nodi-sel-"));
  try {
    mkdirSync(join(dir, "bin"));
    writeFileSync(join(dir, "bin/wl-paste"), '#!/bin/bash\ncase "$*" in *--primary*) printf "picked";; *--list-types*) echo text/plain;; *) printf "copied\\n";; esac\n', { mode: 0o755 });
    const argv = S.selectionArgv();
    assert.deepEqual(plain(argv.slice(0, 2)), ["/usr/bin/bash", "-c"]);
    const out = execFileSync(argv[0], argv.slice(1), { env: { PATH: join(dir, "bin") + ":/usr/bin:/bin" } }).toString();
    assert.equal(out, "picked\n\u001e\ncopied\n\n\u001e\n", "the selection, its marker, the clipboard with its own newline, its marker");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// ---------------------------------------------------------------- window cwd

const ranCwd = (pid, ms = 2000) => {
  const argv = S.limited(S.cwdArgv(), ms, 8192);
  const env = S.cwdEnv(pid);
  const r = spawnSync(argv[0], argv.slice(1), { encoding: "utf8", env: { PATH: "/usr/bin:/bin", ...(env || {}) } });
  return { text: r.stdout, ok: r.status === 0 };
};

const sleeper = (cwd) => {
  const p = spawnSync("bash", ["-c", 'cd "$1" && (sleep 30 </dev/null >/dev/null 2>&1 & echo $!)', "x", cwd], { encoding: "utf8" });
  return Number(p.stdout.trim());
};

test("window cwd: the argv is fixed and holds no pid; the pid is in the environment only", () => {
  const argv = plain(S.cwdArgv(4211));
  assert.deepEqual(argv, plain(S.cwdArgv()), "no argument changes it");
  assert.equal(argv[0], "/usr/bin/bash");
  assert.ok(!argv.join("\u0000").includes("4211"), "the pid is nowhere in the argv: " + JSON.stringify(argv));
  assert.ok(!/\b4211\b/.test(JSON.stringify(S.limited(S.cwdArgv(4211), 1000, 8192))), "nor in the argv the Reader really starts");
  assert.deepEqual(plain(S.cwdEnv(4211)), { NODI_WINDOW_PID: "4211" });
  assert.deepEqual(plain(S.cwdEnv(1)), { NODI_WINDOW_PID: "1" });
  assert.deepEqual(plain(S.cwdEnv(4194304)), { NODI_WINDOW_PID: "4194304" });
  for (const bad of [0, -1, 1.5, NaN, Infinity, "4211", "1; touch /tmp/x", null, undefined, {}, [4211], 2 ** 40, 4194305])
    assert.equal(S.cwdEnv(bad), null, JSON.stringify(bad));
});

test("window cwd: the program takes its pid from the environment only, and a bad one reads nothing", () => {
  const argv = S.limited(S.cwdArgv(), 1000, 8192);
  const run = (env, extra = []) => spawnSync(argv[0], argv.slice(1).concat(extra), { encoding: "utf8", env: { PATH: "/usr/bin:/bin", ...env } });
  assert.notEqual(run({}).status, 0, "no pid in the environment: nothing");
  assert.notEqual(run({}, [String(process.pid)]).status, 0, "a pid in the argv is not read");
  for (const bad of ["", "0", "-1", "1; touch /tmp/nodi-x", "$(id)", "../1", "1 2", "01", "99999999999"]) {
    const r = run({ NODI_WINDOW_PID: bad });
    assert.notEqual(r.status, 0, JSON.stringify(bad));
    assert.equal(r.stdout, "", JSON.stringify(bad));
  }
  assert.equal(existsSync("/tmp/nodi-x"), false);
});

test("window cwd: a window is its address and pid together; a gone or replaced one is not it", () => {
  const list = [{ address: "0xa", pid: 4211 }, { address: "0xb", pid: 77 }];
  assert.equal(S.sameWindow(list, "0xa", 4211), true);
  assert.equal(S.sameWindow(list, "0xa", 77), false, "the address holds another pid");
  assert.equal(S.sameWindow(list, "0xc", 4211), false, "the window is gone");
  assert.equal(S.sameWindow([{ address: "0xb", pid: 4211 }], "0xa", 4211), false, "the pid was taken by another window");
  assert.equal(S.sameWindow([], "0xa", 4211), false);
  assert.equal(S.sameWindow("junk", "0xa", 4211), false);
  assert.equal(S.sameWindow(list, "", 4211), false);
  assert.equal(S.sameWindow(list, "0xa", 0), false);
  assert.equal(S.sameWindow(list, "0xa", "4211"), false, "a pid is a number");
  assert.equal(S.sameWindow([{ address: "0xa", pid: 0 }], "0xa", 0), false);
});

test("window cwd: a live process's cwd is read with its pid, read-only", { skip: !existsSync("/proc/self/cwd") }, () => {
  const dir = mkdtempSync(join(tmpdir(), "nodi-cwd-"));
  const pid = sleeper(dir);
  try {
    const got = ranCwd(pid);
    assert.equal(got.ok, true);
    assert.equal(S.windowCwd(got.text, pid), execFileSync("readlink", ["/proc/" + pid + "/cwd"]).toString().trim());
    assert.equal(S.windowCwd(got.text, pid), execFileSync("realpath", [dir]).toString().trim());
  } finally { process.kill(pid); rmSync(dir, { recursive: true, force: true }); }
});

test("window cwd: a path with spaces or a newline reads whole or not at all", { skip: !existsSync("/proc/self/cwd") }, () => {
  const base = mkdtempSync(join(tmpdir(), "nodi-cwd-"));
  const spaced = join(base, "my project");
  mkdirSync(spaced);
  const newline = join(base, "a\nb");
  mkdirSync(newline);
  const p1 = sleeper(spaced);
  const p2 = sleeper(newline);
  try {
    assert.equal(S.windowCwd(ranCwd(p1).text, p1), execFileSync("realpath", [spaced]).toString().trim(), "a space is part of it");
    const two = ranCwd(p2);
    assert.equal(S.windowCwd(two.text, p2), "", "a newline would split the record: no cwd");
  } finally { process.kill(p1); process.kill(p2); rmSync(base, { recursive: true, force: true }); }
});

test("window cwd: a vanished process and a deleted directory give nothing", { skip: !existsSync("/proc/self/cwd") }, () => {
  const dir = mkdtempSync(join(tmpdir(), "nodi-cwd-"));
  const pid = sleeper(dir);
  rmSync(dir, { recursive: true, force: true });
  try {
    const gone = ranCwd(pid);
    assert.equal(S.windowCwd(gone.text, pid), "", "the directory is deleted: '(deleted)' is no place");
  } finally { process.kill(pid); }
  // The process is over: its /proc entry is too.
  const finished = Number(spawnSync("bash", ["-c", "echo $$"], { encoding: "utf8" }).stdout.trim());
  const dead = ranCwd(finished);
  assert.equal(dead.ok, false, "no such process: the read fails");
  assert.equal(S.windowCwd(dead.text, finished), "");
});

// Every program a PATH search could start is replaced by one that records
// its argv and does nothing else, so a pid or a path entering the argv of any
// child the script starts shows in the log. A child started by an absolute
// path is not found this way: the script is held to start none (the last
// assertion).
test("window cwd: no child process of the script is ever given the pid or the path", { skip: !existsSync("/proc/self/cwd") }, () => {
  const base = mkdtempSync(join(tmpdir(), "nodi-argv-"));
  const bin = join(base, "bin");
  mkdirSync(bin);
  const log = join(base, "argv.log");
  writeFileSync(join(base, "logger"), '#!/bin/sh\nprintf "%s\\n" "$0 $*" >> "$NODI_ARGV_LOG"\n', { mode: 0o755 });
  for (const dir of ["/usr/bin", "/bin"]) {
    if (!existsSync(dir)) continue;
    for (const name of readdirSync(dir)) {
      const link = join(bin, name);
      if (!existsSync(link) && !/[\/]/.test(name)) try { symlinkSync(join(base, "logger"), link); } catch (e) {}
    }
  }
  const work = join(base, "my work dir");
  mkdirSync(work);
  const pid = sleeper(work);
  const argv = S.cwdArgv();
  try {
    const run = (env) => spawnSync("/usr/bin/bash", argv.slice(1), { encoding: "utf8", env: { NODI_ARGV_LOG: log, ...env } });
    // Every program is a recorder, as a search would find it: none runs.
    const withSearch = run({ PATH: bin, NODI_WINDOW_PID: String(pid) });
    assert.equal(withSearch.status, 0, "it needs no program: " + withSearch.stderr);
    assert.equal(S.windowCwd(withSearch.stdout, pid), execFileSync("realpath", [work]).toString().trim());
    assert.equal(existsSync(log) ? readFileSync(log, "utf8") : "", "", "no child was started by a search of PATH");
    // And with nothing to search at all.
    const empty = join(base, "empty");
    mkdirSync(empty);
    const bare = run({ PATH: empty, NODI_WINDOW_PID: String(pid) });
    assert.equal(S.windowCwd(bare.stdout, pid), execFileSync("realpath", [work]).toString().trim(), "builtins alone read it");
    assert.ok(!/(^|[\s;|&(`$])\/(?:usr\/)?(?:s?bin|lib)\//.test(argv[2]), "no program is named by a path either");
  } finally { process.kill(pid); rmSync(base, { recursive: true, force: true }); }
});

test("window cwd: the answer must be this pid's, one line, an absolute path", () => {
  assert.equal(S.windowCwd("4211\t/home/user/project\n", 4211), "/home/user/project");
  assert.equal(S.windowCwd("4211\t/\n", 4211), "/");
  assert.equal(S.windowCwd("4211\t/home/user/project", 4211), "/home/user/project", "the Reader's last newline may be missing");
  assert.equal(S.windowCwd("4212\t/home/user/project\n", 4211), "", "another pid answered: a mismatch");
  assert.equal(S.windowCwd("42110\t/x\n", 4211), "");
  assert.equal(S.windowCwd("4211\t/home/user/project\n", 0), "");
  assert.equal(S.windowCwd("4211\t/home/user/project\n", "4211"), "", "the expected pid is a number");
  assert.equal(S.windowCwd("4211\t/home/user/project\n", 4212), "");
  for (const bad of ["", "\n", null, undefined, 5, "4211\n", "4211\t\n", "4211\trelative\n", "4211\t~/x\n", "4211\t/a\nb\n",
                     "4211\t/a\n4211\t/b\n", "4211\t/a\tb\n", "4211\t/a\u0000b\n", "4211\t/a\u001bb\n", "4211\t/a\u0080b\n", "4211\t/a\u0085b\n", "4211\t/a\u009bb\n", "4211\t/a\u009fb\n", "4211\t/x (deleted)\n",
                     "4211 /x\n", "\n4211\t/x\n", "4211\t/" + "d".repeat(4096) + "\n", "x4211\t/x\n"])
    assert.equal(S.windowCwd(bad, 4211), "", JSON.stringify(bad));
  assert.equal(S.windowCwd("4211\t/" + "d".repeat(4095) + "\n", 4211).length, 4096);
});

test("window cwd: a program that overflows or is cut off by the deadline reads as nothing", () => {
  const big = S.limited(["/usr/bin/bash", "-c", "printf '4211\\t/%s\\n' $(head -c 20000 /dev/zero | tr '\\0' d)"], 1000, 8192);
  const o = spawnSync(big[0], big.slice(1), { encoding: "utf8" });
  assert.equal(o.status, S.OVERFLOW);
  const slow = S.limited(["/usr/bin/bash", "-c", "sleep 5; printf '4211\\t/x\\n'"], 1000, 8192);
  const t = spawnSync(slow[0], slow.slice(1), { encoding: "utf8" });
  assert.notEqual(t.status, 0, "the deadline ends it, and a failed read is not read");
});

test("the window an Ask is about: its class, title, pid and workspace number, from what the bar already knows", () => {
  const list = [{ address: "0xa", cls: "foot", title: "x", workspace: "3", workspaceId: 3, focus: 0, pid: 4211, floating: false },
                { address: "0xb", cls: "foot", title: "y", workspace: "code", workspaceId: 0, focus: 1, pid: 9, floating: false }];
  const ctx = S.windowContext({ address: "0xa", title: "project", ipc: { class: "foot", pid: 4211 }, workspace: "3" }, list);
  assert.deepEqual(plain(S.windowSnapshot(ctx, list)), { class: "foot", title: "project", workspace: 3, pid: 4211 });
  const named = S.windowContext({ address: "0xb", title: "t", ipc: { class: "foot", pid: 9 }, workspace: "code" }, list);
  assert.deepEqual(plain(S.windowSnapshot(named, list)), { class: "foot", title: "t", pid: 9 }, "a named workspace has no number");
  assert.deepEqual(plain(S.windowSnapshot(ctx, [])), { class: "foot", title: "project", pid: 4211 }, "no list, no workspace number");
  assert.deepEqual(plain(S.windowSnapshot(ctx, "junk")), { class: "foot", title: "project", pid: 4211 });
  const none = S.windowContext(null, []);
  assert.deepEqual(plain(S.windowSnapshot(none, list)), {}, "no window the bar came from, no window");
  assert.deepEqual(plain(S.windowSnapshot(null, list)), {});
  assert.deepEqual(plain(S.windowSnapshot({ address: "0xa", "class": "", title: "", pid: "" }, list)), { workspace: 3 }, "unknown fields are left out");
  assert.equal(S.windowSnapshot({ address: "0xa", pid: "4211abc", "class": "c", title: "t" }, list).pid, undefined, "a pid is digits");
});

test("window cwd: a path with a character just past C1 is kept, one inside it is not", () => {
  assert.equal(S.windowCwd("4211\t/a\u00a0b\n", 4211), "/a\u00a0b", "U+00A0 is a space, not a control");
  assert.equal(S.windowCwd("4211\t/a\u009fb\n", 4211), "");
});
