// What `nodi mcp` may run (lib/NodiMcp.js).

import { test } from "node:test";
import assert from "node:assert/strict";
import { load, plain } from "./load.mjs";

const M = load("lib/NodiMcp.js");
const Prefs = load("lib/Prefs.js");

const app = key => ({ key, title: "T " + key, subtitle: "", kind: "App", provider: "apps", run: { kind: "app", id: key } });

test("a search's rows are kept ten minutes, the last 64", () => {
  let kept = M.keepFound({}, [], [app("a"), app("b")], 1000);
  assert.deepEqual(plain(kept.order), ["a", "b"]);
  assert.equal(M.foundRow(kept.rows, "a", 1000 + M.FOUND_MS - 1).key, "a");
  assert.equal(M.foundRow(kept.rows, "a", 1000 + M.FOUND_MS), null);
  kept = M.keepFound(kept.rows, kept.order, [app("a")], 5000);
  assert.deepEqual(plain(kept.order), ["a", "b"], "found again keeps its place");
  assert.equal(kept.rows.a.at, 5000);
  const many = Array.from({ length: 70 }, (_, i) => app("r" + i));
  kept = M.keepFound(kept.rows, kept.order, many, 6000);
  assert.equal(kept.order.length, 64);
  assert.equal(Object.keys(kept.rows).length, 64);
  assert.equal(kept.rows.a, undefined);
});

test("a search answers each row with what it runs, on one line", () => {
  const rows = [{ ...app("x"), confirm: true, risk: "it deletes" }];
  const reply = JSON.parse(M.searchReply(rows));
  assert.equal(reply[0].asks, "a second Enter");
  assert.equal(reply[0].risk, "it deletes");
  assert.equal(typeof reply[0].command, "string");
  assert.equal(M.oneLine(" a\n\n b "), "a b");
  assert.equal(M.oneLine("x".repeat(400)).length, 300);
  assert.equal(M.agentData({ confirmWord: "yes" }).asks, "a typed word");
});

test("a key runs the found row for an agent, else the saved one as its provider gives it now", () => {
  const found = M.keepFound({}, [], [{ ...app("f"), remember: false }], 0).rows;
  const none = () => null;
  assert.deepEqual(plain(M.keySnapshot("f", true, found, Prefs.empty(), {}, 1, none)).remember, false);
  assert.equal(M.keySnapshot("f", false, found, Prefs.empty(), {}, 1, none), null, "a hotkey never runs a found row");
  const history = { h: { n: 1, t: 0, s: { run: { kind: "app", id: "h" }, confirm: false } } };
  let asked = 0;
  const live = M.keySnapshot("h", false, {}, Prefs.empty(), history, 1, (key, saved) => { asked++; return { ...app("h"), run: { kind: "app", id: "h2" } } });
  assert.equal(asked, 1);
  assert.deepEqual(plain(live.s.run), { kind: "app", id: "h2" });
  assert.equal(live.remember, true);
  assert.equal(M.keySnapshot("h", false, {}, Prefs.empty(), history, 1, none).s.run.id, "h");
});

test("a shown row is kept once, the last eight, and taken once", () => {
  const shown = {};
  let order = [];
  for (let i = 0; i < 10; i++) order = M.keepShown(shown, order, "k" + i, { s: { run: {} } });
  assert.deepEqual(plain(order), ["k2", "k3", "k4", "k5", "k6", "k7", "k8", "k9"]);
  assert.equal(shown.k0, undefined);
  order = M.keepShown(shown, order, "w", { s: { run: {}, confirmWord: "yes" } });
  assert.equal(shown.w, undefined, "one asking for a typed word is not kept for a run");
  const taken = M.takeShown(shown, order, "k9");
  assert.ok(taken.a);
  assert.equal(shown.k9, undefined);
  assert.equal(taken.order.includes("k9"), false);
  assert.equal(M.takeShown(shown, taken.order, "k9"), null);
  assert.deepEqual(JSON.parse(M.describeReply("k", { title: "T", run: { kind: "copy", text: "x" }, confirm: true })).asks, "a second Enter");
});

test("a key's run is refused by the first rule it breaks", () => {
  const plan = (s, o = {}) => plain(M.runPlan({ key: o.key || "app:x", a: s ? { s, remember: true } : null, confirmed: false, agent: false,
    proposed: false, homeCurrent: () => true, appAction: () => null, ...o }));
  const run = { kind: "copy", text: "hi" };
  assert.deepEqual(plan(null), { refusal: "unknown row" });
  assert.ok(plan({ run, provider: "apps" }).argv.command, "a copy runs as a command and its environment");
  assert.equal(plan({ run, provider: "apps" }).remember, true);
  assert.match(plan({ run, provider: "shell" }, { key: "shell:rm", agent: true }).refusal, /command line/);
  assert.equal(plan({ run, provider: "shell" }, { key: "shell:rm", agent: true, proposed: true }).refusal, undefined, "proposed, he saw it");
  assert.deepEqual(plan({ run, provider: "home" }, { homeCurrent: () => false }), { refusal: "watched row is no longer current" });
  assert.deepEqual(plan({ run: { kind: "nothing" } }), { refusal: "unknown row" });
  assert.match(plan({ run, confirmWord: "yes", confirm: true }, { confirmed: true }).refusal, /typed word/);
  assert.match(plan({ run, confirm: true }).refusal, /asks before it runs/);
  assert.equal(plan({ run, confirm: true }, { confirmed: true }).refusal, undefined);
});
