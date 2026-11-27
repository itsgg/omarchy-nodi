// Which of the open's forking probes are due (lib/Probes.js).

import { test } from "node:test";
import assert from "node:assert/strict";
import { load } from "./load.mjs";

const P = load("lib/Probes.js");
const MIN = 60 * 1000;

test("a probe never made, or made before the clock went back, is due", () => {
  assert.equal(P.due(0, 1000, P.FRESH_MS), true);
  assert.equal(P.due(5000, 1000, P.FRESH_MS), true);
});

test("a toggle read seconds old is the open's own; an older one is read again", () => {
  const at = 1_000_000;
  assert.equal(P.due(at, at + 1000, P.FRESH_MS), false);
  assert.equal(P.due(at, at + P.FRESH_MS, P.FRESH_MS), true);
  assert.ok(P.FRESH_MS >= 1000 && P.FRESH_MS <= 10000, "a few seconds");
});

test("the agents are kept until their programs or the PATH change, or ten minutes pass", () => {
  const seen = { at: 1_000_000, key: "codex\n/usr/bin" };
  assert.equal(P.agentsDue(null, seen.at, seen.key), true, "never looked for");
  assert.equal(P.agentsDue(seen, seen.at + 5 * MIN, seen.key), false, "five minutes on, the same programs");
  assert.equal(P.agentsDue(seen, seen.at + 1000, "claude\n/usr/bin"), true, "another program asked for");
  assert.equal(P.agentsDue(seen, seen.at + 1000, "codex\n/usr/bin:/opt/bin"), true, "another PATH");
  assert.equal(P.agentsDue(seen, seen.at + P.AGENTS_MAX_AGE_MS, seen.key), true, "ten minutes on");
});

test("the themes wait ten minutes at most for one added", () => {
  assert.equal(P.due(1, 1 + 9 * MIN, P.THEMES_MAX_AGE_MS), false);
  assert.equal(P.due(1, 1 + 10 * MIN, P.THEMES_MAX_AGE_MS), true);
});

test("an Ask failing as a missing program does sends the agents to be looked for", () => {
  for (const e of ["Codex could not start", "bash: codex: command not found", "env: 'claude': No such file or directory",
                   "Claude stopped: codex-acp is not installed", "Codex stopped: exit 127", "spawn ENOENT"])
    assert.equal(P.suggestsMissing(e), true, e);
  for (const e of ["", null, "Claude stopped: exit 1", "rate limited", "The agent declined"])
    assert.equal(P.suggestsMissing(e), false, String(e));
});
