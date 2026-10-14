#!/usr/bin/env node

import { readFileSync, renameSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const DISABLED_FEATURES = [
  "apps", "web_search_request", "shell_tool", "unified_exec", "skill_search",
  "hooks", "browser_use", "computer_use", "image_generation", "multi_agent",
  "code_mode_host", "plugins"
];

export function validateStrictConfig(value) {
  const config = value && typeof value === "object" && !Array.isArray(value) ? value : null;
  const features = config && config.features && typeof config.features === "object"
    && !Array.isArray(config.features) ? config.features : null;
  if (!config || !features || config.web_search !== "disabled"
      || config.project_doc_max_bytes !== 0
      || DISABLED_FEATURES.some(name => features[name] !== false)
      || features.skip_host_skill_discovery !== true)
    throw new Error("unsupported strict Codex config");
  if (Object.prototype.hasOwnProperty.call(features, "code_mode")
      || Object.prototype.hasOwnProperty.call(features, "code_mode_only")
      || Object.prototype.hasOwnProperty.call(features, "code_mode_only_strict_3p_tools"))
    throw new Error("Codex code mode must be absent");
  return { disabled: DISABLED_FEATURES.slice(), codeMode: false };
}

export function codexExecutableVersion(command) {
  if (typeof command !== "string" || !command)
    throw new Error("missing selected Codex executable");
  let output;
  try {
    output = execFileSync(command, ["--version"], {
      encoding: "utf8", timeout: 10000, maxBuffer: 4096
    });
  } catch {
    throw new Error("could not read the selected Codex executable version");
  }
  const match = /^codex-cli ([0-9]+\.[0-9]+\.[0-9]+)\n?$/.exec(output);
  if (!match) throw new Error("unsupported selected Codex executable version response");
  return match[1];
}

const TURN_STARTED = [
  '      case "turn/started":',
  "        this.sessionState.currentTurnId = notification.params.turn.id;",
  "        await this.flushPendingErrors();",
  "        return null;"
].join("\n");

const TRUSTED_TURN_STARTED = [
  '      case "turn/started":',
  "        this.sessionState.currentTurnId = notification.params.turn.id;",
  "        await this.flushPendingErrors();",
  '        return { sessionUpdate: "session_info_update", _meta: {',
  "          nodi_codex_turn_started: true,",
  "          nodi_codex_turn_id: notification.params.turn.id",
  "        } };"
].join("\n");

const MCP_STARTED = [
  '      case "mcpToolCall":',
  "        return this.renderer.render(McpToolReporter.started(event.item));"
].join("\n");

const TRUSTED_MCP_STARTED = [
  '      case "mcpToolCall": {',
  "        const update = this.renderer.render(McpToolReporter.started(event.item));",
  "        update._meta = { ...update._meta, nodi_codex_turn_id: event.turnId };",
  "        return update;",
  "      }"
].join("\n");

const MCP_STATUS_METHOD = [
  "  async listMcpServerStatus(params) {",
  '    return await this.sendRequest({ method: "mcpServerStatus/list", params });',
  "  }"
].join("\n");

const TRUSTED_MCP_STATUS_METHOD = MCP_STATUS_METHOD + "\n" + [
  "  async listApps(params) {",
  '    return await this.sendRequest({ method: "app/list", params });',
  "  }"
].join("\n");

const MCP_HTTP_HEADERS = '"http_headers": Object.fromEntries(mcpServer.headers.map((h) => [h.name, h.value]))';
const TRUSTED_MCP_HTTP_HEADERS = MCP_HTTP_HEADERS
  + ',\n            ...(NODI_CODEX_ACTION_SERVER_NAMES.has(mcpServer.name) ? { "tool_timeout_sec": 3600 } : {})';
const MCP_STDIO_ENV = '"env": Object.fromEntries(mcpServer.env.map((env) => [env.name, env.value]))';
const TRUSTED_MCP_STDIO_ENV = MCP_STDIO_ENV
  + ',\n      ...(NODI_CODEX_ACTION_SERVER_NAMES.has(mcpServer.name) ? { "tool_timeout_sec": 3600 } : {})';

const CLIENT_MARKER = [
  "// src/CodexAcpClient.ts",
  'var CUSTOM_GATEWAY_PROVIDER_ID = "custom-gateway";'
].join("\n");

const TRUSTED_CLIENT_MARKER = `// src/CodexAcpClient.ts
var NODI_CODEX_EXECUTABLE_VERSION = __NODI_CODEX_EXECUTABLE_VERSION__;
var NODI_CODEX_ACTION_SERVER_NAMES = new Set();
function nodiCodexRuntimeVersion(userAgent) {
  if (typeof userAgent !== "string") throw new Error("nodi: Codex initialize omitted userAgent");
  const match = /\\/([0-9]+\\.[0-9]+\\.[0-9]+)(?:[ )]|$)/.exec(userAgent);
  if (!match) throw new Error("nodi: unsupported Codex userAgent");
  if (match[1] !== NODI_CODEX_EXECUTABLE_VERSION)
    throw new Error("nodi: Codex app-server version does not match its executable");
  return match[1];
}
async function nodiCatalogPages(read, label) {
  const data = [];
  let cursor = null;
  const seen = new Set();
  for (let page = 0; page < 100; page += 1) {
    const response = await read(cursor);
    if (!response || !Array.isArray(response.data)
        || !(response.nextCursor === null || typeof response.nextCursor === "string"))
      throw new Error("nodi: unsupported Codex " + label + " catalog response");
    data.push(...response.data);
    if (response.nextCursor === null) return data;
    if (!response.nextCursor || seen.has(response.nextCursor))
      throw new Error("nodi: invalid Codex " + label + " catalog cursor");
    seen.add(response.nextCursor);
    cursor = response.nextCursor;
  }
  throw new Error("nodi: Codex " + label + " catalog exceeded 100 pages");
}
var CUSTOM_GATEWAY_PROVIDER_ID = "custom-gateway";`;

const CLIENT_INITIALIZE = [
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
  "  }"
].join("\n");

const TRUSTED_CLIENT_INITIALIZE = CLIENT_INITIALIZE.replace(
  "    this.configPath = response?.codexHome ?? null;",
  "    this.nodiInitializeResponse = response;\n    this.nodiRuntimeVersion = nodiCodexRuntimeVersion(response?.userAgent);\n    this.configPath = response?.codexHome ?? null;"
) + `
  async nodiCatalogs(threadId, cwd, requestedMcpServers) {
    const runtimeVersion = this.nodiRuntimeVersion;
    const requestedServers = (requestedMcpServers || []).map((server) => String(server.name));
    const diagnosticErrors = [];
    let statuses = [];
    let apps = [];
    try {
      statuses = await nodiCatalogPages(
        (cursor) => this.codexClient.listMcpServerStatus({
          cursor, limit: 100, detail: "full", threadId
        }),
        "MCP"
      );
    } catch (error) {
      diagnosticErrors.push("MCP: " + String(error?.message || error));
    }
    try {
      apps = await nodiCatalogPages(
        (cursor) => this.codexClient.listApps({
          cursor, limit: 100, threadId, forceRefetch: false
        }),
        "app"
      );
    } catch (error) {
      diagnosticErrors.push("app: " + String(error?.message || error));
    }
    const servers = [];
    for (const status of statuses) {
      if (!status || typeof status.name !== "string"
          || status.runtimeStatus !== "connected"
          || !status.tools || typeof status.tools !== "object" || Array.isArray(status.tools)
          || status.toolsError !== null) {
        diagnosticErrors.push("MCP: incomplete catalog entry");
        continue;
      }
      servers.push({
        name: status.name,
        source: requestedServers.includes(status.name) ? "session" : "inherited",
        status: status.runtimeStatus,
        tools: Object.keys(status.tools).sort()
      });
    }
    const appIds = [];
    for (const app of apps) {
      if (!app || typeof app.id !== "string") {
        diagnosticErrors.push("app: unsupported catalog entry");
        continue;
      }
      appIds.push(app.id);
    }
    return {
      version: 1,
      adapter: "codex",
      runtimeVersion,
      apps: appIds.sort(),
      requestedServers,
      mcpServers: servers,
      diagnosticErrors
    };
  }`;

const NEW_SESSION = [
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
  "  }"
].join("\n");

const TRUSTED_NEW_SESSION = NEW_SESSION.replace(
  '    logger.log("Starting new session...");',
  `    const nodiActionServer = String(params._meta?.nodiActionServer ?? "");
    for (const server of params.mcpServers ?? []) {
      if (server && server.name === nodiActionServer)
        NODI_CODEX_ACTION_SERVER_NAMES.add(server.name);
    }
    logger.log("Starting new session...");`
).replace(
  "    return {",
  "    const nodiCatalogs = await this.codexAcpClient.nodiCatalogs(sessionId, params.cwd, params.mcpServers ?? []);\n    return {"
).replace(
  "      modes: modeState,",
  "      modes: modeState,\n      _meta: { nodi_runtime_catalogs: nodiCatalogs },"
);

function replaceOnce(source, from, to) {
  const first = source.indexOf(from);
  if (first < 0 || source.indexOf(from, first + from.length) >= 0)
    throw new Error("unsupported Codex ACP source");
  return source.slice(0, first) + to + source.slice(first + from.length);
}

export function patchAdapter(source, executableVersion) {
  if (!/^[0-9]+\.[0-9]+\.[0-9]+$/.test(String(executableVersion || "")))
    throw new Error("missing selected Codex executable version");
  const trustedClientMarker = TRUSTED_CLIENT_MARKER.replace(
    "__NODI_CODEX_EXECUTABLE_VERSION__", JSON.stringify(executableVersion)
  );
  let patched = String(source);
  for (const [from, to] of [
    [TURN_STARTED, TRUSTED_TURN_STARTED],
    [MCP_STARTED, TRUSTED_MCP_STARTED],
    [MCP_STATUS_METHOD, TRUSTED_MCP_STATUS_METHOD],
    [MCP_HTTP_HEADERS, TRUSTED_MCP_HTTP_HEADERS],
    [MCP_STDIO_ENV, TRUSTED_MCP_STDIO_ENV],
    [CLIENT_MARKER, trustedClientMarker],
    [CLIENT_INITIALIZE, TRUSTED_CLIENT_INITIALIZE],
    [NEW_SESSION, TRUSTED_NEW_SESSION]
  ]) patched = replaceOnce(patched, from, to);
  return patched;
}

export function prepareAdapter(root, executableVersion) {
  const sourcePath = join(root, "node_modules", "@agentclientprotocol", "codex-acp", "dist", "index.js");
  const targetPath = join(dirname(sourcePath), "nodi-trusted-index.mjs");
  const patched = patchAdapter(readFileSync(sourcePath, "utf8"), executableVersion);
  try {
    if (readFileSync(targetPath, "utf8") === patched) return targetPath;
  } catch {}
  const temporary = targetPath + "." + process.pid;
  writeFileSync(temporary, patched, { mode: 0o600 });
  renameSync(temporary, targetPath);
  return targetPath;
}

function refreshToken(home) {
  if (!home) return "";
  try {
    const auth = JSON.parse(readFileSync(join(home, "auth.json"), "utf8"));
    return typeof auth?.tokens?.refresh_token === "string"
      ? auth.tokens.refresh_token : "";
  } catch {
    return "";
  }
}

export function copiedRefreshToken(sourceHome, targetHome) {
  if (!sourceHome || !targetHome || resolve(sourceHome) === resolve(targetHome))
    return false;
  const source = refreshToken(sourceHome);
  return !!source && source === refreshToken(targetHome);
}

async function main() {
  const root = process.argv[2];
  if (!root) throw new Error("missing installed Codex ACP directory");
  let config;
  try {
    config = JSON.parse(process.env.CODEX_CONFIG || "");
  } catch {
    throw new Error("invalid strict Codex config");
  }
  validateStrictConfig(config);
  const sourceHome = process.env.CODEX_HOME || join(process.env.HOME || "", ".codex");
  const targetHome = process.env.NODI_CODEX_HOME;
  if (copiedRefreshToken(sourceHome, targetHome))
    throw new Error("the private Codex profile still has a copied one-use sign-in; replace it with: CODEX_HOME="
                    + JSON.stringify(targetHome) + " codex login");
  const executableVersion = codexExecutableVersion(process.env.NODI_CODEX_COMMAND);
  const target = prepareAdapter(resolve(root), executableVersion);
  process.argv = [process.execPath, target, ...process.argv.slice(3)];
  await import(pathToFileURL(target).href);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  main().catch(error => {
    console.error("nodi: could not prepare trusted Codex ACP:", error.message);
    process.exitCode = 1;
  });
