// Ask: the bar's tools, the agents it can hold, and its rows.

import { test } from "node:test";
import assert from "node:assert/strict";
import { load, plain } from "./load.mjs";
import { run } from "./fixtures.mjs";
import { spawnSync } from "node:child_process";

const run_launch = args => spawnSync("/usr/bin/bash", ["-c", load("lib/Agents.js").LAUNCH, "nodi-agent", ...args], { encoding: "utf8" });

const A = load("lib/AskTools.js");
const G = load("lib/Agents.js");

test("the bar's server answers initialize, ping, tools/list and tools/call; a notification gets nothing", () => {
  const h = { search: q => [{ key: "app:" + q }], run: k => "Ran: " + k };
  assert.equal(plain(A.mcp({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18" } }, h)).result.serverInfo.name, "nodi");
  assert.deepEqual(plain(A.mcp({ jsonrpc: "2.0", id: 2, method: "tools/list" }, h)).result.tools.map(t => t.name), ["search", "run"]);
  assert.equal(plain(A.mcp({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "search", arguments: { query: "firefox" } } }, h)).result.content[0].text, '[{"key":"app:firefox"}]');
  assert.equal(plain(A.mcp({ jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "run", arguments: { key: "app:x" } } }, h)).result.content[0].text, "Ran: app:x");
  assert.equal(plain(A.mcp({ jsonrpc: "2.0", id: 5, method: "tools/call", params: { name: "rm" } }, h)).error.code, -32602, "an unknown tool is a bad parameter (MCP)");
  assert.equal(plain(A.mcp({ jsonrpc: "2.0", id: 9, method: "resources/list" }, h)).error.code, -32601);
  assert.deepEqual(plain(A.mcp({ jsonrpc: "2.0", id: 8, method: "ping" }, h)), { jsonrpc: "2.0", id: 8, result: {} });
  const bad = plain(A.mcp({ jsonrpc: "2.0", id: 6, method: "tools/call", params: { name: "search", arguments: {} } }, { search: () => { throw "boom"; } }));
  assert.ok(bad.result.isError && /boom/.test(bad.result.content[0].text), "a handler that throws is a tool error, not a dead session");
  assert.equal(A.mcp({ jsonrpc: "2.0", method: "notifications/initialized" }, h), null);
});

test("the bar's own tools, as each agent names them; any other tool is not", () => {
  const own = x => A.barTool(x);
  assert.equal(own({ title: "mcp__nodi__run", _meta: { claudeCode: { toolName: "mcp__nodi__run", mcpServer: { name: "nodi", source: "dynamic" } } } }), "run");
  assert.equal(own({ title: "mcp__nodi__run", _meta: { claudeCode: { toolName: "mcp__nodi__run", mcpServer: { name: "other" } } } }), "", "Claude's _meta decides");
  for (const [t, want] of [["mcp__nodi__search", "search"], ["nodi__run", "run"], ["search (nodi MCP Server)", "search"], ["nodi: run", "run"],
                           ["mcp.nodi.search", "search"], ["nodi_run", "run"], ["nodi/search", "search"],
                           ["Bash", ""], ["run", ""], ["mcp__nodiplus__run", ""], ["mcp__nodi__rm", ""], ["mcp__other__run", ""], ["nodi: run it all", ""]])
    assert.equal(own({ title: t }), want, t);
  assert.equal(own({ name: "nodi__search", title: "Searching the bar" }), "search", "by name when the title is prose");
  assert.equal(own(null), "");
});

test("what a tool call is doing, in words, while he waits", () => {
  assert.equal(A.doing({ title: "mcp__nodi__search", rawInput: { query: "lock  screen" } }), "Searching the bar for lock screen");
  assert.equal(A.doing({ title: "nodi: search", rawInput: {} }), "Searching the bar");
  assert.equal(A.doing({ title: "search (nodi MCP Server)", rawInput: { query: "x".repeat(80) } }), "Searching the bar for " + "x".repeat(57) + "...");
  assert.equal(A.doing({ title: "mcp.nodi.run", rawInput: { key: "menu:system.lock" } }), "Running a row of the bar");
  assert.equal(A.doing({ title: "ReadFile" }), "Using ReadFile");
  assert.equal(A.doing({}), "Using a tool");
});

test("what the agent is told: the bar's rules, its tools only with actions, the servers only when named", () => {
  assert.equal(A.instructions(false, false), A.SYSTEM);
  assert.equal(A.instructions(true, false), A.SYSTEM + A.ACTS);
  assert.equal(A.instructions(true, true), A.SYSTEM + A.ACTS + A.MCP_NOTE);
  assert.equal(A.instructions(false, true), A.SYSTEM, "no servers without actions");
});

test("Claude over ACP: its adapter pinned, his own claude, nothing of his settings, and only the bar's search unasked (ROADMAP 84)", () => {
  const s = plain(G.spec("claude", "/d", "", "x", ["nodi"], "/p/lib/adapters"));
  assert.equal(s.name, "Claude");
  assert.equal(s.model, "haiku", "haiku unless set");
  assert.deepEqual(s.argv.slice(0, 2), ["/usr/bin/bash", "-lc"], "a login shell, for his PATH and the agent's sign-in");
  assert.deepEqual(s.argv.slice(4, 7), ["--bounds", "67108864", "4194304"], "its output bounded, by arguments, not by anything in the environment");
  const rest = s.argv.slice(7);
  assert.deepEqual(rest.slice(0, 3), ["--which", "CLAUDE_CODE_EXECUTABLE", "claude"]);
  assert.deepEqual(rest.slice(3), ["npm", "/d/agents/_agentclientprotocol_claude-agent-acp@0.86.0", "/p/lib/adapters/claude-agent-acp",
                                   "@agentclientprotocol/claude-agent-acp", "0.86.0", "claude-agent-acp"]);
  assert.equal(s.adapter, "@agentclientprotocol/claude-agent-acp 0.86.0");
  assert.deepEqual(s.env, { CLAUDE_CODE_DISABLE_CLAUDE_MDS: "1", CLAUDE_CODE_DISABLE_AUTO_MEMORY: "1", ANTHROPIC_MODEL: "haiku" });
  const m = plain(G.spec("claude", "/d", "sonnet", "Be brief.", ["nodi"]).meta(true));
  assert.equal(m.systemPrompt, "Be brief.", "replaces Claude Code's own prompt");
  const o = m.claudeCode.options;
  assert.deepEqual([o.model, o.tools, o.settingSources, o.strictMcpConfig, o.persistSession, o.allowDangerouslySkipPermissions],
                   ["sonnet", [], [], true, false, false]);
  assert.deepEqual(o.allowedTools, ["mcp__nodi__search"], "the run asks, as does every tool of a server he named");
  assert.deepEqual(plain(G.spec("claude", "/d", "", "x", []).meta(false)).claudeCode.options.allowedTools, []);
  assert.equal(G.spec("nonesuch", "/d", ""), null);
  assert.equal(G.spec("toString", "/d", ""), null, "only the agents named");
});

test("Codex: its adapter on his own codex, read-only, no shell, apps or web, the instructions its own (ROADMAP 84)", () => {
  const s = plain(G.spec("codex", "/d", "", "Be brief.", ["nodi"], "/p/lib/adapters"));
  assert.deepEqual(s.argv.slice(7, 10), ["--which", "CODEX_PATH", "codex"]);
  assert.deepEqual(s.argv.slice(10), ["npm", "/d/agents/_agentclientprotocol_codex-acp@2.1.1", "/p/lib/adapters/codex-acp",
                                     "@agentclientprotocol/codex-acp", "2.1.1", "codex-acp"]);
  assert.equal(s.env.INITIAL_AGENT_MODE, "read-only");
  const c = JSON.parse(s.env.CODEX_CONFIG);
  assert.deepEqual(c, { developer_instructions: "Be brief.", web_search: "disabled", project_doc_max_bytes: 0,
                        "features.shell_tool": false, "features.unified_exec": false, "features.apps": false });
  assert.equal(JSON.parse(G.spec("codex", "/d", "gpt-5.5", "x", []).env.CODEX_CONFIG).model, "gpt-5.5");
  assert.deepEqual([s.instructs, s.modelInMeta, s.meta], [true, true, null]);
});

test("Gemini: no built-in tool, only the servers given, no GEMINI.md, no hooks", () => {
  const gem = plain(G.spec("gemini", "/d", "gemini-3.8-flash", "x", ["nodi", "github"]));
  assert.deepEqual(gem.argv.slice(7, 10), ["--file", "GEMINI_CLI_SYSTEM_SETTINGS_PATH", "/d/gemini-settings.json"]);
  assert.deepEqual(JSON.parse(gem.argv[10]), { tools: { core: [] }, mcp: { allowed: ["nodi", "github"] }, context: { fileName: "NODI_NONE.md" },
                                              hooksConfig: { enabled: false }, model: { name: "gemini-3.8-flash" } });
  assert.deepEqual(gem.argv.slice(11), ["exec", "gemini", "--acp"]);
  assert.equal(gem.adapter, "", "Gemini is its own program, nothing installed");
  assert.deepEqual([gem.instructs, gem.mode], [false, ""], "the instructions with the first prompt");
  assert.deepEqual(plain(G.known()).sort(), ["claude", "codex", "gemini"], "Cursor reads files unasked (AgentsLiveTest, 2026-10-07)");
  assert.equal(G.spec("cursor-agent", "/d", ""), null);
});

test("after session/new: the mode Ask needs and the model asked for, or a start that fails saying why", () => {
  const Acp = load("lib/Acp.js");
  const res = { configOptions: [
    { id: "mode", category: "mode", type: "select", currentValue: "agent", options: [{ value: "agent", name: "Agent" }, { value: "ask", name: "Ask" }] },
    { id: "model", category: "model", type: "select", currentValue: "gpt-5.6-sol[x]",
      options: [{ group: "g", name: "G", options: [{ value: "gpt-5.6-sol[x]", name: "gpt-5.6-sol" }, { value: "claude-sonnet-5-5[y]", name: "claude-sonnet-5-5" }] }] }] };
  assert.deepEqual(plain(Acp.configure("s", res, "ask", "claude-sonnet-5-5")).requests.map(r => [r.method, r.params.configId, r.params.value]),
    [["session/set_config_option", "mode", "ask"], ["session/set_config_option", "model", "claude-sonnet-5-5[y]"]]);
  assert.deepEqual(plain(Acp.configure("s", res, "agent", "gpt-5.6-sol")).requests, [], "already so: nothing to send");
  assert.match(Acp.configure("s", res, "plan", "").error, /no plan mode/);
  assert.match(Acp.configure("s", res, "", "o3").error, /no model o3; it offers gpt-5.6-sol, claude-sonnet-5-5/);
  assert.deepEqual(plain(Acp.configure("s", { modes: { currentModeId: "default", availableModes: [{ id: "ask" }] } }, "ask", "")).requests,
    [{ method: "session/set_mode", params: { sessionId: "s", modeId: "ask" }, what: "mode" }], "the older modes when there are no config options");
  assert.match(Acp.configure("s", {}, "ask", "").error, /no ask mode/, "an agent with no such mode does not start");
});

test("an agent of his own: started as its command says, its instructions with the first prompt, nothing of it turned off", () => {
  const s = plain(G.spec({ name: "Helper", command: ["helper", "acp", "--quiet"], env: { HELPER_MODE: "bar", "bad name": "x", N: 3 } }, "/d", "", "x", ["nodi"]));
  assert.deepEqual(s.argv.slice(4), ["--bounds", "67108864", "4194304", "exec", "helper", "acp", "--quiet"], "bounded as the others are");
  assert.deepEqual([s.name, s.env, s.instructs, s.meta, s.mode, s.modelInMeta], ["Helper", { HELPER_MODE: "bar", N: "3" }, false, null, "", false]);
  assert.equal(G.spec({ command: ["/opt/x/bin/opencode", "acp"] }, "/d", "").name, "opencode", "named by its program when unnamed");
  for (const bad of [{}, { command: [] }, { command: "opencode acp" }, { command: [3] }, { command: [""] }, []])
    assert.equal(G.spec(bad, "/d", ""), null, JSON.stringify(bad));
  assert.deepEqual(plain(G.chosen({ command: ["a"] }, "claude")), { command: ["a"] });
});

test("which agent Ask holds: nodi.json's, else Omarchy's default when Ask knows it, else Claude", () => {
  assert.equal(G.chosen("gemini", "claude"), "gemini");
  assert.equal(G.chosen("", "claude"), "claude");
  assert.equal(G.chosen("", "nonesuch"), "claude");
  assert.equal(G.chosen(undefined, ""), "claude");
});

// A stand-in npm: `npm install --prefix DIR ... pkg@ver` writes DIR's
// node_modules/.bin/x after a pause, logging its start and end.
const FAKE_NPM = `#!/usr/bin/bash
prefix=$3
echo "start $$ $*" >> "$NPM_LOG"
sleep "\${NPM_SLEEP:-0.4}"
mkdir -p "$prefix/node_modules/.bin"
printf '#!/usr/bin/bash\\necho ran "$@"\\n' > "$prefix/node_modules/.bin/x"
chmod +x "$prefix/node_modules/.bin/x"
echo "end $$" >> "$NPM_LOG"
`;

test("an adapter installs once, under a lock: two starts at once, and one ended midway (Fable 2026-10-07)", async () => {
  const { mkdtempSync, mkdirSync, writeFileSync, chmodSync, readFileSync, existsSync, rmSync } = await import("node:fs");
  const { spawn } = await import("node:child_process");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const t = mkdtempSync(join(tmpdir(), "nodi-launch-"));
  try {
    writeFileSync(join(t, "npm"), FAKE_NPM); chmodSync(join(t, "npm"), 0o755);
    const env = { PATH: t + ":/usr/bin:/bin", NPM_LOG: join(t, "log"), HOME: t, NODI_INSTALL: "1" };
    const dir = join(t, "agents/pkg@1");
    const lock = join(t, "lock");
    mkdirSync(lock); writeFileSync(join(lock, "package.json"), "{}\n"); writeFileSync(join(lock, "package-lock.json"), "{\"v\": 1}\n");
    const start = (extra = {}) => spawn("/usr/bin/bash", ["-c", G.LAUNCH, "nodi-agent", "npm", dir, lock, "pkg", "1", "x", "hello"], { env: { ...env, ...extra } });
    const done = p => new Promise(r => { let out = ""; p.stdout.on("data", d => out += d); p.on("close", code => r({ code, out })); });
    const [a, b] = await Promise.all([done(start()), done(start())]);
    assert.deepEqual([a.code, a.out, b.code, b.out], [0, "ran hello\n", 0, "ran hello\n"]);
    const starts = readFileSync(join(t, "log"), "utf8").split("\n").filter(l => l.startsWith("start"));
    assert.equal(starts.length, 1, "installed once");
    assert.match(starts[0], / ci --prefix \S+ --ignore-scripts --omit=optional /, "the shipped lock's tree, no install scripts");
    assert.equal(readFileSync(join(dir, "package-lock.json"), "utf8"), "{\"v\": 1}\n", "the shipped lock beside what it installed");
    // Ended midway: its npm stops, nothing passes for installed, the next installs afresh.
    rmSync(dir, { recursive: true }); rmSync(join(t, "log"));
    const slow = start({ NPM_SLEEP: "5" });
    await new Promise(r => setTimeout(r, 1000));
    slow.kill("SIGTERM");
    assert.equal((await done(slow)).code, 143);
    await new Promise(r => setTimeout(r, 300));
    assert.ok(!existsSync(join(dir, "node_modules/.bin/x")), "no half install taken for a whole one");
    assert.doesNotMatch(readFileSync(join(t, "log"), "utf8"), /^end/m, "its npm was stopped");
    const again = await done(start());
    assert.deepEqual([again.code, again.out], [0, "ran hello\n"]);
  } finally { rmSync(t, { recursive: true, force: true }); }
});

test("an adapter installs only when asked to, and again when the shipped lock is not the one installed (the marketplace's review, 2026-10-09)", async () => {
  const { mkdtempSync, mkdirSync, writeFileSync, chmodSync, readFileSync, existsSync, rmSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const t = mkdtempSync(join(tmpdir(), "nodi-consent-"));
  try {
    writeFileSync(join(t, "npm"), FAKE_NPM); chmodSync(join(t, "npm"), 0o755);
    const dir = join(t, "agents/pkg@1"), lock = join(t, "lock");
    mkdirSync(lock); writeFileSync(join(lock, "package.json"), "{}\n"); writeFileSync(join(lock, "package-lock.json"), "{\"v\": 1}\n");
    const go = (extra = {}) => spawnSync("/usr/bin/bash", ["-c", G.LAUNCH, "nodi-agent", "npm", dir, lock, "pkg", "1", "x", "hello"],
                                         { encoding: "utf8", env: { PATH: t + ":/usr/bin:/bin", NPM_LOG: join(t, "log"), HOME: t, NPM_SLEEP: "0", ...extra } });
    const typed = go();
    assert.deepEqual([typed.status, typed.stderr], [75, "nodi: pkg@1 is not installed\n"], "typing installs nothing");
    assert.ok(!existsSync(join(t, "log")), "npm never ran");
    assert.ok(!existsSync(dir));
    assert.equal(go({ NODI_INSTALL: "0" }).status, 75, "NODI_INSTALL=0 is no install either");
    const asked = go({ NODI_INSTALL: "1" });
    assert.deepEqual([asked.status, asked.stdout], [0, "ran hello\n"]);
    assert.match(asked.stderr, /^nodi: installing pkg@1\nnodi: adapter ready\n$/, "ready, said before it runs");
    assert.equal(go().stderr, "nodi: adapter ready\n");
    assert.deepEqual([go().status, go().stdout], [0, "ran hello\n"], "installed: run without asking again");
    // A new lock ships (or the tree was installed from another): not the
    // tree reviewed, so not run, and installed again when asked.
    writeFileSync(join(lock, "package-lock.json"), "{\"v\": 2}\n");
    assert.equal(go().status, 75, "a tree from another lock is not run");
    assert.equal(go({ NODI_INSTALL: "1" }).status, 0);
    assert.equal(readFileSync(join(t, "log"), "utf8").split("\n").filter(l => l.startsWith("start")).length, 2);
    assert.equal(readFileSync(join(dir, "package-lock.json"), "utf8"), "{\"v\": 2}\n");
    // No lockfile shipped: refused, never a bare install.
    rmSync(dir, { recursive: true }); rmSync(join(lock, "package-lock.json"));
    const bare = go({ NODI_INSTALL: "1" });
    assert.deepEqual([bare.status, bare.stderr.trim().split("\n").pop()], [1, "nodi: no lockfile for pkg in " + lock]);
  } finally { rmSync(t, { recursive: true, force: true }); }
});

test("the shipped lockfiles are the versions Ask names: exact, every package from the registry with its hash, none with an install script", async () => {
  const { readFileSync } = await import("node:fs");
  const root = new URL("../../", import.meta.url).pathname;
  for (const id of ["claude", "codex"]) {
    const s = plain(G.spec(id, "/d", "", "x", [], root + "lib/adapters"));
    const [pkg, ver] = s.adapter.split(" ");
    const dir = s.argv[s.argv.indexOf("npm") + 2];
    const pj = JSON.parse(readFileSync(dir + "/package.json", "utf8"));
    const lock = JSON.parse(readFileSync(dir + "/package-lock.json", "utf8"));
    assert.deepEqual(pj.dependencies, { [pkg]: ver }, id + ": package.json pins the adapter exactly");
    assert.deepEqual(lock.packages[""].dependencies, { [pkg]: ver }, id + ": the lock agrees with package.json");
    assert.equal(lock.packages["node_modules/" + pkg].version, ver);
    for (const [k, v] of Object.entries(lock.packages)) {
      if (!k) continue;
      assert.match(v.resolved || "", /^https:\/\/registry\.npmjs\.org\//, id + ": " + k + " from the registry");
      assert.match(v.integrity || "", /^sha512-/, id + ": " + k + " has its hash");
      assert.ok(!v.hasInstallScript, id + ": " + k + " has an install script");
    }
    // Whole: every dependency a locked package needs resolves, as Node
    // resolves it, to a locked package (its own node_modules, then each
    // folder above), unless it is optional or a peer; `npm ci` refuses a
    // lock with one missing.
    const where = (from, dep) => {
      for (let at = from; ; at = at.slice(0, Math.max(0, at.lastIndexOf("/node_modules/")))) {
        const k = (at ? at + "/" : "") + "node_modules/" + dep;
        if (lock.packages[k]) return k;
        if (!at) return null;
      }
    };
    for (const [k, v] of Object.entries(lock.packages)) {
      const optional = new Set(Object.keys(v.optionalDependencies || {}));
      for (const dep of Object.keys(v.dependencies || {})) {
        if (optional.has(dep)) continue;
        assert.ok(where(k, dep), id + ": " + (k || "the root") + " needs " + dep + ", which the lock does not hold");
      }
    }
  }
});

test("the launch script: an adapter installed once, then run; his own agent found on his PATH", () => {
  const r = run_launch(["--which", "X_BIN", "sh", "exec", "sh", "-c", 'printf %s "$X_BIN"']);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /\/sh$/);
  const miss = run_launch(["--which", "X_BIN", "no-such-program-here", "exec", "true"]);
  assert.equal(miss.status, 127);
  assert.match(miss.stderr, /^nodi: no-such-program-here is not installed/);
});

test("a proposed run: two rows, the exact command in the pane, Escape refuses", () => {
  const Pane = load("lib/Pane.js");
  const Run = load("lib/Run.js");
  const Keys = load("lib/Keys.js");
  const proposal = { key: "menu:system.reboot", title: "Reboot", subtitle: "System", run: Run.exec(["systemctl", "reboot"]), risk: "", confirmWord: "" };
  const rows = plain(run("ask restart the machine", { ask: { phase: "proposing", question: "restart the machine", answer: "", agent: "Gemini", model: "", proposal } }));
  assert.deepEqual(rows.map(r => [r.title, r.nodi]), [["Run Reboot", "askAllow"], ["Refuse", "askDeny"]]);
  assert.equal(rows[1].subtitle, "Gemini is told no");
  const pane = plain(Pane.choose({ proposal, agent: "Gemini" }));
  assert.deepEqual([pane.title, pane.text, pane.subtitle], ["Reboot", "systemctl reboot", "Gemini asks to run it: Enter runs it, Esc refuses"]);
  assert.deepEqual(plain(Keys.decide({ name: "Escape" }, { proposing: true })), { do: "refuse" });
});

test("Ask continues: about the selection, about the window, a new question (ROADMAP 43)", () => {
  const idle = { ask: { phase: "idle", question: "", answer: "", model: "haiku" } };
  let rows = plain(run("ask what is this", idle));
  assert.deepEqual(rows.map(r => r.key), ["ask:new"], "nothing selected, no window: the plain question");
  rows = plain(run("ask what is this", { ...idle, selection: { text: "E = mc^2", fresh: false },
                                         window: { address: "0x1", class: "foot", title: "notes", stableId: "180000b1", width: 1512 } }));
  assert.deepEqual(rows.map(r => r.key), ["ask:new", "ask:selection", "ask:window"]);
  const sel = rows[1];
  assert.deepEqual([sel.nodi, sel.ask.question, sel.ask.context], ["askWith", "what is this", "selection"]);
  assert.equal(sel.ask.message, "what is this\n\nThe text it is about:\n<text>\nE = mc^2\n</text>");
  const win = rows[2];
  assert.deepEqual([win.nodi, win.ask.question, win.ask.context, win.subtitle], ["askWindow", "what is this", "window", "notes"]);
  assert.match(win.ask.message, /^what is this\n\nThe picture is the window the question is about, titled "notes"\.$/);
  const done = { ask: { phase: "done", question: "what is this", answer: "a formula", model: "haiku" } };
  const fresh = plain(run("ask what is this", done)).find(r => r.key === "ask:fresh");
  assert.deepEqual([fresh.title, fresh.nodi], ["New question", "askNew"]);
  // A proposal waits on him whatever the field holds (Fable 2026-10-06).
  const prop = { ask: { phase: "proposing", question: "lock my screen", answer: "", model: "haiku",
                        proposal: { key: "menu:system.lock", title: "Lock", subtitle: "System", run: { kind: "exec", argv: ["x"] } } } };
  const edited = plain(run("ask something else", prop));
  assert.deepEqual(edited.map(r => r.key), ["ask:deny", "ask:allow"], "on another question, Refuse leads: a stray Enter says no");
  assert.equal(edited[1].subtitle, "Claude asks to run it for: lock my screen");
  assert.deepEqual(plain(run("ask lock my screen", prop)).map(r => r.key), ["ask:allow", "ask:deny"], "on its own question, Run leads");
  assert.deepEqual(plain(run("ask ", prop)).map(r => r.key), ["ask:deny", "ask:allow"], "an empty question shows it too");
  const copiedQ = plain(run("ask what is this", { ...idle, selection: { text: "x", fresh: true, source: "clipboard" } })).find(r => r.key === "ask:selection");
  assert.deepEqual([copiedQ.title, copiedQ.ask.context], ["Ask about the copied text: what is this", "copied"]);
  // Enter would do nothing: a row says why (Fable 2026-10-06).
  assert.equal(plain(run("ask what time is it", { ask: { phase: "streaming", question: "lock my screen", answer: "", agent: "Claude", model: "haiku" } }))[0].title,
               "Claude is still on: lock my screen");
  const named = plain(run("ask why", { ask: { phase: "idle", question: "", answer: "", agent: "Claude", model: "haiku" } }))[0];
  assert.deepEqual([named.title, named.subtitle], ["Ask Claude: why", "Claude Haiku"]);
  const waiting = { phase: "waiting", question: "why", answer: "", agent: "Claude", model: "haiku" };
  assert.equal(plain(run("ask why", { ask: waiting }))[0].title, "Asking Claude Haiku...", "no status yet: the agent and its model");
  // What it waits on, as Ask says it (components/Ask.qml status).
  assert.equal(plain(run("ask why", { ask: { ...waiting, status: "Installing @agentclientprotocol/claude-agent-acp@0.86.0, once" } }))[0].title,
               "Installing @agentclientprotocol/claude-agent-acp@0.86.0, once...", "an adapter installing says so");
  assert.equal(plain(run("ask why", { ask: { ...waiting, status: "Searching the bar for lock" } }))[0].title, "Searching the bar for lock...");
  const midway = { ...waiting, phase: "streaming", answer: "Running", status: "Searching the bar", activity: "Searching the bar" };
  assert.equal(plain(run("ask why", { ask: midway }))[0].title, "Searching the bar...", "a tool at work after the first words");
  assert.equal(plain(run("ask why", { ask: { ...midway, activity: "" } }))[0].title, "Answering...");
  assert.equal(plain(run("ask what is this", { ask: { phase: "idle", question: "", answer: "", model: "haiku", capturing: true } }))[0].title,
               "Taking a picture of the window...");
  const pic = { ask: { phase: "done", question: "what is this", answer: "a chart", model: "haiku", context: "window" } };
  assert.equal(plain(run("ask what is this", pic)).find(r => r.key === "ask:again").subtitle, "what is this, with the same picture");
});

test("MCP servers he names, for Ask: given to the session, each tool call his to allow (ROADMAP 49)", () => {
  const s = A.servers({ github: { command: "gh-mcp" }, nodi: { command: "x" }, "bad name": { command: "y" }, web: { url: "https://x" }, junk: { foo: 1 },
                        "a__b": { command: "z" } });
  assert.deepEqual(Object.keys(s), ["github", "web"], "a plain name, not the bar's own, no __, with a command or a url");
  const prop = { ask: { phase: "proposing", question: "find my issues", answer: "", agent: "Claude", model: "sonnet",
                        proposal: { key: "tool:mcp__github__search_issues", title: "mcp__github__search_issues", subtitle: '{"q":"is:open"}', tool: true, input: { q: "is:open" } } } };
  const rows = plain(run("ask find my issues", prop));
  assert.deepEqual([rows[0].title, rows[0].actionLabel, rows[0].nodi], ["Allow mcp__github__search_issues", "Allow", "askAllow"]);
  const Pane = load("lib/Pane.js");
  const pane = plain(Pane.choose({ proposal: prop.ask.proposal }));
  assert.match(pane.markdown, /"q": "is:open"/, "the pane shows what it is given");
});

test("an agent that needs him signed in asks in the bar (ROADMAP 84)", () => {
  const prop = { ask: { phase: "proposing", question: "why", answer: "", agent: "Codex", model: "",
                        proposal: { key: "auth:codex", title: "Sign in to Codex: Sign in with ChatGPT", subtitle: "Opens a browser", auth: true, input: {} } } };
  const rows = plain(run("ask why", prop));
  assert.deepEqual(rows.map(r => [r.title, r.actionLabel]), [["Sign in to Codex: Sign in with ChatGPT", "Sign in"], ["Not now", "Refuse"]]);
  const Pane = load("lib/Pane.js");
  assert.equal(plain(Pane.choose({ proposal: prop.ask.proposal })).title, "Sign in to Codex: Sign in with ChatGPT");
});

test("before the first question installs the adapter, the rows that ask say so (the marketplace's review, 2026-10-09)", () => {
  const ask = { phase: "idle", question: "", answer: "", agent: "Claude", model: "haiku", install: "@agentclientprotocol/claude-agent-acp 0.86.0" };
  const rows = plain(run("ask what is this", { ask }));
  assert.equal(rows[0].key, "ask:new");
  assert.equal(rows[0].subtitle, "Enter installs @agentclientprotocol/claude-agent-acp 0.86.0 from npm first, once");
  assert.equal(plain(run("ask what is this", { ask: { ...ask, install: "" } }))[0].subtitle, "Claude Haiku", "installed: the agent and its model");
  const fb = plain(run("qqzzxxvv", { ask })).find(r => r.key === "fallback:ask");
  assert.equal(fb.subtitle, "Enter installs @agentclientprotocol/claude-agent-acp 0.86.0 from npm first, once");
});

test("what the agent writes is bounded before the shell reads it: a long line broken, too much stopped, each line as it comes (the marketplace's review, 2026-09-12)", async () => {
  const { spawn } = await import("node:child_process");
  const go = (bounds, script, env = {}) => spawnSync("/usr/bin/bash", ["-c", G.LAUNCH, "nodi-agent"].concat(bounds ? ["--bounds"].concat(bounds) : [], ["exec", "/usr/bin/bash", "-c", script]),
                                                  { encoding: "utf8", maxBuffer: 64 * 1048576, env: { PATH: "/usr/bin:/bin", ...env } });
  const long = go(["100000", "10"], 'printf "%s\\n" 0123456789abcdefghijXYZ; echo short');
  assert.equal(long.stdout, "0123456789\nabcdefghij\nXYZ\nshort\n", "no line past the cap reaches the shell");
  const lot = go(["4000", "100"], 'while :; do echo "a line of the answer" || exit 9; done');
  assert.equal(lot.stdout.length, 4000, "no more than the cap");
  assert.match(lot.stderr, /^nodi: the agent wrote more than 4000 bytes, and was stopped$/m);
  assert.notEqual(lot.status, 0, "the agent was stopped");
  // One that writes too much, then waits: stopped, not left running with
  // nothing reading it (codex's review, 2026-10-09).
  const quiet = spawn("/usr/bin/bash", ["-c", G.LAUNCH, "nodi-agent", "--bounds", "100", "100", "exec", "/usr/bin/bash", "-c", 'head -c 1000 /dev/zero | tr "\\0" a; echo; exec sleep 20'],
                      { env: { PATH: "/usr/bin:/bin" } });
  quiet.stdout.resume(); quiet.stderr.resume();
  const t0 = Date.now();
  const how = await new Promise(r => quiet.on("exit", (code, signal) => r({ code, signal, ms: Date.now() - t0 })));
  assert.ok(how.ms < 10000, "stopped in " + how.ms + " ms, not after its sleep");
  assert.equal(how.signal, "SIGTERM");
  assert.equal(go(null, "head -c 5000000 /dev/zero | tr '\\0' a", { NODI_LINE_MAX: "100000000", NODI_OUT_MAX: "100000000" }).stdout.split("\n")[0].length, 4194304,
               "the environment moves no bound");
  const err = go(null, 'head -c 70000 /dev/zero | tr "\\0" e >&2; echo >&2');
  assert.deepEqual(err.stderr.split("\n").map(l => l.length).slice(0, 2), [65536, 70000 - 65536], "stderr's lines at 64 KB");
  // A line at a time: the first is read while the agent still runs.
  const p = spawn("/usr/bin/bash", ["-c", G.LAUNCH, "nodi-agent", "exec", "/usr/bin/bash", "-c", "echo first; sleep 3; echo second"], { env: { PATH: "/usr/bin:/bin" } });
  const first = await new Promise(r => { const t0 = Date.now(); p.stdout.once("data", d => r([String(d), Date.now() - t0])); });
  p.kill();
  assert.equal(first[0], "first\n");
  assert.ok(first[1] < 2500, "the first line came in " + first[1] + " ms, not held to the end");
});

test("an answer kept to its most characters: the separator counted, never half a character (codex's review, 2026-10-09)", () => {
  const Acp = load("lib/Acp.js");
  assert.deepEqual(plain(Acp.capped("abc", "", "def", 10)), { text: "abcdef", cut: false });
  assert.deepEqual(plain(Acp.capped("x".repeat(9), "\n\n", "yz", 10)), { text: "x".repeat(9) + "\n", cut: true }, "the separator is in the count");
  assert.deepEqual(plain(Acp.capped("x".repeat(8), "", "\u{1F525}\u{1F525}", 11)), { text: "x".repeat(8) + "\u{1F525}", cut: true }, "a pair kept whole or not at all");
  assert.deepEqual(plain(Acp.capped("x".repeat(8), "", "\u{1F525}\u{1F525}", 9)), { text: "x".repeat(8), cut: true });
  assert.equal(Acp.capped("x".repeat(10), "", "y", 10).text.length, 10);
});

test("when Ask goes, its agent is stopped: TERM, then KILL if it is still the same process (codex's review, 2026-10-09)", async () => {
  const { spawn } = await import("node:child_process");
  const ignores = spawn("/usr/bin/bash", ["-c", 'trap "" TERM; sleep 30'], { stdio: "ignore" });
  await new Promise(r => setTimeout(r, 200));
  const gone = new Promise(r => ignores.on("exit", (code, signal) => r(signal)));
  const a = G.stopArgv(ignores.pid, 0.3);
  spawnSync(a[0], a.slice(1));
  assert.equal(await gone, "SIGKILL", "one that ignores TERM is killed");
  const calm = spawn("/usr/bin/sleep", ["30"], { stdio: "ignore" });
  const ended = new Promise(r => calm.on("exit", (code, signal) => r(signal)));
  const b = G.stopArgv(calm.pid, 0.3);
  assert.equal(spawnSync(b[0], b.slice(1)).status, 0);
  assert.equal(await ended, "SIGTERM");
  assert.equal(spawnSync(b[0], b.slice(1)).status, 0, "gone already: nothing to do");
  assert.equal(G.stopArgv(0), null); assert.equal(G.stopArgv(1), null, "never init"); assert.equal(G.stopArgv("x"), null);
});

test("an agent's run at once takes only rows no word of its own reaches; its search starts none of his programs (codex's reviews, 2026-10-09)", async () => {
  const { Engine, config, services } = await import("./fixtures.mjs");
  const Registry = load("providers/index.js");
  const ids = [...new Set(Registry.all.map(p => p.id))];
  const atOnce = ["apps", "windows", "menu", "system", "desktop", "desktops", "keys", "plugins"];
  assert.ok(ids.length > 30, "every provider: " + ids.length);
  for (const id of ids) assert.equal(A.refusedAtOnce(id + ":x", id) === "", atOnce.includes(id), id + (atOnce.includes(id) ? " runs at once" : " is proposed"));
  for (const id of atOnce) assert.ok(ids.includes(id), id + " is a provider");
  assert.match(A.refusedAtOnce("shell:rm -rf ~", "shell"), /command line; propose it/);
  assert.match(A.refusedAtOnce("remind:15", "system"), /propose it/, "a reminder's message is the agent's words");
  assert.equal(A.refusedAtOnce("remind:show", "system"), "");
  assert.equal(A.refusedAtOnce("volume:60", "system"), "", "a number, clamped");
  assert.match(A.refusedAtOnce("k", undefined), /propose it/);
  const row = plain(run("> rm -rf ~", {}))[0];
  assert.deepEqual([row.key, row.provider], ["shell:rm -rf ~", "shell"]);
  // The reads an agent's search may not start: none reaches his request;
  // every other does, with all its arguments ({ fetch: false } among them).
  const calls = [];
  const req = A.forAgent(function() { calls.push([...arguments]); return { state: "ready", value: [] }; });
  for (const name of ["filter", "filter-list", "filter-step", "script-output"]) assert.equal(req(name, "p").state, "error", name);
  assert.deepEqual(calls, [], "none of his programs asked for");
  req("rates", "USD", { fetch: false });
  assert.deepEqual(calls, [["rates", "USD", { fetch: false }]]);
  assert.equal(A.forAgent(null)("define", "x").state, "pending");
  // Engine.agentRows, which Nodi.qml's is (tools/hygiene.mjs): a filter
  // that runs its query is never asked; his own search asks it.
  const cfg = Object.assign({}, config, { filters: [{ keyword: "x", title: "X", command: ["bash", "-c"] },
                                                  { keyword: "l", title: "L", command: ["bash", "-c"], list: true, root: true }] });
  const asked = [];
  const rows = plain(Engine.agentRows("x touch /tmp/pwn", cfg, services({ asked, filter: () => { throw new Error("started") } })));
  Engine.agentRows("l touch", cfg, services({ asked, filter: () => { throw new Error("started") } }));
  assert.ok(!asked.some(k => /^filter/.test(k)), "the filters were not asked: " + asked.join(" "));
  assert.ok(!rows.some(r => r.provider === "filters"), "and offer nothing");
  assert.ok(rows.length <= 8 && rows.every(r => r.run && !r.help && !r.nodi));
  const his = [];
  Engine.run("x touch /tmp/pwn", cfg, services({ asked: his, filter: () => [] }));
  assert.ok(his.some(k => /^filter:/.test(k)), "his own search asks it, as before");
});
