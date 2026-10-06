// The run contract and the Ctrl+K actions: what a row may ask for, and the
// exact argv each becomes.

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { load, plain } from "./load.mjs";

const Run = load("lib/Run.js");
const Rows = load("lib/Rows.js");

const LOGIN = ["bash", "-lc", 'exec "$@"', "nodi"];

test("well-formed runs pass, malformed ones say why", () => {
  for (const ok of [Run.exec(["omarchy-reminder", "5"]), Run.shell("echo hi"), Run.app("firefox"), Run.app("firefox", 0), Run.app("Google Calendar"),
    Run.focus("0xab12"), Run.open("https://example.com"), Run.open("/home/u/a.pdf"), Run.open("obsidian://open"),
    Run.summon("omarchy.menu", { menu: "root" }), Run.copy("x")]) assert.equal(Run.problem(ok), "", JSON.stringify(ok));
  const bad = [
    [null, "no run"], [{ kind: "exec", argv: [] }, "exec needs argv"], [{ kind: "exec", argv: ["ls", 3] }, "argv must be strings"],
    [{ kind: "exec", argv: ["-rf", "x"] }, "program looks like an option"],
    [{ kind: "shell", script: "  " }, "shell needs a script"], [{ kind: "app", id: "../x" }, "bad desktop id"],
    [{ kind: "app", id: "a/b" }, "bad desktop id"], [{ kind: "app", id: "-x" }, "bad desktop id"], [{ kind: "app", id: "a\nb" }, "bad desktop id"], [{ kind: "app", id: "a\u0085b" }, "bad desktop id"],
    [{ kind: "app", id: "x", action: 1.5 }, "bad action index"], [{ kind: "window", address: "$(rm -rf ~)" }, "window address must be hex"],
    [{ kind: "open", target: "--help" }, "target looks like an option"], [{ kind: "open", target: "relative/path" }, "target must be a URL or an absolute path"],
    [{ kind: "summon", id: "a b" }, "bad plugin id"], [{ kind: "copy", text: "" }, "copy needs text"], [{ kind: "bash", script: "x" }, "unknown kind bash"]
  ];
  for (const [run, why] of bad) assert.equal(Run.problem(run), why);
});

test("every kind becomes one argv, started the way Omarchy's menu starts things", () => {
  assert.deepEqual(plain(Run.command(Run.exec(["omarchy-reminder", "5", "tea; rm -rf ~"]))), LOGIN.concat(["omarchy-reminder", "5", "tea; rm -rf ~"]));
  assert.deepEqual(plain(Run.command(Run.shell("omarchy-launch-about"))), ["bash", "-lc", "omarchy-launch-about", "nodi"]);
  assert.deepEqual(plain(Run.command(Run.shell('echo "$1"', ["a b"]))), ["bash", "-lc", 'echo "$1"', "nodi", "a b"]);
  assert.equal(Run.command(Run.shell("echo", [1])), null, "shell args must be strings");
  assert.deepEqual(plain(Run.command(Run.app("firefox"))), LOGIN.concat(["uwsm-app", "--", "gtk-launch", "firefox.desktop"]));
  assert.deepEqual(plain(Run.command(Run.app("Disk Usage"))), LOGIN.concat(["uwsm-app", "--", "gtk-launch", "Disk Usage.desktop"]), "a name with a space is one argument");
  assert.deepEqual(plain(Run.command(Run.app("firefox", 1), (id, i) => ["firefox", "--private-window"])), LOGIN.concat(["uwsm-app", "--", "firefox", "--private-window"]));
  assert.equal(Run.command(Run.app("firefox", 1), () => null), null, "an action with no Exec runs nothing");
  assert.deepEqual(plain(Run.command(Run.open("https://x.org"))), LOGIN.concat(["xdg-open", "https://x.org"]));
  assert.deepEqual(plain(Run.command(Run.summon("omarchy.emojis"))), LOGIN.concat(["omarchy-shell", "shell", "summon", "omarchy.emojis", "{}"]));
  assert.deepEqual(plain(Run.command(Run.copy("a b"))), LOGIN.concat(["wl-copy", "--", "a b"]));
  const focus = plain(Run.command(Run.focus("0xab")));
  assert.equal(focus[0], "bash"); assert.equal(focus[4], "0xab", "the address is a positional argument, not script text");
  assert.equal(Run.command({ kind: "window", address: "0xab; reboot" }), null);
});

test("the login wrapper keeps arguments literal", () => {
  const argv = Run.command(Run.exec(["printf", "%s|", "$(echo pwned)", "a b", "'q'"]));
  // Run the wrapper without the login part, so the test does not read the profile.
  const out = execFileSync(argv[0], ["-c", argv[2], ...argv.slice(3)]).toString();
  assert.equal(out, "$(echo pwned)|a b|'q'|");
});

test("window actions build only from hex addresses", () => {
  assert.match(Run.closeWindow("0x1f").argv[2], /^hl\.dsp\.window\.close\(\{ window = "address:0x1f" \}\)$/);
  assert.match(Run.floatWindow("0x1f").argv[2], /hl\.dsp\.window\.float\(.*action = "toggle"/);
  assert.equal(Run.bringWindow("0x1f", "3").argv[5], "3");
  assert.equal(Run.closeWindow("0x1f\" }) hl.dsp.exit() --"), null);
  assert.equal(Run.bringWindow("0x1f", "3; reboot"), null);
  assert.equal(Run.bringWindow("0x1f", "name:code").argv[5], "name:code", "a named workspace by its name");
  for (const w of ["-1337", "0", "name:a\"b", "name:a\\b", "name:", "special:x\" })"]) assert.equal(Run.bringWindow("0x1f", w), null, w);
});

test("a row with a bad run keeps its text and loses the run", () => {
  const row = Rows.normalize({ title: "x", run: { kind: "exec", argv: [] } }, { id: "t", name: "T" }, 0, 0);
  assert.equal(row.run, null); assert.equal(row.title, "x");
  const armed = Rows.normalize({ title: "y", confirm: true }, { id: "t", name: "T" }, 0, 0);
  assert.equal(armed.confirm, false, "confirm without a run means nothing");
});

test("Ctrl+K: the row's own action first, every entry runnable", () => {
  const win = Rows.normalize({ title: "GitHub", copy: "", run: Run.focus("0xb2") }, { id: "windows", name: "Windows" }, 0, 0);
  const labels = Rows.actionsFor(win, { activeWorkspace: 4 }).map(a => a.label);
  assert.deepEqual(plain(labels), ["Switch", "Bring to this workspace", "Toggle floating", "Close window", "Copy title"]);
  assert.deepEqual(plain(Rows.actionsFor(win, {}).map(a => a.label)), ["Switch", "Toggle floating", "Close window", "Copy title"]);
  const sum = Rows.normalize({ title: "1,024", copy: "1024" }, { id: "math", name: "Calculator" }, 0, 0);
  assert.deepEqual(plain(Rows.actionsFor(sum, {}).map(a => a.label)), ["Copy 1024", "Copy title"]);
  const danger = Rows.normalize({ title: "Shutdown", copy: "", confirm: true, run: Run.shell("omarchy-system-shutdown") }, { id: "menu", name: "Omarchy" }, 0, 0);
  assert.equal(Rows.actionsFor(danger, {})[0].confirm, true, "the palette keeps the confirmation");
  for (const a of Rows.actionsFor(win, { activeWorkspace: 4 })) assert.equal(Run.problem(a.run), "");
  // An app can be uninstalled as Omarchy's launcher does it, after a second Enter.
  const app = Rows.normalize({ title: "Spotify", copy: "", run: Run.app("spotify") }, { id: "apps", name: "Apps" }, 0, 0);
  const un = Rows.actionsFor(app, {}).find(a => a.label === "Uninstall");
  assert.deepEqual(plain(un.run.argv.slice(-2)), ["spotify", "Spotify"], "the id and the name as arguments, never as script text");
  assert.match(un.run.argv[2], /omarchy-remove-launcher-entry "\$1" "\$2"/);
  assert.equal(un.confirm, true);
  const newWindow = Rows.normalize({ title: "New Window", copy: "", run: Run.app("firefox", 0) }, { id: "apps", name: "Apps" }, 0, 0);
  assert.ok(!Rows.actionsFor(newWindow, {}).some(a => a.label === "Uninstall"), "not on a desktop action");
});

test("Ctrl+K offers Reset ranking only for a row with history", () => {
  const row = Rows.normalize({ key: "app:foot", title: "Foot", run: Run.app("foot") }, { id: "apps", name: "Apps" }, 0, 0);
  const known = Rows.actionsFor(row, { knows: k => k === "app:foot" });
  const reset = known.find(a => a.nodi === "forget");
  assert.deepEqual([reset.label, reset.group], ["Reset ranking", "Manage"]);
  assert.equal(known[known.length - 1].label, "Uninstall", "in Manage, Uninstall last (ROADMAP 52)");
  assert.ok(!Rows.actionsFor(row, { knows: () => false }).some(a => a.nodi));
  assert.ok(!Rows.actionsFor(row, {}).some(a => a.nodi));
});

test("a file's path as a URL keeps # and ? as part of the name", () => {
  const Rows = load("lib/Rows.js");
  assert.equal(Rows.fileUrl("/home/u/shot #2.png"), "file:///home/u/shot%20%232.png");
  assert.equal(Rows.fileUrl("/home/u/100%?.png"), "file:///home/u/100%25%3F.png");
});

test("a file's preview: its details and first lines once the read lands", () => {
  const Rows = load("lib/Rows.js");
  const F = load("providers/files.js");
  const head = F.parseHead("12147\t1791079693\ntext/plain\n# Nodi\n\nA command bar.\n", true);
  assert.deepEqual(JSON.parse(JSON.stringify(head)), { size: 12147, modified: 1791079693, type: "text/plain", text: "# Nodi\n\nA command bar." });
  const p = { title: "README.md", subtitle: "~/x", read: { source: "file-head", param: "/x/README.md" } };
  assert.deepEqual(JSON.parse(JSON.stringify(Rows.withRead(p, { state: "pending" }))), { title: "README.md", subtitle: "~/x", labels: [] }, "the header while it reads");
  const done = Rows.withRead(p, { state: "ready", value: head }, () => "2026-10-04 07:31");
  assert.deepEqual(JSON.parse(JSON.stringify(done.labels)), [["Size", "11.9 KB"], ["Modified", "2026-10-04 07:31"], ["Type", "text/plain"]]);
  assert.equal(done.text, "# Nodi\n\nA command bar."); assert.equal(done.mono, true);
  const bin = Rows.withRead(p, { state: "ready", value: F.parseHead("1195144\t1781065932\napplication/x-pie-executable\n", true) });
  assert.ok(!bin.text, "a binary file: its labels, no text");
  assert.throws(() => F.parseHead("", false));
});

test("a watched command says it failed, with its last line, and only then (ROADMAP 53)", () => {
  const dir = mkdtempSync(join(tmpdir(), "nodi-watch-"));
  const log = join(dir, "said");
  writeFileSync(join(dir, "notify-send"), `#!/usr/bin/bash\nprintf '%s|' "$@" >> ${JSON.stringify(log)}\necho >> ${JSON.stringify(log)}\n`, { mode: 0o755 });
  const said = () => { try { return readFileSync(log, "utf8").trim().split("\n").filter(Boolean); } catch { return []; } };
  const runIt = (argv) => {
    const a = Run.watched("Sync notes", argv);
    assert.deepEqual(plain(a.slice(0, 2)), ["bash", "-lc"]);
    // As a plain shell here, with the fake on the PATH: a login shell would read the user's profile.
    try { execFileSync("/usr/bin/bash", ["-c"].concat(a.slice(2)), { env: { PATH: dir + ":/usr/bin:/bin", XDG_RUNTIME_DIR: dir }, stdio: "pipe" }); return 0; }
    catch (e) { return e.status; }
  };
  assert.equal(runIt(["bash", "-c", "echo working >&2; echo 'rsync: connection refused' >&2; exit 3"]), 3, "its own exit code");
  assert.deepEqual(said(), ["-a|Nodi|--|Sync notes failed|rsync: connection refused|"]);
  assert.equal(runIt(["bash", "-c", "exit 1"]), 1);
  assert.equal(said().length, 1, "a failure that says nothing is quiet");
  assert.equal(runIt(["bash", "-c", "echo bye >&2; kill -TERM $$"]), 143);
  assert.equal(said().length, 1, "an exit by a signal is quiet");
  assert.equal(runIt(["bash", "-c", "echo fine >&2"]), 0);
  assert.equal(said().length, 1, "success is quiet");
  assert.equal(runIt(["bash", "-c", "echo 'the disk is full' >&2; sleep 0.4 & exit 2"]), 2);
  assert.equal(said()[1], "-a|Nodi|--|Sync notes failed|the disk is full|", "a child that holds stderr a moment longer: the line still read (Fable 2026-10-05)");
  assert.equal(runIt(["bash", "-c", "echo '-x is not an option' >&2; exit 4"]), 4);
  assert.equal(said()[2], "-a|Nodi|--|Sync notes failed|-x is not an option|", "a line that starts with a dash is no option to notify-send");
  assert.equal(runIt(["printf", "%s", "$(touch " + join(dir, "pwned") + ")"]), 0);
  assert.ok(!existsSync(join(dir, "pwned")), "arguments are never read as shell");
  assert.deepEqual(readdirSync(dir).filter(f => f.startsWith("nodi-err")), [], "no file left behind");
  assert.equal(Run.command(Run.exec(["true"]), null, "T")[2].indexOf("notify-send") > 0, true, "a titled command is watched");
  assert.deepEqual(plain(Run.command(Run.exec(["true"]), null)).slice(0, 3), ["bash", "-lc", 'exec "$@"'], "untitled, as before");
  assert.equal(Run.command(Run.app("firefox"), null, "Firefox")[2], 'exec "$@"', "an app is not watched: LaunchFeedback says");
});


// Ctrl+K grouped and typed into (ROADMAP 52).
test("Ctrl+K: the row's own, then Copy, then Manage, each with its chord", () => {
  const Prefs = load("lib/Prefs.js");
  const row = Rows.normalize({ key: "app:firefox", title: "Firefox", run: Run.app("firefox"), copy: "",
                                actions: [{ label: "New Window", run: Run.app("firefox", 0) }] }, { id: "apps", name: "Apps" }, 0, 0);
  const acts = Rows.actionsFor(row, { prefs: Prefs.empty(), knows: () => true });
  assert.deepEqual(plain(acts.map(a => [a.label, a.group, a.chord])), [
    ["Open", "", "Enter"], ["New Window", "", ""], ["Copy desktop id", "Copy", ""],
    ["Add to favourites", "Manage", "Ctrl Shift F"], ["Add alias", "Manage", "Ctrl Shift A"], ["Set hotkey", "Manage", ""],
    ["Copy deeplink", "Manage", "Ctrl Shift D"], ["Reset ranking", "Manage", ""], ["Hide", "Manage", "Ctrl Shift H"], ["Uninstall", "Manage", ""]]);
  assert.deepEqual(plain(acts.filter(a => a.own).map(a => a.label)), ["Open"], "one own action");
  const sum = Rows.normalize({ key: "calc:1", title: "= 4", copy: "4", run: Run.exec(["true"]) }, { id: "calc", name: "Calculator" }, 0, 0);
  const copy = Rows.actionsFor(sum, {}).find(a => a.label === "Copy 4");
  assert.deepEqual([copy.chord, copy.chordKey, copy.group], ["Ctrl Enter", "copy", "Copy"], "what Ctrl+Enter copies from the list");
});

test("Ctrl+K typed into: words that start the label or group's, each group under its name once", () => {
  const Prefs = load("lib/Prefs.js");
  const row = Rows.normalize({ key: "app:firefox", title: "Firefox", run: Run.app("firefox"), copy: "" }, { id: "apps", name: "Apps" }, 0, 0);
  const acts = Rows.actionsFor(row, { prefs: Prefs.empty(), knows: () => true });
  const f = text => plain(Rows.filterActions(acts, text).map(a => [a.label, a.section]));
  assert.deepEqual(f("fav"), [["Add to favourites", "Manage"]]);
  assert.deepEqual(f("copy"), [["Copy desktop id", "Copy"], ["Copy deeplink", "Manage"]]);
  assert.deepEqual(f("COPY  Desk"), [["Copy desktop id", "Copy"]], "every word, any case");
  assert.equal(f("manage").length, 7, "a group by its name");
  assert.deepEqual(f("pen"), [], "the start of a word, not its inside");
  const aliased = Rows.actionsFor(row, { prefs: Prefs.withAlias(Prefs.empty(), 'x"y', row.key, { title: "Firefox", run: row.run }), knows: () => true });
  for (const q of ['remove "x', 'remove x"y', "alias x"])
    assert.deepEqual(plain(Rows.filterActions(aliased, q).map(a => a.label)), ['Remove alias "x"y"'], q + ": typed as the label is split (Sonnet 2026-10-06)");
  assert.deepEqual(f("zz"), []);
  const all = f("");
  assert.equal(all.length, acts.length);
  assert.deepEqual(all.filter(a => a[1]).map(a => a[1]), ["Copy", "Manage"], "the row's own under the row's name, the others under theirs");
  assert.ok(!("section" in acts[3]), "the list actionsFor gave is left as it was");
});
