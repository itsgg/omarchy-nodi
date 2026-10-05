// The readers' parsers, on hand-made output and, where the program is here,
// on its real output.

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
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
  const r = plain(S.windows(JSON.stringify(clients) + "\n@@\n" + JSON.stringify({ id: 4 })));
  assert.deepEqual(r, { list: [{ address: "0xa", cls: "firefox", title: "Docs", workspace: "2", focus: 1, pid: 0 }], activeWorkspace: 4 });
  assert.deepEqual(plain(S.windows("garbage")), { list: [], activeWorkspace: null });
  assert.equal(S.windows('[]\n@@\n{"id":-1337,"name":"code"}').activeWorkspace, "name:code", "a named workspace, never its negative id");
  assert.equal(S.windows('[]\n@@\n{"id":-98,"name":"special:scratch"}').activeWorkspace, "special:scratch");
});

test("windows: the real hyprctl output parses", { skip: !process.env.HYPRLAND_INSTANCE_SIGNATURE }, () => {
  const out = execFileSync("bash", ["-c", "hyprctl clients -j; echo @@; hyprctl activeworkspace -j"]).toString();
  const r = S.windows(out);
  assert.equal(typeof r.activeWorkspace, "number");
  assert.ok(r.list.every(w => /^0x[0-9a-f]+$/.test(w.address)));
});

test("the window you came from: Hyprland's active window, filled in from the list", () => {
  const list = [{ address: "0x5b8f", cls: "foot", title: "vim notes.md", workspace: "2", focus: 0, pid: 5438 }];
  const ipc = { address: "0x5b8f", class: "foot", title: "old title", pid: 5438, workspace: { id: 2, name: "2" } };
  // Quickshell gives the address without 0x.
  assert.deepEqual(plain(S.windowContext({ address: "5b8f", title: "vim notes.md", ipc, workspace: "2" }, [])),
    { address: "0x5b8f", class: "foot", title: "vim notes.md", pid: "5438", workspace: "2" }, "the live title, not the record's");
  assert.deepEqual(plain(S.windowContext({ address: "5b8f", title: "", ipc: {}, workspace: "" }, list)),
    { address: "0x5b8f", class: "foot", title: "vim notes.md", pid: "5438", workspace: "2" }, "an empty record is filled from the list");
  assert.deepEqual(plain(S.windowContext({ address: "5b8f", title: "t", ipc: null }, [])),
    { address: "0x5b8f", class: "", title: "t", pid: "", workspace: "" }, "what is not known is empty");
  const none = { address: "", class: "", title: "", pid: "", workspace: "" };
  assert.deepEqual(plain(S.windowContext(null, list)), none, "no window had the focus");
  assert.deepEqual(plain(S.windowContext({ address: "0xzz;rm" }, list)), none, "an address that is not one");
  assert.equal(S.windowContext({ address: "1", title: "x".repeat(1000) }, []).title.length, 300);
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

test("reminders: soonest first", () => {
  const text = JSON.stringify({ count: 2, reminders: [
    { unit: "omarchy-reminder-2.timer", label: "Stretch", remaining: "40m", atTime: "17:40", remainingSeconds: 2400 },
    { unit: "omarchy-reminder-1.timer", label: "Tea", remaining: "5m", atTime: "17:05", remainingSeconds: 300 }] });
  assert.deepEqual(plain(S.reminders(text).map(r => r.label)), ["Tea", "Stretch"]);
  assert.deepEqual(plain(S.reminders("nope")), []);
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
