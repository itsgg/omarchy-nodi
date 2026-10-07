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
  const s = plain(G.spec("claude", "/d", "", "x", ["nodi"]));
  assert.equal(s.name, "Claude");
  assert.equal(s.model, "haiku", "haiku unless set");
  assert.deepEqual(s.argv.slice(0, 2), ["/usr/bin/bash", "-lc"], "a login shell, for his PATH and the agent's sign-in");
  const rest = s.argv.slice(4);
  assert.deepEqual(rest.slice(0, 3), ["--which", "CLAUDE_CODE_EXECUTABLE", "claude"]);
  assert.deepEqual(rest.slice(3), ["npm", "/d/agents/_agentclientprotocol_claude-agent-acp@0.86.0", "@agentclientprotocol/claude-agent-acp", "0.86.0", "claude-agent-acp"]);
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
  const s = plain(G.spec("codex", "/d", "", "Be brief.", ["nodi"]));
  assert.deepEqual(s.argv.slice(4, 7), ["--which", "CODEX_PATH", "codex"]);
  assert.deepEqual(s.argv.slice(7), ["npm", "/d/agents/_agentclientprotocol_codex-acp@2.1.1", "@agentclientprotocol/codex-acp", "2.1.1", "codex-acp"]);
  assert.equal(s.env.INITIAL_AGENT_MODE, "read-only");
  const c = JSON.parse(s.env.CODEX_CONFIG);
  assert.deepEqual(c, { developer_instructions: "Be brief.", web_search: "disabled", project_doc_max_bytes: 0,
                        "features.shell_tool": false, "features.unified_exec": false, "features.apps": false });
  assert.equal(JSON.parse(G.spec("codex", "/d", "gpt-5.5", "x", []).env.CODEX_CONFIG).model, "gpt-5.5");
  assert.deepEqual([s.instructs, s.modelInMeta, s.meta], [true, true, null]);
});

test("Gemini: no built-in tool, only the servers given, no GEMINI.md, no hooks", () => {
  const gem = plain(G.spec("gemini", "/d", "gemini-3.8-flash", "x", ["nodi", "github"]));
  assert.deepEqual(gem.argv.slice(4, 7), ["--file", "GEMINI_CLI_SYSTEM_SETTINGS_PATH", "/d/gemini-settings.json"]);
  assert.deepEqual(JSON.parse(gem.argv[7]), { tools: { core: [] }, mcp: { allowed: ["nodi", "github"] }, context: { fileName: "NODI_NONE.md" },
                                              hooksConfig: { enabled: false }, model: { name: "gemini-3.8-flash" } });
  assert.deepEqual(gem.argv.slice(8), ["exec", "gemini", "--acp"]);
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
  const s = plain(G.spec({ name: "Akshi", command: ["akshi", "acp", "--quiet"], env: { AKSHI_MODE: "bar", "bad name": "x", N: 3 } }, "/d", "", "x", ["nodi"]));
  assert.deepEqual(s.argv.slice(4), ["exec", "akshi", "acp", "--quiet"]);
  assert.deepEqual([s.name, s.env, s.instructs, s.meta, s.mode, s.modelInMeta], ["Akshi", { AKSHI_MODE: "bar", N: "3" }, false, null, "", false]);
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
echo "start $$" >> "$NPM_LOG"
sleep "\${NPM_SLEEP:-0.4}"
mkdir -p "$prefix/node_modules/.bin"
printf '#!/usr/bin/bash\\necho ran "$@"\\n' > "$prefix/node_modules/.bin/x"
chmod +x "$prefix/node_modules/.bin/x"
echo "end $$" >> "$NPM_LOG"
`;

test("an adapter installs once, under a lock: two starts at once, and one ended midway (Fable 2026-10-07)", async () => {
  const { mkdtempSync, writeFileSync, chmodSync, readFileSync, existsSync, rmSync } = await import("node:fs");
  const { spawn } = await import("node:child_process");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const t = mkdtempSync(join(tmpdir(), "nodi-launch-"));
  try {
    writeFileSync(join(t, "npm"), FAKE_NPM); chmodSync(join(t, "npm"), 0o755);
    const env = { PATH: t + ":/usr/bin:/bin", NPM_LOG: join(t, "log"), HOME: t };
    const dir = join(t, "agents/pkg@1");
    const start = (extra = {}) => spawn("/usr/bin/bash", ["-c", G.LAUNCH, "nodi-agent", "npm", dir, "pkg", "1", "x", "hello"], { env: { ...env, ...extra } });
    const done = p => new Promise(r => { let out = ""; p.stdout.on("data", d => out += d); p.on("close", code => r({ code, out })); });
    const [a, b] = await Promise.all([done(start()), done(start())]);
    assert.deepEqual([a.code, a.out, b.code, b.out], [0, "ran hello\n", 0, "ran hello\n"]);
    assert.equal(readFileSync(join(t, "log"), "utf8").split("\n").filter(l => l.startsWith("start")).length, 1, "installed once");
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
