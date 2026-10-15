// Watched JSONL home sources: bounded parsing, stable identity and merging.

import { test } from "node:test";
import assert from "node:assert/strict";
import { load, plain } from "./load.mjs";
import { Engine, config, services } from "./fixtures.mjs";

const Home = load("lib/HomeSources.js");
const Prefs = load("lib/Prefs.js");
const NOW = Date.parse("2026-10-15T12:00:00Z");
const source = (more = {}) => Object.assign({
  id: "tasks", file: "/run/user/1000/tasks.jsonl", title: "Tasks", max: 4,
  priority: 10, trustedActions: false
}, more);
const safe = { path: "/run/user/1000/tasks.jsonl", regular: true, symlink: false, uid: 1000, ownerUid: 1000, mode: 0o600 };

test("JSONL rows inherit source groups and keep explicit groups, priorities and stable IDs", () => {
  const got = Home.parse([
    '{"id":"one","title":"One","priority":2}',
    '{"id":"two","title":"Two","group":"Due","priority":9}',
    '{"title":"No ID"}'
  ].join("\n"), source(), safe);
  assert.equal(got.valid, true);
  assert.equal(got.error, "");
  assert.deepEqual(plain(got.rows.map(r => [r.key, r.group, r.priority, r.remember])), [
    ["home:tasks:one", "Tasks", 2, true],
    ["home:tasks:two", "Due", 9, true],
    ["home:tasks:#2", "Tasks", 0, false]
  ]);
});

test("invalid row shapes are skipped and source max limits accepted rows", () => {
  const lines = [
    "null", "[]", '"text"', '{"title":""}', '{"title":3}',
    '{"id":"a","title":"A"}', '{"id":"b","title":"B"}', '{"id":"c","title":"C"}'
  ];
  const got = Home.parse(lines.join("\n"), source({ max: 2 }), safe);
  assert.equal(got.valid, true);
  assert.deepEqual(plain(got.rows.map(r => r.title)), ["A", "B"]);
});

test("malformed or incomplete JSONL rejects the snapshot with a diagnostic", () => {
  const got = Home.parse('{"id":"a","title":"A"}\n{"id":"half"', source(), safe);
  assert.equal(got.valid, false);
  assert.deepEqual(plain(got.rows), []);
  assert.match(got.error, /line 2/);
});

test("expired rows are removed at merge time and the earliest future expiry is returned", () => {
  const got = Home.parse([
    '{"id":"old","title":"Old","expires":"2026-10-15T11:59:59Z"}',
    '{"id":"next","title":"Next","expires":"2026-10-15T12:00:05Z"}',
    '{"id":"later","title":"Later","expires":"2026-10-15T12:01:00Z"}',
    '{"id":"bad","title":"Bad date","expires":"tomorrow"}'
  ].join("\n"), source(), safe);
  const merged = Home.merge([{ source: source(), snapshot: got }], NOW);
  assert.deepEqual(plain(merged.rows.map(r => r.title)), ["Next", "Later", "Bad date"]);
  assert.equal(merged.nextExpiry, Date.parse("2026-10-15T12:00:05Z"));
});

test("merge sorts by source priority, row priority, then stable source and file order", () => {
  const low = source({ id: "low", title: "Low", priority: 1, max: 10 });
  const high = source({ id: "high", title: "High", priority: 20, max: 10 });
  const a = Home.parse('{"id":"a","title":"A","priority":50}\n{"id":"b","title":"B","priority":50}', low, safe);
  const b = Home.parse('{"id":"c","title":"C","priority":1}\n{"id":"d","title":"D","priority":9}', high, safe);
  const merged = Home.merge([{ source: low, snapshot: a }, { source: high, snapshot: b }], NOW);
  assert.deepEqual(plain(merged.rows.map(r => r.title)), ["D", "C", "A", "B"]);
});

test("parser and merger enforce explicit byte, line, field, per-source and global bounds", () => {
  assert.equal(Home.parse("x".repeat(Home.MAX_BYTES + 1), source(), safe).valid, false, "file bytes");
  assert.equal(Home.parse('{"title":"' + "x".repeat(Home.MAX_LINE) + '"}', source(), safe).valid, false, "line length");
  const long = Home.parse(JSON.stringify({
    id: "i".repeat(Home.MAX.id + 20), title: "t".repeat(Home.MAX.title + 20),
    subtitle: "s".repeat(Home.MAX.subtitle + 20), group: "g".repeat(Home.MAX.group + 20),
    badge: "b".repeat(Home.MAX.badge + 20)
  }), source(), safe);
  assert.deepEqual(plain([long.rows[0].key.length, long.rows[0].title.length, long.rows[0].subtitle.length,
    long.rows[0].group.length, long.rows[0].badge.length]),
    [("home:tasks:".length + Home.MAX.id), Home.MAX.title, Home.MAX.subtitle, Home.MAX.group, Home.MAX.badge]);
  const many = Array.from({ length: Home.MAX_ROWS_PER_SOURCE + 20 }, (_, i) => JSON.stringify({ id: String(i), title: "R" + i })).join("\n");
  assert.equal(Home.parse(many, source({ max: 100000 }), safe).rows.length, Home.MAX_ROWS_PER_SOURCE);
  const snapshots = Array.from({ length: 8 }, (_, i) => {
    const s = source({ id: "s" + i, max: Home.MAX_ROWS_PER_SOURCE });
    return { source: s, snapshot: Home.parse(many, s, safe) };
  });
  assert.equal(Home.merge(snapshots, NOW).rows.length, Home.MAX_ROWS_GLOBAL);
});

test("actions and previews have bounded nesting, argument counts and argument lengths", () => {
  let deep = { copy: "x" };
  for (let i = 0; i < Home.MAX_DEPTH + 1; i++) deep = { nested: deep };
  const args = Array.from({ length: Home.MAX_ACTION_ARGS + 1 }, () => "x");
  const tooLong = "x".repeat(Home.MAX_ARG + 1);
  const got = Home.parse([
    JSON.stringify({ id: "deep", title: "Deep", action: deep }),
    JSON.stringify({ id: "many", title: "Many", action: { exec: args } }),
    JSON.stringify({ id: "long", title: "Long", action: { exec: ["run", tooLong] } }),
    JSON.stringify({ id: "preview", title: "Preview", preview: { markdown: "m".repeat(Home.MAX.markdown + 20) } })
  ].join("\n"), source({ trustedActions: true, max: 10 }), safe);
  assert.equal(got.valid, true);
  assert.equal(got.rows[0].run, null);
  assert.equal(got.rows[1].run, null);
  assert.equal(got.rows[2].run, null);
  assert.equal(got.rows[3].preview.markdown.length, Home.MAX.markdown);
});

test("home source rows follow immediate context and precede favourites while obeying hidden rows", () => {
  const feed = source({ max: 10 });
  const snapshot = Home.parse('{"id":"one","title":"Watched","action":{"copy":"value"}}', feed, safe);
  const now = services().now().getTime();
  const favourite = {
    key: "app:favourite",
    s: { title: "Favourite", subtitle: "", provider: "apps", run: { kind: "app", id: "favourite" } }
  };
  const prefs = Object.assign(Prefs.empty(), { favourites: [favourite] });
  const rows = Engine.home(config, services({
    history: {}, reminders: [], prefs,
    selection: { text: "fresh text", fresh: true, source: "selection" },
    undo: [{ key: "undo:watched", title: "Undo first", run: { kind: "exec", argv: ["undo-tool"] }, at: now - 1000 }],
    homeSources: [{ source: feed, snapshot }]
  }));
  const keys = rows.map(r => r.key);
  assert.ok(keys.indexOf("undo:watched") < keys.indexOf("home:tasks:one"), "undo stays ahead");
  assert.ok(keys.indexOf("selection:actions") < keys.indexOf("home:tasks:one"), "fresh selection stays ahead");
  assert.ok(keys.indexOf("home:tasks:one") < keys.indexOf("app:favourite"), "watched rows precede favourites");

  const hidden = Prefs.hiddenRow(prefs, "home:tasks:one", { title: "Watched", provider: "home" });
  const without = Engine.home(config, services({
    history: {}, reminders: [], prefs: hidden, homeSources: [{ source: feed, snapshot }]
  }));
  assert.equal(without.some(r => r.key === "home:tasks:one"), false);
});
