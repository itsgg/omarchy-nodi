// bin/nodi, the command: what it asks Omarchy's shell for, and what it
// prints and exits with. A stand-in omarchy-shell plays the shell and Nodi:
// it logs each call and answers a pick the way Nodi does, through the FIFO.

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync, spawn } from "node:child_process";
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
      runRow|runFound) echo "$FAKE_RUNROW" ;;
      runProposed) echo "\${FAKE_RUNPROPOSED:-ok}" ;;
      search) printf '%s\\n' "\${FAKE_SEARCH:-[]}" ;;
      describeRow) printf '%s\\n' "\${FAKE_DESCRIBE:-unknown row}" ;;
      pickAlive) echo "$FAKE_ALIVE" ;;
      askMcp)
        # As the facade, one argument: { token, line }. Ask answers: an echo
        # of the message's id, "" for a notification.
        [ $# -eq 5 ] || { echo "Too many arguments provided" >&2; exit 1; }
        line=$(printf '%s' "$5" | /usr/bin/jq -r .line)
        printf '%s\n' "$line" >> "$FAKE_LOG.ask"
        [ "$(printf '%s' "$5" | /usr/bin/jq -r .token)" = "$FAKE_TOKEN" ] || { echo unknown; exit 0; }
        [ "$FAKE_EMPTY" = 1 ] && exit 0
        [ "$FAKE_EMPTY" = ok ] && { echo ok; exit 0; }
        printf '%s' "$line" | /usr/bin/jq -c 'if has("id") then {jsonrpc: "2.0", id: .id, result: {seen: .method}} else empty end' ;;
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
    OMARCHY_PATH: join(t, "omarchy"), XDG_RUNTIME_DIR: join(t, "run"), FAKE_LOG: join(t, "log"), LANG: "C.UTF-8",
    FAKE_PICK: opts.pick || "cancel", FAKE_ALIVE: opts.alive || "yes", FAKE_RUNROW: opts.runRow || "ok", FAKE_DOWN: opts.down ? "1" : "0",
    FAKE_SEARCH: opts.search || "[]", FAKE_DESCRIBE: opts.describe || "unknown row", FAKE_RUNPROPOSED: opts.runProposed || "ok",
    FAKE_TOKEN: "t0k", ...(opts.env || {})
  };
  const r = spawnSync(NODI, args, { env, input: opts.input || "", timeout: opts.timeout || 15000 });
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

test("pick keeps at most what the bar reads: past 8 MB it is refused, nothing asked, nothing left (codex's review, 2026-10-09)", () => {
  const t = setup();
  try {
    const r = nodi(t, ["pick"], { input: "x".repeat(8388609), pick: "pick 0" });
    assert.equal(r.status, 2, r.err);
    assert.match(r.err, /more than 8 MB of rows/);
    assert.ok(!/call \S+ pick /.test(r.log), "the bar was not asked");
    assert.deepEqual(readdirSync(join(t, "run")), [], "nothing left in the runtime directory");
    // Exactly 8 MB, in short lines: kept, asked, the first picked.
    const fits = nodi(t, ["pick"], { input: "a\n".repeat(4194304), pick: "pick 0" });
    assert.deepEqual([fits.status, fits.out], [0, "a\n"], fits.err);
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
    assert.equal(r.status, 3, "unreachable, not refused (a check 2026-10-05)");
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

// nodi mcp (ROADMAP 45, 46): JSON-RPC a line each way.
function mcp(t, messages, opts = {}) {
  writeFileSync(join(t, "log"), "");
  const input = messages.map(m => typeof m === "string" ? m : JSON.stringify(m)).join("\n") + "\n";
  const r = nodi(t, ["mcp"], { ...opts, input });
  const replies = r.out.split("\n").filter(Boolean).map(l => JSON.parse(l));
  return { ...r, replies, byId: Object.fromEntries(replies.filter(x => x.id !== null).map(x => [x.id, x])) };
}
const call = (id, name, args) => ({ jsonrpc: "2.0", id, method: "tools/call", params: { name, arguments: args } });
const text = reply => reply.result.content[0].text;

test("nodi mcp: the handshake, the tools, and what it does not know", () => {
  const t = setup();
  try {
    const r = mcp(t, [{ jsonrpc: "2.0", id: 1, method: "server/discover", params: {} },
                      { jsonrpc: "2.0", id: 2, method: "initialize", params: { protocolVersion: "2025-11-25", capabilities: {} } },
                      { jsonrpc: "2.0", method: "notifications/initialized" },
                      { jsonrpc: "2.0", id: 3, method: "tools/list" },
                      { jsonrpc: "2.0", id: 4, method: "ping" },
                      "not json",
                      call(5, "nope", {})]);
    assert.equal(r.status, 0);
    assert.equal(r.byId[1].error.code, -32601, "server/discover: method not found, so the client falls back to initialize");
    assert.equal(r.byId[2].result.protocolVersion, "2025-11-25");
    assert.equal(r.byId[2].result.serverInfo.name, "nodi");
    assert.deepEqual(r.byId[3].result.tools.map(x => x.name), ["search", "run", "propose", "approve"]);
    assert.deepEqual(r.byId[4].result, {});
    assert.equal(r.replies.find(x => x.id === null).error.code, -32700);
    assert.equal(r.byId[5].error.code, -32602);
    assert.equal(r.replies.length, 7 - 1, "a notification gets no reply");
    const e = mcp(t, [{ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "1999-01-01" } },
                      [{ jsonrpc: "2.0", id: 2, method: "ping" }], "\"text\"",
                      { jsonrpc: "2.0", id: 3 },
                      { jsonrpc: "2.0", method: "tools/call", params: { name: "run", arguments: { key: "x" } } }]
                     .map(m => typeof m === "string" ? m : JSON.stringify(m)).concat([JSON.stringify({ jsonrpc: "2.0", id: 4, method: "ping" })]));
    assert.equal(e.byId[1].result.protocolVersion, "2025-11-25", "a version it does not speak: the newest it does");
    assert.deepEqual(e.replies.filter(x => x.id === null).map(x => x.error.code), [-32600, -32600], "a batch and a string are no requests");
    assert.equal(e.byId[3].error.code, -32600, "an id and no method");
    assert.doesNotMatch(e.log, /runRow/, "a tools/call without an id is a notification: not run");
    assert.deepEqual(e.byId[4].result, {});
    const ids = mcp(t, [{ jsonrpc: "2.0", id: false, method: "ping" }, { jsonrpc: "2.0", id: null, method: "nope" }]);
    assert.deepEqual(ids.replies.map(x => [x.id, x.error ? x.error.code : "ok"]), [[false, "ok"], [null, -32601]], "ids as given (Fable 2026-10-06)");
    const last = nodi(t, ["mcp"], { input: JSON.stringify({ jsonrpc: "2.0", id: 9, method: "ping" }) });
    assert.equal(JSON.parse(last.out).id, 9, "a last line without its newline is read");
  } finally { rmSync(t, { recursive: true, force: true }); }
});

test("nodi mcp reads a line at most 16 MB at a time: a longer one is refused, never held whole, and the next answered (codex's review, 2026-10-09)", () => {
  const t = setup();
  try {
    const ping = id => ({ jsonrpc: "2.0", id, method: "ping" });
    // bash reads a pipe a byte at a time: 16 MB takes it about 15 s here.
    const r = mcp(t, [ping(1), "x".repeat(16777300), ping(2), "y".repeat(300000)], { timeout: 120000 });
    assert.deepEqual(r.byId[1].result, {});
    assert.deepEqual(r.byId[2].result, {}, "the message after it answered");
    const said = r.replies.filter(x => x.id === null).map(x => x.error.message);
    assert.deepEqual(said, ["Too long: a message is 16 MB at most", "parse error"],
                     "the line past 16 MB refused unread; a 300 KB one, within the cap, read and found no JSON");
  } finally { rmSync(t, { recursive: true, force: true }); }
});

test("nodi mcp: search and run go to the bar; a refusal and an unreachable bar are tool errors, the server goes on", () => {
  const t = setup();
  try {
    const rows = JSON.stringify([{ key: "menu:system.lock", title: "Lock", subtitle: "System", kind: "action", asks: "", command: "omarchy-lock-screen" }]);
    let r = mcp(t, [call(1, "search", { query: "lock" }), call(2, "run", { key: "menu:system.lock" })], { search: rows });
    assert.equal(text(r.byId[1]), rows);
    assert.equal(text(r.byId[2]), "Ran menu:system.lock");
    assert.match(r.log, /call io\.github\.itsgg\.nodi search lock\n/);
    assert.match(r.log, /call io\.github\.itsgg\.nodi runFound menu:system\.lock\n/, "an agent's run may name a row its search found, a hotkey's may not");
    r = mcp(t, [call(1, "run", { key: "menu:system.reboot" })], { runRow: "it asks before it runs; open it in the bar" });
    assert.deepEqual([text(r.byId[1]), r.byId[1].result.isError], ["Not run: it asks before it runs; open it in the bar", true]);
    r = mcp(t, [call(1, "search", { query: "x" })], { search: "error" });
    assert.deepEqual([text(r.byId[1]), r.byId[1].result.isError], ["Nodi failed to answer; the shell's log says why", true],
                     "the shell's answer when the function threw: a failure, not an unreachable bar (Fable 2026-10-06)");
    assert.equal(nodi(t, ["run", "x"], { runRow: "error" }).status, 2, "nodi run too");
    r = mcp(t, [call(1, "search", { query: "q".repeat(70000) })]);
    assert.deepEqual([text(r.byId[1]), r.byId[1].result.isError], ["Too long: a query or a key is 64 KB at most", true]);
    r = mcp(t, [call(1, "search", { query: "த".repeat(30000) })]);
    assert.equal(text(r.byId[1]), "Too long: a query or a key is 64 KB at most", "90000 bytes in 30000 letters (Fable 2026-10-06)");
    r = mcp(t, [call(1, "search", { query: "த".repeat(20000) })]);
    assert.equal(r.byId[1].result.isError, false, "60000 bytes go");
    const longKey = "history:https://example.com/" + "a".repeat(5000);
    r = mcp(t, [call(1, "run", { key: longKey })]);
    assert.equal(text(r.byId[1]), "Ran " + longKey, "a long key a search returned still runs (Fable 2026-10-06)");
    r = mcp(t, [{ jsonrpc: "2.0", id: 1, method: "tools/call", params: "str" }]);
    assert.deepEqual([r.byId[1].error.code, r.err], [-32602, ""], "params of another shape: no tool, and nothing on stderr");
    r = mcp(t, [{ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "approve", arguments: "x" } }]);
    assert.deepEqual([r.byId[1].error.code, r.err], [-32602, ""], "arguments of another shape");
    assert.doesNotMatch(r.log, / search /, "never sent to the shell");
    r = mcp(t, [call(1, "search", { query: "x" }), { jsonrpc: "2.0", id: 2, method: "ping" }], { down: true });
    assert.deepEqual([text(r.byId[1]), r.byId[1].result.isError], ["The bar cannot be reached", true]);
    assert.deepEqual(r.byId[2].result, {}, "still answering");
  } finally { rmSync(t, { recursive: true, force: true }); }
});

test("nodi mcp: propose shows the row with its command; his Enter runs it, Escape does not", () => {
  const t = setup();
  try {
    const describe = JSON.stringify({ key: "menu:system.reboot", title: "Reboot", subtitle: "System", command: "omarchy-cmd-reboot", risk: "Restarts the computer", asks: "a second Enter" });
    let r = mcp(t, [call(1, "propose", { key: "menu:system.reboot" })], { describe, pick: "pick 0" });
    assert.equal(text(r.byId[1]), "He ran it");
    assert.match(r.log, /call io\.github\.itsgg\.nodi runProposed menu:system\.reboot\n/);
    const shown = JSON.parse(readFileSync(join(t, "log.rows"), "utf8"));
    assert.deepEqual([shown.title, shown.subtitle, shown.preview.subtitle], ["Run Reboot", "omarchy-cmd-reboot", "Restarts the computer"]);
    assert.match(readFileSync(join(t, "log.req"), "utf8"), /An agent asks to run this/);
    r = mcp(t, [call(1, "propose", { key: "menu:system.reboot" })], { describe, pick: "cancel" });
    assert.equal(text(r.byId[1]), "He refused it");
    assert.doesNotMatch(r.log, /runProposed/);
    r = mcp(t, [call(1, "propose", { key: "k" })], { pick: "cancel",
              describe: JSON.stringify({ key: "k", title: "Two\nlines", subtitle: "", command: "a\n\n$1 = 'x'", risk: "", asks: "" }) });
    const two = JSON.parse(readFileSync(join(t, "log.rows"), "utf8"));
    assert.deepEqual([two.title, two.subtitle], ["Run Two lines", "a $1 = 'x'"], "one line each, the pick's JSON intact");
    r = mcp(t, [call(1, "propose", { key: "k" })], { pick: "pick 0",
              describe: JSON.stringify({ key: "k", title: "Erase", subtitle: "", command: "x", risk: "", asks: "a typed word" }) });
    assert.deepEqual([text(r.byId[1]), r.byId[1].result.isError], ["Not run: it asks for a typed word; open it in the bar", true]);
    assert.doesNotMatch(r.log, / pick | runProposed /, "not asked: his yes could not be honoured (Fable 2026-10-06)");
    r = mcp(t, [call(1, "propose", { key: "made:up" })]);
    assert.deepEqual([text(r.byId[1]), r.byId[1].result.isError], ["Not run: unknown row", true]);
    assert.doesNotMatch(r.log, / pick /, "nothing shown for a row the bar does not know");
  } finally { rmSync(t, { recursive: true, force: true }); }
});

test("nodi mcp: approve answers Claude Code's permission prompt tool as it reads it (probed 2026-10-06)", () => {
  const t = setup();
  try {
    const args = { tool_name: "Bash", input: { command: "touch /tmp/x", description: "make x" }, tool_use_id: "toolu_1" };
    let r = mcp(t, [call(1, "approve", args)], { pick: "pick 0" });
    assert.deepEqual(JSON.parse(text(r.byId[1])), { behavior: "allow", updatedInput: args.input });
    const shown = JSON.parse(readFileSync(join(t, "log.rows"), "utf8"));
    assert.deepEqual([shown.title, shown.subtitle], ["Allow Bash", "touch /tmp/x"]);
    r = mcp(t, [call(1, "approve", args)], { pick: "cancel" });
    assert.deepEqual(JSON.parse(text(r.byId[1])), { behavior: "deny", message: "He refused it in the bar." });
    r = mcp(t, [call(1, "approve", { tool_name: "Bash", input: { command: "cd x &&\n  make\tall" } })], { pick: "cancel" });
    assert.equal(JSON.parse(readFileSync(join(t, "log.rows"), "utf8")).subtitle, "cd x && make all", "one line (Fable 2026-10-06)");
    r = mcp(t, [call(1, "approve", { tool_name: "Write", input: { file_path: "/tmp/y", content: "z" } })], { pick: "cancel" });
    assert.equal(JSON.parse(readFileSync(join(t, "log.rows"), "utf8")).subtitle, "/tmp/y", "what the tool acts on");
    const big = { tool_name: "Write", input: { file_path: "/tmp/big", content: "x".repeat(300000) } };
    r = mcp(t, [call(1, "approve", big)], { pick: "pick 0" });
    assert.deepEqual(JSON.parse(text(r.byId[1])), { behavior: "allow", updatedInput: big.input }, "past the 128 KB of one argument (Fable 2026-10-06)");
    r = mcp(t, [call(1, "approve", args), call(2, "propose", { key: "k" })], { pick: "replaced",
              describe: JSON.stringify({ key: "k", title: "K", subtitle: "", command: "k", risk: "", asks: "" }) });
    assert.deepEqual(JSON.parse(text(r.byId[1])), { behavior: "deny", message: "Another question took the bar first; he was not asked." },
                     "a newer pick is no refusal of his");
    assert.deepEqual([text(r.byId[2]), r.byId[2].result.isError], ["Not asked: another question took the bar first", true]);
  } finally { rmSync(t, { recursive: true, force: true }); }
});

test("nodi mcp: ended while a question waits in the bar, it takes the question away", async () => {
  const t = setup();
  try {
    const env = { OMARCHY_PATH: join(t, "omarchy"), XDG_RUNTIME_DIR: join(t, "run"), FAKE_LOG: join(t, "log"), FAKE_PICK: "none",
                  FAKE_ALIVE: "yes", FAKE_RUNROW: "ok", FAKE_DOWN: "0" };
    const p = spawn(NODI, ["mcp"], { env });
    p.stdin.write(JSON.stringify(call(1, "approve", { tool_name: "Bash", input: { command: "true" } })) + "\n");
    await new Promise(r => setTimeout(r, 1500));
    p.kill("SIGTERM");
    await new Promise(r => p.on("exit", r));
    await new Promise(r => setTimeout(r, 500));
    const log = readFileSync(join(t, "log"), "utf8");
    const id = JSON.parse(readFileSync(join(t, "log.req"), "utf8")).id;
    assert.match(log, new RegExp("call io\\.github\\.itsgg\\.nodi cancelPick " + id + "\\n"), "the bar is told (Fable 2026-10-06)");
  } finally { rmSync(t, { recursive: true, force: true }); }
});

test("nodi mcp --ask hands each message to Ask whole and prints its answer; one the shell cannot take is answered here (ROADMAP 84)", () => {
  const t = setup();
  try {
    const lines = ['{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18"}}',
                   '{"jsonrpc":"2.0","method":"notifications/initialized"}',
                   '', '{"jsonrpc":"2.0","id":"x","method":"tools/call","params":{"name":"search","arguments":{"query":"a \\"b\\" நொடி"}}}'];
    let r = nodi(t, ["mcp", "--ask"], { input: lines.join("\n") + "\n", env: { NODI_ASK_SESSION: "t0k" } });
    assert.equal(r.status, 0, r.err);
    assert.deepEqual(r.out.trim().split("\n").map(l => JSON.parse(l)),
      [{ jsonrpc: "2.0", id: 1, result: { seen: "initialize" } }, { jsonrpc: "2.0", id: "x", result: { seen: "tools/call" } }], "a notification gets nothing");
    assert.equal(readFileSync(join(t, "log.ask"), "utf8").split("\n")[2], lines[3], "the message reaches Ask as it came");
    // An ended session's token, then the shell down: each request still answered.
    r = nodi(t, ["mcp", "--ask"], { input: lines[0] + "\n" + lines[1] + "\n", env: { NODI_ASK_SESSION: "old" } });
    assert.deepEqual(JSON.parse(r.out), { jsonrpc: "2.0", id: 1, error: { code: -32603, message: "The bar cannot be reached" } });
    r = nodi(t, ["mcp", "--ask"], { input: lines[3] + "\n", down: true, env: { NODI_ASK_SESSION: "t0k" } });
    assert.equal(JSON.parse(r.out).error.code, -32603);
    assert.equal(JSON.parse(r.out).id, "x");
    // An empty answer from the shell: the request is still answered, the notification not.
    r = nodi(t, ["mcp", "--ask"], { input: lines[1] + "\n" + lines[3] + "\n", env: { NODI_ASK_SESSION: "t0k", FAKE_EMPTY: "1" } });
    assert.deepEqual(JSON.parse(r.out), { jsonrpc: "2.0", id: "x", error: { code: -32603, message: "The bar gave no answer" } });
    // The facade's "ok" for a function that returned nothing is no answer either.
    r = nodi(t, ["mcp", "--ask"], { input: lines[3] + "\n", env: { NODI_ASK_SESSION: "t0k", FAKE_EMPTY: "ok" } });
    assert.equal(JSON.parse(r.out).error.message, "The bar gave no answer");
    // Past 64 KB a message is refused here; without its session it does not start.
    r = nodi(t, ["mcp", "--ask"], { input: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "search", arguments: { query: "x".repeat(70000) } } }) + "\n",
                                    env: { NODI_ASK_SESSION: "t0k" } });
    assert.match(JSON.parse(r.out).error.message, /64 KB/);
    r = nodi(t, ["mcp", "--ask"], { input: lines[0] + "\n" });
    assert.equal(r.status, 2);
    assert.match(r.err, /NODI_ASK_SESSION/);
  } finally { rmSync(t, { recursive: true, force: true }); }
});
