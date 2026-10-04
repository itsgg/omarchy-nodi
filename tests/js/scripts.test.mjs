// Script commands: the @nodi header (or Raycast's @raycast one) read from a folder, rows by title or
// file name, each mode run as it says, arguments never read as shell.

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, chmodSync, readFileSync, existsSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { load, root, plain } from "./load.mjs";
import { config, run, top } from "./fixtures.mjs";

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
  assert.deepEqual(plain(r.run.args), ["Say Hello", DIR, at("hello.sh"), "Ravi", "loud"]);
  assert.equal(r.remember, false, "filled-in arguments name a moment");
  assert.deepEqual(plain(top("hello Ravi", { scripts }).run.args.slice(-2)), ["Ravi", ""], "an optional argument left out is empty");
  const bad = top("hello Ravi shout", { scripts });
  assert.equal(bad.hint, "hello <name> [tone: Loud|Soft]", "the choices on the hint line"); assert.ok(!bad.run);
  const bare = top("hello", { scripts });
  assert.equal(bare.complete, "hello "); assert.ok(!bare.run);
  assert.equal(top("say hello", { scripts }).title, "Say Hello", "by its title");
});

test("fullOutput runs in Omarchy's floating terminal, in its folder, after a second Enter when it asks", () => {
  const r = top("show build log", { scripts });
  assert.equal(r.confirm, true);
  assert.deepEqual(plain(r.run.argv.slice(0, 8)), ["uwsm-app", "--", "xdg-terminal-exec", "--app-id=org.omarchy.terminal", "--title=Show Build Log", "-e", "bash", "-c"]);
  assert.deepEqual(plain(r.run.argv.slice(-3)), ["nodi", "/home/u/logs", at("show-log.sh")]);
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
  assert.deepEqual(plain(fb[0].run.args.slice(-1)), ["zzqx%20a%26b"]);
});

// The silent mode's shell, run for real against a stub notify-send.
function quiet(row) {
  const home = mkdtempSync(join(tmpdir(), "nodi-scripts-"));
  const bin = join(home, "bin");
  mkdirSync(bin);
  writeFileSync(join(bin, "notify-send"), '#!/bin/bash\nprintf "%s\\n" "$@" > "$NOTIFIED"\n');
  chmodSync(join(bin, "notify-send"), 0o755);
  try {
    const cmd = Run.command(row.run);
    execFileSync(cmd[0], cmd.slice(1), { env: { HOME: home, PATH: bin + ":/usr/bin:/bin", NOTIFIED: join(home, "n") }, cwd: home });
    return { said: existsSync(join(home, "n")) ? readFileSync(join(home, "n"), "utf8").trim().split("\n") : [], home };
  } finally { rmSync(home, { recursive: true, force: true }); }
}

test("silent posts the last line, a failure says so, and an argument is text, never shell", () => {
  assert.deepEqual(quiet(top("hello Ravi soft", { scripts })).said, ["-a", "Nodi", "--", "Say Hello", "hello Ravi (soft)"]);
  assert.deepEqual(quiet(top("always fails", { scripts })).said, ["-a", "Nodi", "-u", "critical", "--", "Always Fails failed", "it broke"]);
  const marker = join(tmpdir(), "nodi-scripts-injected");
  rmSync(marker, { force: true });
  const said = quiet(top('hello "$(touch ' + marker + ')"', { scripts })).said;
  assert.ok(!existsSync(marker), "nothing typed ran");
  assert.equal(said[said.length - 1], "hello $(touch " + marker + ")");
});

test("an argument number left out keeps its place, so argument3 is still $3", () => {
  const out = ["# @raycast.title Gap", "# @raycast.mode silent",
    '# @raycast.argument1 { "type": "text", "placeholder": "first" }',
    '# @raycast.argument3 { "type": "text", "placeholder": "third" }'].map(l => "/s/gap.sh\u0000" + l).join("\n");
  const gap = S.parseScripts(out);
  assert.deepEqual(plain(gap[0].args.map(a => a.type)), ["text", "gap", "text"]);
  const r = top("gap a b c", { scripts: gap });
  assert.deepEqual(plain(r.run.args.slice(-3)), ["a", "", "b c"]);
  assert.equal(top("gap a", { scripts: gap }).hint, "gap <first> <third>");
});

test("a header in Nodi's words and one in Raycast's are both read; a key given both ways takes the first", () => {
  assert.ok(readFileSync(at("hello.sh"), "utf8").includes("@nodi.title"), "the fixture says @nodi");
  assert.ok(readFileSync(at("uptime.sh"), "utf8").includes("@raycast.title"), "and another says @raycast");
  const mixed = S.parseScripts("/s/x\u0000# @nodi.title Mine\n/s/x\u0000# @raycast.title Theirs\n/s/x\u0000# @raycast.mode silent\n");
  assert.equal(mixed[0].title, "Mine");
  assert.equal(mixed[0].mode, "silent");
});
