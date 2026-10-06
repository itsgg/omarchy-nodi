// Starter rows on a first open (ROADMAP 77).
import { test } from "node:test";
import assert from "node:assert/strict";
import { load, plain } from "./load.mjs";
import { Engine, config, services, run, windows } from "./fixtures.mjs";

const P = load("lib/Prefs.js");
const S = load("lib/Starters.js");
const Rows = load("lib/Rows.js");
// A row the home shows from the history: one with its snapshot.
const ran = provider => ({ n: 1, t: 1790000000000, s: { title: "x", provider, run: { kind: "app", id: "x" } } });
const home = extra => Engine.home(config, services(Object.assign({ history: {}, reminders: [] }, extra)));
const keys = rows => plain(rows.filter(r => r.provider === "starter").map(r => r.key));
const ALL = ["starter:app", "starter:windows", "starter:clipboard", "starter:answers", "starter:actions"];

test("a first open teaches five things, each a row that fills the field in, offered on Ctrl+K too", () => {
  const rows = home({});
  assert.deepEqual(keys(rows), ALL);
  const app = rows.find(r => r.key === "starter:app");
  assert.deepEqual(plain([app.title, app.subtitle, app.complete, app.run, app.copy, app.actionLabel]),
    ["Open an app by its name", "Type firefox, or any app's name", "firefox", null, "", "Try"]);
  assert.equal(rows.find(r => r.key === "starter:actions").badge, "Ctrl K");
  assert.equal(rows.find(r => r.key === "starter:answers").select, true, "the sum comes in selected: typing replaces it");
  // Ctrl+K and a right click offer what Enter does, as on any row whose
  // Enter fills the field in.
  const acts = Rows.actionsFor(app, {});
  assert.deepEqual(plain([acts[0].label, acts[0].nodi, acts[0].own, acts[0].chord]), ["Try", "complete", true, "Enter"]);
  assert.deepEqual(keys(home({ apps: [] })), ALL.slice(1), "no app to name: no app row");
  // A starter for a provider that is off would teach what is not there.
  const off = providers => Engine.home(Object.assign({}, config, { providers }), services({ history: {}, reminders: [] }));
  assert.deepEqual(keys(off(["apps", "units"])), ["starter:app", "starter:answers", "starter:actions"]);
  assert.equal(off(["units"]).find(r => r.key === "starter:answers").complete, "5 km to mi", "the sum's example from what is on");
});

test("what each search reached: windows, clips or an answer leading the list", () => {
  const clip = { clipboard: [{ type: "text", text: "hello world" }] };
  const reached = (q, extra) => S.reachedBy(run(q, extra)[0]);
  assert.deepEqual([reached("w ", { windows }), reached("brave", { windows }), reached("cb ", clip), reached("12*8 + 15%", {}),
                    reached("5 km to mi", {}), reached("100 usd to eur", {})],
                   ["windows", "windows", "clipboard", "answers", "answers", "answers"]);
  // What only says there is nothing reaches nothing; nor does an app.
  assert.deepEqual([reached("w ", { windows: [] }), reached("cb ", { clipboard: [] }), reached("cb clear", { clipboard: [] }),
                    reached("firefox", {}), S.reachedBy(undefined)], ["", "", "", "", ""], "cb clear leads with a control, not a clip");
});

test("each goes once its lesson was reached; all go once the home has five rows", () => {
  let prefs = P.withTried(P.empty(), "windows");
  prefs = P.withTried(prefs, "answers");
  assert.deepEqual(keys(home({ prefs })), ["starter:app", "starter:clipboard", "starter:actions"]);
  assert.deepEqual(keys(home({ history: { "app:firefox": ran("apps") } })), ALL.slice(1), "an app run is in the history");
  assert.deepEqual(keys(home({ prefs: P.withTried(P.empty(), "actions") })), ALL.slice(0, 4), "Ctrl+K opened");
  const pinned = P.toggledPin(P.empty(), "clip:1", { kind: "text", text: "hi" });
  assert.deepEqual(keys(home({ prefs: pinned })), ALL.slice(0, 4), "set on a row before the starters were: Ctrl+K is known");
  const five = {};
  for (let i = 0; i < 5; i++) five["k" + i] = ran("system");
  assert.deepEqual(keys(home({ history: five })), [], "five rows of your own: a home of your own");
  // Launches counted from another launcher's list carry no snapshot: the
  // home shows none of them, so they are not a home (Cursor 2026-10-07).
  const counted = {};
  for (let i = 0; i < 5; i++) counted["app:a" + i] = { n: 3, t: 1790000000000 };
  assert.deepEqual(keys(home({ history: counted })), ALL);
});

test("what was reached is saved, and nothing else is read back as it", () => {
  const saved = P.load(P.serialize(P.withTried(P.empty(), "clipboard")));
  assert.deepEqual(plain(saved.tried), ["clipboard"]);
  assert.equal(P.withTried(saved, "clipboard"), null, "a lesson reached before is not saved again");
  assert.equal(P.withTried(saved, "windows-but-not"), null);
  const hostile = Array.from({ length: 80 }, (_, i) => "kind" + i).concat(["Windows", 3, "windows", "windows", "__proto__"]);
  assert.deepEqual(plain(P.load(JSON.stringify({ tried: hostile })).tried), ["windows"], "a file full of other names blocks nothing");
  assert.deepEqual(plain(P.load("{}").tried), []);
  assert.deepEqual(plain(P.copy(saved).tried), ["clipboard"]);
});
