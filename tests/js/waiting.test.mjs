// Rows.waiting: the row a provider shows while its read has given nothing,
// with the read's error once it has failed.

import { test } from "node:test";
import assert from "node:assert/strict";
import { load, plain } from "./load.mjs";
import { run } from "./fixtures.mjs";

const Rows = load("lib/Rows.js");

test("a failed read says why; one still running says it is reading", () => {
  assert.deepEqual(plain(Rows.waiting({ state: "pending" }, "Reading ports...", "Could not read ports", { subtitle: "Ports" })),
    { score: 40, copy: "", remember: false, subtitle: "Ports", title: "Reading ports..." });
  const failed = Rows.waiting({ state: "error", error: "ss: command not found" }, "Reading ports...", "Could not read ports", { subtitle: "Ports", icon: "x" });
  assert.equal(failed.title, "Could not read ports");
  assert.equal(failed.subtitle, "ss: command not found");
  assert.equal(failed.icon, "x");
  assert.equal(Rows.waiting({ state: "error", error: "" }, "r", "f", { subtitle: "Ports" }).subtitle, "Ports", "no error text: the subtitle stands");
  assert.ok(Rows.waiting({ state: "error", error: "x".repeat(500) }, "r", "f").subtitle.length <= 160);
});

test("the providers' status rows carry the error", () => {
  const failed = { ports: "lsof failed", services: "systemctl: bus gone", processes: "ps died", fonts: "fc-list missing",
                   "power-profiles": "no daemon", keybindings: "no records", "browser-history": "locked", "notes-file": "denied",
                   "agent-usage": "bad json", "agent-sessions": "hyprctl gone" };
  for (const [q, want] of [["ports", "lsof failed"], ["services", "systemctl: bus gone"], ["kill ", "ps died"], ["fonts", "fc-list missing"],
                           ["power", "no daemon"], ["h github", "locked"], ["usage", "bad json"]]) {
    const rows = run(q, { failed, processes: undefined });
    assert.ok(rows.some(r => r.subtitle === want), q + ": " + JSON.stringify(rows.slice(0, 3).map(r => [r.title, r.subtitle])));
  }
});
