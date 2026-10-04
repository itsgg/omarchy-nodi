// Ask: what a stream-json line means, and the command that holds a session.

import { test } from "node:test";
import assert from "node:assert/strict";
import { load, plain } from "./load.mjs";

const A = load("lib/AskStream.js");

test("a stream-json line, as Ask needs it", () => {
  assert.deepEqual(plain(A.parse('{"type":"system","subtype":"init","tools":[]}')), { kind: "ready" });
  assert.deepEqual(plain(A.parse('{"type":"stream_event","event":{"type":"content_block_delta","delta":{"type":"text_delta","text":"Canb"}}}')), { kind: "text", text: "Canb" });
  assert.deepEqual(plain(A.parse('{"type":"stream_event","event":{"type":"content_block_delta","delta":{"type":"thinking_delta","thinking":"hm"}}}')), { kind: "other" });
  assert.deepEqual(plain(A.parse('{"type":"result","subtype":"success","is_error":false,"result":"Canberra"}')), { kind: "done", text: "Canberra", error: "" });
  assert.equal(A.parse('{"type":"result","subtype":"error_during_execution","is_error":true,"result":"x"}').error, "x");
  assert.deepEqual(plain(A.parse("not json")), { kind: "other" });
});

test("a question is one JSON line; the session has no tools, no MCP, no user settings", () => {
  const m = A.message('say "hi"\nthen go');
  assert.ok(m.endsWith("\n") && m.split("\n").length === 2, "one line");
  assert.equal(JSON.parse(m).message.content, 'say "hi"\nthen go');
  const argv = A.argv("haiku");
  for (const flag of ["--strict-mcp-config", "--no-session-persistence", "--safe-mode"]) assert.ok(argv.includes(flag), flag);
  assert.equal(argv[argv.indexOf("--tools") + 1], "");
  assert.equal(argv[argv.indexOf("--setting-sources") + 1], "local");
  assert.equal(argv[argv.indexOf("--model") + 1], "haiku");
});
