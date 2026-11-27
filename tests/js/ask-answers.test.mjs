// What the agent's answers to Nodi's requests decide (lib/AskAnswers.js).

import { test } from "node:test";
import assert from "node:assert/strict";
import { load, plain } from "./load.mjs";

const N = load("lib/AskAnswers.js");
const Acp = load("lib/Acp.js");

test("an error's reason is its message, else its code", () => {
  assert.equal(N.why({ error: { message: "no credits", code: 1 } }), "no credits");
  assert.equal(N.why({ error: { code: -32603 } }), "error -32603");
  assert.equal(N.why({ result: {} }), "");
});

test("each request's failure is said in its own words", () => {
  assert.equal(N.failure("init", "x", "Claude"), "Claude did not start: x");
  assert.equal(N.failure("session", "", "Claude"), "Claude could not start a session: no session");
  assert.equal(N.failure("close:resume", "x", "Codex"), "Codex could not close the current session: x");
  assert.equal(N.failure("resume", "x", "Codex"), "Codex could not resume the session: x");
  assert.equal(N.failure("config:model", "x", "Codex"), "Codex could not set its model: x");
  assert.equal(N.failure("auth", "x", "Gemini", ": run gemini in a terminal"), "Signing in to Gemini failed: x: run gemini in a terminal");
});

test("a start goes on only with the ACP version Nodi speaks", () => {
  const ok = N.started({ result: { protocolVersion: Acp.VERSION, agentInfo: { name: "fake" } } }, "Agent");
  assert.equal(ok.caps.version, Acp.VERSION);
  assert.equal(ok.caps.name, "fake");
  assert.equal(N.started({ result: { protocolVersion: 2 } }, "Agent").fail, "Agent speaks ACP 2; Nodi speaks " + Acp.VERSION);
  assert.equal(N.started({ error: { message: "boom" } }, "Agent").fail, "Agent did not start: boom");
});

test("a session is opened, asks for a sign-in, or fails", () => {
  assert.deepEqual(plain(N.opened({ result: { sessionId: "s1" } }, "A")), { sessionId: "s1" });
  assert.deepEqual(plain(N.opened({ error: { code: Acp.AUTH_REQUIRED, message: "" } }, "A")), { signIn: "error " + Acp.AUTH_REQUIRED });
  assert.deepEqual(plain(N.opened({ error: { code: Acp.AUTH_REQUIRED, message: "login" } }, "A")), { signIn: "login" });
  assert.equal(N.opened({ result: { sessionId: 4 } }, "A").fail, "A could not start a session: no session");
  assert.equal(N.opened({ error: { code: 1, message: "x" } }, "A").fail, "A could not start a session: x");
});

test("a turn ends with the answer, its stop reason and what was refused", () => {
  const t = (over = {}) => ({ answer: "Done.", refused: [], answerMax: 1000, proposal: null, ...over });
  assert.deepEqual(plain(N.ended({ result: { stopReason: "end_turn" } }, t())), { answer: "Done.", phase: "done" });
  assert.equal(N.ended({ result: {} }, t({ proposal: {} })).phase, "proposing");
  assert.equal(N.ended({ result: { stopReason: "max_tokens" } }, t()).answer, "Done.\n\n(The answer reached its length limit)");
  assert.deepEqual(plain(N.ended({ result: { stopReason: "refusal" } }, t({ answer: "" }))), { fail: "The agent refused to answer" });
  assert.match(N.ended({ result: {} }, t({ refused: ["touch"] })).answer, /Refused: touch/);
  assert.deepEqual(plain(N.ended({ error: { message: "Internal error" } }, t({ answer: "  out of credits\nmore" }))), { fail: "out of credits" });
  assert.deepEqual(plain(N.ended({ error: { message: "Internal error" } }, t({ answer: " " }))), { fail: "Internal error" });
});
