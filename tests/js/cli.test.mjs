// bin/nodi, the command: what it asks Omarchy's shell for, and what it
// prints and exits with. A stand-in omarchy-shell plays the shell and Nodi:
// it logs each call and answers a pick the way Nodi does, through the FIFO.

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync, spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync, chmodSync, statSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { root } from "./load.mjs";

const NODI = join(root, "bin/nodi");

// FAKE: "ok" answers every call; pick=<answer> is what the pick hears
// ("pick 2", "cancel", or "none" for no answer at all), FAKE_ANSWER_ON_ALIVE
// one written as pickAlive is asked, and FAKE_PICKREPLY what the pick call itself
// answers ("ok" unless set); alive=<yes|no>; runRow=<reply>; down makes
// every call fail as an unreachable shell does; FAKE_EMPTY=error has Ask's
// call answer as a function that threw.
const FAKE = `#!/usr/bin/bash
printf '%s\\n' "$*" >> "$FAKE_LOG"
[ "$FAKE_DOWN" = 1 ] && { echo "omarchy-shell is not running" >&2; exit 1; }
# A payload bin/nodi carried in a file (components/Carried.qml reads it so):
# the text, and the modes of its folder and file.
arg=\${5-}; [ "\${2-}" = summon ] && arg=\${4-}
case $arg in @file:*) p=\${arg#@file:}; stat -c '%a' "\${p%/*}" "$p" | paste -sd ' ' > "$FAKE_LOG.carried"; arg=$(cat -- "$p") ;; esac
# What each call handed the bar, the payload read: never seen in "$*".
[ "\${2-}" = call ] && printf '%s %s\\n' "\${4-}" "$arg" >> "$FAKE_LOG.calls"
[ "\${2-}" = summon ] && printf 'summon %s\\n' "$arg" >> "$FAKE_LOG.calls"
case "$2" in
  summon) echo ok ;;
  call)
    case "$4" in
      runRow|runFound) echo "$FAKE_RUNROW" ;;
      runProposed) echo "\${FAKE_RUNPROPOSED:-ok}" ;;
      search) printf '%s' "$arg" > "$FAKE_LOG.search"; printf '%s\\n' "\${FAKE_SEARCH:-[]}" ;;
      describeRow) printf '%s\\n' "\${FAKE_DESCRIBE:-unknown row}" ;;
      pickAlive)
        # FAKE_ANSWER_ON_ALIVE: the answer lands as the bar says the pick is
        # gone, between nodi's two reads, at no time of its own.
        [ -n "$FAKE_ANSWER_ON_ALIVE" ] && printf '%s\\n' "$FAKE_ANSWER_ON_ALIVE" > "$(cat "$FAKE_LOG.dir")/answer"
        echo "$FAKE_ALIVE" ;;
      askMcp)
        # As the facade, one argument. A pending action makes each short
        # shell call answer with control until its final JSON-RPC response.
        [ $# -eq 5 ] || { echo "Too many arguments provided" >&2; exit 1; }
        printf '%s %s\n' "$$" "$arg" >> "$FAKE_LOG.ask-calls"
        if [ "$FAKE_PENDING" = 1 ]; then
          op=$(printf '%s' "$arg" | /usr/bin/jq -r '.op // ""')
          if [ "$op" = call ]; then
            printf '%s\n' '{"nodiPending":"ticket-7"}'
            if [ "$FAKE_CALL_RESPONSE_PAUSE" = 1 ]; then
              printf ready > "$FAKE_LOG.call-response"
              sleep 0.3
            fi
            exit 0
          elif [ "$op" = poll ]; then
            polls=0; [ -f "$FAKE_LOG.polls" ] && polls=$(cat "$FAKE_LOG.polls")
            polls=$((polls + 1)); printf '%s' "$polls" > "$FAKE_LOG.polls"
            [ "$FAKE_POLL_FAILURE" = 1 ] && exit 1
            [ -n "$FAKE_POLL_SENTINEL" ] && { printf '%s\n' "$FAKE_POLL_SENTINEL"; exit 0; }
            pending_polls=\${FAKE_PENDING_POLLS:-1}
            if [ "$FAKE_PENDING_FOREVER" = 1 ] || [ "$polls" -le "$pending_polls" ]; then printf '%s\n' '{"nodiPending":"ticket-7"}'
            elif [ -n "$FAKE_FINAL_RESPONSE" ]; then printf '%s\n' "$FAKE_FINAL_RESPONSE"
            else printf '%s\n' '{"jsonrpc":"2.0","id":7,"result":{"content":[{"type":"text","text":"{\\"status\\":\\"refused\\"}"}]}}'
            fi
            exit 0
          elif [ "$op" = cancel ]; then
            echo ok
            exit 0
          fi
        fi
        line=$(printf '%s' "$arg" | /usr/bin/jq -r .line)
        printf '%s\n' "$line" >> "$FAKE_LOG.ask"
        [ "$(printf '%s' "$arg" | /usr/bin/jq -r .token)" = "$FAKE_TOKEN" ] \
          && [ "$(printf '%s' "$arg" | /usr/bin/jq -r .channel)" = "$FAKE_CHANNEL" ] \
          || { echo unknown; exit 0; }
        [ "$FAKE_EMPTY" = 1 ] && exit 0
        [ "$FAKE_EMPTY" = ok ] && { echo ok; exit 0; }
        [ "$FAKE_EMPTY" = error ] && { echo error; exit 0; }
        printf '%s' "$line" | /usr/bin/jq -c 'if has("id") then {jsonrpc: "2.0", id: .id, result: {seen: .method}} else empty end' ;;
      pick)
        dir=$(printf '%s' "$arg" | /usr/bin/jq -r .dir)
        printf '%s' "$dir" > "$FAKE_LOG.dir"
        printf '%s\\n' "$arg" > "$FAKE_LOG.req"
        cp "$dir/rows" "$FAKE_LOG.rows"
        stat -c %a "$dir" > "$FAKE_LOG.mode"
        if [ "$FAKE_PICK" != none ]; then
          ( sleep 0.3; [ -p "$dir/answer" ] && printf '%s\\n' "$FAKE_PICK" > "$dir/answer" ) >/dev/null 2>&1 &
        fi
        echo "\${FAKE_PICKREPLY:-ok}" ;;
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
    FAKE_TOKEN: "t0k", FAKE_CHANNEL: "channel-0", NODI_ASK_CHANNEL: "channel-0", NODI_CARRY_KEEP: "1", ...(opts.env || {})
  };
  const r = spawnSync(opts.program || NODI, args, { env, input: opts.input || "", timeout: opts.timeout || 15000 });
  const read = f => { try { return readFileSync(join(t, f), "utf8") } catch (e) { return "" } };
  return { status: r.status, out: r.stdout.toString(), err: r.stderr.toString(), log: read("log"), calls: read("log.calls") };
}

test("words open the bar with them typed, encoded whole; no words open it empty", () => {
  const t = setup();
  try {
    // What the bar was handed, read from the file it was carried in; the
    // words in no argument.
    const summoned = r => r.calls.trim().split("\n").pop().replace(/^summon /, "");
    let r = nodi(t, ["hello", "world"]);
    assert.equal(r.status, 0, r.err);
    assert.equal(summoned(r), '{"query":"hello world"}');
    assert.match(r.log, /^shell summon io\.github\.itsgg\.nodi @file:.*\/nodi-ipc\.[A-Za-z0-9]+\/payload\n$/);
    rmSync(join(t, "log"));
    r = nodi(t, ['a "b" \\ நொடி $(x)']);
    assert.equal(JSON.parse(summoned(r)).query, 'a "b" \\ நொடி $(x)', "quotes, backslashes and Tamil reach the bar as typed");
    rmSync(join(t, "log"));
    r = nodi(t, []);
    assert.equal(summoned(r), "{}");
    rmSync(join(t, "log"));
    r = nodi(t, ["--", "run", "x"]);
    assert.equal(JSON.parse(summoned(r)).query, "run x", "-- types a word nodi would take as a command");
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

test("pick keeps at most what the bar reads: past 8 MB it is refused, nothing asked, nothing left", () => {
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
  writeFileSync(join(t, "log"), ""); writeFileSync(join(t, "log.calls"), "");
  const input = messages.map(m => typeof m === "string" ? m : JSON.stringify(m)).join("\n") + "\n";
  const r = nodi(t, ["mcp"], { ...opts, input });
  const replies = r.out.split("\n").filter(Boolean).map(l => JSON.parse(l));
  return { ...r, replies, byId: Object.fromEntries(replies.filter(x => x.id !== null).map(x => [x.id, x])) };
}
const call = (id, name, args) => ({ jsonrpc: "2.0", id, method: "tools/call", params: { name, arguments: args } });
const text = reply => reply.result.content[0].text;

function askRelay(t, extra = {}) {
  const env = {
    OMARCHY_PATH: join(t, "omarchy"), XDG_RUNTIME_DIR: join(t, "run"), FAKE_LOG: join(t, "log"),
    FAKE_TOKEN: "t0k", FAKE_CHANNEL: "channel-7", FAKE_PENDING: "1", FAKE_PENDING_FOREVER: "1",
    NODI_ASK_SESSION: "t0k", NODI_ASK_CHANNEL: "channel-7", ...extra
  };
  const process = spawn(NODI, ["mcp", "--ask"], { env });
  let stdout = "", stderr = "";
  process.stdout.on("data", chunk => { stdout += chunk; });
  process.stderr.on("data", chunk => { stderr += chunk; });
  return { process, stdout: () => stdout, stderr: () => stderr };
}

function askEnvelopes(t) {
  try {
    return readFileSync(join(t, "log.ask-calls"), "utf8").trim().split("\n").filter(Boolean)
      .map(line => JSON.parse(line.slice(line.indexOf(" ") + 1)));
  } catch (e) {
    return [];
  }
}

async function waitFor(predicate, message, timeout = 2500) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (predicate()) return;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  assert.fail(message);
}

async function endRelay(relay) {
  if (relay.process.exitCode === null && relay.process.signalCode === null) relay.process.stdin.end();
  if (relay.process.exitCode === null && relay.process.signalCode === null)
    await Promise.race([once(relay.process, "exit"), new Promise(resolve => setTimeout(resolve, 2500))]);
  if (relay.process.exitCode === null && relay.process.signalCode === null) {
    relay.process.kill("SIGKILL");
    await once(relay.process, "exit");
  }
}

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
    assert.deepEqual(ids.replies.map(x => [x.id, x.error ? x.error.code : "ok"]), [[false, "ok"], [null, -32601]], "ids as given");
    const last = nodi(t, ["mcp"], { input: JSON.stringify({ jsonrpc: "2.0", id: 9, method: "ping" }) });
    assert.equal(JSON.parse(last.out).id, 9, "a last line without its newline is read");
  } finally { rmSync(t, { recursive: true, force: true }); }
});

test("nodi mcp reads a line at most 16 MB at a time: a longer one is refused, never held whole, and the next answered", () => {
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
    assert.match(r.calls, /^search lock\n/m);
    assert.match(r.calls, /^runFound menu:system\.lock\n/m, "an agent's run may name a row its search found, a hotkey's may not");
    r = mcp(t, [call(1, "run", { key: "menu:system.reboot" })], { runRow: "it asks before it runs; open it in the bar" });
    assert.deepEqual([text(r.byId[1]), r.byId[1].result.isError], ["Not run: it asks before it runs; open it in the bar", true]);
    r = mcp(t, [call(1, "search", { query: "x" })], { search: "error" });
    assert.deepEqual([text(r.byId[1]), r.byId[1].result.isError], ["Nodi failed to answer; the shell's log says why", true],
                     "the shell's answer when the function threw: a failure, not an unreachable bar");
    assert.equal(nodi(t, ["run", "x"], { runRow: "error" }).status, 2, "nodi run too");
    r = mcp(t, [call(1, "search", { query: "q".repeat(70000) })]);
    assert.deepEqual([text(r.byId[1]), r.byId[1].result.isError], ["Too long: a query or a key is 64 KB at most", true]);
    r = mcp(t, [call(1, "search", { query: "த".repeat(30000) })]);
    assert.equal(text(r.byId[1]), "Too long: a query or a key is 64 KB at most", "90000 bytes in 30000 letters");
    r = mcp(t, [call(1, "search", { query: "த".repeat(20000) })]);
    assert.equal(r.byId[1].result.isError, false, "60000 bytes go");
    const longKey = "history:https://example.com/" + "a".repeat(5000);
    r = mcp(t, [call(1, "run", { key: longKey })]);
    assert.equal(text(r.byId[1]), "Ran " + longKey, "a long key a search returned still runs");
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
    assert.match(r.calls, /^runProposed menu:system\.reboot\n/m);
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
    assert.doesNotMatch(r.log, / pick | runProposed /, "not asked: his yes could not be honoured");
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
    assert.equal(JSON.parse(readFileSync(join(t, "log.rows"), "utf8")).subtitle, "cd x && make all", "one line");
    r = mcp(t, [call(1, "approve", { tool_name: "Write", input: { file_path: "/tmp/y", content: "z" } })], { pick: "cancel" });
    assert.equal(JSON.parse(readFileSync(join(t, "log.rows"), "utf8")).subtitle, "/tmp/y", "what the tool acts on");
    const big = { tool_name: "Write", input: { file_path: "/tmp/big", content: "x".repeat(300000) } };
    r = mcp(t, [call(1, "approve", big)], { pick: "pick 0" });
    assert.deepEqual(JSON.parse(text(r.byId[1])), { behavior: "allow", updatedInput: big.input }, "past the 128 KB of one argument");
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
    assert.match(log, new RegExp("call io\\.github\\.itsgg\\.nodi cancelPick " + id + "\\n"), "the bar is told");
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

test("nodi mcp --ask polls a pending action through short-lived shell calls and prints only its final response", async () => {
  const t = setup();
  let relay;
  try {
    const request = call(7, "run", { query: "lock" });
    relay = askRelay(t, { FAKE_PENDING_FOREVER: "0" });
    relay.process.stdin.write(JSON.stringify(request) + "\n");
    await waitFor(() => relay.stdout().includes("\n"), "pending action did not return its final response");
    assert.deepEqual(relay.stdout().trim().split("\n").map(JSON.parse), [
      { jsonrpc: "2.0", id: 7, result: { content: [{ type: "text", text: '{"status":"refused"}' }] } }
    ], "pending controls are not emitted on stdout");
    const calls = readFileSync(join(t, "log.ask-calls"), "utf8").trim().split("\n")
      .map(line => {
        const space = line.indexOf(" ");
        return { pid: line.slice(0, space), envelope: JSON.parse(line.slice(space + 1)) };
      });
    assert.deepEqual(calls.map(x => x.envelope.op), ["call", "poll", "poll"]);
    assert.equal(calls.filter(x => x.envelope.op === "call").length, 1);
    assert.ok(calls.every(x => x.envelope.token === "t0k" && x.envelope.channel === "channel-7"));
    assert.equal(new Set(calls.map(x => x.pid)).size, calls.length, "each poll uses a short-lived shell process");
  } finally {
    if (relay) await endRelay(relay);
    rmSync(t, { recursive: true, force: true });
  }
});

test("nodi mcp --ask does not spin short-lived shell processes while a card waits", async () => {
  const t = setup();
  let relay;
  try {
    relay = askRelay(t, { FAKE_PENDING_FOREVER: "1" });
    relay.process.stdin.write(JSON.stringify(call(7, "run", { query: "lock" })) + "\n");
    await waitFor(() => askEnvelopes(t).some(x => x.op === "poll"), "relay did not start polling");
    await new Promise(resolve => setTimeout(resolve, 1100));
    const polls = askEnvelopes(t).filter(x => x.op === "poll").length;
    assert.ok(polls <= 6, "an idle card spawned " + polls + " polls in about one second");
  } finally {
    if (relay) await endRelay(relay);
    rmSync(t, { recursive: true, force: true });
  }
});

test("nodi mcp --ask relays a matching cancellation notification once and cancels the original request", async () => {
  const t = setup();
  let relay;
  try {
    relay = askRelay(t);
    relay.process.stdin.write(JSON.stringify(call(7, "run", { query: "lock" })) + "\n");
    await waitFor(() => askEnvelopes(t).some(x => x.op === "poll"), "relay did not start polling");
    relay.process.stdin.write(JSON.stringify({
      jsonrpc: "2.0", method: "notifications/cancelled", params: { requestId: 7, reason: "Timed out" }
    }) + "\n");
    await waitFor(() => askEnvelopes(t).some(x => x.op === "cancel"), "relay did not cancel the pending ticket");
    await waitFor(() => relay.stdout().includes("\n"), "original request did not receive its cancellation outcome");
    assert.deepEqual(relay.stdout().trim().split("\n").map(JSON.parse), [{
      jsonrpc: "2.0", id: 7, error: { code: -32800, message: "Request cancelled" }
    }], "the notification itself receives no response");
    const afterCancel = askEnvelopes(t);
    assert.equal(afterCancel.filter(x => x.op === "cancel").length, 1);
    const pollCount = afterCancel.filter(x => x.op === "poll").length;
    await new Promise(resolve => setTimeout(resolve, 150));
    assert.equal(askEnvelopes(t).filter(x => x.op === "poll").length, pollCount, "polling stopped after cancellation");
  } finally {
    if (relay) await endRelay(relay);
    rmSync(t, { recursive: true, force: true });
  }
});

test("nodi mcp --ask matches cancellation request IDs without coercing strings and numbers", async () => {
  const t = setup();
  let relay;
  try {
    relay = askRelay(t);
    relay.process.stdin.write(JSON.stringify(call("1", "run", { query: "lock" })) + "\n");
    await waitFor(() => askEnvelopes(t).some(x => x.op === "poll"), "relay did not start polling");
    relay.process.stdin.write(JSON.stringify({
      jsonrpc: "2.0", method: "notifications/cancelled", params: { requestId: 1 }
    }) + "\n");
    const polls = askEnvelopes(t).filter(x => x.op === "poll").length;
    await waitFor(() => askEnvelopes(t).filter(x => x.op === "poll").length > polls,
                  "numeric cancellation incorrectly stopped or blocked polling");
    assert.equal(askEnvelopes(t).filter(x => x.op === "cancel").length, 0, "numeric 1 must not cancel string \"1\"");
    assert.equal(relay.stdout(), "", "an unrelated notification remains unanswered");
    relay.process.stdin.write(JSON.stringify({
      jsonrpc: "2.0", method: "notifications/cancelled", params: { requestId: "1" }
    }) + "\n");
    await waitFor(() => askEnvelopes(t).some(x => x.op === "cancel"), "matching string ID did not cancel");
    await waitFor(() => relay.stdout().includes("\n"), "cancelled string request received no outcome");
    assert.equal(JSON.parse(relay.stdout()).id, "1");
  } finally {
    if (relay) await endRelay(relay);
    rmSync(t, { recursive: true, force: true });
  }
});

test("nodi mcp --ask cancels once and exits promptly when stdin closes during polling", async () => {
  const t = setup();
  let relay;
  try {
    relay = askRelay(t);
    relay.process.stdin.write(JSON.stringify(call(7, "run", { query: "lock" })) + "\n");
    await waitFor(() => askEnvelopes(t).some(x => x.op === "poll"), "relay did not start polling");
    const exited = once(relay.process, "exit");
    relay.process.stdin.end();
    await Promise.race([
      exited,
      new Promise((_, reject) => setTimeout(() => reject(new Error("relay did not exit after stdin EOF")), 1000))
    ]);
    const envelopes = askEnvelopes(t);
    assert.equal(envelopes.filter(x => x.op === "cancel").length, 1);
    assert.equal(envelopes.at(-1).op, "cancel");
    assert.equal(relay.stdout(), "", "a closed transport receives no response");
  } finally {
    if (relay) await endRelay(relay);
    rmSync(t, { recursive: true, force: true });
  }
});

test("nodi mcp --ask preserves a partial cancellation line while it continues polling", async () => {
  const t = setup();
  let relay;
  try {
    relay = askRelay(t);
    relay.process.stdin.write(JSON.stringify(call(7, "run", { query: "lock" })) + "\n");
    await waitFor(() => askEnvelopes(t).some(x => x.op === "poll"), "relay did not start polling");
    const cancellation = JSON.stringify({
      jsonrpc: "2.0", method: "notifications/cancelled", params: { requestId: 7 }
    });
    const split = Math.floor(cancellation.length / 2);
    const before = askEnvelopes(t).filter(x => x.op === "poll").length;
    relay.process.stdin.write(cancellation.slice(0, split));
    await waitFor(() => askEnvelopes(t).filter(x => x.op === "poll").length > before,
                  "partial input blocked pending polls");
    assert.equal(askEnvelopes(t).filter(x => x.op === "cancel").length, 0, "partial input was treated as a message");
    relay.process.stdin.write(cancellation.slice(split) + "\n");
    await waitFor(() => askEnvelopes(t).some(x => x.op === "cancel"), "completed cancellation was not processed");
    assert.equal(askEnvelopes(t).filter(x => x.op === "cancel").length, 1);
  } finally {
    if (relay) await endRelay(relay);
    rmSync(t, { recursive: true, force: true });
  }
});

test("nodi mcp --ask rejects an unrelated request as busy while the pending action keeps polling", async () => {
  const t = setup();
  let relay;
  try {
    relay = askRelay(t);
    relay.process.stdin.write(JSON.stringify(call(7, "run", { query: "lock" })) + "\n");
    await waitFor(() => askEnvelopes(t).some(x => x.op === "poll"), "relay did not start polling");
    relay.process.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: 8, method: "ping" }) + "\n");
    await waitFor(() => relay.stdout().includes("\n"), "unrelated request did not receive a busy response");
    assert.deepEqual(JSON.parse(relay.stdout()), {
      jsonrpc: "2.0", id: 8, error: { code: -32000, message: "Another request is already in progress" }
    });
    assert.equal(askEnvelopes(t).filter(x => x.op === "call").length, 1, "busy request was not relayed or queued");
    const polls = askEnvelopes(t).filter(x => x.op === "poll").length;
    await waitFor(() => askEnvelopes(t).filter(x => x.op === "poll").length > polls,
                  "pending request stopped polling after a busy response");
    relay.process.stdin.write(JSON.stringify({
      jsonrpc: "2.0", method: "notifications/progress", params: { progressToken: "x" }
    }) + "\n");
    await new Promise(resolve => setTimeout(resolve, 100));
    assert.equal(relay.stdout().trim().split("\n").length, 1, "notification received a response");
    relay.process.stdin.write(JSON.stringify({
      jsonrpc: "2.0", method: "notifications/cancelled", params: { requestId: 7 }
    }) + "\n");
    await waitFor(() => askEnvelopes(t).some(x => x.op === "cancel"), "cleanup cancellation was not processed");
  } finally {
    if (relay) await endRelay(relay);
    rmSync(t, { recursive: true, force: true });
  }
});

test("nodi mcp --ask joins bounded semantic retransmissions to one successful pending call", async () => {
  const t = setup();
  let relay;
  try {
    const original = ' { "params": { "arguments": { "__proto__": { "safe": true }, "query": "lock" }, "name": "run" }, "method": "tools/call", "id": 7, "jsonrpc": "2.0" } ';
    const reordered = '{"jsonrpc":"2.0","id":7,"method":"tools/call","params":{"name":"run","arguments":{"query":"lock","__proto__":{"safe":true}}}}';
    relay = askRelay(t, { FAKE_PENDING_FOREVER: "0", FAKE_PENDING_POLLS: "4" });
    relay.process.stdin.write(original + "\n" + reordered + "\n" + original + "\n" + reordered + "\n");
    await waitFor(() => relay.stdout().trim().split("\n").filter(Boolean).length === 4,
                  "joined retransmissions did not all receive the terminal response", 5000);
    const replies = relay.stdout().trim().split("\n").map(JSON.parse);
    assert.equal(replies.length, 4);
    assert.ok(replies.every(reply => JSON.stringify(reply) === JSON.stringify(replies[0])),
              "every semantic retransmission receives the same terminal response");
    const envelopes = askEnvelopes(t);
    assert.equal(envelopes.filter(x => x.op === "call").length, 1,
                 "retransmissions must not create another shell call or card");
  } finally {
    if (relay) await endRelay(relay);
    rmSync(t, { recursive: true, force: true });
  }
});

test("nodi mcp --ask bounds retained exact retransmissions", async () => {
  const t = setup();
  let relay;
  try {
    const request = JSON.stringify(call(7, "run", { query: "lock" }));
    relay = askRelay(t);
    relay.process.stdin.write(Array(18).fill(request).join("\n") + "\n");
    await waitFor(() => relay.stdout().includes("Too many duplicate requests are already waiting"),
                  "duplicate overflow did not receive an immediate bounded error", 6000);
    const replies = relay.stdout().trim().split("\n").map(JSON.parse);
    assert.deepEqual(replies, [{
      jsonrpc: "2.0", id: 7,
      error: { code: -32000, message: "Too many duplicate requests are already waiting" }
    }]);
    assert.equal(askEnvelopes(t).filter(x => x.op === "call").length, 1,
                 "overflow must not reach Ask or create another card");
    const exited = once(relay.process, "exit");
    relay.process.stdin.end();
    await exited;
    assert.equal(askEnvelopes(t).filter(x => x.op === "cancel").length, 1);
  } finally {
    if (relay) await endRelay(relay);
    rmSync(t, { recursive: true, force: true });
  }
});

test("nodi mcp --ask rejects a changed same-ID body and a differently typed ID without mutating the pending call", async () => {
  const t = setup();
  let relay;
  try {
    const original = '{"jsonrpc":"2.0","id":7,"method":"tools/call","params":{"name":"run","arguments":{"query":"lock","__proto__":{"safe":true}}}}';
    relay = askRelay(t);
    relay.process.stdin.write(original + "\n");
    await waitFor(() => askEnvelopes(t).some(x => x.op === "poll"), "relay did not start polling");
    relay.process.stdin.write('{"jsonrpc":"2.0","id":7,"method":"tools/call","params":{"name":"run","arguments":{"query":"logout","__proto__":{"safe":true}}}}\n');
    relay.process.stdin.write('{"jsonrpc":"2.0","id":7,"method":"tools/call","params":{"name":"run","arguments":{"query":"lock","__proto__":{"safe":"true"}}}}\n');
    relay.process.stdin.write('{"jsonrpc":"2.0","id":"7","method":"tools/call","params":{"name":"run","arguments":{"query":"lock","__proto__":{"safe":true}}}}\n');
    await waitFor(() => relay.stdout().trim().split("\n").filter(Boolean).length === 3,
                  "mismatched pending requests did not receive immediate errors");
    assert.deepEqual(relay.stdout().trim().split("\n").map(JSON.parse), [{
      jsonrpc: "2.0", id: 7,
      error: { code: -32600, message: "Request ID is already pending with different content" }
    }, {
      jsonrpc: "2.0", id: 7,
      error: { code: -32600, message: "Request ID is already pending with different content" }
    }, {
      jsonrpc: "2.0", id: "7",
      error: { code: -32000, message: "Another request is already in progress" }
    }]);
    assert.equal(askEnvelopes(t).filter(x => x.op === "call").length, 1);
    const polls = askEnvelopes(t).filter(x => x.op === "poll").length;
    await waitFor(() => askEnvelopes(t).filter(x => x.op === "poll").length > polls,
                  "mismatches mutated or stopped the pending request");
  } finally {
    if (relay) await endRelay(relay);
    rmSync(t, { recursive: true, force: true });
  }
});

test("nodi mcp --ask gives an exact retransmission the same failed-poll error", async () => {
  const t = setup();
  let relay;
  try {
    const request = JSON.stringify(call(7, "run", { query: "lock" }));
    relay = askRelay(t, { FAKE_POLL_FAILURE: "1" });
    relay.process.stdin.write(request + "\n" + request + "\n");
    await waitFor(() => relay.stdout().trim().split("\n").filter(Boolean).length === 2,
                  "joined retransmission did not receive the failed-poll outcome");
    const replies = relay.stdout().trim().split("\n").map(JSON.parse);
    assert.equal(replies.length, 2);
    assert.deepEqual(replies[0], {
      jsonrpc: "2.0", id: 7,
      error: { code: -32603, message: "The bar cannot be reached" }
    });
    assert.deepEqual(replies[1], replies[0]);
    assert.equal(askEnvelopes(t).filter(x => x.op === "call").length, 1);
    assert.equal(askEnvelopes(t).filter(x => x.op === "cancel").length, 1);
  } finally {
    if (relay) await endRelay(relay);
    rmSync(t, { recursive: true, force: true });
  }
});

test("nodi mcp --ask gives an exact retransmission the same terminal JSON-RPC error", async () => {
  const t = setup();
  let relay;
  try {
    const request = JSON.stringify(call(7, "run", { query: "lock" }));
    const terminal = {
      jsonrpc: "2.0", id: 7,
      error: { code: -32042, message: "Action ended" }
    };
    relay = askRelay(t, {
      FAKE_PENDING_FOREVER: "0",
      FAKE_FINAL_RESPONSE: JSON.stringify(terminal)
    });
    relay.process.stdin.write(request + "\n" + request + "\n");
    await waitFor(() => relay.stdout().trim().split("\n").filter(Boolean).length === 2,
                  "joined retransmission did not receive the terminal JSON-RPC error");
    assert.deepEqual(relay.stdout().trim().split("\n").map(JSON.parse), [terminal, terminal]);
    assert.equal(askEnvelopes(t).filter(x => x.op === "call").length, 1);
  } finally {
    if (relay) await endRelay(relay);
    rmSync(t, { recursive: true, force: true });
  }
});

test("nodi mcp --ask gives an exact retransmission the same cancellation error", async () => {
  const t = setup();
  let relay;
  try {
    const request = JSON.stringify(call(7, "run", { query: "lock" }));
    relay = askRelay(t);
    relay.process.stdin.write(request + "\n");
    await waitFor(() => askEnvelopes(t).some(x => x.op === "poll"), "relay did not start polling");
    relay.process.stdin.write(request + "\n");
    const polls = askEnvelopes(t).filter(x => x.op === "poll").length;
    await waitFor(() => askEnvelopes(t).filter(x => x.op === "poll").length > polls,
                  "exact retransmission was not retained");
    relay.process.stdin.write(JSON.stringify({
      jsonrpc: "2.0", method: "notifications/cancelled", params: { requestId: 7 }
    }) + "\n");
    await waitFor(() => relay.stdout().trim().split("\n").filter(Boolean).length === 2,
                  "joined retransmission did not receive cancellation");
    const replies = relay.stdout().trim().split("\n").map(JSON.parse);
    assert.equal(replies.length, 2);
    assert.deepEqual(replies[0], {
      jsonrpc: "2.0", id: 7, error: { code: -32800, message: "Request cancelled" }
    });
    assert.deepEqual(replies[1], replies[0]);
    assert.equal(askEnvelopes(t).filter(x => x.op === "call").length, 1);
    assert.equal(askEnvelopes(t).filter(x => x.op === "cancel").length, 1);
  } finally {
    if (relay) await endRelay(relay);
    rmSync(t, { recursive: true, force: true });
  }
});

test("nodi mcp --ask bounds oversize input while an action is pending and continues polling", async () => {
  const t = setup();
  let relay;
  try {
    relay = askRelay(t);
    relay.process.stdin.write(JSON.stringify(call(7, "run", { query: "lock" })) + "\n");
    await waitFor(() => askEnvelopes(t).some(x => x.op === "poll"), "relay did not start polling");
    relay.process.stdin.write("x".repeat(65537) + "\n");
    await waitFor(() => relay.stdout().includes("\n"), "oversize line did not receive an error");
    assert.deepEqual(JSON.parse(relay.stdout()), {
      jsonrpc: "2.0", id: null, error: { code: -32602, message: "Too long: a message is 64 KB at most" }
    });
    assert.equal(askEnvelopes(t).filter(x => x.op === "cancel").length, 0);
    const polls = askEnvelopes(t).filter(x => x.op === "poll").length;
    await waitFor(() => askEnvelopes(t).filter(x => x.op === "poll").length > polls,
                  "oversize line blocked later polling");
    relay.process.stdin.write(JSON.stringify({
      jsonrpc: "2.0", method: "notifications/cancelled", params: { requestId: 7 }
    }) + "\n");
    await waitFor(() => askEnvelopes(t).some(x => x.op === "cancel"), "cleanup cancellation was not processed");
  } finally {
    if (relay) await endRelay(relay);
    rmSync(t, { recursive: true, force: true });
  }
});

test("nodi mcp --ask cancels every failed poll once, preserves its error, and leaves notifications unanswered", async () => {
  const cases = [
    { env: { FAKE_POLL_SENTINEL: "error" }, message: "Nodi failed to answer; the shell's log says why" },
    { env: { FAKE_POLL_SENTINEL: "unknown" }, message: "The bar cannot be reached" },
    { env: { FAKE_POLL_SENTINEL: "ok" }, message: "The bar gave no answer" },
    { env: { FAKE_POLL_FAILURE: "1" }, message: "The bar cannot be reached" }
  ];
  for (const item of cases) {
    const t = setup();
    let relay;
    try {
      const request = call(7, "run", { query: "lock" });
      const notification = {
        jsonrpc: "2.0", method: "tools/call",
        params: { name: "run", arguments: { query: "logout" } }
      };
      relay = askRelay(t, item.env);
      relay.process.stdin.write(JSON.stringify(request) + "\n");
      await waitFor(() => relay.stdout().includes("\n"), "failed poll did not answer: " + JSON.stringify(item.env));
      const lines = relay.stdout().trim() ? relay.stdout().trim().split("\n").map(JSON.parse) : [];
      assert.deepEqual(lines, [{
        jsonrpc: "2.0", id: 7,
        error: { code: -32603, message: item.message }
      }], JSON.stringify(item.env));
      let envelopes = readFileSync(join(t, "log.ask-calls"), "utf8").trim().split("\n")
        .map(line => JSON.parse(line.slice(line.indexOf(" ") + 1)));
      assert.equal(envelopes.filter(x => x.op === "cancel").length, 1, JSON.stringify(item.env));
      assert.deepEqual(envelopes.at(-1), {
        token: "t0k", channel: "channel-7", op: "cancel", ticket: "ticket-7"
      }, JSON.stringify(item.env));
      await endRelay(relay);
      relay = undefined;

      rmSync(join(t, "log.ask-calls"));
      rmSync(join(t, "log.polls"));
      relay = askRelay(t, item.env);
      relay.process.stdin.write(JSON.stringify(notification) + "\n");
      await waitFor(() => askEnvelopes(t).some(x => x.op === "cancel"),
                    "failed notification poll was not cancelled: " + JSON.stringify(item.env));
      assert.equal(relay.stdout(), "", "notification: " + JSON.stringify(item.env));
      envelopes = readFileSync(join(t, "log.ask-calls"), "utf8").trim().split("\n")
        .map(line => JSON.parse(line.slice(line.indexOf(" ") + 1)));
      assert.equal(envelopes.filter(x => x.op === "cancel").length, 1,
                   "notification: " + JSON.stringify(item.env));
    } finally {
      if (relay) await endRelay(relay);
      rmSync(t, { recursive: true, force: true });
    }
  }
});

test("nodi mcp --ask best-effort cancels its pending ticket once when terminated", async () => {
  const t = setup();
  try {
    const env = {
      OMARCHY_PATH: join(t, "omarchy"), XDG_RUNTIME_DIR: join(t, "run"), FAKE_LOG: join(t, "log"),
      FAKE_TOKEN: "t0k", FAKE_CHANNEL: "channel-7", FAKE_PENDING: "1", FAKE_PENDING_FOREVER: "1",
      NODI_ASK_SESSION: "t0k", NODI_ASK_CHANNEL: "channel-7"
    };
    const p = spawn(NODI, ["mcp", "--ask"], { env });
    p.stdin.write(JSON.stringify(call(7, "run", { query: "lock" })) + "\n");
    const callsPath = join(t, "log.ask-calls");
    let sawPoll = false;
    for (let i = 0; i < 100; i++) {
      let calls = "";
      try { calls = readFileSync(callsPath, "utf8"); } catch (e) {}
      if (calls.includes('"op":"poll"')) { sawPoll = true; break; }
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    const exited = new Promise(resolve => p.on("exit", resolve));
    p.kill("SIGTERM");
    await exited;
    assert.equal(sawPoll, true, "relay reached its pending poll loop");
    const envelopes = readFileSync(callsPath, "utf8").trim().split("\n")
      .map(line => JSON.parse(line.slice(line.indexOf(" ") + 1)));
    assert.equal(envelopes.filter(x => x.op === "cancel").length, 1);
    assert.equal(envelopes.at(-1).op, "cancel");
    assert.equal(envelopes.at(-1).ticket, "ticket-7");
  } finally { rmSync(t, { recursive: true, force: true }); }
});

test("nodi mcp --ask publishes a returned pending ticket before honoring termination", async () => {
  const t = setup();
  try {
    const env = {
      OMARCHY_PATH: join(t, "omarchy"), XDG_RUNTIME_DIR: join(t, "run"), FAKE_LOG: join(t, "log"),
      FAKE_TOKEN: "t0k", FAKE_CHANNEL: "channel-7", FAKE_PENDING: "1", FAKE_PENDING_FOREVER: "1",
      FAKE_CALL_RESPONSE_PAUSE: "1", NODI_ASK_SESSION: "t0k", NODI_ASK_CHANNEL: "channel-7"
    };
    const p = spawn(NODI, ["mcp", "--ask"], { env });
    p.stdin.write(JSON.stringify(call(7, "run", { query: "lock" })) + "\n");
    const marker = join(t, "log.call-response");
    let returned = false;
    for (let i = 0; i < 100; i++) {
      if (existsSync(marker)) { returned = true; break; }
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    const before = readFileSync(join(t, "log.ask-calls"), "utf8");
    assert.equal(returned, true, "fake shell did not publish its call response");
    assert.doesNotMatch(before, /"op":"poll"/, "test missed the pre-poll race window");
    const exited = new Promise(resolve => p.on("exit", resolve));
    p.kill("SIGTERM");
    await exited;
    const envelopes = readFileSync(join(t, "log.ask-calls"), "utf8").trim().split("\n")
      .map(line => JSON.parse(line.slice(line.indexOf(" ") + 1)));
    assert.equal(envelopes.filter(x => x.op === "cancel").length, 1);
    assert.equal(envelopes.at(-1).op, "cancel");
    assert.equal(envelopes.at(-1).ticket, "ticket-7");
  } finally { rmSync(t, { recursive: true, force: true }); }
});

test("nodi mcp --ask defers signals at every cancellation ticket-capture window", async () => {
  for (const stage of ["before-busy", "after-busy", "after-capture", "after-clear", "after-attempt"]) {
    const t = setup();
    let relay;
    try {
      const marker = join(t, "cancel-hook");
      relay = askRelay(t, {
        NODI_ASK_TEST_SIGNAL_CANCEL_STAGE: stage,
        NODI_ASK_TEST_CANCEL_MARKER: marker
      });
      relay.process.stdin.write(JSON.stringify(call(7, "run", { query: "lock" })) + "\n");
      await waitFor(() => askEnvelopes(t).some(x => x.op === "poll"),
                    stage + ": relay did not start polling");
      const exited = once(relay.process, "exit");
      relay.process.stdin.end();
      await Promise.race([
        exited,
        new Promise((_, reject) => setTimeout(() => reject(new Error(stage + ": relay did not exit")), 1500))
      ]);
      assert.equal(readFileSync(marker, "utf8"), stage, stage + ": deterministic hook was not reached");
      const envelopes = askEnvelopes(t);
      assert.equal(envelopes.filter(x => x.op === "cancel").length, 1,
                   stage + ": cancellation must be attempted exactly once");
      assert.equal(envelopes.at(-1).op, "cancel", stage);
      assert.equal(relay.process.exitCode, 0, stage + ": deferred signal exit was not deterministic");
    } finally {
      if (relay) await endRelay(relay);
      rmSync(t, { recursive: true, force: true });
    }
  }
});

test("nodi --help and -h print what the command does, from its own header", () => {
  const t = setup();
  try {
    for (const flag of ["--help", "-h"]) {
      const r = nodi(t, [flag]);
      assert.equal(r.status, 0, flag);
      assert.match(r.out, /^nodi: Nodi from a terminal or a script/, flag);
      assert.match(r.out, /\n  nodi run <key> /);
      assert.ok(!/^#/m.test(r.out), "the comment marks taken off");
      assert.equal(r.log, "", "the bar is not asked");
    }
  } finally { rmSync(t, { recursive: true, force: true }); }
});

test("pick: an answer that comes as the bar closes is still taken", () => {
  const t = setup();
  try {
    // The first wait (2 s) ends, and the answer lands as the bar says the
    // pick is gone: taken by the second read. Not timed against the waits,
    // which a loaded machine stretches.
    const r = nodi(t, ["pick"], { input: "alpha\nbeta\n", pick: "none", alive: "no", env: { FAKE_ANSWER_ON_ALIVE: "pick 1" } });
    assert.deepEqual([r.status, r.out], [0, "beta\n"], r.err);
    assert.match(r.log, /pickAlive/);
  } finally { rmSync(t, { recursive: true, force: true }); }
});

test("nodi mcp: propose and approve when the bar refuses the question say it could not ask him", () => {
  const t = setup();
  try {
    const describe = JSON.stringify({ key: "k", title: "K", subtitle: "", command: "k", risk: "", asks: "" });
    let r = mcp(t, [call(1, "propose", { key: "k" })], { describe, env: { FAKE_PICKREPLY: "busy" } });
    assert.deepEqual([text(r.byId[1]), r.byId[1].result.isError], ["The bar could not ask him", true]);
    r = mcp(t, [call(1, "approve", { tool_name: "Bash", input: { command: "ls" } })], { env: { FAKE_PICKREPLY: "busy" } });
    assert.deepEqual(JSON.parse(text(r.byId[1])), { behavior: "deny", message: "The bar could not ask him." });
  } finally { rmSync(t, { recursive: true, force: true }); }
});

test("nodi mcp --ask: under 64 KB in letters but past it in bytes, a message is refused with its id; one the shell failed on says so", () => {
  const t = setup();
  try {
    // 30,000 Tamil letters: within read_line's 65,536 characters, over the
    // 64 KB the one IPC argument holds.
    const big = JSON.stringify({ jsonrpc: "2.0", id: 9, method: "tools/call", params: { name: "search", arguments: { query: "த".repeat(30000) } } });
    let r = nodi(t, ["mcp", "--ask"], { input: big + "\n", env: { NODI_ASK_SESSION: "t0k" } });
    const refused = JSON.parse(r.out);
    assert.deepEqual([refused.id, refused.error.code, refused.error.message], [9, -32602, "Too long: a message is 64 KB at most"]);
    assert.ok(!/askMcp/.test(r.log), "never sent to the shell");
    r = nodi(t, ["mcp", "--ask"], { input: JSON.stringify({ jsonrpc: "2.0", id: 3, method: "tools/list" }) + "\n",
                                    env: { NODI_ASK_SESSION: "t0k", FAKE_EMPTY: "error" } });
    assert.deepEqual(JSON.parse(r.out).error, { code: -32603, message: "Nodi failed to answer; the shell's log says why" });
  } finally { rmSync(t, { recursive: true, force: true }); }
});

test("a summon's payload outlives the call, for a bar that reads it once Nodi has loaded, then goes", async () => {
  const t = setup();
  try {
    const r = nodi(t, ["hello"], { env: { NODI_CARRY_KEEP: "2" } });
    assert.equal(r.status, 0, r.err);
    const path = r.log.match(/@file:(\S+)/)[1];
    assert.equal(readFileSync(path, "utf8"), '{"query":"hello"}', "still there when nodi has returned");
    await new Promise(res => setTimeout(res, 3500));
    assert.deepEqual(readdirSync(join(t, "run")).filter(f => f.startsWith("nodi-ipc.")), [], "gone after its time");
  } finally { rmSync(t, { recursive: true, force: true }); }
});

// Bash runs an EXIT trap when SIGPIPE ends it (5.3); verify that a payload
// outlives a relay ended so.
test("an Ask relay whose agent has gone dies by SIGPIPE at its next answer, and its payload folder goes with it", () => {
  const t = setup();
  try {
    const line = JSON.stringify(call("x", "search", { query: "q" }));
    writeFileSync(join(t, "in"), line + "\n" + line + "\n");
    // Its reader gone before the answer is written. --norc: bash -c with
    // a socket for stdin, as Node gives it, reads ~/.bashrc, whose
    // OMARCHY_PATH would point nodi at the real shell.
    const r = nodi(t, ["--norc", "--noprofile", "-c", '"$0" mcp --ask < "$1" | true; echo "${PIPESTATUS[0]}"', NODI, join(t, "in")], { env: { NODI_ASK_SESSION: "t0k" }, program: "/usr/bin/bash" });
    assert.equal(r.out.trim(), "141", "ended by the pipe: " + r.err);
    assert.match(r.log, /askMcp @file:/, "the bar was asked first");
    assert.deepEqual(readdirSync(join(t, "run")).filter(f => f.startsWith("nodi-ipc.")), [], "no payload left behind");
  } finally { rmSync(t, { recursive: true, force: true }); }
});

test("with no XDG_RUNTIME_DIR (Codex clears it), payloads go to logind's folder for this user, where the bar reads them", () => {
  const t = setup();
  try {
    const uid = process.getuid(), own = `/run/user/${uid}`;
    let mine = false;
    try { mine = statSync(own).isDirectory() && statSync(own).uid === uid; } catch (e) {}
    const r = mcp(t, [call(1, "search", { query: "x" })], { env: { XDG_RUNTIME_DIR: undefined } });
    assert.equal(r.status, 0, r.err);
    const path = r.log.match(/search @file:(\S+)/)[1];
    assert.ok(path.startsWith((mine ? own : "/tmp") + "/nodi-ipc."), path);
    assert.ok(!existsSync(path.replace(/\/payload$/, "")), "and gone when it ends");
  } finally { rmSync(t, { recursive: true, force: true }); }
});

test("an agent's search, a row's key and Ask's messages reach the bar in a 0700 folder's file, never an argument", () => {
  const t = setup();
  try {
    const secret = "the merger with Acme நொடி";
    let r = mcp(t, [call(1, "search", { query: secret }), call(2, "run", { key: "file:/test-home/" + secret + ".md" })]);
    assert.equal(r.status, 0, r.err);
    assert.equal(readFileSync(join(t, "log.search"), "utf8"), secret, "the search reached the bar whole");
    assert.equal(readFileSync(join(t, "log.carried"), "utf8").trim(), "700 600", "its folder and file owner-only");
    assert.ok(!r.log.includes("merger") && !r.log.includes("Acme"), "in an argument: " + r.log);
    assert.match(r.log, /call io\.github\.itsgg\.nodi search @file:.*\/nodi-ipc\.[A-Za-z0-9]+\/payload\n/);
    const line = JSON.stringify(call("x", "search", { query: secret }));
    r = nodi(t, ["mcp", "--ask"], { input: line + "\n", env: { NODI_ASK_SESSION: "t0k3n-secret", FAKE_TOKEN: "t0k3n-secret" } });
    assert.equal(r.status, 0, r.err);
    assert.equal(readFileSync(join(t, "log.ask"), "utf8").trim(), line, "the message reached Ask whole");
    assert.ok(!r.log.includes("merger") && !r.log.includes("t0k3n"), "the message or the token in an argument: " + r.log);
    assert.deepEqual(readdirSync(join(t, "run")).filter(f => f.startsWith("nodi-ipc.")), [], "each server's folder gone when it ends");
  } finally { rmSync(t, { recursive: true, force: true }); }
});
