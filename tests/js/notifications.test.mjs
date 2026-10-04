// The notification history as rows: found by what they said, newest first,
// Enter doing what clicking the toast did.

import { test } from "node:test";
import assert from "node:assert/strict";
import { load, plain } from "./load.mjs";
import { run, top, now } from "./fixtures.mjs";

const N = load("providers/notifications.js");
const at = now().getTime();
const text = [
  JSON.stringify({ app: "omarchy-action", summary: "Process crashed: chromium", body: "Click to diagnose with AI", glyph: "x", execArgv: JSON.stringify(["omarchy-agent-crash", "123"]), timestamp: at - 3600e3 }),
  JSON.stringify({ app: "Nodi", summary: "nodi.json has an error", body: "line 3: expected , or }", glyph: "", execArgv: "", timestamp: at - 60e3 }),
  JSON.stringify({ app: "x", summary: "Bad action", body: "", execArgv: "rm -rf ~", timestamp: at - 120e3 }),
  JSON.stringify({ app: "x", summary: "Dash", body: "", execArgv: JSON.stringify(["-c", "x"]), timestamp: at - 200e3 }),
  "not json",
  JSON.stringify({ app: "x", body: "no summary", timestamp: at })
].join("\n");
const notifications = N.parse(text, true);

test("the history parses, newest first, an action only when it is an argv", () => {
  assert.deepEqual(plain(notifications.map(n => n.summary)), ["nodi.json has an error", "Bad action", "Dash", "Process crashed: chromium"]);
  assert.equal(notifications[2].argv, null, "a program that reads as an option never runs, as in the shell");
  assert.deepEqual(plain(notifications[3].argv), ["omarchy-agent-crash", "123"]);
  assert.equal(notifications[1].argv, null, "a string that is not a JSON argv never runs");
  assert.throws(() => N.parse("", false));
});

test("found by what they said, Enter does what the click did", () => {
  const crash = top("crashed", { notifications });
  assert.equal(crash.title, "Process crashed: chromium");
  assert.equal(crash.subtitle, "omarchy-action, Click to diagnose with AI, 1 h ago");
  assert.deepEqual(plain(crash.run), { kind: "exec", argv: ["omarchy-agent-crash", "123"] });
  const err = top("nodi.json", { notifications });
  assert.deepEqual(plain(err.run), { kind: "copy", text: "nodi.json has an error: line 3: expected , or }" });
  assert.equal(err.actionLabel, "Copy");
  const all = run("notifications", { notifications }).filter(r => r.provider === "notifications");
  assert.deepEqual(plain(all.map(r => r.title)), ["nodi.json has an error", "Bad action", "Dash", "Process crashed: chromium"]);
  assert.ok(!run("lock", { notifications }).some(r => r.provider === "notifications"));
});
