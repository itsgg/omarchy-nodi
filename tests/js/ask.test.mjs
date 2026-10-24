// Ask: the bar's tools, the agents it can hold, and its rows.

import { test } from "node:test";
import assert from "node:assert/strict";
import { load, plain, root } from "./load.mjs";
import { run } from "./fixtures.mjs";
import { spawnSync, execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const run_launch = args => spawnSync("/usr/bin/bash", ["-c", load("lib/Agents.js").LAUNCH, "nodi-agent", ...args], { encoding: "utf8" });

const A = load("lib/AskTools.js");
const G = load("lib/Agents.js");
const Rows = load("lib/Rows.js");
const Engine = load("lib/Engine.js");

test("the bar's server answers initialize, ping, tools/list and tools/call; a notification gets nothing", () => {
  const calls = [];
  const h = { search: q => [{ key: "app:" + q }], run: input => {
    calls.push(plain(input));
    return "Ran: " + input.kind + "=" + input.value;
  } };
  assert.equal(plain(A.mcp({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18" } }, h)).result.serverInfo.name, "nodi");
  const tools = plain(A.mcp({ jsonrpc: "2.0", id: 2, method: "tools/list" }, h)).result.tools;
  assert.deepEqual(tools.map(t => t.name), ["search", "run"]);
  assert.deepEqual(tools[1], {
    name: "run",
    description: "Resolve and propose one bar action. Use query directly for an obvious action; use key only after search when alternatives had to be inspected.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "What a person would type in the bar" },
        key: { type: "string", description: "A key returned by search in this turn" }
      },
      additionalProperties: false
    },
    annotations: { readOnlyHint: false }
  });
  assert.equal(plain(A.mcp({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "search", arguments: { query: "firefox" } } }, h)).result.content[0].text, '[{"key":"app:firefox"}]');
  assert.equal(plain(A.mcp({ jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "run", arguments: { query: "firefox" } } }, h)).result.content[0].text, "Ran: query=firefox");
  assert.equal(plain(A.mcp({ jsonrpc: "2.0", id: 7, method: "tools/call", params: { name: "run", arguments: { key: "app:x" } } }, h)).result.content[0].text, "Ran: key=app:x");
  assert.deepEqual(calls, [
    { ok: true, kind: "query", value: "firefox" },
    { ok: true, kind: "key", value: "app:x" }
  ]);
  const invalidRun = plain(A.mcp({ jsonrpc: "2.0", id: 10, method: "tools/call", params: { name: "run", arguments: {} } }, h));
  assert.equal(invalidRun.result.isError, true);
  assert.match(invalidRun.result.content[0].text, /exactly one/);
  assert.equal(plain(A.mcp({ jsonrpc: "2.0", id: 5, method: "tools/call", params: { name: "rm" } }, h)).error.code, -32602, "an unknown tool is a bad parameter (MCP)");
  assert.equal(plain(A.mcp({ jsonrpc: "2.0", id: 9, method: "resources/list" }, h)).error.code, -32601);
  assert.deepEqual(plain(A.mcp({ jsonrpc: "2.0", id: 8, method: "ping" }, h)), { jsonrpc: "2.0", id: 8, result: {} });
  const bad = plain(A.mcp({ jsonrpc: "2.0", id: 6, method: "tools/call", params: { name: "search", arguments: {} } }, { search: () => { throw "boom"; } }));
  assert.ok(bad.result.isError && /boom/.test(bad.result.content[0].text), "a handler that throws is a tool error, not a dead session");
  assert.equal(A.mcp({ jsonrpc: "2.0", method: "notifications/initialized" }, h), null);
});

test("run input validation is shared with the guarded action state machine", () => {
  assert.deepEqual(plain(A.runInput({ query: " lock " })), { ok: true, kind: "query", value: " lock " });
  assert.deepEqual(plain(A.runInput({ key: "menu:system.lock" })), { ok: true, kind: "key", value: "menu:system.lock" });
  for (const args of [{}, { query: " " }, { query: null }, { query: "lock", key: "menu:system.lock" }])
    assert.equal(A.runInput(args).ok, false);
});

test("the bar's own tools require the exact session server in trusted adapter metadata", () => {
  const callFrom = (server, tool) => ({
    title: "mcp__" + server + "__" + tool,
    _meta: { claudeCode: { toolName: "mcp__" + server + "__" + tool,
                            mcpServer: { name: server, source: "dynamic" } } }
  });
  assert.equal(A.barTool(callFrom("nodi-a1", "run"), "nodi-a1"), "run");
  assert.equal(A.barTool(callFrom("nodi-a1", "run"), "nodi-b2"), "");
  assert.equal(A.barTool({ title: "mcp__nodi-a1__run" }, "nodi-a1"), "",
    "a title without trusted adapter metadata is not identity");
  assert.equal(A.barTool({
    title: "mcp.nodi-a1.search",
    _meta: { is_mcp_tool_call: true },
    rawInput: { server: "nodi-a1", tool: "search", arguments: { query: "lock" } }
  }, "nodi-a1"), "search", "Codex's structured wrapper identifies the server and tool");
  assert.equal(A.barTool({
    title: "mcp.nodi-a1.search",
    _meta: { is_mcp_tool_call: true },
    rawInput: { server: "nodi-other", tool: "search", arguments: { query: "lock" } }
  }, "nodi-a1"), "");
  assert.equal(A.barTool(null, "nodi-a1"), "");
});

test("what a tool call is doing, in words, while he waits", () => {
  const search = { title: "mcp__nodi-a1__search", rawInput: { query: "lock  screen" },
                   _meta: { claudeCode: { toolName: "mcp__nodi-a1__search", mcpServer: { name: "nodi-a1" } } } };
  const runCall = { title: "mcp.nodi-a1.run", _meta: { is_mcp_tool_call: true },
                    rawInput: { server: "nodi-a1", tool: "run", arguments: { key: "menu:system.lock" } } };
  assert.equal(A.doing(search, "nodi-a1"), "Searching the bar for lock screen");
  assert.deepEqual(plain(A.input({ title: "mcp.nodi.run", _meta: { is_mcp_tool_call: true },
                                   rawInput: { server: "nodi", tool: "run", arguments: { key: "menu:system.lock" } } })),
    { key: "menu:system.lock" }, "Codex wraps an MCP tool's input");
  assert.deepEqual(plain(A.input({ title: "mcp__nodi__run", rawInput: { key: "menu:system.lock" } })),
    { key: "menu:system.lock" }, "other adapters carry its input directly");
  assert.deepEqual(plain(A.input({ title: "another tool", rawInput: { server: "x", tool: "y", arguments: { own: true } } })),
    { server: "x", tool: "y", arguments: { own: true } }, "a tool may itself take fields named like Codex's wrapper");
  assert.equal(A.doing({ ...search, rawInput: {} }, "nodi-a1"), "Searching the bar");
  assert.equal(A.doing({ ...search, rawInput: { query: "x".repeat(80) } }, "nodi-a1"), "Searching the bar for " + "x".repeat(57) + "...");
  assert.equal(A.doing(runCall, "nodi-a1"), "Running a row of the bar");
  assert.equal(A.doing({ title: "ReadFile" }, "nodi-a1"), "Using ReadFile");
  assert.equal(A.doing({}, "nodi-a1"), "Using a tool");
});

test("what the agent is told: the bar's rules, its tools only with actions, the servers only when named", () => {
  assert.equal(A.instructions(false, false), A.SYSTEM);
  assert.equal(A.instructions(true, false), A.SYSTEM + A.ACTS);
  assert.equal(A.instructions(true, true), A.SYSTEM + A.ACTS + A.MCP_NOTE);
  assert.equal(A.instructions(false, true), A.SYSTEM, "no servers without actions");
  assert.match(A.ACTS, /obvious action.+run.+query/i);
  assert.match(A.ACTS, /search.+inspect alternatives/i);
});

test("each agent declares how Ask enforces its isolation policy", () => {
  const registered = G.registry({
    agents: [{ id: "free", name: "Free", command: ["free-acp"] }]
  });
  assert.equal(G.policy("claude"), "strict");
  assert.equal(G.policy("codex"), "unmanaged");
  assert.equal(G.policy("pi"), "answer-only");
  assert.equal(G.policy("agy"), "answer-only");
  assert.equal(G.policy("opencode"), "unmanaged");
  assert.equal(G.policy("free", registered), "unmanaged");

  for (const id of ["claude", "codex", "pi", "agy", "opencode", "free"]) {
    const s = plain(G.spec(id, "/data", "", "Be brief.", ["nodi"], "/repo/lib/adapters", registered));
    assert.equal(s.policy, G.policy(id, registered), id + " spec policy");
    assert.equal(typeof s.enforcement, "string", id + " enforcement type");
    assert.ok(s.enforcement.length > 0, id + " enforcement description");
  }
  const own = plain(G.spec({ name: "Own", command: ["own-acp"] }, "/data", "", "Be brief.", ["nodi"]));
  assert.deepEqual([own.policy, typeof own.enforcement, own.enforcement.length > 0], ["unmanaged", "string", true]);
});

test("Codex's unmanaged built-in tools are explicit in user docs", () => {
  for (const relative of [
    "docs/ask.md",
    "docs/privacy.md",
    "docs/troubleshooting.md"
  ]) {
    const text = readFileSync(root + "/" + relative, "utf8");
    assert.match(text, /Codex[\s\S]{0,800}unmanaged/i, relative);
    assert.match(text, /cannot disable[\s\S]{0,200}built-in tools/i, relative);
    assert.match(text, /Codex\s+may use (?:them|(?:its )?built-in tools)/i, relative);
  }
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
                                   "@agentclientprotocol/claude-agent-acp", "0.86.0", "claude-agent-acp",
                                   "--nodi-runner", "/p/lib/adapters/claude-agent-acp/claude-agent-acp-trusted.mjs"]);
  assert.equal(s.adapter, "@agentclientprotocol/claude-agent-acp 0.86.0");
  assert.deepEqual(s.env, { CLAUDE_CODE_DISABLE_CLAUDE_MDS: "1", CLAUDE_CODE_DISABLE_AUTO_MEMORY: "1", ANTHROPIC_MODEL: "haiku" });
  const m = plain(G.spec("claude", "/d", "sonnet", "Be brief.", ["nodi-a1"]).meta(true, "nodi-a1"));
  assert.equal(m.systemPrompt, "Be brief.", "replaces Claude Code's own prompt");
  assert.equal(m.nodiActionServer, "nodi-a1", "the trusted adapter knows which requested server is required");
  const o = m.claudeCode.options;
  assert.deepEqual([o.model, o.tools, o.settingSources, o.strictMcpConfig, o.persistSession, o.allowDangerouslySkipPermissions],
                   ["sonnet", [], [], true, false, false]);
  assert.deepEqual(o.allowedTools, ["mcp__nodi-a1__search"], "only this session's search skips a permission prompt");
  assert.deepEqual(plain(G.spec("claude", "/d", "", "x", []).meta(false, "nodi-a1")).claudeCode.options.allowedTools, []);
  assert.equal(plain(G.spec("claude", "/d", "", "x", []).meta(false, "nodi-a1")).nodiActionServer, "");
  assert.equal(G.spec("nonesuch", "/d", ""), null);
  assert.equal(G.spec("toString", "/d", ""), null, "only the agents named");
});

test("Codex: unmanaged and action-capable, with a private profile (ROADMAP 84)", () => {
  const s = plain(G.spec("codex", "/d", "", "Be brief.", ["nodi"], "/p/lib/adapters"));
  assert.equal(s.policy, "unmanaged");
  assert.match(s.enforcement, /private CODEX_HOME/);
  assert.match(s.enforcement, /cannot disable/i);
  assert.match(s.enforcement, /built-in/i);
  assert.equal(s.capabilities.actions, true);
  assert.deepEqual(s.argv.slice(7, 10), ["--which", "NODI_CODEX_COMMAND", "codex"]);
  assert.deepEqual(s.argv.slice(10), ["npm", "/d/agents/_agentclientprotocol_codex-acp@2.1.1", "/p/lib/adapters/codex-acp",
                                     "@agentclientprotocol/codex-acp", "2.1.1", "codex-acp",
                                     "--nodi-runner", "/p/lib/adapters/codex-acp/codex-acp-trusted.mjs"]);
  assert.equal(s.env.INITIAL_AGENT_MODE, "read-only");
  assert.equal(s.env.CODEX_PATH, "/p/lib/adapters/codex-acp/codex-isolated");
  assert.equal(s.env.NODI_CODEX_HOME, "/d/profiles/codex");
  const c = JSON.parse(s.env.CODEX_CONFIG);
  assert.deepEqual(c, {
    developer_instructions: "Do not use or mention Codex skills, project instructions, or built-in tools. Use only MCP tools supplied for this session.\n\nBe brief.",
    web_search: "disabled", project_doc_max_bytes: 0,
    features: { apps: false, web_search_request: false,
                shell_tool: false, unified_exec: false, skill_search: false,
                hooks: false, browser_use: false, computer_use: false, image_generation: false,
                multi_agent: false, code_mode_host: false,
                plugins: false, skip_host_skill_discovery: true }
  });
  assert.equal(Object.keys(c.features).some(k => k === "code_mode" || k.startsWith("code_mode_only")), false,
               "Codex uses direct MCP, with internal code-mode dispatch absent");
  assert.ok(!Object.keys(c).some(k => k.startsWith("features.")), "CODEX_CONFIG is an object, not codex -c dotted keys");
  assert.equal(JSON.parse(G.spec("codex", "/d", "gpt-5.5", "x", []).env.CODEX_CONFIG).model, "gpt-5.5");
  const codexMeta = plain(G.spec("codex", "/d", "", "x", ["nodi"], "/p/lib/adapters").meta(true, "nodi-a1"));
  assert.deepEqual([s.instructs, s.modelInMeta, codexMeta],
                   [true, true, { mcpStartupAwaitTimeoutMs: 15000, nodiActionServer: "nodi-a1" }]);
});

test("Codex's trusted adapter runner publishes provider turns and diagnostic runtime catalogs", async () => {
  const runner = await import("../../lib/adapters/codex-acp/codex-acp-trusted.mjs");
  const source = [
    "var CodexAppServerClient = class {",
    "  async listMcpServerStatus(params) {",
    '    return await this.sendRequest({ method: "mcpServerStatus/list", params });',
    "  }",
    "};",
    "// src/CodexAcpClient.ts",
    "var CUSTOM_GATEWAY_PROVIDER_ID = \"custom-gateway\";",
    "  async initialize(request) {",
    "    const response = await this.codexClient.initialize({",
    "      capabilities: {",
    "        experimentalApi: true,",
    "        requestAttestation: false",
    "      },",
    "      clientInfo: {",
    "        name: request.clientInfo?.name ?? this.defaultClientInfo.name,",
    "        version: request.clientInfo?.version ?? this.defaultClientInfo.version,",
    "        title: request.clientInfo?.title ?? this.defaultClientInfo.title",
    "      }",
    "    });",
    "    this.configPath = response?.codexHome ?? null;",
    "  }",
    "  async newSession(params) {",
    "    if (this.providerUpdate !== null) {",
    "      await this.providerUpdate;",
    "    }",
    '    logger.log("Starting new session...");',
    "    const [sessionId, modelState, modeState] = await this.getOrCreateSession(params);",
    '    logger.log("New session created", {',
    "      sessionId,",
    "      modelId: modelState.currentModelId,",
    "      availableModelCount: modelState.availableModels.length",
    "    });",
    "    return {",
    "      sessionId,",
    "      models: modelState,",
    "      modes: modeState,",
    "      ...this.createSessionConfigOptionsResponse(this.getSessionState(sessionId))",
    "    };",
    "  }",
    '      case "turn/started":',
    "        this.sessionState.currentTurnId = notification.params.turn.id;",
    "        await this.flushPendingErrors();",
    "        return null;",
    '      case "mcpToolCall":',
    "        return this.renderer.render(McpToolReporter.started(event.item));",
    "  createMcpSeverConfig(mcpServer) {",
    '    if ("type" in mcpServer && mcpServer.type === "http") {',
    "      return {",
    '        "url": mcpServer.url,',
    '        "http_headers": Object.fromEntries(mcpServer.headers.map((h) => [h.name, h.value]))',
    "      };",
    "    }",
    "    return {",
    '      "command": mcpServer.command,',
    '      "args": mcpServer.args,',
    '      "env": Object.fromEntries(mcpServer.env.map((env) => [env.name, env.value]))',
    "    };",
    "  }"
  ].join("\n");
  const patched = runner.patchAdapter(source, "0.162.1");
  assert.match(patched, /nodi_codex_turn_started/);
  assert.match(patched, /nodi_codex_turn_id: notification\.params\.turn\.id/);
  assert.match(patched, /nodi_codex_turn_id: event\.turnId/);
  assert.match(patched, /method: "app\/list"/);
  assert.match(patched, /nodiInitializeResponse = response/);
  assert.match(patched, /nodi_runtime_catalogs/);
  assert.doesNotMatch(patched, /nodi_tool_inventory|builtinEvidence|builtins:\s*\[\]|evidence:\s*"strict-config"/);
  assert.match(patched, /diagnosticErrors/);
  assert.doesNotMatch(patched, /throw new Error\("nodi: incomplete Codex MCP runtime catalog"\)/,
                      "diagnostic catalogs cannot gate unmanaged Codex startup");
  assert.match(patched, /mcpServerStatus\/list/);
  assert.equal((patched.match(/"tool_timeout_sec": 3600/g) || []).length, 2,
               "both action-server transport shapes can wait for the card");
  assert.match(patched, /NODI_CODEX_ACTION_SERVER_NAMES\.has\(mcpServer\.name\)/,
               "only Nodi's action server gets the long tool timeout");
  assert.match(patched, /const nodiActionServer = String\(params\._meta\?\.nodiActionServer \?\? ""\)/,
               "the exact action server comes from this ACP session");
  const strict = {
    web_search: "disabled", project_doc_max_bytes: 0,
    features: { apps: false, web_search_request: false, shell_tool: false,
      unified_exec: false, skill_search: false, hooks: false, browser_use: false,
      computer_use: false, image_generation: false, multi_agent: false,
      code_mode_host: false, plugins: false, skip_host_skill_discovery: true }
  };
  assert.doesNotThrow(() => runner.validateStrictConfig(strict));
  assert.throws(() => runner.validateStrictConfig({ ...strict, features: { ...strict.features, code_mode: true } }),
                /code mode/i);
  assert.throws(() => runner.validateStrictConfig({ ...strict, features: { ...strict.features, apps: true } }),
                /strict Codex config/i);
  assert.throws(() => runner.patchAdapter(source), /missing selected Codex executable version/);
  assert.throws(() => runner.codexExecutableVersion(""), /missing selected Codex executable/);
  assert.throws(() => runner.patchAdapter("unknown adapter source", "0.162.1"), /unsupported Codex ACP source/);
});

test("Codex trusted parent derives the selected executable version and rejects an app-server mismatch", async () => {
  const { mkdtempSync, mkdirSync, writeFileSync, chmodSync, rmSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const t = mkdtempSync(join(tmpdir(), "nodi-codex-version-"));
  try {
    const fake = join(t, "codex");
    writeFileSync(fake, '#!/usr/bin/bash\n[[ ${1-} == --version ]] || exit 92\nprintf "codex-cli 0.162.1\\n"\n');
    chmodSync(fake, 0o755);
    const root = join(t, "adapter");
    const dist = join(root, "node_modules", "@agentclientprotocol", "codex-acp", "dist");
    mkdirSync(dist, { recursive: true });
    const source = [
      "var CodexAppServerClient = class {",
      '  async initialize() { return { codexHome: "/tmp", userAgent: "codex/0.999.0" }; }',
      "  async sendRequest(request) {",
      '    return request.method === "mcpServerStatus/list"',
      "      ? { data: [], nextCursor: null } : { data: [], nextCursor: null };",
      "  }",
      "  async listMcpServerStatus(params) {",
      '    return await this.sendRequest({ method: "mcpServerStatus/list", params });',
      "  }",
      "};",
      "// src/CodexAcpClient.ts",
      'var CUSTOM_GATEWAY_PROVIDER_ID = "custom-gateway";',
      "var CodexAcpClient = class {",
      "  constructor() { this.codexClient = new CodexAppServerClient(); }",
      "  async initialize(request) {",
      "    const response = await this.codexClient.initialize({",
      "      capabilities: {",
      "        experimentalApi: true,",
      "        requestAttestation: false",
      "      },",
      "      clientInfo: {",
      "        name: request.clientInfo?.name ?? this.defaultClientInfo.name,",
      "        version: request.clientInfo?.version ?? this.defaultClientInfo.version,",
      "        title: request.clientInfo?.title ?? this.defaultClientInfo.title",
      "      }",
      "    });",
      "    this.configPath = response?.codexHome ?? null;",
      "  }",
      "};",
      "var Adapter = class {",
      "  async newSession(params) {",
      "    if (this.providerUpdate !== null) {",
      "      await this.providerUpdate;",
      "    }",
      '    logger.log("Starting new session...");',
      "    const [sessionId, modelState, modeState] = await this.getOrCreateSession(params);",
      '    logger.log("New session created", {',
      "      sessionId,",
      "      modelId: modelState.currentModelId,",
      "      availableModelCount: modelState.availableModels.length",
      "    });",
      "    return {",
      "      sessionId,",
      "      models: modelState,",
      "      modes: modeState,",
      "      ...this.createSessionConfigOptionsResponse(this.getSessionState(sessionId))",
      "    };",
      "  }",
      "  async render(notification, event) {",
      "    switch (notification.method) {",
      '      case "turn/started":',
      "        this.sessionState.currentTurnId = notification.params.turn.id;",
      "        await this.flushPendingErrors();",
      "        return null;",
      '      case "mcpToolCall":',
      "        return this.renderer.render(McpToolReporter.started(event.item));",
      "    }",
      "  }",
      "  createMcpSeverConfig(mcpServer) {",
      '    if ("type" in mcpServer && mcpServer.type === "http") {',
      "      return {",
      '        "url": mcpServer.url,',
      '        "http_headers": Object.fromEntries(mcpServer.headers.map((h) => [h.name, h.value]))',
      "      };",
      "    }",
      "    return {",
      '      "command": mcpServer.command,',
      '      "args": mcpServer.args,',
      '      "env": Object.fromEntries(mcpServer.env.map((env) => [env.name, env.value]))',
      "    };",
      "  }",
      "};",
      "const client = new CodexAcpClient();",
      'client.defaultClientInfo = { name: "test", version: "1", title: "test" };',
      "await client.initialize({ clientInfo: {} });",
      'await client.nodiCatalogs("thread", "/tmp", []);'
    ].join("\n");
    writeFileSync(join(dist, "index.js"), source);
    const strict = {
      web_search: "disabled", project_doc_max_bytes: 0,
      features: { apps: false, web_search_request: false, shell_tool: false,
        unified_exec: false, skill_search: false, hooks: false, browser_use: false,
        computer_use: false, image_generation: false, multi_agent: false,
        code_mode_host: false, plugins: false, skip_host_skill_discovery: true }
    };
    const trusted = new URL("../../lib/adapters/codex-acp/codex-acp-trusted.mjs", import.meta.url).pathname;
    const runner = await import("../../lib/adapters/codex-acp/codex-acp-trusted.mjs");
    const sourceHome = join(t, "source-home");
    const targetHome = join(t, "target-home");
    mkdirSync(sourceHome);
    mkdirSync(targetHome);
    const copied = JSON.stringify({ tokens: { refresh_token: "legacy-one-use-token" } }) + "\n";
    writeFileSync(join(sourceHome, "auth.json"), copied);
    writeFileSync(join(targetHome, "auth.json"), copied);
    assert.equal(runner.copiedRefreshToken(sourceHome, targetHome), true);
    const refused = spawnSync(process.execPath, [trusted, root], {
      encoding: "utf8",
      env: { ...process.env, CODEX_HOME: sourceHome, NODI_CODEX_HOME: targetHome,
             NODI_CODEX_COMMAND: fake, CODEX_CONFIG: JSON.stringify(strict) }
    });
    assert.equal(refused.status, 1);
    assert.match(refused.stderr, /copied one-use sign-in.*CODEX_HOME=.*codex login/i,
                 "the ACP parent independently refuses copied authentication");
    writeFileSync(join(targetHome, "auth.json"),
                  JSON.stringify({ tokens: { refresh_token: "independent-token" } }) + "\n");
    assert.equal(runner.copiedRefreshToken(sourceHome, targetHome), false);
    const mismatch = spawnSync(process.execPath, [trusted, root], {
      encoding: "utf8",
      env: { ...process.env, CODEX_HOME: sourceHome, NODI_CODEX_HOME: targetHome,
             NODI_CODEX_COMMAND: fake, CODEX_CONFIG: JSON.stringify(strict) }
    });
    assert.equal(mismatch.status, 1);
    assert.match(mismatch.stderr, /app-server version does not match its executable/);
  } finally { rmSync(t, { recursive: true, force: true }); }
});

test("Claude's trusted adapter runner publishes inventory and action origins", async () => {
  const runner = await import("../../lib/adapters/claude-agent-acp/claude-agent-acp-trusted.mjs");
  const source = [
    '                    case "system":',
    "                        switch (message.subtype) {",
    '                            case "init":',
    "                                // A fresh `system`/init marker.",
    "                                break;",
    "            creationParams: params,",
    "    canUseTool(sessionId) {",
    "        return async (toolName, toolInput, { signal, suggestions, toolUseID, agentID, matchedAskRule, blockedPath, decisionReason, title, displayName, description, defaultToNo, suppressAlwaysAllowRule, mcpServer, }) => {",
    "            const session = this.sessions[sessionId];",
    "            if (!session) {",
    "                return {",
    '                    behavior: "deny",',
    '                    message: "Session not found",',
    "                };",
    "            }",
    "            if (mcpServer || (parentToolUseId && !airClient)) {",
    "                presentation.toolCall._meta = {",
    "                    claudeCode: {",
    "                        ...(airClient ? {} : { toolName }),",
    "                        ...(parentToolUseId && !airClient ? { parentToolUseId } : {}),",
    "                        ...(mcpServer ? { mcpServer: { name: mcpServer.name, source: mcpServer.source } } : {}),",
    "                    },",
    "                };",
    "            }"
  ].join("\n");
  const entry = '#!/usr/bin/env node\nimport { claudeCliPath } from "./acp-agent.js";\nimport { serveAcp } from "./serve.js";\n';
  const serve = 'import { v1AgentApp } from "./acp-agent.js";\n';
  const patched = runner.patchAgent(source);
  assert.match(patched, /message\.tools/);
  assert.match(patched, /mcpServerStatus\(\)/);
  assert.match(patched, /nodi_tool_inventory/);
  assert.match(patched, /message\.mcp_servers/);
  assert.match(patched, /nodi_claude_turn_started/);
  assert.match(patched, /nodi_claude_action_origin/);
  assert.match(patched, /toolUseID/);
  assert.match(patched, /promptUuid/);
  assert.match(patched, /mcpServer/);
  assert.match(patched, /toolInput/);
  assert.deepEqual(runner.builtInTools(
    ["Read", "mcp__nodi-a__search", "mcp__nodi-a__run"],
    [{ name: "nodi-a", tools: [{ name: "search" }, { name: "run" }] }]
  ), ["Read"]);
  assert.deepEqual(runner.runtimeServer({
    name: "optional", status: "failed", source: "dynamic", error: "offline"
  }), { name: "optional", source: "dynamic", status: "failed", tools: [] },
  "an unavailable optional server stays diagnostic, not fatal");
  assert.deepEqual(runner.runtimeServer({
    name: "nodi-a", status: "connected", source: "dynamic", tools: [{ name: "run" }, { name: "search" }]
  }), { name: "nodi-a", source: "dynamic", status: "connected", tools: ["run", "search"] });
  assert.throws(() => runner.runtimeServer({
    name: "bad", status: "connected", source: "dynamic"
  }), /bad.*connected.*tools/i);
  assert.throws(() => runner.runtimeServer({
    name: "nodi-a", status: "failed", source: "dynamic", error: "could not start"
  }, "nodi-a"), /required action server nodi-a.*failed/i);
  assert.deepEqual(runner.runtimeServers([
    { name: "optional", status: "failed", source: "dynamic", error: "offline" },
    { name: "nodi-a", status: "connected", source: "dynamic", tools: [{ name: "run" }] }
  ], "nodi-a"), [
    { name: "optional", source: "dynamic", status: "failed", tools: [] },
    { name: "nodi-a", source: "dynamic", status: "connected", tools: ["run"] }
  ]);
  assert.throws(() => runner.runtimeServers([
    { name: "optional", status: "failed", source: "dynamic", error: "offline" }
  ], "nodi-a"), /required action server nodi-a.*missing/i);
  assert.equal(runner.requiredActionServer({
    _meta: { nodiActionServer: "nodi-a" }
  }), "nodi-a");
  assert.throws(() => runner.requiredActionServer({ mcpServers: [] }),
                /omitted Nodi session metadata/i);
  assert.match(runner.patchEntry(entry), /nodi-trusted-acp-agent\.mjs/);
  assert.match(runner.patchEntry(entry), /nodi-trusted-serve\.mjs/);
  assert.match(runner.patchServe(serve), /nodi-trusted-acp-agent\.mjs/);
  assert.throws(() => runner.patchAgent(source.split("    canUseTool")[0]),
                /action origin source/);
  assert.throws(() => runner.patchAgent(source.replace(
    /            if \(mcpServer \|\| \(parentToolUseId && !airClient\)\) \{[\s\S]*?            \}\n?$/,
    ""
  )), /permission metadata source/);
  assert.throws(() => runner.patchAgent(source.replace("            creationParams: params,\n", "")),
                /creation params/i);
  assert.throws(() => runner.patchAgent("unknown adapter source"), /unsupported Claude ACP .*source/);
  assert.throws(() => runner.patchEntry("unknown adapter entry"), /unsupported Claude ACP entry/);
  assert.throws(() => runner.patchServe("unknown adapter serve"), /unsupported Claude ACP serve/);
});

test("Codex keeps authentication private instead of duplicating a rotating global refresh token", async () => {
  const { mkdtempSync, mkdirSync, writeFileSync, readFileSync, chmodSync, rmSync, existsSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const t = mkdtempSync(join(tmpdir(), "nodi-codex-wrapper-"));
  try {
    const source = join(t, "source");
    const target = join(t, "target");
    const observed = join(t, "observed");
    const observedArgs = join(t, "observed-args");
    const observedVersion = join(t, "observed-version");
    const fake = join(t, "codex");
    mkdirSync(source);
    const sourceAuth = '{"token":"source"}\n';
    writeFileSync(join(source, "auth.json"), sourceAuth);
    writeFileSync(join(source, "config.toml"), '[mcp_servers.global]\ncommand = "unsafe"\n');
    writeFileSync(fake, '#!/usr/bin/bash\nif [[ ${1-} == --version ]]; then echo "codex-cli 0.162.1"; exit 0; fi\nprintf "%s" "$CODEX_HOME" > "$OBSERVED"\nprintf "%s" "$NODI_CODEX_VERSION" > "$OBSERVED_VERSION"\nprintf "%s\\n" "$@" > "$OBSERVED_ARGS"\n');
    chmodSync(fake, 0o755);
    const wrapper = new URL("../../lib/adapters/codex-acp/codex-isolated", import.meta.url).pathname;
    const env = { ...process.env, CODEX_HOME: source, NODI_CODEX_HOME: target, NODI_CODEX_COMMAND: fake,
                  OBSERVED: observed, OBSERVED_ARGS: observedArgs, OBSERVED_VERSION: observedVersion };

    let r = spawnSync(wrapper, ["app-server"], { encoding: "utf8", env });
    assert.deepEqual([r.status, r.stderr], [0, ""]);
    assert.equal(readFileSync(observed, "utf8"), target);
    assert.equal(existsSync(join(target, "auth.json")), false,
                 "a global refresh token was not copied into a competing profile");
    assert.equal(readFileSync(join(target, "config.toml"), "utf8"), "");
    assert.ok(!readFileSync(join(target, "config.toml"), "utf8").includes("mcp_servers"));
    assert.equal(readFileSync(observedVersion, "utf8"), "0.162.1");
    assert.deepEqual(readFileSync(observedArgs, "utf8").trim().split("\n"), ["--strict-config", "app-server"]);

    const retainedAuth = '{"token":"newer-target"}\n';
    writeFileSync(join(source, "auth.json"), '{"token":"changed-source"}\n');
    writeFileSync(join(target, "auth.json"), retainedAuth);
    r = spawnSync(wrapper, ["app-server"], { encoding: "utf8", env });
    assert.equal(r.status, 0);
    assert.equal(readFileSync(join(target, "auth.json"), "utf8"), retainedAuth);
    assert.equal(readFileSync(join(target, "config.toml"), "utf8"), "");

    const shared = JSON.stringify({
      tokens: { refresh_token: "one-use-token", access_token: "access" }
    }) + "\n";
    writeFileSync(join(source, "auth.json"), shared);
    writeFileSync(join(target, "auth.json"), shared);
    r = spawnSync(wrapper, ["app-server"], { encoding: "utf8", env });
    assert.equal(r.status, 75);
    assert.match(r.stderr, /private Codex profile.*codex login/i);

    const apiKey = '{"auth_mode":"apikey","OPENAI_API_KEY":"same-static-key"}\n';
    writeFileSync(join(source, "auth.json"), apiKey);
    writeFileSync(join(target, "auth.json"), apiKey);
    r = spawnSync(wrapper, ["app-server"], { encoding: "utf8", env });
    assert.equal(r.status, 0, r.stderr);
  } finally { rmSync(t, { recursive: true, force: true }); }
});

test("Agy: pinned plan+sandbox answer-only adapter replaces Gemini", () => {
  const s = plain(G.spec("agy", "/d", "", "answer briefly", ["nodi", "github"], "/p/lib/adapters"));
  assert.deepEqual(s.argv.slice(7), [
    "--which", "NODI_AGY_COMMAND", "agy",
    "npm", "/d/agents/google-antigravity-acp@2.0.1", "/p/lib/adapters/agy-acp",
    "google-antigravity-acp", "2.0.1", "google-antigravity-acp",
    "--binary-path", "/p/lib/adapters/agy-acp/agy-answer-only",
    "--no-skip-permissions"
  ]);
  assert.deepEqual([s.adapter, s.instructs, s.modelInMeta, s.capabilities.actions],
    ["google-antigravity-acp 2.0.1", false, false, false]);
  assert.equal(G.spec("gemini", "/d", "", "x", [], "/p/lib/adapters").id, "agy");
  assert.deepEqual(plain(G.known()).sort(), ["agy", "claude", "codex", "opencode", "pi"]);
  const opencode = plain(G.spec("opencode", "/d", "", "x", ["nodi"], "/p/lib/adapters"));
  assert.deepEqual(opencode.argv.slice(7), ["exec", "opencode", "acp"], "OpenCode remains its native ACP command");
  assert.equal(opencode.adapter, "");
  assert.equal(G.spec("cursor-agent", "/d", ""), null);
});

test("Agy first prompt appends the no-tools sentence; other agents keep base instructions", () => {
  const base = A.instructions(false, false);
  const agyExtra = "\n\nDo not use any tools or inspect the workspace; answer only from your own knowledge.";
  assert.equal(G.firstPromptInstructions("agy", base), base + agyExtra);
  assert.equal(G.firstPromptInstructions("gemini", base), base + agyExtra);
  assert.equal(G.firstPromptInstructions("claude", base), base);
  assert.equal(G.firstPromptInstructions("pi", base), base);
});

test("retired Gemini IDs canonicalize to Agy and remain reserved", () => {
  assert.equal(G.canonicalId("gemini"), "agy");
  assert.equal(G.canonicalId("agy"), "agy");
  assert.equal(G.canonicalId("Bad Id"), "");
  const registry = plain(G.registry({
    agents: [{ id: "gemini", name: "Old custom", command: ["old-acp"] }]
  }));
  assert.ok(!registry.some(a => a.id === "gemini"));
  assert.ok(registry.some(a => a.id === "agy" && a.builtin));
  assert.equal(G.program("gemini", registry), "agy");
});

test("Pi: pinned answer-only adapter and quiet ACP startup", () => {
  const pi = plain(G.spec("pi", "/d", "provider/model", "action instructions", ["nodi", "github"], "/p/lib/adapters", undefined, "/w"));
  assert.deepEqual(pi.argv.slice(7), [
    "--which", "NODI_PI_COMMAND", "pi",
    "--file", "NODI_PI_SETTINGS", "/w/.pi/settings.json", '{"quietStartup":true}',
    "npm", "/d/agents/pi-acp@0.0.34", "/p/lib/adapters/pi-acp", "pi-acp", "0.0.34", "pi-acp"
  ]);
  assert.deepEqual(pi.env, { PI_ACP_PI_COMMAND: "/p/lib/adapters/pi-acp/pi-answer-only" });
  assert.deepEqual([pi.adapter, pi.model, pi.mode, pi.modelInMeta, pi.instructs, pi.meta, pi.capabilities.actions],
    ["pi-acp 0.0.34", "provider/model", "", false, false, null, false]);

  for (const id of ["claude", "codex", "opencode"])
    assert.deepEqual(plain(G.capabilities(id)), { actions: true }, id + " keeps Nodi actions");
  assert.deepEqual(plain(G.capabilities("pi")), { actions: false });
  assert.deepEqual(plain(G.capabilities("agy")), { actions: false });
  assert.deepEqual(plain(G.capabilities("free", G.registry({ agents: [{ id: "free", name: "Free", command: ["free-acp"] }] }))),
    { actions: true }, "custom agents keep Nodi actions");
});

test("Pi's shipped command wrapper disables every answer-unsafe input while retaining extensions and argument boundaries", async () => {
  const { mkdtempSync, writeFileSync, chmodSync, rmSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const t = mkdtempSync(join(tmpdir(), "nodi-pi-wrapper-"));
  try {
    const pi = join(t, "pi");
    writeFileSync(pi, "#!/usr/bin/bash\nprintf '<%s>\\n' \"$@\"\n");
    chmodSync(pi, 0o755);
    const wrapper = new URL("../../lib/adapters/pi-acp/pi-answer-only", import.meta.url).pathname;
    const r = spawnSync(wrapper, ["--mode", "rpc value", "*", ""], {
      encoding: "utf8", env: { NODI_PI_COMMAND: pi }
    });
    assert.deepEqual([r.status, r.stderr], [0, ""]);
    assert.deepEqual(r.stdout.trim().split("\n"), [
      "<--no-tools>", "<--no-mcp>", "<--no-context-files>", "<--no-skills>", "<--no-prompt-templates>",
      "<--mode>", "<rpc value>", "<*>", "<>"
    ], "pi-acp's argv follows the fixed flags, with no --no-extensions");
  } finally { rmSync(t, { recursive: true, force: true }); }
});

test("Pi ACP routing notices are activity, not words in its answer", () => {
  for (const notice of [
    "router: provider/model cooling for 1m, rerouting",
    "Retrying (attempt 1/20, waiting 1s)...",
    "Retry finished, resuming."
  ]) assert.equal(G.answerText("pi", notice), "");
  assert.equal(G.answerText("pi", "4"), "4");
  assert.equal(G.answerText("claude", "Retry finished, resuming."), "Retry finished, resuming.");
});

test("Agy's shipped command wrapper forces plan+sandbox before stream-json arguments and preserves boundaries", async () => {
  const { mkdtempSync, writeFileSync, chmodSync, rmSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const t = mkdtempSync(join(tmpdir(), "nodi-agy-wrapper-"));
  try {
    const agy = join(t, "agy");
    writeFileSync(agy, "#!/usr/bin/bash\nprintf '<%s>\\n' \"$@\"\n");
    chmodSync(agy, 0o755);
    const wrapper = new URL("../../lib/adapters/agy-acp/agy-answer-only", import.meta.url).pathname;
    const r = spawnSync(wrapper, ["--input-format=stream-json", "two words", "*", ""], {
      encoding: "utf8", env: { NODI_AGY_COMMAND: agy }
    });
    assert.deepEqual([r.status, r.stderr], [0, ""]);
    assert.deepEqual(r.stdout.trim().split("\n"), [
      "<--mode>", "<plan>", "<--sandbox>",
      "<--input-format=stream-json>", "<two words>", "<*>", "<>"
    ]);
  } finally { rmSync(t, { recursive: true, force: true }); }
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

test("strict inventory is Claude-only; Codex runtime catalogs stay diagnostic", () => {
  const Acp = load("lib/Acp.js");
  const inventory = {
    version: 1, adapter: "claude", runtimeVersion: "2.1.0",
    builtins: [], apps: [], requestedServers: ["nodi-a"],
    servers: [{ name: "nodi-a", source: "dynamic", status: "connected", tools: ["search", "run"] }]
  };
  assert.deepEqual(plain(Acp.inventory({ nodi_tool_inventory: inventory }, "claude")), inventory);
  assert.equal(Acp.inventory({ nodi_tool_inventory: { ...inventory, adapter: "codex" } }, "codex"), null);
  assert.equal(Acp.inventory({ nodi_tool_inventory: { ...inventory, version: 2 } }, "claude"), null);

  const catalogs = {
    version: 1, adapter: "codex", runtimeVersion: "0.162.1",
    requestedServers: ["nodi-a"], apps: [],
    mcpServers: [{ name: "nodi-a", source: "session", status: "connected", tools: ["search", "run"] }]
  };
  assert.deepEqual(plain(Acp.catalogs({ nodi_runtime_catalogs: catalogs }, "codex")), catalogs);
  assert.equal(Acp.catalogs({ nodi_runtime_catalogs: catalogs }, "claude"), null);
  assert.equal(Acp.catalogs({ nodi_runtime_catalogs: { ...catalogs, builtins: [] } }, "codex"), null,
               "Codex catalogs cannot claim a final built-in inventory");
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
  assert.equal(G.chosen("gemini", "claude"), "agy");
  assert.equal(G.chosen("", "claude"), "claude");
  assert.equal(G.chosen("", "nonesuch"), "claude");
  assert.equal(G.chosen(undefined, ""), "claude");
});

test("the Ask registry has every built-in and only valid unique custom agents", () => {
  const registry = plain(G.registry({
    agents: [
      { id: "free", name: "Free", command: ["opencode", "acp"], env: { PROFILE: "free" } },
      { id: "free", name: "Duplicate", command: ["other"] },
      { id: "claude", name: "Reserved", command: ["other"] },
      { id: "Bad Id", name: "Unsafe", command: ["other"] },
      { id: "noname", name: " ", command: ["other"] },
      { id: "shell", name: "Shell text", command: "other --acp" },
      { id: "badenv", name: "Bad env", command: ["other"], env: { N: 3 } },
      { id: "work", name: " Work ACP ", command: ["/opt/work", "acp"], env: { MODE: "safe" } }
    ]
  }));
  assert.deepEqual(registry.map(a => a.id), ["claude", "codex", "opencode", "pi", "agy", "free", "work"]);
  assert.deepEqual(registry.slice(-2).map(a => [a.name, a.command, a.env]),
    [["Free", ["opencode", "acp"], { PROFILE: "free" }], ["Work ACP", ["/opt/work", "acp"], { MODE: "safe" }]]);
  assert.equal(G.byId(registry, "constructor"), null);
  assert.equal(G.disabledReason("agy"), "");
  assert.equal(G.disabledReason("pi"), "");
});

test("legacy Gemini configuration resolves to Agy", () => {
  const registry = G.registry({});
  assert.equal(G.chosen("gemini", "claude", "", registry, {}), "agy");
  assert.equal(G.chosen("", "gemini", "", registry, {}), "agy");
  assert.equal(G.chosen("claude", "codex", "gemini", registry, { agy: true }), "agy");
  assert.equal(G.modelFor("agy", { models: { gemini: "legacy" } }, "claude", registry), "legacy");
  assert.equal(G.modelFor("agy", { models: { gemini: "legacy", agy: "current" } }, "claude", registry), "current");
});

test("agent resolution prefers an available remembered ID, then config, supported Omarchy default, then Claude", () => {
  const registry = G.registry({ agents: [{ id: "free", name: "Free", command: ["free-acp"] }] });
  assert.equal(G.chosen("gemini", "claude", "free", registry, { free: true }), "free");
  assert.equal(G.chosen("gemini", "claude", "free", registry, { free: false }), "agy", "an unavailable memory is skipped");
  assert.equal(G.chosen("missing", "codex", "", registry, {}), "codex", "an unsupported configured ID is skipped");
  assert.equal(G.chosen("", "missing", "", registry, {}), "claude");
  assert.equal(G.chosen("", "agy", "", registry, {}), "agy");
  assert.equal(G.chosen("agy", "gemini", "", registry, {}), "agy");
  assert.deepEqual(plain(G.chosen({ command: ["legacy"] }, "codex", "", registry, {})), { command: ["legacy"] },
    "the legacy custom agent object remains configured");
});

test("models are per agent, with legacy ask.model only for the configured or Omarchy default agent", () => {
  const registry = G.registry({});
  const ask = { agent: "codex", model: "gpt-5.5", models: { codex: "gpt-5.6", gemini: "flash" } };
  assert.equal(G.modelFor("codex", ask, "claude", registry), "gpt-5.6", "the per-agent model overrides legacy");
  assert.equal(G.modelFor("gemini", ask, "claude", registry), "flash");
  assert.equal(G.modelFor("claude", ask, "claude", registry), "haiku", "legacy does not follow a remembered selection; the built-in default remains");
  assert.equal(G.modelFor("gemini", { model: "pro" }, "gemini", registry), "pro", "without ask.agent it belongs to Omarchy's supported default");
  assert.equal(G.modelFor("claude", { model: "sonnet" }, "unsupported", registry), "sonnet", "Claude is the final configured default");
  assert.equal(G.modelFor("free", { models: { free: 3 } }, "claude",
    G.registry({ agents: [{ id: "free", name: "Free", command: ["free"] }] })), "", "models must be strings");
});

test("object-valued ask.agent keeps identity for legacy ask.model", () => {
  const obj = { command: ["a"] };
  assert.equal(G.modelFor(obj, { agent: obj, model: "m" }, "claude"), "m");
  assert.equal(G.modelFor(obj, { agent: obj, models: { "": "empty-key" } }, "claude"), "",
    "non-string agent ids must not read models[\"\"]");
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
    // Once a version is in place, the same adapter's others go, and only those.
    for (const old of ["agents/pkg@0", "agents/other@1", "agents/pkg@2"]) mkdirSync(join(t, old), { recursive: true });
    writeFileSync(join(t, "agents/pkg@0.log"), "old log\n");
    // pkg@2's lock is held, as an install of it would hold it: kept.
    const { spawn } = await import("node:child_process");
    const holder = spawn("/usr/bin/flock", [join(t, "agents/pkg@2.lock"), "sleep", "5"], { stdio: "ignore" });
    await new Promise(r => setTimeout(r, 300));
    writeFileSync(join(lock, "package-lock.json"), "{\"v\": 3}\n");
    assert.equal(go({ NODI_INSTALL: "1" }).status, 0);
    holder.kill();
    const { readdirSync } = await import("node:fs");
    assert.deepEqual(readdirSync(join(t, "agents")).sort(), ["other@1", "pkg@1", "pkg@1.lock", "pkg@1.log", "pkg@2", "pkg@2.lock"],
                     "the old version's tree and log gone, one installing kept, another adapter's kept");
    // No lockfile shipped: refused, never a bare install.
    rmSync(dir, { recursive: true }); rmSync(join(lock, "package-lock.json"));
    const bare = go({ NODI_INSTALL: "1" });
    assert.deepEqual([bare.status, bare.stderr.trim().split("\n").pop()], [1, "nodi: no lockfile for pkg in " + lock]);
  } finally { rmSync(t, { recursive: true, force: true }); }
});

test("--check says whether the adapter is in place, and does nothing else whatever NODI_INSTALL says: no install, lock, file, program or start (2026-10-10)", async () => {
  const { mkdtempSync, mkdirSync, writeFileSync, chmodSync, existsSync, rmSync, readdirSync, readFileSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const t = mkdtempSync(join(tmpdir(), "nodi-check-"));
  try {
    writeFileSync(join(t, "npm"), FAKE_NPM); chmodSync(join(t, "npm"), 0o755);
    const dir = join(t, "agents/pkg@1"), lock = join(t, "lock");
    mkdirSync(lock); writeFileSync(join(lock, "package.json"), "{}\n"); writeFileSync(join(lock, "package-lock.json"), "{\"v\": 1}\n");
    const settings = join(t, "settings.json");
    const opts = ["--which", "AGENT", "no-such-program-nodi", "--file", "VAR", settings, "{}"];
    const go = (pre, install) => spawnSync("/usr/bin/bash", ["-c", G.LAUNCH, "nodi-agent", ...pre, "npm", dir, lock, "pkg", "1", "x", "hello"],
                                         { encoding: "utf8", env: { PATH: t + ":/usr/bin:/bin", NPM_LOG: join(t, "log"), HOME: t, NPM_SLEEP: "0", NODI_INSTALL: install } });
    // NODI_INSTALL=1 as a profile might export it: still no install.
    const none = go(["--check", ...opts], "1");
    assert.deepEqual([none.status, none.stdout, none.stderr], [75, "", "nodi: pkg@1 is not installed\n"], "not installed: said, as a start says it");
    assert.ok(!existsSync(join(t, "log")) && !existsSync(dir) && !existsSync(dir + ".lock"), "nothing installed, no lock taken");
    assert.ok(!existsSync(settings), "no settings file written");
    assert.equal(go([], "1").status, 0, "installed when asked");
    mkdirSync(join(t, "agents/pkg@0"));
    const before = readdirSync(join(t, "agents")).sort();
    const ready = go(["--check", ...opts], "1");
    assert.deepEqual([ready.status, ready.stdout, ready.stderr], [0, "", "nodi: adapter ready\n"], "ready, and the adapter not run");
    assert.deepEqual(readdirSync(join(t, "agents")).sort(), before, "another version kept, nothing added");
    assert.ok(!existsSync(settings));
    assert.equal(go(opts, "0").status, 127, "a start still needs its program");
    writeFileSync(join(lock, "package-lock.json"), "{\"v\": 2}\n");
    assert.equal(go(["--check"], "1").status, 75, "a tree from another lock is not ready, and is not installed again");
    assert.equal(readFileSync(join(dir, "package-lock.json"), "utf8"), "{\"v\": 1}\n");
    const marker = join(t, "started");
    const own = spawnSync("/usr/bin/bash", ["-c", G.LAUNCH, "nodi-agent", "--check", "exec", "/usr/bin/touch", marker], { encoding: "utf8", env: { PATH: "/usr/bin:/bin" } });
    assert.deepEqual([own.status, own.stderr, existsSync(marker)], [0, "", false], "an agent that is its own program: not started");
  } finally { rmSync(t, { recursive: true, force: true }); }
});

test("an agent runs under umask 077: what it writes is his alone (2026-10-10)", () => {
  const r = spawnSync("/usr/bin/bash", ["-c", G.LAUNCH, "nodi-agent", "exec", "/usr/bin/bash", "-c", "umask"], { encoding: "utf8", env: { PATH: "/usr/bin:/bin" } });
  assert.deepEqual([r.status, r.stdout.trim()], [0, "0077"]);
});

test("checkArgv: the start's arguments with --check first, under a shell that reads no profile; none for a program of his own", () => {
  const s = plain(G.spec("claude", "/d", "", "x", [], "/a"));
  const c = plain(G.checkArgv(s.argv));
  assert.deepEqual(c.slice(0, 2), ["/usr/bin/bash", "-c"], "no login shell: no profile runs before the script");
  assert.equal(c[2], s.argv[2]);
  assert.deepEqual(c.slice(3), [s.argv[3], "--check"].concat(s.argv.slice(4)));
  assert.equal(G.checkArgv(["/usr/bin/python3", "fake-agent.py"]), null);
  assert.equal(G.checkArgv(null), null);
});

test("the enabled adapters' lockfiles are the versions Ask names: exact, every package from the registry with its hash, none with an install script", async () => {
  const { readFileSync } = await import("node:fs");
  const root = new URL("../../", import.meta.url).pathname;
  for (const id of ["claude", "codex", "pi", "agy"]) {
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

test("adapter installation ignores package lifecycle scripts", async () => {
  const { mkdtempSync, mkdirSync, writeFileSync, chmodSync, existsSync, rmSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const t = mkdtempSync(join(tmpdir(), "nodi-no-install-scripts-"));
  try {
    const dependency = join(t, "hooked");
    const lock = join(t, "lock");
    const marker = join(t, "POSTINSTALL_RAN");
    mkdirSync(join(dependency, "bin"), { recursive: true });
    mkdirSync(lock);
    writeFileSync(join(dependency, "package.json"), JSON.stringify({
      name: "hooked-adapter", version: "1.0.0",
      bin: { x: "bin/x" },
      scripts: { postinstall: "node -e \"require('fs').writeFileSync(process.env.HOOK_MARKER, 'ran')\"" }
    }));
    writeFileSync(join(dependency, "bin/x"), "#!/usr/bin/bash\necho safe\n");
    chmodSync(join(dependency, "bin/x"), 0o755);
    writeFileSync(join(lock, "package.json"), JSON.stringify({
      name: "nodi-hook-test", private: true, dependencies: { "hooked-adapter": "file:" + dependency }
    }));
    const made = spawnSync("npm", ["install", "--package-lock-only", "--ignore-scripts", "--no-audit", "--no-fund"], {
      cwd: lock, encoding: "utf8", env: { ...process.env, HOOK_MARKER: marker }
    });
    assert.equal(made.status, 0, made.stderr);
    const dir = join(t, "installed");
    const r = spawnSync("/usr/bin/bash",
      ["-c", G.LAUNCH, "nodi-agent", "npm", dir, lock, "hooked-adapter", "1.0.0", "x"], {
        encoding: "utf8",
        env: { PATH: process.env.PATH, HOME: t, NODI_INSTALL: "1", HOOK_MARKER: marker }
      });
    assert.deepEqual([r.status, r.stdout], [0, "safe\n"]);
    assert.equal(existsSync(marker), false, "postinstall did not run");
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
  // Continue: the agent opened with no prompt, the conversation copied to
  // paste, in no argument, all of it as Raycast hands its history on.
  const cont = plain(run("ask what is this", done)).find(r => r.key === "ask:agent");
  assert.equal(cont.subtitle, "Opens it, the conversation copied to paste");
  assert.deepEqual([cont.run.kind, cont.run.text, cont.run.args], ["shell", "Our conversation so far:\n\nQ: what is this\n\nA: a formula", undefined]);
  const longer = { ask: Object.assign({}, done.ask, { turns: [{ question: "first", answer: "one " }] }) };
  assert.equal(plain(run("ask what is this", longer)).find(r => r.key === "ask:agent").run.text,
               "Our conversation so far:\n\nQ: first\n\nA: one\n\nQ: what is this\n\nA: a formula", "the earlier turns first");
  // Ctrl+Enter copies the conversation too, and one past what an environment
  // string holds keeps its newest turns.
  assert.equal(cont.copy, cont.run.text, "Ctrl+Enter copies what Enter carries");
  const huge = { ask: Object.assign({}, done.ask, { turns: [{ question: "old", answer: "\u0ba4".repeat(40000) }, { question: "older", answer: "y".repeat(40000) }] }) };
  const t = plain(run("ask what is this", huge)).find(r => r.key === "ask:agent").run.text;
  assert.ok(Buffer.byteLength(t, "utf8") <= 120000, "under 120 KB in bytes: " + Buffer.byteLength(t, "utf8"));
  assert.ok(t.endsWith("Q: what is this\n\nA: a formula"), "the newest turn kept");
  assert.ok(t.includes("(Earlier turns left out.)") && !t.includes("Q: old\n"), "the oldest left out, and said so");
  assert.equal(cont.run.script, load("lib/Run.js").COPY + " || exit 1\nexec omarchy-agent --pick", "copied as Run's copy copies, then the agent");
  assert.ok(!JSON.stringify(load("lib/Run.js").command(cont.run).command).includes("what is this"), "the question in no argument");
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

test("ACP commands, result actions, forms, plans, and saved sessions are visible", () => {
  const commands = [
    { name: "status", description: "Show status", input: null },
    { name: "review", description: "Review", input: { hint: "scope", required: true } }
  ];
  let rows = plain(run("ask /", {
    ask: { phase: "done", question: "x", answer: "done", commands }
  }));
  assert.deepEqual(rows.map(r => [r.key, r.nodi, r.complete]), [
    ["ask:command:status", "askCommand", ""],
    ["ask:command:review", "", "ask /review "]
  ]);

  const done = {
    ask: {
      phase: "done", question: "x", answer: "done",
      sessionId: "current",
      commands,
      resultActions: [
        { title: "Continue", action: { prompt: "/status" } },
        { title: "Run", action: { exec: ["true"] } }
      ],
      remoteSessions: [
        { sessionId: "current", title: "Current", cwd: "/tmp" },
        { sessionId: "saved-1", title: "Saved", cwd: "/tmp" }
      ]
    }
  };
  rows = plain(run("ask x", done));
  assert.deepEqual(rows.slice(0, 7).map(r => r.key), [
    "ask:paste", "ask:copy", "ask:agent",
    "ask:result:0", "ask:result:1",
    "ask:answer-command:status", "ask:answer-command:review"
  ], "agent additions follow the fixed answer actions");
  assert.equal(rows.find(r => r.key === "ask:session:saved-1").data.index, 1,
            "saved sessions are offered");

  const form = { message: "Choose", fields: [{ name: "strategy", type: "enum", enum: ["safe", "fast"], value: "safe" }] };
  rows = plain(run("ask x", {
    ask: { phase: "proposing", question: "x", answer: "", form,
           proposal: { form: true, title: "Choose" } }
  }));
  assert.deepEqual(rows.map(r => [r.title, r.nodi]), [
    ["Submit", "askAllow"], ["Cancel", "askDeny"]
  ]);

  const Pane = load("lib/Pane.js");
  assert.equal(plain(Pane.choose({
    proposal: { title: "Choose", subtitle: "", form }
  })).form.message, "Choose", "the form remains visible if the query changes");
  const pane = plain(Pane.choose({
    ask: { question: "x", agent: "Claude", text: "", plans: [
      { content: "Inspect", status: "in_progress", priority: "high" }
    ], form, answerTurn: "turn-1" }
  }));
  assert.deepEqual([pane.plans[0].content, pane.form.message, pane.answerLink, pane.answerTurn],
                   ["Inspect", "Choose", true, "turn-1"]);
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
  assert.equal(G.signInCommand("codex", "/test-home/.local/share/nodi"),
               "CODEX_HOME='/test-home/.local/share/nodi/profiles/codex' codex login");
  assert.equal(G.signInCommand("claude", "/test-home/.local/share/nodi"), "claude");
  for (const relative of ["docs/ask.md", "docs/troubleshooting.md"]) {
    const text = readFileSync(root + "/" + relative, "utf8");
    assert.match(text, /CODEX_HOME=.*profiles\/codex.*codex login/i,
                 relative + " names the private login, not normal codex");
  }
});

test("Ask status refresh waits until its state-change handler has finished", () => {
  const nodi = readFileSync(root + "/Nodi.qml", "utf8");
  assert.match(nodi, /function syncAskStatus\(\) \{[\s\S]*?root\.askStatus = askSession\.status[\s\S]*?root\.recompute\(\)[\s\S]*?onStatusChanged:\s*Qt\.callLater\(root\.syncAskStatus\)/,
               "a synchronous refresh can warm a new session inside the old session's reset, and the pane must not outrun its row");
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
  // A line at a time: the agent waits for the reader to release it after
  // the first line, so the test does not depend on OS pipe chunk boundaries.
  const { createInterface } = await import("node:readline");
  const p = spawn("/usr/bin/bash", ["-c", G.LAUNCH, "nodi-agent", "exec", "/usr/bin/bash", "-c", "echo first; IFS= read -r _; echo second"], { env: { PATH: "/usr/bin:/bin" } });
  const exited = new Promise(resolve => p.once("exit", resolve));
  const lines = createInterface({ input: p.stdout });
  const nextLine = label => new Promise((resolve, reject) => {
    const timeout = setTimeout(() => { p.kill(); reject(new Error(label + " was not streamed")) }, 20000);
    lines.once("line", value => { clearTimeout(timeout); resolve(value) });
  });
  assert.equal(await nextLine("first line"), "first");
  p.stdin.write("\n");
  assert.equal(await nextLine("second line"), "second");
  const status = await exited;
  lines.close();
  assert.equal(status, 0);
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
  const atOnce = ["apps", "windows", "menu", "system", "desktop", "desktops", "plugins"];
  assert.ok(ids.length > 30, "every provider: " + ids.length);
  for (const id of ids) assert.equal(A.refusedAtOnce(id + ":x", id) === "", atOnce.includes(id), id + (atOnce.includes(id) ? " runs at once" : " is proposed"));
  for (const id of atOnce) assert.ok(ids.includes(id), id + " is a provider");
  assert.match(A.refusedAtOnce("shell:rm -rf ~", "shell"), /command line; propose it/);
  assert.match(A.refusedAtOnce("remind:15", "system"), /propose it/, "a reminder's message is the agent's words");
  // Nodi's own reminders (2026-10-10): no row of theirs runs at once, the
  // list's copying a message the agent's words may have set, clearing his.
  for (const k of ["remind:show", "remind:clear", "remind:pending:r1"]) assert.match(A.refusedAtOnce(k, "system"), /propose it/, k);
  assert.equal(A.refusedAtOnce("volume:60", "system"), "", "a number, clamped");
  // A change of setting or an install waits for his Enter (his word,
  // 2026-10-10): DNS, a font, a theme, a toggle, a device, a network.
  for (const [k, p] of [["menu:setup.network.dns.cloudflare", "menu"], ["menu:install.style.font", "menu"], ["menu:style.theme", "menu"],
                        ["menu:trigger.toggle.idle-lock", "menu"], ["toggle:wifi", "system"], ["theme:catppuccin", "system"],
                        ["bluetooth:41:42:28:7B:19:CF", "desktop"], ["wifi:Home", "desktop"], ["output:alsa_output.x", "desktop"], ["menu:remove.package", "menu"],
                        ["system:bg-next", "system"]])
    assert.match(A.refusedAtOnce(k, p), /changes a setting or installs; propose it/, k);
  // A keybinding runs what it is bound to: a toggle, a lock (Fable
  // 2026-10-10: `keys idle` flipped Stay Awake with no Enter).
  assert.match(A.refusedAtOnce("keys:SUPER CTRL + I", "keys"), /keybinding runs whatever it is bound to; propose it/);
  for (const [k, p] of [["app:firefox", "apps"], ["window:0xabc", "windows"], ["menu:trigger.capture.screenshot", "menu"], ["media:org.mpris.MediaPlayer2.spotify", "desktop"],
                        ["system:shot-region", "system"], ["system:record-full", "system"]])
    assert.equal(A.refusedAtOnce(k, p), "", k + " still at once");
  assert.match(A.refusedAtOnce("k", undefined), /propose it/);
  const row = plain(run("> rm -rf ~", {}))[0];
  assert.deepEqual([row.key, row.provider], ["shell:rm -rf ~", "shell"]);
  // The reads an agent's search may not start: none reaches his request;
  // every other does, with all its arguments ({ fetch: false } among them).
  const calls = [];
  const req = A.forAgent(function() { calls.push([...arguments]); return { state: "ready", value: [] }; });
  for (const name of ["filter", "filter-list", "filter-step", "filter-socket", "script-output"]) assert.equal(req(name, "p").state, "error", name);
  assert.deepEqual(calls, [], "none of his programs asked for");
  req("rates", "USD", { fetch: false });
  assert.deepEqual(calls, [["rates", "USD", { fetch: false }]]);
  assert.equal(A.forAgent(null)("define", "x").state, "pending");
  // Engine.agentRows, which Nodi.qml's is (tools/hygiene.mjs): a filter
  // that runs its query is never asked; his own search asks it.
  const cfg = Object.assign({}, config, { filters: [{ keyword: "x", title: "X", command: ["bash", "-c"] },
                                                  { keyword: "l", title: "L", command: ["bash", "-c"], list: true, root: true },
                                                  { keyword: "s", title: "S", socket: "/run/user/1000/s.sock" }] });
  const asked = [];
  const rows = plain(Engine.agentRows("x touch /tmp/pwn", cfg, services({ asked, filter: () => { throw new Error("started") } })));
  Engine.agentRows("l touch", cfg, services({ asked, filter: () => { throw new Error("started") } }));
  Engine.agentRows("s secret", cfg, services({ asked, filter: () => { throw new Error("started") } }));
  assert.ok(!asked.some(k => /^filter/.test(k)), "the filters were not asked: " + asked.join(" "));
  assert.ok(!rows.some(r => r.provider === "filters"), "and offer nothing");
  assert.ok(rows.length <= 8 && rows.every(r => r.run && !r.help && !r.nodi));
  const his = [];
  Engine.run("x touch /tmp/pwn", cfg, services({ asked: his, filter: () => [] }));
  assert.ok(his.some(k => /^filter:/.test(k)), "his own search asks it, as before");
});

test("Ask direct resolution sees the exact unfiltered top row without starting an agent-unsafe provider", async () => {
  const { Engine, config, services } = await import("./fixtures.mjs");
  const volume = plain(Engine.agentTop("volume", config, services()));
  const ranked = plain(Engine.run("volume", config, services()));
  const exploratory = plain(Engine.agentRows("volume", config, services()));
  assert.deepEqual(volume, ranked[0], "direct resolution changed the bar's top-ranked row");
  assert.equal(volume.key, "volume:prompt");
  assert.deepEqual(exploratory.slice(0, 2).map(r => r.key), ["volume:5", "volume:-5"],
                   "exploratory search no longer offers the filtered runnable rows");

  assert.equal(Engine.agentTop("?", config, services()).help, true, "help remains the true top row");
  assert.equal(Engine.agentTop("ask firefox", config, services()).nodi, "ask", "Nodi-owned rows remain visible to direct validation");
  assert.ok(Engine.agentTop("volume up", config, services()).run, "a normal runnable top row remains runnable");

  const cfg = Object.assign({}, config, {
    filters: [{ keyword: "x", title: "X", command: ["bash", "-c"] },
              { keyword: "l", title: "L", command: ["bash", "-c"], list: true, root: true }]
  });
  const asked = [];
  Engine.agentTop("x touch /tmp/pwn", cfg, services({ asked, filter: () => { throw new Error("started") } }));
  Engine.agentTop("l touch", cfg, services({ asked, filter: () => { throw new Error("started") } }));
  assert.ok(!asked.some(k => /^filter/.test(k)), "direct resolution started an unsafe provider: " + asked.join(" "));
});

test("files Nodi writes are written beside, under names of their own, then moved in: a link at the old fixed name, or at the name itself, is never followed (codex's reviews, 2026-10-09)", async () => {
  const { mkdtempSync, writeFileSync, readFileSync, symlinkSync, readdirSync, statSync, lstatSync, rmSync, chmodSync, mkdirSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const t = mkdtempSync(join(tmpdir(), "nodi-tmp-"));
  try {
    const victim = join(t, "victim");
    writeFileSync(victim, "untouched");
    mkdirSync(join(t, "victimdir"));
    const mode = f => statSync(f).mode & 0o777;
    const isFile = f => lstatSync(f).isFile();
    // The launch script's settings file: links at the old temp name and at
    // the name, one to a file and one to a folder.
    symlinkSync(victim, join(t, "settings.json.tmp"));
    symlinkSync(victim, join(t, "settings.json"));
    symlinkSync(join(t, "victimdir"), join(t, "other.json"));
    for (const name of ["settings.json", "other.json"]) {
      const r = run_launch(["--file", "X_SETTINGS", join(t, name), '{"a":1}', "exec", "/usr/bin/bash", "-c", 'cat "$X_SETTINGS"']);
      assert.deepEqual([r.status, r.stdout], [0, '{"a":1}\n'], name);
      assert.ok(isFile(join(t, name)), name + " is a file now, not the link");
      assert.equal(mode(join(t, name)), 0o600);
    }
    assert.deepEqual(readdirSync(join(t, "victimdir")), [], "nothing put in the folder a link named");
    // lib/ics.py's cache: links at the copy, its meta and their old temp names.
    for (const n of ["feed.ics", "feed.json", "feed.ics.tmp", "feed.json.tmp"]) symlinkSync(victim, join(t, n));
    execFileSync("/usr/bin/python3", ["-I", "-B", "-c", "import sys; sys.path.insert(0, sys.argv[1]); import ics; ics.write_private(sys.argv[2], b'cal'); ics.write_meta(sys.argv[3], {'etag': 'x'})",
                                      join(root, "lib"), join(t, "feed.ics"), join(t, "feed")]);
    assert.deepEqual([readFileSync(join(t, "feed.ics"), "utf8"), readFileSync(join(t, "feed.json"), "utf8")], ["cal", '{"etag": "x"}']);
    for (const n of ["feed.ics", "feed.json"]) { assert.ok(isFile(join(t, n)), n); assert.equal(mode(join(t, n)), 0o600, n); }
    // The currency rates, from a stand-in curl: links at rates.json and its old temp name.
    mkdirSync(join(t, "bin")); mkdirSync(join(t, "cache"));
    writeFileSync(join(t, "bin/curl"), '#!/bin/bash\nprintf \'{"result":"success","rates":{"USD":1}}\'\n'); chmodSync(join(t, "bin/curl"), 0o755);
    symlinkSync(victim, join(t, "cache/rates.json.tmp"));
    symlinkSync(victim, join(t, "cache/rates.json"));
    const C = load("providers/currency.js");
    const a = C.provider.sources.rates.argv("", { cacheDir: join(t, "cache") });
    assert.equal(execFileSync(a[0], a.slice(1), { env: { PATH: join(t, "bin") + ":/usr/bin:/bin" } }).toString(), '{"result":"success","rates":{"USD":1}}');
    assert.ok(isFile(join(t, "cache/rates.json"))); assert.equal(mode(join(t, "cache/rates.json")), 0o600);
    assert.equal(readFileSync(victim, "utf8"), "untouched", "no write went through a link");
    const left = readdirSync(t).filter(f => /\.[A-Za-z0-9]{6}$/.test(f)).concat(readdirSync(join(t, "cache")).filter(f => /\.[A-Za-z0-9]{6}$/.test(f)));
    assert.deepEqual(left, [], "nothing left behind");
  } finally { rmSync(t, { recursive: true, force: true }); }
});

test("with the agent's program not installed, no Ask fallback, and `ask ` says so before an Enter (2026-10-09)", () => {
  assert.deepEqual(["claude", "codex", "gemini", "pi", "agy"].map(id => G.program(id)), ["claude", "codex", "agy", "pi", "agy"]);
  assert.equal(G.program({ command: ["my-agent", "acp"] }), "my-agent");
  assert.equal(G.program("nonesuch"), "");
  const ask = { phase: "idle", question: "", answer: "", agent: "Claude", model: "haiku", missing: "claude" };
  assert.ok(!plain(run("qqzzxxvv", { ask })).some(r => r.key === "fallback:ask"), "no Ask among the fallbacks");
  assert.ok(plain(run("qqzzxxvv", { ask: { ...ask, missing: "" } })).some(r => r.key === "fallback:ask"), "installed: offered");
  assert.equal(plain(run("ask what is this", { ask }))[0].subtitle, "claude is not on your login PATH: install it, or name another agent in nodi.json");
  assert.equal(plain(run("ask ", { ask }))[0].subtitle, "claude is not on your login PATH: install it, or name another agent in nodi.json", "said at `ask ` itself");
});

test("a question that could not be asked says why, and Enter asks again", () => {
  const rows = plain(run("ask why", { ask: { phase: "error", question: "why", error: "out of credits", agent: "Claude", model: "haiku" } }));
  assert.deepEqual([rows[0].key, rows[0].title, rows[0].actionLabel, rows[0].nodi], ["ask:error", "Could not ask: out of credits", "Ask again", "ask"]);
});

test("Continue in your agent: a copy that fails stops it before the agent opens, so the toast says why (Fable 2026-10-10)", async () => {
  const { execFileSync } = await import("node:child_process");
  const { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { run } = await import("./fixtures.mjs");
  const cont = plain(run("ask what is this", { ask: { phase: "done", question: "what is this", answer: "a", model: "haiku" } })).find(r => r.key === "ask:agent");
  const dir = mkdtempSync(join(tmpdir(), "nodi-continue-"));
  try {
    writeFileSync(join(dir, "omarchy-agent"), '#!/bin/bash\necho "$*" > "$0.ran"\n', { mode: 0o755 });
    const go = copy => {
      writeFileSync(join(dir, "wl-copy"), "#!/bin/bash\ncat > /dev/null\n" + copy, { mode: 0o755 });
      rmSync(join(dir, "omarchy-agent.ran"), { force: true });
      try { execFileSync("/usr/bin/bash", ["--norc", "-c", cont.run.script], { env: { PATH: dir + ":/usr/bin:/bin", NODI_TEXT: cont.run.text }, stdio: "pipe" }); return 0 }
      catch (e) { return e.status }
    };
    assert.equal(go("exit 0\n"), 0);
    assert.equal(readFileSync(join(dir, "omarchy-agent.ran"), "utf8").trim(), "--pick", "copied: the agent opens");
    assert.equal(go('echo "no compositor" >&2; exit 1\n'), 1, "a failed copy fails the row");
    assert.ok(!existsSync(join(dir, "omarchy-agent.ran")), "and the agent is not opened");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// A fallback (his ask, 2026-10-11): one of his answers, by its keyword, takes
// a question Ask could not answer; first when the agent hit a limit.
test("a failed question offers the fallback answer, first when the agent hit a limit", async () => {
  const { config } = await import("./fixtures.mjs");
  const Jsonc = load("lib/Jsonc.js");
  const cfg = Jsonc.merge(config, { ask: { fallback: "fr" }, answers: [{ keyword: "fr", title: "Free (pi)", command: ["pi", "-p"] }] });
  const failed = (error) => ({ ask: { phase: "error", question: "what is uv", error, agent: "Claude", model: "haiku" } });
  const limited = plain(run("ask what is uv", failed("Claude stopped: Claude AI usage limit reached"), cfg));
  assert.deepEqual(limited.map(r => r.key), ["ask:fallback", "ask:error"], "a limit: the fallback leads");
  assert.deepEqual([limited[0].title, limited[0].subtitle, limited[0].nodi], ["Ask Free (pi) instead: what is uv", "Claude hit a limit; Free (pi) answers", "askFallback"]);
  assert.deepEqual(limited[0].data, { keyword: "fr", question: "what is uv", message: "what is uv", fresh: true });
  const other = plain(run("ask what is uv", failed("Claude stopped: exit 3"), cfg));
  assert.deepEqual(other.map(r => r.key), ["ask:error", "ask:fallback"], "any other failure: asking again leads");
  assert.equal(other[1].subtitle, "Free (pi) answers in its place");
  const selectionMessage = "translate this\n\nThe text it is about:\n<text>\nவணக்கம்\n</text>";
  const selection = plain(run("ask translate this", { ask: { ...failed("usage limit reached").ask, question: "translate this",
    context: "selection", message: selectionMessage } }, cfg)).find(r => r.key === "ask:fallback");
  assert.equal(selection.data.message, selectionMessage, "selected text reaches the fallback, not only its displayed question");
  const continued = plain(run("ask and why", { ask: { ...failed("usage limit reached").ask, question: "and why", message: "and why",
    turns: [{ question: "what is uv", answer: "A package manager." }] } }, cfg)).find(r => r.key === "ask:fallback");
  assert.equal(continued.data.message, "Our conversation so far:\n\nQ: what is uv\n\nA: A package manager.\n\nQ: and why",
               "a follow-up carries the earlier turns");
  const selectedTurn = plain(run("ask and why", { ask: { ...failed("usage limit reached").ask, question: "and why", message: "and why",
    turns: [{ question: "translate this", message: selectionMessage, answer: "Hello." }] } }, cfg)).find(r => r.key === "ask:fallback");
  assert.equal(selectedTurn.data.message, "Our conversation so far:\n\nQ: " + selectionMessage + "\n\nA: Hello.\n\nQ: and why",
               "a follow-up keeps the earlier turn's selected text");
  const window = plain(run("ask what is this", { ask: { ...failed("usage limit reached").ask, question: "what is this",
    context: "window", message: "what is this\n\nThe picture is the window the question is about." } }, cfg)).find(r => r.key === "ask:fallback");
  assert.equal(window.data.message, "what is this\n\nThe window picture from the failed request is not available to this fallback.",
               "a fallback never claims to have the missing picture");
  assert.ok(!plain(run("ask what is uv", failed("usage limit reached"))).some(r => r.key === "ask:fallback"), "no fallback set: no row");
  const missing = Jsonc.merge(config, { ask: { fallback: "nope" } });
  assert.ok(!plain(run("ask what is uv", failed("usage limit reached"), missing)).some(r => r.key === "ask:fallback"), "a fallback no answer has: no row");
});

test("Ask agent actions include only agents that can currently be selected", async () => {
  const { config } = await import("./fixtures.mjs");
  const Jsonc = load("lib/Jsonc.js");
  const cfg = Jsonc.merge(config, { ask: {
    agent: "claude",
    models: { codex: "gpt-5.6", free: "provider/model" },
    agents: [{ id: "free", name: "Free", command: ["free-acp"] }]
  } });
  const agents = [
    { id: "claude", name: "Claude", model: "haiku", policy: "strict", missing: "", available: true, current: true },
    { id: "codex", name: "Codex", model: "gpt-5.6", policy: "unmanaged", missing: "", available: true, current: false },
    { id: "agy", name: "Agy", model: "", policy: "answer-only", missing: "", reason: "", available: true, current: false },
    { id: "pending", name: "Pending", model: "", policy: "unmanaged", missing: "", reason: "", available: false, current: false },
    { id: "free", name: "Free", model: "provider/model", policy: "unmanaged", missing: "", available: true, current: false }
  ];
  const row = plain(run("ask why", { ask: { phase: "idle", agent: "Claude", model: "haiku", agents } }, cfg))[0];
  const actions = plain(Rows.actionsFor(row, {})).filter(a => a.nodi === "askAgent");
  assert.deepEqual(actions.map(a => [a.data.id, a.label, a.detail, a.disabled, a.reason]), [
    ["claude", "Use Claude", "haiku | Managed | Current", false, ""],
    ["codex", "Use Codex", "gpt-5.6 | Unmanaged tools", false, ""],
    ["agy", "Use Agy", "No Nodi actions", false, ""],
    ["free", "Use Free", "provider/model | Unmanaged tools", false, ""]
  ]);
});

test("available ACP agents are direct one-shot Ask prefixes, including custom agents", async () => {
  const { config } = await import("./fixtures.mjs");
  const Jsonc = load("lib/Jsonc.js");
  const cfg = Jsonc.merge(config, { ask: {
    agents: [{ id: "work", name: "Work", command: ["work-acp"] }]
  } });
  const agents = [
    { id: "claude", name: "Claude", model: "haiku", missing: "", reason: "", available: true, current: true },
    { id: "codex", name: "Codex", model: "gpt-5.6", missing: "", reason: "", available: true, current: false },
    { id: "opencode", name: "OpenCode", model: "", missing: "opencode", reason: "", available: false, current: false },
    { id: "pi", name: "Pi", model: "provider/model", missing: "", reason: "", available: true, current: false },
    { id: "agy", name: "Agy", model: "", missing: "", reason: "", available: true, current: false },
    { id: "work", name: "Work", model: "", missing: "", reason: "", available: true, current: false }
  ];
  const idle = { phase: "idle", question: "", answer: "", agent: "Claude", agentId: "claude", model: "haiku", agents };

  for (const [query, id, question, name] of [
    ["claude why", "claude", "why", "Claude"],
    ["codex review this", "codex", "review this", "Codex"],
    ["pi explain this", "pi", "explain this", "Pi"],
    ["agy compare these", "agy", "compare these", "Agy"],
    ["work inspect this", "work", "inspect this", "Work"]
  ]) {
    const row = plain(run(query, { ask: idle }, cfg)).find(r => r.provider === "ask" && r.nodi === "askAs");
    assert.ok(row, query);
    assert.deepEqual(row.data, { id, question });
    assert.equal(row.title, "Ask " + name + ": " + question);
  }

  for (const [id, name] of [["claude", "Claude"], ["codex", "Codex"], ["pi", "Pi"], ["agy", "Agy"], ["work", "Work"]]) {
    const bare = plain(run(id, { ask: idle }, cfg));
    assert.deepEqual([bare[0].key, bare[0].title], ["ask:direct:" + id, "Ask " + name], id + " is the exact command");
    const modeRows = plain(run(id + " ", { ask: idle }, cfg));
    assert.ok(modeRows.length > 0 && modeRows.every(r => r.provider === "ask"), id + " space is exclusive");
    assert.equal(Engine.mode(id + " ", cfg, modeRows).label, "Ask " + name);
  }
  assert.equal(run("pi * 2", { ask: idle }, cfg)[0].provider, "math",
    "a whole-query calculation beats an agent with arguments");
  assert.ok(!plain(run("opencode review", { ask: idle }, cfg)).some(r => r.provider === "ask" && r.nodi === "askAs"),
    "an unavailable agent does not claim a direct prefix");
  assert.ok(!plain(run("gemini review", { ask: idle }, cfg)).some(r => r.provider === "ask" && r.nodi === "askAs"),
    "the retired Gemini name is not exposed");
});

test("a direct agent prefix follows that agent's live Ask state without changing the default", () => {
  const agents = [
    { id: "claude", name: "Claude", model: "haiku", missing: "", reason: "", available: true, current: true },
    { id: "codex", name: "Codex", model: "gpt-5.6", missing: "", reason: "", available: true, current: false }
  ];
  const waiting = {
    phase: "waiting", question: "review this", answer: "", agent: "Codex", agentId: "codex",
    model: "gpt-5.6", agents
  };
  const row = plain(run("codex review this", { ask: waiting })).find(r => r.provider === "ask");
  assert.deepEqual([row.key, row.title], ["ask:wait", "Asking Codex Gpt-5.6..."]);
  assert.equal(row.data, null, "displaying state does not persist an agent selection");
});

test("direct agent prefixes preserve capture, approval, and busy state", () => {
  const agents = [
    { id: "claude", name: "Claude", missing: "", reason: "", available: true, current: true },
    { id: "codex", name: "Codex", missing: "", reason: "", available: true, current: false }
  ];
  const base = { question: "first", agent: "Claude", agentId: "claude", agents };
  const capturing = plain(run("codex second", { ask: { ...base, phase: "idle", capturing: true } }))
    .find(r => r.provider === "ask");
  assert.equal(capturing.key, "ask:shot");
  const proposing = plain(run("codex second", { ask: {
    ...base, phase: "proposing", proposal: { title: "Open it" }
  } })).filter(r => r.provider === "ask");
  assert.deepEqual(proposing.map(r => r.key), ["ask:deny", "ask:allow"]);
  const busy = plain(run("codex second", { ask: { ...base, phase: "streaming" } }))
    .find(r => r.provider === "ask");
  assert.equal(busy.key, "ask:busy");
});

test("fallbackAgent takes precedence, preserves the effective message, and waits for Enter; answer fallback remains compatible", async () => {
  const { config } = await import("./fixtures.mjs");
  const Jsonc = load("lib/Jsonc.js");
  const cfg = Jsonc.merge(config, {
    ask: { fallbackAgent: "free", fallback: "fr" },
    answers: [{ keyword: "fr", title: "Free answer", command: ["pi", "-p"] }]
  });
  const message = "translate this\n\nThe text it is about:\n<text>\nவணக்கம்\n</text>";
  const ask = {
    phase: "error", question: "translate this", message, context: "selection", error: "usage limit reached",
    agent: "Claude", model: "haiku",
    agents: [
      { id: "claude", name: "Claude", model: "haiku", missing: "", current: true },
      { id: "free", name: "Free", model: "provider/model", missing: "", current: false }
    ]
  };
  const rows = plain(run("ask translate this", { ask }, cfg));
  assert.deepEqual(rows.slice(0, 3).map(r => r.key), ["ask:agent-fallback", "ask:fallback", "ask:error"]);
  assert.deepEqual([rows[0].title, rows[0].nodi, rows[0].actionLabel],
    ["Ask Free instead: translate this", "askAgentFallback", "Prepare"]);
  assert.deepEqual(rows[0].data, { id: "free", question: "translate this", message, context: "selection", direct: false });
  const legacy = plain(run("ask translate this", {
    ask: { ...ask, agents: ask.agents.concat([
      { id: "agy", name: "Agy", model: "", missing: "", reason: "", current: false }
    ]) }
  }, Jsonc.merge(cfg, { ask: { fallbackAgent: "gemini" } })));
  assert.equal(legacy.find(r => r.key === "ask:agent-fallback").data.id, "agy");
  const unavailable = plain(run("ask translate this", { ask: { ...ask, agents: ask.agents.map(a => a.id === "free" ? { ...a, missing: "free-acp" } : a) } }, cfg));
  assert.ok(!unavailable.some(r => r.key === "ask:agent-fallback"), "an unavailable fallback agent is invalid");
  assert.ok(unavailable.some(r => r.key === "ask:fallback"), "the legacy answer fallback remains");
  const disabled = plain(run("ask translate this", { ask: { ...ask, agents: ask.agents.map(a => a.id === "free" ? { ...a, reason: "cannot disable tools" } : a) } }, cfg));
  assert.ok(!disabled.some(r => r.key === "ask:agent-fallback"), "a disabled fallback agent is invalid");
  const duplicate = plain(run("ask translate this", { ask }, Jsonc.merge(cfg, {
    ask: { fallbackAgent: "free", fallback: "free" },
    answers: [{ keyword: "free", title: "Free", command: ["free-answer"] }]
  })));
  assert.deepEqual(duplicate.filter(r => /^ask:(?:agent-)?fallback$/.test(r.key)).map(r => r.key),
    ["ask:agent-fallback"], "one fallback agent is not offered twice through two routes");
});

test("disabled Nodi-owned actions survive normalization and cannot be activated", () => {
  const row = Rows.normalize({ title: "Ask", actions: [
    { label: "Use Codex", nodi: "askAgent", data: { id: "codex" }, disabled: true, reason: "codex is missing" }
  ] }, { id: "ask", name: "Ask" }, 0, 0);
  const action = plain(Rows.actionsFor(row, {}))[0];
  assert.deepEqual([action.nodi, action.disabled, action.reason], ["askAgent", true, "codex is missing"]);
  assert.equal(Rows.activatable(action), false);
});

test("the rows that ask about the selection or the window say their purpose is ask", () => {
  const idle = { ask: { phase: "idle", question: "", answer: "", model: "haiku" } };
  const rows = plain(run("ask what is this", {
    ...idle, selection: { text: "x", fresh: true, source: "selection" }, window: { stableId: "ab12", title: "Docs", class: "firefox" }
  }));
  const about = rows.filter(r => r.key === "ask:selection" || r.key === "ask:window");
  assert.deepEqual(about.map(r => r.key), ["ask:selection", "ask:window"]);
  assert.deepEqual(about.map(r => r.ask.purpose), ["ask", "ask"]);
});
