// The run contract and the Ctrl+K actions: what a row may ask for, and the
// exact argv each becomes.

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
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
  assert.equal(known[known.length - 1].label, "Reset ranking");
  assert.equal(known[known.length - 1].nodi, "forget");
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
