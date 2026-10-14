#!/usr/bin/env node

import { readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

export function builtInTools(effectiveTools, statuses) {
  const mcpTools = new Set((statuses || []).flatMap(server =>
    (server.tools || []).map(tool => "mcp__" + server.name + "__" + tool.name)
  ));
  return (effectiveTools || []).filter(tool => !mcpTools.has(tool)).sort();
}

export function runtimeServer(server, requiredName) {
  const statuses = new Set(["connected", "failed", "needs-auth", "pending", "disabled"]);
  if (!server || typeof server.name !== "string" || !server.name
      || typeof server.source !== "string" || !server.source
      || !statuses.has(server.status))
    throw new Error("nodi: unsupported Claude MCP runtime catalog entry");
  if (requiredName && server.name === requiredName && server.status !== "connected")
    throw new Error("nodi: required action server " + requiredName
                    + " is " + server.status);
  if (server.status === "connected"
      && (!Array.isArray(server.tools)
          || !server.tools.every(tool => tool && typeof tool.name === "string" && tool.name)))
    throw new Error("nodi: Claude MCP server " + server.name
                    + " is connected without a complete tools catalog");
  return {
    name: server.name,
    source: server.source,
    status: server.status,
    tools: server.status === "connected" ? server.tools.map(tool => tool.name).sort() : []
  };
}

export function runtimeServers(servers, requiredName, convert = runtimeServer) {
  const result = servers.map(server => convert(server, requiredName));
  if (requiredName
      && !result.some(server => server.name === requiredName
                               && server.status === "connected"))
    throw new Error("nodi: required action server " + requiredName + " is missing");
  return result;
}

export function requiredActionServer(creationParams) {
  const meta = creationParams?._meta;
  if (!meta || typeof meta !== "object" || Array.isArray(meta)
      || typeof meta.nodiActionServer !== "string")
    throw new Error("nodi: Claude session omitted Nodi session metadata");
  return meta.nodiActionServer;
}

const INIT_CASE = '                            case "init":';
const SESSION_CREATION_PARAMS = "            creationParams: params,";

const TRUSTED_INIT_CASE = `${INIT_CASE}
                                if (!Array.isArray(message.tools)
                                    || !message.tools.every((tool) => typeof tool === "string")
                                    || !Array.isArray(message.mcp_servers)
                                    || typeof message.claude_code_version !== "string"
                                    || !message.claude_code_version) {
                                    throw new Error("nodi: unsupported Claude system/init inventory");
                                }
                                const nodiMcpStatuses = await session.query.mcpServerStatus();
                                if (!Array.isArray(nodiMcpStatuses)) {
                                    throw new Error("nodi: unsupported Claude mcpServerStatus response");
                                }
                                const nodiRequestedServers = (session.creationParams?.mcpServers ?? [])
                                    .map((server) => String(server.name));
                                const nodiRequiredActionServer = ${requiredActionServer.toString()};
                                const nodiActionServer = nodiRequiredActionServer(
                                    session.creationParams);
                                if (nodiActionServer
                                    && !nodiRequestedServers.includes(nodiActionServer)) {
                                    throw new Error("nodi: required Claude action server was not requested");
                                }
                                const nodiInitServers = message.mcp_servers.map((server) => {
                                    if (!server || typeof server.name !== "string"
                                        || typeof server.status !== "string"
                                        || typeof server.source !== "string" || !server.source) {
                                        throw new Error("nodi: Claude system/init omitted MCP provenance");
                                    }
                                    return { name: server.name, status: server.status, source: server.source };
                                });
                                const nodiRuntimeServer = ${runtimeServer.toString()};
                                const nodiRuntimeServers = ${runtimeServers.toString()};
                                const nodiServers = nodiRuntimeServers(
                                    nodiMcpStatuses, nodiActionServer, nodiRuntimeServer);
                                const nodiStatusByName = new Map(nodiServers.map((server) => [server.name, server]));
                                if (nodiInitServers.length !== nodiServers.length
                                    || nodiInitServers.some((server) => {
                                        const status = nodiStatusByName.get(server.name);
                                        return !status || status.source !== server.source;
                                    })) {
                                    throw new Error("nodi: Claude MCP inventories disagree");
                                }
                                const nodiMcpToolNames = new Set(nodiServers.flatMap((server) =>
                                    server.tools.map((tool) => "mcp__" + server.name + "__" + tool)));
                                const nodiBuiltins = message.tools
                                    .filter((tool) => !nodiMcpToolNames.has(tool)).sort();
                                await this.client.sessionUpdate({
                                    sessionId: params.sessionId,
                                    update: {
                                        sessionUpdate: "session_info_update",
                                        _meta: {
                                            nodi_tool_inventory: {
                                                version: 1,
                                                adapter: "claude",
                                                runtimeVersion: message.claude_code_version,
                                                builtins: nodiBuiltins,
                                                effectiveTools: [...message.tools].sort(),
                                                builtinEvidence: "system/init",
                                                apps: [],
                                                appEvidence: "not-exposed-by-Claude",
                                                requestedServers: nodiRequestedServers,
                                                initServers: nodiInitServers,
                                                servers: nodiServers
                                            }
                                        }
                                    }
                                });`;

const CAN_USE_TOOL_SESSION = `    canUseTool(sessionId) {
        return async (toolName, toolInput, { signal, suggestions, toolUseID, agentID, matchedAskRule, blockedPath, decisionReason, title, displayName, description, defaultToNo, suppressAlwaysAllowRule, mcpServer, }) => {
            const session = this.sessions[sessionId];
            if (!session) {
                return {
                    behavior: "deny",
                    message: "Session not found",
                };
            }`;

const TRUSTED_CAN_USE_TOOL_SESSION = `${CAN_USE_TOOL_SESSION}
            let nodiClaudeActionOrigin;
            if (mcpServer) {
                const nodiTurn = session.activeTurn;
                if (typeof toolUseID !== "string" || !toolUseID
                    || !toolInput || typeof toolInput !== "object" || Array.isArray(toolInput)
                    || typeof mcpServer.name !== "string" || !mcpServer.name
                    || typeof mcpServer.source !== "string" || !mcpServer.source
                    || !nodiTurn || nodiTurn.settled || nodiTurn.insertedReported !== true
                    || typeof nodiTurn.promptUuid !== "string" || !nodiTurn.promptUuid) {
                    throw new Error("nodi: unsupported Claude MCP action origin");
                }
                await this.client.sessionUpdate({
                    sessionId,
                    update: {
                        sessionUpdate: "session_info_update",
                        _meta: {
                            nodi_claude_turn_started: true,
                            nodi_claude_turn_id: nodiTurn.promptUuid
                        }
                    }
                });
                nodiClaudeActionOrigin = {
                    version: 1,
                    adapter: "claude",
                    acpSessionId: sessionId,
                    providerTurn: nodiTurn.promptUuid,
                    callId: toolUseID,
                    server: { name: mcpServer.name, source: mcpServer.source },
                    input: toolInput
                };
            }`;

const PERMISSION_META = `            if (mcpServer || (parentToolUseId && !airClient)) {
                presentation.toolCall._meta = {
                    claudeCode: {
                        ...(airClient ? {} : { toolName }),
                        ...(parentToolUseId && !airClient ? { parentToolUseId } : {}),
                        ...(mcpServer ? { mcpServer: { name: mcpServer.name, source: mcpServer.source } } : {}),
                    },
                };
            }`;

const TRUSTED_PERMISSION_META = `${PERMISSION_META}
            if (nodiClaudeActionOrigin) {
                presentation.toolCall._meta = {
                    ...presentation.toolCall._meta,
                    nodi_claude_action_origin: nodiClaudeActionOrigin
                };
            }`;

const ENTRY_IMPORT = 'import { claudeCliPath } from "./acp-agent.js";';
const TRUSTED_ENTRY_IMPORT = 'import { claudeCliPath } from "./nodi-trusted-acp-agent.mjs";';
const ENTRY_SERVE_IMPORT = 'import { serveAcp } from "./serve.js";';
const TRUSTED_ENTRY_SERVE_IMPORT = 'import { serveAcp } from "./nodi-trusted-serve.mjs";';
const SERVE_IMPORT = 'import { v1AgentApp } from "./acp-agent.js";';
const TRUSTED_SERVE_IMPORT = 'import { v1AgentApp } from "./nodi-trusted-acp-agent.mjs";';

function replaceOnce(source, from, to, message) {
  const first = source.indexOf(from);
  if (first < 0 || source.indexOf(from, first + from.length) >= 0)
    throw new Error(message);
  return source.slice(0, first) + to + source.slice(first + from.length);
}

export function patchAgent(source) {
  const params = replaceOnce(String(source), SESSION_CREATION_PARAMS,
                             SESSION_CREATION_PARAMS,
                             "unsupported Claude ACP creation params source");
  const inventory = replaceOnce(params, INIT_CASE, TRUSTED_INIT_CASE,
                                "unsupported Claude ACP source");
  const origin = replaceOnce(inventory, CAN_USE_TOOL_SESSION,
                             TRUSTED_CAN_USE_TOOL_SESSION,
                             "unsupported Claude ACP action origin source");
  return replaceOnce(origin, PERMISSION_META, TRUSTED_PERMISSION_META,
                     "unsupported Claude ACP permission metadata source");
}

export function patchEntry(source) {
  const agent = replaceOnce(String(source), ENTRY_IMPORT, TRUSTED_ENTRY_IMPORT,
                            "unsupported Claude ACP entry");
  return replaceOnce(agent, ENTRY_SERVE_IMPORT, TRUSTED_ENTRY_SERVE_IMPORT,
                     "unsupported Claude ACP entry");
}

export function patchServe(source) {
  return replaceOnce(String(source), SERVE_IMPORT, TRUSTED_SERVE_IMPORT,
                     "unsupported Claude ACP serve");
}

function writeChanged(path, content) {
  try {
    if (readFileSync(path, "utf8") === content) return;
  } catch {}
  const temporary = path + "." + process.pid;
  writeFileSync(temporary, content, { mode: 0o600 });
  renameSync(temporary, path);
}

export function prepareAdapter(root) {
  const dist = join(root, "node_modules", "@agentclientprotocol", "claude-agent-acp", "dist");
  const agentPath = join(dist, "acp-agent.js");
  const entryPath = join(dist, "index.js");
  const servePath = join(dist, "serve.js");
  const trustedAgentPath = join(dist, "nodi-trusted-acp-agent.mjs");
  const trustedServePath = join(dist, "nodi-trusted-serve.mjs");
  const trustedEntryPath = join(dist, "nodi-trusted-index.mjs");
  writeChanged(trustedAgentPath, patchAgent(readFileSync(agentPath, "utf8")));
  writeChanged(trustedServePath, patchServe(readFileSync(servePath, "utf8")));
  writeChanged(trustedEntryPath, patchEntry(readFileSync(entryPath, "utf8")));
  return trustedEntryPath;
}

async function main() {
  const root = process.argv[2];
  if (!root) throw new Error("missing installed Claude ACP directory");
  const target = prepareAdapter(resolve(root));
  process.argv = [process.execPath, target, ...process.argv.slice(3)];
  await import(pathToFileURL(target).href);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  main().catch(error => {
    console.error("nodi: could not prepare trusted Claude ACP:", error.message);
    process.exitCode = 1;
  });
