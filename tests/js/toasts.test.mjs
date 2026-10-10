// Nodi's own notices (lib/Toasts.js, shown by components/Toast.qml): a
// title and a body, three at most, each for a few seconds; what a detached
// script carried (Run.js TOAST) read back, anything else refused. Never a
// notification, whose words ride in arguments (the marketplace's review,
// 2026-10-10).
import { test } from "node:test";
import assert from "node:assert/strict";
import { load, plain } from "./load.mjs";

const T = load("lib/Toasts.js");

test("a toast: its title and body cleaned, kept for a few seconds, three at most, the newest last", () => {
  let l = T.add([], "Sync notes failed", "rsync: connection refused", 1000, 1);
  assert.deepEqual(plain(l), [{ id: 1, title: "Sync notes failed", body: "rsync: connection refused", until: 1000 + T.SHOW_MS }]);
  l = T.add(l, "two", "", 1100, 2);
  l = T.add(l, "three", "", 1200, 3);
  l = T.add(l, "four", "", 1300, 4);
  assert.deepEqual(plain(l.map(t => t.id)), [2, 3, 4], "the oldest goes");
  assert.deepEqual(plain(T.add([], "", "", 0, 9)), [], "nothing to say: nothing shown");
  assert.deepEqual(plain(T.add([], "", "only a body", 0, 9).map(t => [t.title, t.body])), [["only a body", ""]], "a body alone is its title");
  const messy = T.add([], "a\u0007title\nsecond line", "one\r\ntwo\n\n\nthree\nfour\u0000", 0, 1)[0];
  assert.deepEqual(plain([messy.title, messy.body]), ["a title", "one\ntwo\nthree"], "control characters as spaces; a title its first line, a body three");
  assert.equal(T.add([], "x".repeat(500), "y".repeat(900), 0, 1)[0].title.length, T.TITLE_MAX);
  assert.equal(T.add([], "x", "y".repeat(900), 0, 1)[0].body.length, T.BODY_MAX);
  assert.equal(T.add(null, "x", null, 0, 1).length, 1);
});

test("a toast ends on time or at a click; the next one's end is when to look again", () => {
  const l = T.add(T.add([], "a", "", 0, 1), "b", "", 2000, 2);
  assert.deepEqual(plain(T.live(l, T.SHOW_MS - 1).map(t => t.id)), [1, 2]);
  assert.deepEqual(plain(T.live(l, T.SHOW_MS).map(t => t.id)), [2], "the first gone at its time");
  assert.deepEqual(plain(T.dismiss(l, 2).map(t => t.id)), [1], "a click takes one");
  assert.equal(T.nextIn(l, 1000), T.SHOW_MS - 1000);
  assert.equal(T.nextIn([{ until: 5 }, { until: 3 }], 10), 0, "past due: at once");
  assert.equal(T.nextIn([{ until: 50 }, { until: 30 }], 10), 20, "the soonest");
  assert.equal(T.nextIn([], 0), -1);
  assert.deepEqual(plain(T.live(null, 0)), []);
  assert.deepEqual(plain(T.dismiss(null, 1)), []);
  assert.equal(T.nextIn(null, 0), -1);
});

test("what a script carried: its JSON's title and body, anything else none", () => {
  assert.deepEqual(plain(T.fromCarried('{"title": "Could not uninstall Foo", "body": "not found"}')), { title: "Could not uninstall Foo", body: "not found" });
  assert.deepEqual(plain(T.fromCarried('{"title": "t"}')), { title: "t", body: "" });
  assert.deepEqual(plain(T.fromCarried('{"title": "t", "body": 3}')), { title: "t", body: "" });
  for (const bad of ["", "nope", "[]", "null", '{"body": "b"}', '{"title": 5}', "3"]) assert.equal(T.fromCarried(bad), null, bad);
});
