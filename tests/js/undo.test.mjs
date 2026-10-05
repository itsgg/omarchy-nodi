// Undo (lib/Undo.js): what an undoable action's output names, how long it
// is offered, where its row shows, and which rows and actions can be undone.
// components/Undoer.qml itself is tested in Quickshell (tests/qml/UndoerTest.qml).

import { test } from "node:test";
import assert from "node:assert/strict";
import { load, plain } from "./load.mjs";
import { Engine, config, services } from "./fixtures.mjs";

const U = load("lib/Undo.js");
const Run = load("lib/Run.js");
const Rows = load("lib/Rows.js");
const History = load("lib/History.js");
const F = load("providers/filters.js");

test("the last line of JSON names the undo; anything else names none", () => {
  const u = plain(U.parse('sent 3\n{"undo": {"exec": ["mailer", "recall", "42"], "title": "Recall the report"}}\n\n', "Send the report"));
  assert.deepEqual(u, { title: "Recall the report", run: { kind: "exec", argv: ["mailer", "recall", "42"] } });
  assert.equal(U.parse('{"undo": {"exec": ["mailer", "recall"]}}', "Send the report").title, "Undo Send the report", "no title: Undo and the action's");
  assert.equal(U.parse('{"undo": {"exec": ["a"]}}\ndone', "x"), null, "only the last line counts");
  for (const bad of ['{"undo": {"exec": []}}', '{"undo": {"exec": ["", "x"]}}', '{"undo": {"exec": [1]}}', '{"undo": {"shell": "rm -rf ~"}}',
                     '{"undo": "mailer recall"}', "not json", "{broken", ""])
    assert.equal(U.parse(bad, "x"), null, bad);
});

test("an undo is offered for ten minutes, newest first, Enter twice", () => {
  const now = 1_000_000_000;
  const entries = [
    { key: "undo:1", title: "Undo moving notes", run: Run.exec(["mv", "b", "a"]), at: now - 11 * 60000 },
    { key: "undo:2", title: "Recall the report", run: Run.exec(["mailer", "recall"]), at: now - 3 * 60000 },
    { key: "undo:3", title: "Undo archiving", run: Run.exec(["mailer", "unarchive"]), at: now - 10000 }
  ];
  assert.deepEqual(plain(U.live(entries, now).map(e => e.key)), ["undo:2", "undo:3"]);
  const rows = U.rows(entries, now);
  assert.deepEqual(plain(rows.map(r => [r.title, r.subtitle])), [["Undo archiving", "Just now, Enter twice undoes it"], ["Recall the report", "3 minutes ago, Enter twice undoes it"]]);
  assert.ok(rows.every(r => r.confirm && r.nodi === "undo" && !r.remember && r.group === "Undo"));
});

test("the empty bar opens on them, above favourites; a query finds one by its title or by undo", () => {
  const now = services().now().getTime();    // the fixtures' clock
  const undo = [{ key: "undo:1", title: "Recall the report", run: Run.exec(["mailer", "recall"]), at: now - 60000 }];
  const fav = { key: "apps:firefox.desktop", s: { run: Run.app("firefox"), title: "Firefox", provider: "apps" } };
  const prefs = Object.assign(load("lib/Prefs.js").empty(), { favourites: [fav] });
  const home = Engine.run("", config, services({ undo, prefs }));
  assert.deepEqual(plain(home.slice(0, 2).map(r => r.title)), ["Recall the report", "Firefox"]);
  assert.equal(home[0].section, "", "one undo has no header of its own");
  assert.equal(Engine.run("undo", config, services({ undo }))[0].title, "Recall the report");
  assert.equal(Engine.run("recall", config, services({ undo }))[0].title, "Recall the report");
  assert.ok(!Engine.run("undo", config, services({ undo: [] })).some(r => r.provider === "undo"));
});

test("an exec row or action can be undoable, kept in its snapshot; a script filter's line says so", () => {
  const P = { id: "t", name: "T" };
  assert.equal(Rows.normalize({ title: "x", run: Run.exec(["a"]), undoable: true }, P, 0, 0).undoable, true);
  assert.equal(Rows.normalize({ title: "x", run: Run.open("https://x.test"), undoable: true }, P, 0, 0).undoable, false, "only what Nodi can read the output of");
  assert.equal(Rows.normalize({ title: "x", undoable: true }, P, 0, 0).undoable, false);
  const row = Rows.normalize({ title: "Send", run: Run.exec(["mailer", "send"]), undoable: true,
    actions: [{ label: "Archive", run: Run.exec(["mailer", "archive"]), undoable: true }] }, P, 0, 0);
  assert.deepEqual(plain(Rows.actionsFor(row, null).map(a => [a.label, a.undoable])).slice(0, 2), [["Run", true], ["Archive", true]]);
  assert.equal(History.snapshot(row).undoable, true);
  const parsed = F.parse(JSON.stringify({ title: "Send", action: { exec: ["mailer", "send"] }, undoable: true,
    actions: [{ title: "Archive", action: { exec: ["mailer", "archive"] }, undoable: true }, { title: "Open", action: { open: "https://x.test" }, undoable: true }] }),
    { keyword: "m", title: "Mail", icon: "" }).map(r => Rows.normalize(r, P, 0, 0))[0];
  assert.equal(parsed.undoable, true);
  assert.deepEqual(plain(parsed.actions.map(a => [a.label, a.undoable])), [["Archive", true], ["Open", false]]);
});
