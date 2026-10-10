// Nodi's own reminders (lib/Reminders.js): set by minutes, due by the wall
// clock, one shown late said so, kept in a file of the bar's own; Omarchy's
// reminder held the words in arguments (the marketplace's review,
// 2026-10-10).
import { test } from "node:test";
import assert from "node:assert/strict";
import { load, plain } from "./load.mjs";

const R = load("lib/Reminders.js");
const at = new Date(2026, 8, 23, 14, 0).getTime();
const MIN = 60000;

test("set: due its minutes from now, its words cleaned; out of range or past fifty, none", () => {
  const made = R.add([], 15, "  call\nmom\u0007 ", at, "a");
  assert.deepEqual(plain(made.entry), { id: "a", at: at + 15 * MIN, set: at, message: "call mom" });
  assert.equal(made.list.length, 1);
  assert.equal(R.add([], 0.5, "x", at, "b"), null, "under a minute");
  assert.equal(R.add([], R.MAX_MINUTES + 1, "x", at, "b"), null, "past a week");
  assert.equal(R.add([], "nope", "x", at, "b"), null);
  assert.equal(R.add([], 5, null, at, "c").entry.message, "", "no words: none");
  assert.equal(R.add([], 5, "x".repeat(500), at, "c").entry.message.length, R.MESSAGE_MAX);
  let full = []
  for (let i = 0; i < R.MAX; i++) full = R.add(full, 5, "n" + i, at, "f" + i).list;
  assert.equal(R.add(full, 5, "one more", at, "x"), null, "fifty at most");
  assert.equal(R.add(null, 5, "x", at, "y").list.length, 1);
});

test("due by the wall clock: those whose time came, shown, the rest kept; listed soonest first", () => {
  const l = [{ id: "b", at: at + 40 * MIN, set: at, message: "stretch" }, { id: "a", at: at + 5 * MIN, set: at, message: "tea" }];
  assert.deepEqual(plain(R.due(l, at + 4 * MIN)), { fire: [], keep: plain(l) });
  const d = R.due(l, at + 5 * MIN);
  assert.deepEqual(plain([d.fire.map(r => r.id), d.keep.map(r => r.id)]), [["a"], ["b"]], "at its minute");
  assert.deepEqual(plain(R.due(l, at + 600 * MIN).fire.map(r => r.id)), ["b", "a"], "after a sleep or a restart: every one past");
  assert.deepEqual(plain(R.pending(l).map(r => r.id)), ["a", "b"]);
  assert.deepEqual(plain(R.remove(l, "a").map(r => r.id)), ["b"]);
  assert.deepEqual(plain(R.due(null, at)), { fire: [], keep: [] });
  assert.deepEqual(plain(R.pending(null)), []);
  assert.deepEqual(plain(R.remove(null, "a")), []);
});

test("what a reminder says: in its row, and as its toast, one shown late saying when it was due", () => {
  const r = { id: "a", at: at + 5 * MIN, set: at, message: "tea" };
  assert.deepEqual(plain(R.describe(r, at, true)), { title: "tea", subtitle: "In 5 min, at 14:05" });
  assert.deepEqual(plain(R.describe(r, at + 6 * MIN, false)), { title: "tea", subtitle: "Now, at 2:05 PM" });
  assert.equal(R.describe({ id: "b", at: at + 90 * MIN, set: at, message: "" }, at, true).title, "Reminder", "no words: Reminder");
  assert.equal(R.describe({ id: "b", at: at + 90 * MIN, set: at, message: "" }, at, true).subtitle, "In 1 h 30 min, at 15:30");
  assert.equal(R.describe({ id: "b", at: at + 120 * MIN, set: at, message: "" }, at, true).subtitle, "In 2 h, at 16:00");
  assert.deepEqual(plain(R.toast(r, at + 5 * MIN, true)), { title: "tea", body: "Set at 14:00 for 5 min" });
  assert.deepEqual(plain(R.toast(r, at + 5 * MIN + 30000, true)), { title: "tea", body: "Set at 14:00 for 5 min" }, "under a minute late: on time");
  assert.deepEqual(plain(R.toast(r, at + 95 * MIN, true)), { title: "tea", body: "Due at 14:05, 1 h 30 min ago: the bar was not running then" });
  assert.equal(R.clock(new Date(2026, 8, 23, 0, 7).getTime(), false), "12:07 AM");
  assert.equal(R.clock(new Date(2026, 8, 23, 9, 7).getTime(), true), "09:07");
});

test("kept in its file and read back; anything that is not a reminder left out", () => {
  const l = [{ id: "a", at: at + 5 * MIN, set: at, message: "tea" }];
  assert.deepEqual(plain(R.parse(R.serialize(l))), plain(l));
  assert.equal(JSON.parse(R.serialize(l)).version, 1);
  assert.deepEqual(plain(R.parse(R.serialize(null))), []);
  for (const bad of ["", "nope", "[]", '{"reminders": 3}']) assert.deepEqual(plain(R.parse(bad)), [], bad);
  const mixed = JSON.stringify({ reminders: [null, 3, { id: 1, at: 1, set: 1 }, { id: "x", at: null, set: 1 }, { id: "y", at: "5", set: 1 },
                                            { id: "z", at: Infinity, set: 1 }, { id: "ok", at: 10, set: 5, message: "a\u0000b" }] });
  assert.deepEqual(plain(R.parse(mixed)), [{ id: "ok", at: 10, set: 5, message: "a b" }]);
  const many = JSON.stringify({ reminders: Array.from({ length: 80 }, (_, i) => ({ id: "r" + i, at: i, set: 0 })) });
  assert.equal(R.parse(many).length, R.MAX, "fifty at most, as set");
});

test("a file with an error is said so and never read as none; an empty one is none (Fable 2026-10-10)", () => {
  assert.equal(R.broken(""), "");
  assert.equal(R.broken("  \n"), "");
  assert.equal(R.broken(R.serialize([])), "");
  assert.equal(R.broken('{"version": 1, "reminders": [{"id": "a"}]}'), "", "a list, whatever is in it");
  assert.equal(R.broken('{"reminders": [ {"id": "a", '), "it is not JSON", "half a file");
  assert.equal(R.broken('{"version": 1}'), "it holds no list of reminders");
  assert.equal(R.broken("[1, 2]"), "it holds no list of reminders");
  assert.equal(R.broken("null"), "it holds no list of reminders");
});

test("those set before the file was read are kept with its own, each once, fifty at most (Fable 2026-10-10)", () => {
  const file = [{ id: "a", at: at + 5 * MIN, set: at, message: "tea" }];
  const held = [{ id: "z", at: at + 9 * MIN, set: at, message: "set at the start" }, { id: "a", at: at + 5 * MIN, set: at, message: "tea" }];
  assert.deepEqual(plain(R.merged(file, held).map(r => r.id)), ["a", "z"]);
  assert.deepEqual(plain(R.merged(file, [])), plain(file));
  assert.deepEqual(plain(R.merged(null, null)), []);
  const many = Array.from({ length: 60 }, (_, i) => ({ id: "m" + i, at, set: at, message: "" }));
  assert.equal(R.merged(many, held).length, R.MAX);
});
