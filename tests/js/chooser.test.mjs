// A file dialog jump (ROADMAP 66): folders lead over a Save or Open
// dialog, Enter typing the path in.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, chmodSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { load, plain } from "./load.mjs";
import { Engine, config, services } from "./fixtures.mjs";

const C = load("providers/chooser.js");
const Run = load("lib/Run.js");
const eq = (a, b, m) => assert.deepEqual(plain(a), b, m);
const mine = rows => rows.filter(r => r.provider === "chooser");
// Rows that type a folder in, whichever provider made them.
const typing = rows => rows.filter(r => r.run && r.run.script === C.TYPE);

const portal = { address: "0x5a1", "class": "xdg-desktop-portal-gtk", title: "Save File", floating: true };
const folders = [
  { kind: "recent", path: "/home/u/Downloads" }, { kind: "recent", path: "/home/u/Work/kalvi/docs" }, { kind: "recent", path: "/home/u" },
  { kind: "recent", path: "/home/u/Notes" }, { kind: "recent", path: "/home/u/Old" },
  { kind: "z", path: "/home/u/Learn" }, { kind: "z", path: "/home/u/Work/GG/nodi" }, { kind: "z", path: "/home/u/Work" }, { kind: "z", path: "/home/u/Work/GG" },
  { kind: "bookmark", path: "/home/u/Projects" }, { kind: "xdg", path: "/home/u/Documents" }, { kind: "xdg", path: "/home/u/Pictures" }
];

test("chooser: a file dialog is the portal's, or a floating window titled as one", () => {
  assert.equal(C.dialogOf(portal).address, "0x5a1");
  for (const title of ["Save As", "Save File", "Open File", "File Upload", "Select a Folder", "Choose Files", "Export", "Open", "Save Image...",
                       "Save Image As", "Enter name of file to save to\u2026"])
    assert.ok(C.dialogOf({ address: "0x1", "class": "firefox", title, floating: true }), title);
  for (const title of ["Open questions - Obsidian", "Save the date.md - Zed", "Exporting", "Select all"])
    assert.equal(C.dialogOf({ address: "0x1", "class": "x", title, floating: true }), null, title);
  assert.equal(C.dialogOf({ address: "0x1", "class": "firefox", title: "Save As", floating: false }), null, "a tiled window is no dialog");
  for (const title of ["Open With\u2026", "Print", "Print Preview", "Choose an application", "Create Web Application", "Screenshot", "Deny Access"])
    assert.equal(C.dialogOf(Object.assign({}, portal, { title })), null, "the portal's other dialogs (Sonnet 2026-10-06): " + title);
  for (const title of ["Pick a photo to upload", "Open Microsoft Access database", "Select access log"])
    assert.ok(C.dialogOf(Object.assign({}, portal, { title })), "a portal file dialog by any title an app gives it: " + title);
  assert.equal(C.dialogOf(Object.assign({}, portal, { title: "Allow access to your location?" })), null);
  assert.equal(C.dialogOf({ address: "", "class": "xdg-desktop-portal-gtk", title: "Save File" }), null, "no window, nothing to type into");
});

test("chooser: over a dialog the empty bar leads with folders, four of recent files, three of zoxide's, then bookmarks and XDG", () => {
  const rows = Engine.home(config, services({ window: portal, chooserFolders: folders, history: {}, reminders: [] }));
  eq(mine(rows).map(r => [r.title, r.subtitle]), [
    ["Downloads", "~/Downloads"], ["docs", "~/Work/kalvi/docs"], ["Home", "~"], ["Notes", "~/Notes"],
    ["Learn", "~/Learn"], ["nodi", "~/Work/GG/nodi"], ["Work", "~/Work"], ["Projects", "~/Projects"]]);
  assert.equal(rows[0].title, "Downloads", "first on the bar");
  eq(mine(Engine.home(config, services({ window: { address: "0x2", "class": "foot", title: "~", floating: false }, chooserFolders: folders, history: {}, reminders: [] }))), [],
     "over any other window, nothing");
});

test("chooser: typed words find folders, offered and under your home, each once, above an app of that name", () => {
  const found = [{ path: "/home/u/Work/GG/nodi/", name: "nodi", dir: true }, { path: "/home/u/Work/GG/nodi-site/", name: "nodi-site", dir: true },
                 { path: "/home/u/Work/GG/nodi.md", name: "nodi.md", dir: false }];
  const rows = Engine.run("nodi", config, services({ window: portal, chooserFolders: folders, found: { q: "nodi", list: found } }));
  eq(typing(rows).map(r => r.subtitle), ["~/Work/GG/nodi/", "~/Work/GG/nodi-site/"], "zoxide's and fd's folder once; a file is no folder");
  assert.equal(rows[0].run.script, C.TYPE, "a folder leads");
  const file = rows.find(r => r.key === "file:/home/u/Work/GG/nodi.md");
  assert.equal(file.run.kind, "open", "a file opens as ever");
  const fd = rows.find(r => r.key === "file:/home/u/Work/GG/nodi-site/");
  eq(fd.actions.map(a => a.label), ["Open the folder", "Copy the path"], "its own run kept in Ctrl+K");
  assert.equal(Engine.run("work", config, services({ chooserFolders: folders }))[0].run.script === C.TYPE, false, "no dialog, no typing");
  eq(typing(Engine.run("work", config, services({ chooserFolders: folders }))), []);
  // Over a dialog a folder leads even an app named so: the dialog is
  // asking for a place (ROADMAP 66, "folders lead"); away from one,
  // Firefox is first as ever.
  const profiles = folders.concat([{ kind: "z", path: "/home/u/Firefox-profiles" }]);
  const over = Engine.run("firefox", config, services({ window: portal, chooserFolders: profiles }));
  eq([over[0].title, over[1].title], ["Firefox-profiles", "Firefox"]);
  assert.equal(Engine.run("firefox", config, services({ chooserFolders: profiles }))[0].title, "Firefox");
  // A folder whose name holds a newline is opened, never typed: wtype
  // would press Enter in the dialog.
  const odd = C.over(C.dialogOf(portal), "x", [{ key: "file:/home/u/a\nb", folder: "/home/u/a\nb", run: Run.open("/home/u/a\nb") }], { home: "/home/u" });
  assert.equal(odd[0].run.kind, "open");
});

test("chooser: a path's folders type themselves in, the folder itself first", () => {
  const directory = { path: "/home/u/Work", entries: [{ name: "GG", dir: true }, { name: "notes.txt", dir: false }] };
  const rows = Engine.run("~/Work/", config, services({ window: portal, directory }));
  eq(rows.map(r => [r.title, r.run.script === C.TYPE ? "type" : r.run.kind]), [["~/Work", "type"], ["GG", "type"], ["notes.txt", "open"]]);
  eq(plain([rows[1].run.args, rows[1].run.text]), [["0x5a1"], "/home/u/Work/GG/"]);
  eq(Engine.run("~/Work/", config, services({ directory }))[0].title, "Open ~/Work", "no dialog: as ever");
});

test("chooser: Enter types the path into the dialog, focused first, a slash after it", () => {
  const row = typing(Engine.run("downloads", config, services({ window: portal, chooserFolders: folders })))[0];
  eq(row.run, { kind: "shell", script: C.TYPE, paste: true, args: ["0x5a1"], text: "/home/u/Downloads/" });
  const c = plain(Run.command(row.run, null, "", "0x5a1"));
  const argv = c.command;
  assert.equal(argv[2], Run.FOCUS_FIRST, "the dialog focused again first (ROADMAP 69)");
  assert.equal(argv[4], "0x5a1");
  assert.deepEqual(c.environment, { NODI_TEXT: "/home/u/Downloads/" }, "the path beside it, in the environment");
  assert.ok(!argv.some(a => a.includes("Downloads")), "and in no argument");
});

test("chooser: the typing waits for nothing else: another window with the focus gets no keys", () => {
  const dir = mkdtempSync(join(tmpdir(), "nodi-chooser-"));
  try {
    const bin = join(dir, "bin");
    mkdirSync(bin);
    const log = join(dir, "wtype.log");
    writeFileSync(join(bin, "hyprctl"), '#!/usr/bin/bash\nprintf \'{"address":"%s"}\\n\' "$ACTIVE"\n');
    writeFileSync(join(bin, "wtype"), '#!/usr/bin/bash\nprintf "%s|" "$@" >> "' + log + '"; printf "stdin:%s\\n" "$(cat)" >> "' + log + '"\n');
    chmodSync(join(bin, "hyprctl"), 0o755);
    chmodSync(join(bin, "wtype"), 0o755);
    const env = { PATH: bin + ":/usr/bin:/bin", ACTIVE: "0x5a1" };
    execFileSync("/usr/bin/bash", ["-c", C.TYPE, "nodi", "0x5a1"], { env: { ...env, NODI_TEXT: "/home/u/My Files/" } });
    assert.equal(readFileSync(log, "utf8"), "-k|Home|-|stdin:/home/u/My Files/\n", "one wtype: no moment between Home and the path, the path on its stdin, in no argument");
    rmSync(log);
    const other = spawnSync("/usr/bin/bash", ["-c", C.TYPE, "nodi", "0x5a1"], { env: Object.assign({}, env, { ACTIVE: "0x777", NODI_TEXT: "/home/u/" }) });
    assert.equal(other.status, 1);
    assert.match(other.stderr.toString(), /no longer has the focus/);
    assert.ok(!existsSync(log), "not a key typed");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("chooser: the folders, from recent files (decoded, newest first), zoxide, GTK bookmarks and XDG", () => {
  const dir = mkdtempSync(join(tmpdir(), "nodi-chooser-"));
  try {
    const home = join(dir, "home");
    for (const d of ["My Files", "Older", "Work/a", "Pics", "Docs", ".local/share", ".config/gtk-3.0", "R&D's", "caf\u00e9", "back\\slash", "new\nline"])
      mkdirSync(join(home, d), { recursive: true });
    writeFileSync(join(home, ".local/share/recently-used.xbel"), [
      '<?xml version="1.0" encoding="UTF-8"?>', "<xbel>",
      `  <bookmark href="file://${home}/Older/x.pdf" added="2026-09-01T00:00:00Z" modified="2026-09-01T00:00:00Z" visited="2026-09-01T00:00:00Z">`, "  </bookmark>",
      `  <bookmark href="file://${home.replace(/ /g, "%20")}/My%20Files/y.pdf" added="2026-10-01T00:00:00Z" modified="2026-10-05T00:00:00Z" visited="2026-10-05T00:00:00Z">`, "  </bookmark>",
      `  <bookmark href="file://${home}/Gone/z.pdf" added="2026-10-02T00:00:00Z" modified="2026-10-06T00:00:00Z" visited="2026-10-06T00:00:00Z">`, "  </bookmark>",
      // As GLib writes them: & and ' as XML entities, the rest percent-escaped.
      `  <bookmark href="file://${home}/R&amp;D&apos;s/a.txt" added="2026-10-02T00:00:00Z" modified="2026-10-04T00:00:00Z" visited="2026-10-04T00:00:00Z">`, "  </bookmark>",
      `  <bookmark href="file://${home}/caf%C3%A9/b.txt" added="2026-10-02T00:00:00Z" modified="2026-10-03T00:00:00Z" visited="2026-10-03T00:00:00Z">`, "  </bookmark>",
      `  <bookmark href="file://${home}/back%5Cslash/c.txt" added="2026-10-02T00:00:00Z" modified="2026-10-02T00:00:00Z" visited="2026-10-02T00:00:00Z">`, "  </bookmark>",
      `  <bookmark href="file://${home}/new%0Aline/d.txt" added="2026-10-02T00:00:00Z" modified="2026-10-02T01:00:00Z" visited="2026-10-02T01:00:00Z">`, "  </bookmark>",
      "</xbel>"].join("\n"));
    writeFileSync(join(home, ".config/gtk-3.0/bookmarks"), `file://${home}/Pics Pictures\nsftp://host/x Remote\n`);
    const bin = join(dir, "bin");
    mkdirSync(bin);
    writeFileSync(join(bin, "zoxide"), `#!/usr/bin/bash\nprintf "%s\\n" "${home}/Work/a" "${home}/missing"\n`);
    writeFileSync(join(bin, "xdg-user-dir"), `#!/usr/bin/bash\n[ "$1" = DOCUMENTS ] && echo "${home}/Docs" || echo "${home}/"\n`);
    chmodSync(join(bin, "zoxide"), 0o755);
    chmodSync(join(bin, "xdg-user-dir"), 0o755);
    const out = execFileSync("/usr/bin/bash", ["-c", C.FOLDERS], { env: { HOME: home, PATH: bin + ":/usr/bin:/bin" } }).toString();
    eq(C.foldersOf(out).map(f => [f.kind, f.path.slice(home.length) || "~"]), [
      ["recent", "/My Files"], ["recent", "/R&D's"], ["recent", "/caf\u00e9"], ["recent", "/back\\slash"], ["recent", "/Older"],
      ["z", "/Work/a"], ["bookmark", "/Pics"], ["xdg", "~"], ["xdg", "/Docs"]],
      "entities and escapes decoded (Sonnet 2026-10-06), a gone folder and a remote bookmark left out, one with a newline too, each folder once");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
