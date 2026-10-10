// Script commands: the @nodi header (or Raycast's @raycast one) read from a folder, rows by title or
// file name, each mode run as it says, arguments never read as shell.

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, chmodSync, readFileSync, existsSync, rmSync, mkdirSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { load, root, plain } from "./load.mjs";
import { config, run, top } from "./fixtures.mjs";
import { toastShell, toasts, toastArgv, carriersLeft } from "./toastfake.mjs";

const S = load("providers/scripts.js");
const Run = load("lib/Run.js");
const DIR = join(root, "tests/js/fixtures/scripts");
const argv = S.provider.sources.scripts.argv(DIR + "\n/nonexistent");
const scripts = S.parseScripts(execFileSync(argv[0], argv.slice(1), { env: { PATH: "/usr/bin:/bin", HOME: "/nonexistent" } }).toString());
const at = name => join(DIR, name);
const rows = (q, extra) => run(q, Object.assign({ scripts }, extra || {})).filter(r => r.key && r.key.indexOf("script:") === 0);

test("the folder is read for headers only: executable, not hidden, with a title and a known mode", () => {
  assert.deepEqual(plain(scripts.map(s => s.title)).sort(),
    ["Always Fails", "Say Hello", "Search Docs", "Show Build Log", "Unlock Vault", "Uptime"]);
  const hello = scripts.find(s => s.keyword === "hello");
  assert.deepEqual(plain(hello.args.map(a => [a.type, a.placeholder, a.optional])), [["text", "name", false], ["dropdown", "tone", true]]);
  assert.equal(scripts.find(s => s.keyword === "uptime").refreshMs, 30000);
  assert.equal(scripts.find(s => s.keyword === "show-log").cwd, "~/logs");
  assert.equal(S.glyph("👋"), "👋"); assert.equal(S.glyph("images/github.png"), "");
});

test("a silent script by its file name with arguments; the dropdown by title; one missing fills the name in", () => {
  const r = top("hello Ravi loud", { scripts });
  assert.equal(r.title, "Say Hello");
  // The values in the environment, each ended by the unit separator, never
  // arguments (the marketplace's review, 2026-10-10).
  assert.deepEqual(plain([r.run.args, r.run.text]), [["Say Hello", DIR, at("hello.sh")], "Ravi\u001floud\u001f"]);
  assert.equal(r.remember, false, "filled-in arguments name a moment");
  assert.equal(top("hello Ravi", { scripts }).run.text, "Ravi\u001f\u001f", "an optional argument left out is empty");
  const bad = top("hello Ravi shout", { scripts });
  assert.equal(bad.hint, "hello <name> [tone: Loud|Soft]", "the choices on the hint line"); assert.ok(!bad.run);
  const bare = top("hello", { scripts });
  assert.equal(bare.complete, "hello "); assert.ok(!bare.run);
  assert.equal(top("say hello", { scripts }).title, "Say Hello", "by its title");
});

test("fullOutput runs in Omarchy's floating terminal, in its folder, after a second Enter when it asks", () => {
  const r = top("show build log", { scripts });
  assert.equal(r.confirm, true);
  assert.match(r.run.script, /exec uwsm-app -- xdg-terminal-exec --app-id=org\.omarchy\.terminal "--title=\$t" -e bash -c "\$l" nodi "\$f" "\$p" "\$d" "\$@"$/);
  assert.deepEqual(plain(r.run.args.slice(1)), ["/home/u/logs", at("show-log.sh"), "Show Build Log"]);
  assert.equal(r.run.text, undefined, "no arguments: nothing handed on");
});

test("inline shows the first line of output, read again after its refreshTime", () => {
  assert.equal(rows("uptime")[0].subtitle, "Running...");
  const r = rows("uptime", { scriptOutput: { [at("uptime.sh")]: "up 3 days" } })[0];
  assert.equal(r.subtitle, "up 3 days"); assert.equal(r.copy, "up 3 days");
  const src = S.provider.sources["script-output"];
  assert.equal(src.maxAgeMs(JSON.stringify([DIR, at("uptime.sh"), 30000])), 30000);
  assert.equal(src.parse("\n first line\nsecond\n", true), " first line");
  assert.throws(() => src.parse("", false));
});

test("a password argument is not taken in the bar; scripts lists them all; none found says where", () => {
  const r = top("unlock", { scripts });
  assert.equal(r.subtitle, "Password argument"); assert.equal(r.badge, "Not run"); assert.ok(!r.run);
  assert.equal(rows("scripts ").length, 6);
  assert.deepEqual(plain(rows("scripts docs").map(r => r.title)), ["Search Docs"]);
  assert.equal(top("scripts ", { scripts: [] }).title, "No scripts found");
  assert.match(top("scripts ", { scripts: [] }).subtitle, /~\/\.config\/omarchy\/nodi\/scripts$/);
});

test("a one-argument script can be a fallback, its value percent-encoded when it asks", () => {
  const cfg = Object.assign({}, config, { fallbacks: ["scripts"] });
  const fb = run("zzqx a&b", { scripts }, cfg).filter(r => r.provider === "fallback");
  assert.deepEqual(plain(fb.map(r => r.title)), ["Search Docs: zzqx a&b"]);
  assert.equal(fb[0].run.text, "zzqx%20a%26b\u001f");
});

// The silent mode's shell, run for real against a stand-in omarchy-shell:
// what it says goes to Nodi's own toast (Run.js TOAST), never notify-send
// (the marketplace's review, 2026-10-10).
function quiet(row) {
  const home = mkdtempSync(join(tmpdir(), "nodi-scripts-"));
  const bin = join(home, "bin");
  mkdirSync(bin);
  toastShell(bin);
  try {
    // An argv, or { command, environment } when the run carries text.
    const c = Run.command(row.run);
    const cmd = Array.isArray(c) ? c : c.command;
    execFileSync(cmd[0], cmd.slice(1), { env: { HOME: home, PATH: bin + ":/usr/bin:/bin", XDG_RUNTIME_DIR: home, ...(Array.isArray(c) ? {} : c.environment) }, cwd: home });
    return { said: toasts(bin).map(t => [t.title, t.body]), argv: toastArgv(bin), left: carriersLeft(home) };
  } finally { rmSync(home, { recursive: true, force: true }); }
}

test("silent shows the last line, a failure says so, and an argument is text, never shell", () => {
  const hello = quiet(top("hello Ravi soft", { scripts }));
  assert.deepEqual(hello.said, [["Say Hello", "hello Ravi (soft)"]]);
  assert.ok(!/hello Ravi/.test(hello.argv), "the output in no argument");
  assert.deepEqual(hello.left, [], "nothing left behind");
  assert.deepEqual(quiet(top("always fails", { scripts })).said, [["Always Fails failed", "it broke"]]);
  const marker = join(tmpdir(), "nodi-scripts-injected");
  rmSync(marker, { force: true });
  const said = quiet(top('hello "$(touch ' + marker + ')"', { scripts })).said;
  assert.ok(!existsSync(marker), "nothing typed ran");
  assert.equal(said[said.length - 1][1], "hello $(touch " + marker + ")");
});

test("an argument number left out keeps its place, so argument3 is still $3", () => {
  const out = ["# @raycast.title Gap", "# @raycast.mode silent",
    '# @raycast.argument1 { "type": "text", "placeholder": "first" }',
    '# @raycast.argument3 { "type": "text", "placeholder": "third" }'].map(l => "/s/gap.sh\u0000" + l).join("\n");
  const gap = S.parseScripts(out);
  assert.deepEqual(plain(gap[0].args.map(a => a.type)), ["text", "gap", "text"]);
  const r = top("gap a b c", { scripts: gap });
  assert.equal(r.run.text, "a\u001f\u001fb c\u001f");
  assert.equal(top("gap a", { scripts: gap }).hint, "gap <first> <third>");
});

test("a header in Nodi's words and one in Raycast's are both read; a key given both ways takes the first", () => {
  assert.ok(readFileSync(at("hello.sh"), "utf8").includes("@nodi.title"), "the fixture says @nodi");
  assert.ok(readFileSync(at("uptime.sh"), "utf8").includes("@raycast.title"), "and another says @raycast");
  const mixed = S.parseScripts("/s/x\u0000# @nodi.title Mine\n/s/x\u0000# @raycast.title Theirs\n/s/x\u0000# @raycast.mode silent\n");
  assert.equal(mixed[0].title, "Mine");
  assert.equal(mixed[0].mode, "silent");
});

test("a folder that cannot be entered stops the script; it never runs where Nodi was", () => {
  const dir = mkdtempSync(join(tmpdir(), "nodi-cwd-"));
  toastShell(dir);
  const marker = join(dir, "ran");
  const script = { title: "Touch", path: "/usr/bin/touch", cwd: join(dir, "gone"), args: [], mode: "silent" };
  const r = S.quiet(script, [marker], "/nonexistent");
  execFileSync("bash", ["-c", r.script, "nodi", ...r.args], { env: { PATH: dir + ":/usr/bin:/bin", XDG_RUNTIME_DIR: dir } });
  assert.equal(existsSync(marker), false, "the script did not run");
  assert.equal(toasts(dir).length, 1);
  assert.equal(toasts(dir)[0].title, "Touch failed");
  assert.match(toasts(dir)[0].body, /^Cannot enter .*gone$/);
  rmSync(dir, { recursive: true, force: true });
});

test("a script that asks twice is not run to fill its row, and asks twice from Ctrl+K", () => {
  const asked = [];
  const confirmInline = { path: "/s/check", keyword: "check", title: "Check", mode: "inline", packageName: "", description: "", icon: "", cwd: "",
                          confirm: true, refreshMs: 60000, args: [] };
  const r = S.row(confirmInline, "", { home: "/home/u", request: (name, param) => { asked.push(name); return { state: "pending" } } }, {});
  assert.deepEqual(asked, [], "its output is not read");
  assert.equal(r.confirm, true);
  assert.equal(r.actions[0].confirm, true, "Run in a terminal asks twice too");
});

test("an argument that is JSON but no object marks the script invalid, places kept", () => {
  const listing = "/s/x\u0000# @nodi.title X\n/s/x\u0000# @nodi.mode silent\n/s/x\u0000# @nodi.argument1 null\n/s/x\u0000# @nodi.argument2 {\"type\": \"text\", \"placeholder\": \"b\"}\n";
  const parsed = S.parseScripts(listing)[0];
  assert.deepEqual(plain(parsed.args.map(a => a.type)), ["invalid", "text"], "argument 2 stays argument 2");
  const r = S.row(parsed, "a b", { home: "/home/u" }, {});
  assert.equal(r.badge, "Not run");
  assert.equal(r.run, undefined);
});

test("an inline script's output is read from its own folder, with what it prints", async () => {
  const S = load("providers/scripts.js");
  const dir = mkdtempSync(join(tmpdir(), "nodi-inline-"));
  try {
    writeFileSync(join(dir, "where.sh"), "#!/bin/bash\npwd\necho second\n");
    chmodSync(join(dir, "where.sh"), 0o755);
    const src = S.provider.sources["script-output"];
    const argv = src.argv(JSON.stringify([dir, join(dir, "where.sh"), 0]));
    const out = execFileSync(argv[0], argv.slice(1), { env: { PATH: "/usr/bin:/bin", HOME: dir } }).toString();
    assert.equal(out, dir + "\nsecond\n");
    assert.throws(() => src.parse("", false), /the script failed/);
    const gone = src.argv(JSON.stringify([join(dir, "nope"), join(dir, "where.sh"), 0]));
    // HOME is the test's: a login shell with none reads the real one's
    // profile (Cursor's review, 2026-10-10).
    assert.throws(() => execFileSync(gone[0], gone.slice(1), { env: { PATH: "/usr/bin:/bin", HOME: dir }, stdio: "pipe" }),
                  e => e.status === 1 && e.stdout.toString() === "", "no folder: it fails, never runs elsewhere");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// What is typed for a script reaches it as NODI_ARGUMENT1.. and in no
// program's arguments, which any local user can read in /proc; with
// "scripts": { "arguments": true } as $1.. too (the marketplace's review,
// 2026-10-10). Each run for real: silent as Nodi starts it, fullOutput
// through stand-ins for uwsm-app, the terminal, Omarchy's banners and its
// shell (the toast), each keeping its arguments.
function typedRun(mode, settings) {
  const home = mkdtempSync(join(tmpdir(), "nodi-typed-"));
  const bin = join(home, "bin"), run = join(home, "run");
  mkdirSync(bin); mkdirSync(run, { mode: 0o700 });
  const log = join(home, "argv.log"), said = join(home, "said");
  const stub = (name, body) => { writeFileSync(join(bin, name), '#!/bin/bash\nprintf "%s\\n" "$*" >> ' + JSON.stringify(log) + '\n' + body); chmodSync(join(bin, name), 0o755); };
  stub("omarchy-shell", "exit 0\n");
  stub("uwsm-app", '[ "$1" = -- ] && shift; exec "$@"\n');
  stub("xdg-terminal-exec", 'while [ "$#" -gt 0 ] && [ "$1" != -e ]; do shift; done; shift; exec "$@"\n');
  stub("omarchy-show-logo", "exit 0\n");
  stub("omarchy-show-done", "exit 0\n");
  const script = join(home, "greet");
  writeFileSync(script, '#!/bin/bash\nprintf "%s|%s|%s|%s\\n" "$#" "${NODI_ARGUMENT1-}" "${NODI_ARGUMENT2-}" "${NODI_TEXT-unset}" > ' + JSON.stringify(said) + '\n');
  chmodSync(script, 0o755);
  const s = { path: script, keyword: "greet", title: "Greet", mode, packageName: "", description: "", icon: "", cwd: "", confirm: false, refreshMs: 0,
              args: [{ type: "text", placeholder: "who", optional: false }, { type: "text", placeholder: "what", optional: false }] };
  try {
    const r = S.row(s, "Ravi the merger plan", { home, settings }, {});
    const c = Run.command(r.run);
    execFileSync(c.command[0], c.command.slice(1), { env: { HOME: home, PATH: bin + ":/usr/bin:/bin", XDG_RUNTIME_DIR: run, ...c.environment }, cwd: home });
    // Nodi's own command line, then every stand-in's.
    const argvs = c.command.join(" ") + "\n" + (existsSync(log) ? readFileSync(log, "utf8") : "");
    return { said: readFileSync(said, "utf8").trim(), argvs, left: execFileSync("/usr/bin/ls", ["-A", run]).toString() };
  } finally { rmSync(home, { recursive: true, force: true }); }
}

test("a script's typed arguments are NODI_ARGUMENT1.., in no program's arguments; \"arguments\": true makes them $1.. too", () => {
  for (const mode of ["silent", "fullOutput"]) {
    const r = typedRun(mode, {});
    assert.equal(r.said, "0|Ravi|the merger plan|unset", mode + ": in its environment, NODI_TEXT gone, no argument");
    assert.ok(!r.argvs.includes("merger") && !r.argvs.includes("Ravi"), mode + ", in an argument: " + r.argvs);
    assert.equal(r.left, "", mode + ": nothing left in the runtime folder");
    assert.equal(typedRun(mode, { arguments: true }).said, "2|Ravi|the merger plan|unset", mode + ": as $1 and $2 too, when asked");
  }
});

// Run for real, as Nodi starts it, against stand-ins (Fable 2026-10-10):
// the arguments file goes on every path, a value's own unit separator is
// dropped, and an empty value keeps its place.
function scriptRun(s, typed, opts = {}) {
  const home = mkdtempSync(join(tmpdir(), "nodi-scriptrun-"));
  const bin = join(home, "bin"), run = join(home, "run"), said = join(home, "said");
  mkdirSync(bin); mkdirSync(run, { mode: 0o700 });
  const stub = (name, body) => { writeFileSync(join(bin, name), "#!/bin/bash\n" + body); chmodSync(join(bin, name), 0o755); };
  stub("omarchy-shell", "exit 0\n");
  stub("omarchy-show-logo", "exit 0\n");
  stub("omarchy-show-done", "exit 0\n");
  if (!opts.noTerminal) {
    stub("uwsm-app", '[ "$1" = -- ] && shift; exec "$@"\n');
    stub("xdg-terminal-exec", 'while [ "$#" -gt 0 ] && [ "$1" != -e ]; do shift; done; shift; exec "$@"\n');
  }
  const script = join(home, "greet");
  writeFileSync(script, '#!/bin/bash\nprintf "%s|%s|%s|%s\\n" "$#" "${NODI_ARGUMENT1-unset}" "${NODI_ARGUMENT2-unset}" "${NODI_ARGUMENT3-unset}" > ' + JSON.stringify(said) + '\n', { mode: 0o755 });
  const sc = Object.assign({ path: script, keyword: "greet", title: "Greet", mode: "fullOutput", packageName: "", description: "", icon: "", cwd: "", confirm: false, refreshMs: 0,
              args: [{ type: "text", placeholder: "a", optional: false }, { type: "text", placeholder: "b", optional: true }, { type: "text", placeholder: "c", optional: false }] }, s);
  try {
    const r = S.row(sc, typed, { home, settings: {} }, {});
    const c = Run.command(r.run);
    let status = 0;
    try { execFileSync(c.command[0], c.command.slice(1), { env: { HOME: home, PATH: bin + ":/usr/bin:/bin", XDG_RUNTIME_DIR: run, NODI_ARGUMENTS_KEEP: "1", ...c.environment }, cwd: home, stdio: "pipe" }); }
    catch (e) { status = e.status; }
    const leftNow = readdirSync(run).filter(f => f.startsWith("nodi-arguments."));
    return { status, said: existsSync(said) ? readFileSync(said, "utf8").trim() : "", leftNow, run, text: r.run.text, home, done: () => rmSync(home, { recursive: true, force: true }) };
  } catch (e) { rmSync(home, { recursive: true, force: true }); throw e; }
}

test("a fullOutput script's arguments file goes when its folder cannot be entered, and when no terminal starts (Fable 2026-10-10)", async () => {
  let r = scriptRun({ cwd: "/nonexistent-nodi-folder" }, "x y z");
  try {
    assert.equal(r.status, 1, "it stops");
    assert.equal(r.said, "", "the script never ran");
    assert.deepEqual(r.leftNow, [], "read and removed before the folder was tried");
  } finally { r.done(); }
  r = scriptRun({}, "secret plan here", { noTerminal: true });
  try {
    assert.notEqual(r.status, 0, "no terminal: it fails");
    await new Promise(res => setTimeout(res, 2000));
    assert.deepEqual(readdirSync(r.run).filter(f => f.startsWith("nodi-arguments.")), [], "gone after its time all the same");
  } finally { r.done(); }
});

test("a value's own unit separator is dropped, so later values keep their places; an empty one is passed empty (Fable 2026-10-10)", () => {
  const r = scriptRun({ mode: "silent" }, "a\u001fb x \u0000c");
  try {
    assert.equal(r.text, "ab\u001fx\u001fc\u001f", "each value whole, its own separator and NUL gone");
    assert.equal(r.said, "0|ab|x|c");
  } finally { r.done(); }
  const gap = S.parseScripts(["# @raycast.title Gap", "# @raycast.mode silent",
    '# @raycast.argument1 { "type": "text", "placeholder": "first" }',
    '# @raycast.argument3 { "type": "text", "placeholder": "third" }'].map(l => "/s/gap.sh\u0000" + l).join("\n"))[0];
  const g = scriptRun({ mode: "silent", args: gap.args }, "one three");
  try {
    assert.equal(g.status, 0);
    assert.equal(g.said, "0|one||three", "the gap is NODI_ARGUMENT2, empty, and three is still the third");
  } finally { g.done(); }
});
