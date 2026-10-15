// Watched home source trust is explicit, metadata-gated and fail closed.

import { test } from "node:test";
import assert from "node:assert/strict";
import { load, plain } from "./load.mjs";

const Home = load("lib/HomeSources.js");
const source = (more = {}) => Object.assign({
  id: "feed", file: "/run/user/1000/feed.jsonl", title: "Feed", max: 20,
  priority: 0, trustedActions: false
}, more);
const safe = (more = {}) => Object.assign({
  path: "/run/user/1000/feed.jsonl", sameFile: true, regular: true, symlink: false,
  uid: 1000, ownerUid: 1000, mode: 0o600
}, more);

test("display-only sources strip executable actions but keep copy, prompt and safe open actions", () => {
  const got = Home.parse([
    '{"id":"exec","title":"Exec","action":{"exec":["tool","arg"]}}',
    '{"id":"copy","title":"Copy","action":{"copy":"text"}}',
    '{"id":"prompt","title":"Prompt","action":{"query":"find more "}}',
    '{"id":"web","title":"Web","action":{"open":"https://example.test/a"}}',
    '{"id":"file","title":"File","action":{"open":"/tmp/report.txt"}}',
    '{"id":"scheme","title":"Scheme","action":{"open":"custom:payload"}}',
    '{"id":"paste","title":"Paste","action":{"paste":"secret"}}'
  ].join("\n"), source(), safe());
  assert.deepEqual(plain(got.rows.map(r => [r.key, r.run && r.run.kind, r.complete, r.copy])), [
    ["home:feed:id:exec", null, "", ""],
    ["home:feed:id:copy", "copy", "", "text"],
    ["home:feed:id:prompt", null, "find more ", ""],
    ["home:feed:id:web", "open", "", ""],
    ["home:feed:id:file", "open", "", ""],
    ["home:feed:id:scheme", null, "", ""],
    ["home:feed:id:paste", null, "", ""]
  ]);
});

test("trusted executable rows require a regular owned non-symlink file without group/world write", () => {
  const text = '{"id":"run","title":"Run","action":{"exec":["tool","arg"]}}';
  const trusted = source({ trustedActions: true });
  for (const [name, info] of [
    ["relative", safe({ path: "feed.jsonl" })],
    ["symlink", safe({ symlink: true })],
    ["not regular", safe({ regular: false })],
    ["other owner", safe({ uid: 1001 })],
    ["group writable", safe({ mode: 0o620 })],
    ["world writable", safe({ mode: 0o602 })],
    ["missing metadata", null]
  ]) {
    const row = Home.parse(text, trusted, info).rows[0];
    assert.equal(row.run, null, name);
  }
  assert.deepEqual(plain(Home.parse(text, trusted, safe()).rows[0].run), { kind: "exec", argv: ["tool", "arg"] });
});

test("trusted exec actions always require confirmation and show the exact command", () => {
  const trusted = source({ trustedActions: true });
  for (const confirm of ["false", "true", '"DELETE"']) {
    const row = Home.parse('{"id":"run","title":"Run","confirm":' + confirm + ',"action":{"exec":["tool","a b","$(x)"]}}', trusted, safe()).rows[0];
    assert.equal(row.confirm, true);
    assert.equal(row.confirmWord, "");
    assert.equal(row.showsCommand, true);
    assert.equal(row.remember, false, "executable source rows are not replayable");
  }
});

test("secondary executable actions use the same trust gate and forced confirmation", () => {
  const text = JSON.stringify({
    id: "row", title: "Row", actions: [
      { title: "Run it", confirm: false, action: { exec: ["tool", "go"] } },
      { title: "Copy it", action: { copy: "value" } }
    ]
  });
  const untrusted = Home.parse(text, source(), safe()).rows[0];
  assert.deepEqual(plain(untrusted.actions.map(a => [a.label, a.run.kind, a.confirm])), [["Copy it", "copy", false]]);
  const trusted = Home.parse(text, source({ trustedActions: true }), safe()).rows[0];
  assert.deepEqual(plain(trusted.actions.map(a => [a.label, a.run.kind, a.confirm])),
    [["Run it", "exec", true], ["Copy it", "copy", false]]);
  assert.equal(trusted.actions[0].showsCommand, true);
  assert.equal(trusted.remember, false, "a row with any executable action is not replayable");
});

test("a stale snapshot loses every executable capability immediately", () => {
  const got = Home.parse([
    '{"id":"primary","title":"Primary","action":{"exec":["primary-tool"]},"confirm":true}',
    '{"id":"secondary","title":"Secondary","action":{"copy":"safe"},"actions":[{"title":"Run","action":{"exec":["secondary-tool"]}},{"title":"Open","action":{"open":"https://example.com"}}]}'
  ].join("\n"), source({ trustedActions: true }), safe());
  const stale = Home.displayOnly(got);
  assert.equal(stale.rows[0].run, null);
  assert.equal(stale.rows[0].confirm, false);
  assert.equal(stale.rows[0].showsCommand, false);
  assert.equal(stale.rows[0].remember, false);
  assert.equal(stale.rows[1].copy, "safe");
  assert.deepEqual(plain(stale.rows[1].actions.map(a => a.run.kind)), ["open"]);
  assert.equal(stale.rows[1].showsCommand, false);
  assert.equal(stale.rows[1].remember, false);
});

test("unsafe action shapes are stripped through shared normalization and Run validation", () => {
  const trusted = source({ trustedActions: true });
  const rows = Home.parse([
    '{"id":"number","title":"Number","action":{"exec":["tool",1]}}',
    '{"id":"empty","title":"Empty","action":{"exec":[]}}',
    '{"id":"option","title":"Option","action":{"exec":["-rf"]}}',
    '{"id":"object","title":"Object","action":{"exec":{"0":"tool"}}}',
    '{"id":"open","title":"Open","action":{"open":"relative/path"}}',
    '{"id":"unknown","title":"Unknown","action":{"shell":"rm -rf /"}}'
  ].join("\n"), trusted, safe()).rows;
  assert.ok(rows.every(r => r.run === null));
});

test("prototype-pollution keys anywhere in a row reject that row without changing prototypes", () => {
  const before = {}.polluted;
  const text = [
    '{"id":"ok","title":"OK"}',
    '{"id":"bad","title":"Bad","__proto__":{"polluted":true}}',
    '{"id":"nested","title":"Nested","action":{"constructor":{"prototype":{"polluted":true}}}}',
    '{"id":"also","title":"Also","preview":{"prototype":{"polluted":true}}}'
  ].join("\n");
  const got = Home.parse(text, source(), safe());
  assert.deepEqual(plain(got.rows.map(r => r.title)), ["OK"]);
  assert.equal({}.polluted, before);
});

test("deeply nested row data is rejected even when it is in an unused field", () => {
  let nested = "leaf";
  for (let i = 0; i < Home.MAX_DEPTH + 1; i++) nested = { nested };
  const got = Home.parse(JSON.stringify({ id: "deep", title: "Deep", unused: nested }), source(), safe());
  assert.deepEqual(plain(got.rows), []);
});

test("duplicate source-row IDs are deterministic and cannot alias one another", () => {
  const got = Home.parse([
    '{"id":"same","title":"First"}',
    '{"id":"same","title":"Second"}',
    '{"id":"#1","title":"Explicit fallback-looking ID"}'
  ].join("\n"), source(), safe());
  assert.deepEqual(plain(got.rows.map(r => [r.key, r.remember])), [
    ["home:feed:id:same", true],
    ["home:feed:line:1", false],
    ["home:feed:id:%231", true]
  ]);
  assert.equal(new Set(got.rows.map(r => r.key)).size, got.rows.length);
});
