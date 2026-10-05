// bin/nodi, the command: what it asks Omarchy's shell for, and what it
// prints and exits with. A stand-in omarchy-shell plays the shell and Nodi:
// it logs each call and answers a pick the way Nodi does, through the FIFO.

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { root } from "./load.mjs";

const NODI = join(root, "bin/nodi");

// FAKE: "ok" answers every call; pick=<answer> is what the pick hears
// ("pick 2", "cancel", or "none" for no answer at all); alive=<yes|no>;
// runRow=<reply>; down makes every call fail as an unreachable shell does.
const FAKE = `#!/usr/bin/bash
printf '%s\\n' "$*" >> "$FAKE_LOG"
[ "$FAKE_DOWN" = 1 ] && { echo "omarchy-shell is not running" >&2; exit 1; }
case "$2" in
  summon) echo ok ;;
  call)
    case "$4" in
      runRow) echo "$FAKE_RUNROW" ;;
      pickAlive) echo "$FAKE_ALIVE" ;;
      pick)
        dir=$(printf '%s' "$5" | /usr/bin/jq -r .dir)
        printf '%s\\n' "$5" > "$FAKE_LOG.req"
        cp "$dir/rows" "$FAKE_LOG.rows"
        stat -c %a "$dir" > "$FAKE_LOG.mode"
        if [ "$FAKE_PICK" != none ]; then
          ( sleep 0.3; [ -p "$dir/answer" ] && printf '%s\\n' "$FAKE_PICK" > "$dir/answer" ) >/dev/null 2>&1 &
        fi
        echo ok ;;
    esac ;;
esac
`;

function setup() {
  const t = mkdtempSync(join(tmpdir(), "nodi-cli-test-"));
  mkdirSync(join(t, "omarchy/bin"), { recursive: true });
  writeFileSync(join(t, "omarchy/bin/omarchy-shell"), FAKE);
  chmodSync(join(t, "omarchy/bin/omarchy-shell"), 0o755);
  mkdirSync(join(t, "run"), { mode: 0o700 });
  return t;
}

function nodi(t, args, opts = {}) {
  const env = {
    OMARCHY_PATH: join(t, "omarchy"), XDG_RUNTIME_DIR: join(t, "run"), FAKE_LOG: join(t, "log"),
    FAKE_PICK: opts.pick || "cancel", FAKE_ALIVE: opts.alive || "yes", FAKE_RUNROW: opts.runRow || "ok", FAKE_DOWN: opts.down ? "1" : "0"
  };
  const r = spawnSync(NODI, args, { env, input: opts.input || "", timeout: 15000 });
  return { status: r.status, out: r.stdout.toString(), err: r.stderr.toString(), log: (() => { try { return readFileSync(join(t, "log"), "utf8") } catch (e) { return "" } })() };
}

test("words open the bar with them typed, encoded whole; no words open it empty", () => {
  const t = setup();
  try {
    let r = nodi(t, ["hello", "world"]);
    assert.equal(r.status, 0, r.err);
    assert.equal(r.log, 'shell summon io.github.itsgg.nodi {"query":"hello world"}\n');
    rmSync(join(t, "log"));
    r = nodi(t, ['a "b" \\ நொடி $(x)']);
    assert.equal(JSON.parse(r.log.trim().split(" ").slice(3).join(" ")).query, 'a "b" \\ நொடி $(x)', "quotes, backslashes and Tamil reach the bar as typed");
    rmSync(join(t, "log"));
    r = nodi(t, []);
    assert.equal(r.log, "shell summon io.github.itsgg.nodi {}\n");
    rmSync(join(t, "log"));
    r = nodi(t, ["--", "run", "x"]);
    assert.equal(JSON.parse(r.log.trim().split(" ").slice(3).join(" ")).query, "run x", "-- types a word nodi would take as a command");
  } finally { rmSync(t, { recursive: true, force: true }); }
});

test("run names a row by its key; Nodi's refusal is an error that says why", () => {
  const t = setup();
  try {
    let r = nodi(t, ["run", "apps:firefox.desktop"]);
    assert.equal(r.status, 0, r.err);
    assert.equal(r.log, "shell call io.github.itsgg.nodi runRow apps:firefox.desktop\n");
    r = nodi(t, ["run", "nope"], { runRow: "unknown row" });
    assert.equal(r.status, 2);
    assert.match(r.err, /nope: unknown row/);
    r = nodi(t, ["run"]);
    assert.equal(r.status, 2);
  } finally { rmSync(t, { recursive: true, force: true }); }
});

test("pick prints the chosen line as it was read, and leaves nothing behind", () => {
  const t = setup();
  try {
    const r = nodi(t, ["pick", "--placeholder", "Which one?"], { input: "alpha\n\nbeta  \ngamma", pick: "pick 2" });
    assert.equal(r.status, 0, r.err);
    assert.equal(r.out, "beta  \n");
    const req = JSON.parse(readFileSync(join(t, "log.req"), "utf8"));
    assert.equal(req.placeholder, "Which one?");
    assert.equal(req.json, false);
    assert.ok(req.dir.endsWith("/nodi-pick." + req.id) && req.dir.startsWith(join(t, "run")), req.dir);
    assert.equal(readFileSync(join(t, "log.rows"), "utf8"), "alpha\n\nbeta  \ngamma", "the rows go by file, as given");
    assert.equal(readFileSync(join(t, "log.mode"), "utf8").trim(), "700", "a directory only this user can read");
    assert.deepEqual(readdirSync(join(t, "run")), [], "the directory is gone after");
  } finally { rmSync(t, { recursive: true, force: true }); }
});

test("pick with --json says so; Escape is exit 1 with nothing printed", () => {
  const t = setup();
  try {
    const r = nodi(t, ["pick", "--json"], { input: '{"title":"a"}\n', pick: "cancel" });
    assert.equal(r.status, 1);
    assert.equal(r.out, "");
    assert.equal(JSON.parse(readFileSync(join(t, "log.req"), "utf8")).json, true);
  } finally { rmSync(t, { recursive: true, force: true }); }
});

test("a bar that closes without answering ends the wait; a shell that is down is exit 3, a refusal 2", () => {
  const t = setup();
  try {
    const started = Date.now();
    let r = nodi(t, ["pick"], { input: "a\n", pick: "none", alive: "no" });
    assert.equal(r.status, 1);
    assert.ok(Date.now() - started < 6000, "within a check or two");
    assert.match(r.log, /pickAlive/);
    r = nodi(t, ["pick"], { input: "a\n", down: true });
    assert.equal(r.status, 3, "unreachable, not refused (Akshi 2026-10-05)");
    r = nodi(t, ["hello"], { down: true });
    assert.equal(r.status, 3);
    r = nodi(t, ["run", "x"], { runRow: "unknown" });
    assert.equal(r.status, 3, "the shell's \"unknown\": Nodi is not loaded");
    assert.match(r.err, /not loaded/);
    r = nodi(t, ["pick"], { input: "a\n", pick: "error" });
    assert.equal(r.status, 2, "rows Nodi could not read are a refusal, never an Escape");
    assert.match(r.err, /could not read the rows/);
    r = nodi(t, ["pick", "--bogus"], { input: "a\n" });
    assert.equal(r.status, 2);
    assert.match(r.err, /unknown option/);
  } finally { rmSync(t, { recursive: true, force: true }); }
});
