import { test } from "node:test";
import assert from "node:assert/strict";
import { load, plain } from "./load.mjs";

const I = load("lib/AskInteraction.js");

test("interaction updates are bound to one process, session, and turn", () => {
  let s = I.create("process-a", "session-a", "turn-a");
  s = I.update(s, "process-a", "session-a", "turn-a", {
    sessionUpdate: "available_commands_update",
    availableCommands: [{ name: "review", description: "Review this" }]
  });
  assert.deepEqual(plain(s.commands), [{ name: "review", description: "Review this", input: null }]);
  assert.equal(I.update(s, "process-b", "session-a", "turn-a", {
    sessionUpdate: "available_commands_update", availableCommands: [{ name: "stale" }]
  }), s, "another process cannot replace commands");
  const nextTurn = I.bind(s, "process-a", "session-a", "turn-b");
  assert.equal(nextTurn.commands.length, 1, "commands live for the session");
  assert.deepEqual(plain(nextTurn.plans), []);
  const nextSession = I.bind(nextTurn, "process-a", "session-b", "turn-c");
  assert.deepEqual(plain(nextSession.commands), []);
});

test("commands and plans are bounded, sanitized, and atomically replaced", () => {
  let s = I.create("p", "s", "t");
  const commands = [];
  for (let n = 0; n < 80; n++) commands.push({
    name: n === 0 ? "../review" : n === 2 ? " spaced " : "cmd-" + n,
    description: "d".repeat(1000),
    input: n === 1 ? { hint: "scope", required: true } : null
  });
  s = I.update(s, "p", "s", "t", { sessionUpdate: "available_commands_update", availableCommands: commands });
  assert.equal(s.commands.length, I.LIMITS.commands);
  assert.equal(s.commands.some(c => c.name === "../review"), false);
  assert.equal(s.commands.some(c => c.name === "spaced"), false,
               "opaque command names are not rewritten");
  assert.deepEqual(plain(s.commands[0].input), { hint: "scope", required: true });
  assert.deepEqual(plain(s.commands[1].input), null);
  s = I.update(s, "p", "s", "t", {
    sessionUpdate: "plan",
    entries: [
      { content: "Inspect", status: "in_progress", priority: "high" },
      { content: "Fix", status: "pending" },
      { content: "x".repeat(5000), status: "unknown" }
    ]
  });
  assert.deepEqual(plain(s.plans.slice(0, 2)), [
    { content: "Inspect", status: "in_progress", priority: "high" },
    { content: "Fix", status: "pending", priority: "" }
  ]);
  assert.equal(s.plans[2].content.length, I.LIMITS.planText);
  assert.equal(s.plans[2].status, "");
});

test("only final _meta.nodi actions for the current turn are retained", () => {
  let s = I.create("p", "s", "t");
  const result = { _meta: { ignored: [{ title: "No" }], nodi: { actions: [
    { title: "Continue", action: { prompt: "/handoff" } },
    { title: "Open", action: { open: "https://example.test" } },
    { title: "Run", action: { exec: ["tool", "--flag"] } },
    { title: "Local", action: { open: "file:///tmp/private" } },
    { title: "Bad", action: { exec: "shell text" } }
  ] } } };
  s = I.finish(s, "p", "s", "t", result);
  assert.deepEqual(plain(s.actions), [
    { title: "Continue", action: { prompt: "/handoff" }, turn: "t" },
    { title: "Open", action: { open: "https://example.test" }, turn: "t" },
    { title: "Run", action: { exec: ["tool", "--flag"] }, turn: "t" }
  ]);
  assert.equal(I.finish(s, "p", "s", "old", result), s);
  const oversized = { _meta: { nodi: {
    actions: [{ title: "No", action: { prompt: "\u0ba4".repeat(I.LIMITS.metadataBytes) } }]
  } } };
  assert.deepEqual(plain(I.finish(s, "p", "s", "t", oversized).actions), [],
                   "metadata is capped in UTF-8 bytes before interpretation");
});

test("elicitation forms accept bounded primitive fields and reject secrets", () => {
  let s = I.create("p", "s", "t");
  s = I.elicit(s, "p", "s", "t", 43, {
    sessionId: "s",
    mode: "form",
    message: "How should this be done?",
    requestedSchema: {
      type: "object",
      required: ["strategy"],
      properties: {
        strategy: { type: "string", title: "Strategy", enum: ["safe", "fast"], default: "safe" },
        notes: { type: "string", title: "Notes", format: "textarea", maxLength: 1000 },
        retries: { type: "integer", minimum: 0, maximum: 9, default: 2 },
        enabled: { type: "boolean", default: true },
        apiToken: { type: "string" }
      }
    }
  });
  assert.equal(s.form.id, 43);
  assert.deepEqual(plain(s.form.fields.map(f => [f.name, f.type, f.value, f.required])), [
    ["strategy", "enum", "safe", true],
    ["notes", "multiline", "", false],
    ["retries", "integer", 2, false],
    ["enabled", "boolean", true, false]
  ]);
  s = I.setField(s, "strategy", "fast");
  s = I.setField(s, "retries", 7);
  const accepted = I.formResult(s, "accept");
  assert.equal(accepted.ok, true);
  assert.deepEqual(plain(accepted.response), {
    action: "accept",
    content: { strategy: "fast", notes: "", retries: 7, enabled: true }
  });
  assert.equal(accepted.state.form, null);
  assert.deepEqual(plain(I.formResult(s, "cancel").response), { action: "cancel" });

  let unsupported = I.create("p", "s", "t");
  unsupported = I.elicit(unsupported, "p", "s", "t", 44, {
    sessionId: "s", mode: "form", message: "Nested",
    requestedSchema: {
      type: "object",
      properties: { nested: { type: "object", title: "Nested settings" } }
    }
  });
  assert.equal(unsupported.form.fields[0].type, "unsupported");
  assert.equal(I.formResult(unsupported, "accept").ok, false);
  assert.equal(I.formResult(unsupported, "cancel").ok, true);

  const secret = I.elicit(I.create("p", "s", "t"), "p", "s", "t", 45, {
    sessionId: "s", mode: "form", message: "Secret",
    requestedSchema: {
      type: "object", required: ["apiToken"],
      properties: { apiToken: { type: "string" } }
    }
  });
  assert.equal(secret.form, null, "a required secret-like field rejects the form");

  const scalar = I.elicit(I.create("p", "s", "t"), "p", "s", "t", 46, {
    sessionId: "s", mode: "form", message: "Scalar",
    requestedSchema: { type: "string" }
  });
  assert.equal(scalar.form, null, "a form must use an object schema");

  for (const schema of [
    { type: "string", title: "Password" },
    { type: "string", format: "password" },
    { type: "string", description: "Your API token" }
  ]) {
    const hidden = I.elicit(I.create("p", "s", "t"), "p", "s", "t", 47, {
      sessionId: "s", mode: "form", message: "Secret",
      requestedSchema: { type: "object", required: ["pw"], properties: { pw: schema } }
    });
    assert.equal(hidden.form, null, "secret semantics reject the field: " + JSON.stringify(schema));
  }

  const properties = {};
  for (let n = 0; n < I.LIMITS.fields + 1; n++)
    properties["field" + n] = { type: "string" };
  const beyond = I.elicit(I.create("p", "s", "t"), "p", "s", "t", 48, {
    sessionId: "s", mode: "form", message: "Many",
    requestedSchema: {
      type: "object", required: ["field" + I.LIMITS.fields], properties
    }
  });
  assert.equal(beyond.form, null, "a required field beyond the display cap cannot be omitted");
});

test("invalid numeric edits cannot silently submit the prior value", () => {
  let state = I.elicit(I.create("p", "s", "t"), "p", "s", "t", 49, {
    sessionId: "s", mode: "form", message: "Count",
    requestedSchema: {
      type: "object", required: ["count"],
      properties: { count: { type: "integer", default: 2 } }
    }
  });
  state = I.setField(state, "count", "not a number");
  assert.equal(state.form.fields[0].value, "not a number");
  assert.equal(I.formResult(state, "accept").ok, false);
});

test("session summaries are bounded and contain no transcript", () => {
  const many = [
    { sessionId: " bad ", title: "Rewritten IDs are unsafe" },
    { sessionId: "s-0", title: "Duplicate" }
  ];
  for (let n = 0; n < 100; n++) many.push({
    sessionId: "s-" + n, title: "Session " + n, cwd: "/work/" + n,
    updatedAt: "2026-10-15T00:00:00Z", transcript: "private"
  });
  const got = I.sessionList({ sessions: many, nextCursor: "next" });
  assert.equal(got.sessions.length, I.LIMITS.sessions);
  assert.deepEqual(Object.keys(got.sessions[0]).sort(), ["cwd", "sessionId", "title", "updatedAt"]);
  assert.equal(got.sessions[0].sessionId, " bad ",
               "opaque session IDs are preserved rather than rewritten");
  assert.equal(got.sessions[1].title, "Duplicate",
               "the first exact duplicate wins");
  assert.equal(got.nextCursor, "next");
});
