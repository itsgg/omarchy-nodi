// Script filters: a program of yours turns what is typed after a keyword
// into rows; what it may say, what Nodi runs, and what shows while it runs.

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { load, root, plain } from "./load.mjs";
import { Engine, config, services } from "./fixtures.mjs";

const F = load("providers/filters.js");
const Run = load("lib/Run.js");
const SCRIPT = join(root, "tests/js/fixtures/filters/notes.sh");
const notes = { keyword: "n", title: "Notes", icon: "󰎞", command: [SCRIPT] };
const cfg = Object.assign({}, config, { filters: [notes] });

// What the bar would read for a query: the provider's own argv run for real,
// its own parse on the output.
function read(p, param) {
  const src = F.provider.sources.filter;
  const argv = src.argv(param);
  let out = "", ok = true;
  try { out = execFileSync(argv[0], argv.slice(1), { env: { PATH: "/usr/bin:/bin" } }).toString(); } catch (e) { ok = false; out = String(e.stdout || ""); }
  return src.parse(out, ok, param);
}
const run = (q, extra) => Engine.run(q, cfg, services(Object.assign({ filter: read }, extra || {})));

test("the program is told of the window you came from, and a run is keyed by it", () => {
  const window = { address: "0x5b8f", class: "foot", title: "vim notes.md", pid: "5438", workspace: "2" };
  assert.deepEqual(plain(run("n window", { window }).map(r => r.title)), ["[0x5b8f]", "[foot]", "[vim notes.md]", "[5438]", "[2]"]);
  assert.deepEqual(plain(run("n window").map(r => r.title)), ["[]", "[]", "[]", "[]", "[]"], "none: each is empty");
  const asked = [];
  run("n meet", { window, asked });
  run("n meet", { window: Object.assign({}, window, { address: "0x77" }), asked });
  assert.equal(new Set(asked.filter(a => a.startsWith("filter:"))).size, 2, "another window is another run");
});

test("a keyword and a space hand the rest to the program, which answers in rows", () => {
  const rows = run("n meet");
  assert.deepEqual(plain(rows.map(r => r.title)), ["Meeting notes"]);
  const r = rows[0];
  assert.equal(r.provider, "filters");
  assert.equal(r.key, "filter:n:id:Meeting notes");
  assert.equal(r.remember, true, "it gave an id");
  assert.deepEqual(plain(r.run), { kind: "exec", argv: ["notes-open", "Meeting notes"] });
  assert.equal(r.preview.markdown, "## Meeting notes\n\nfrom the notes");
  assert.equal(Engine.mode("n meet", cfg).label, "Notes");
  assert.equal(Engine.mode("n meet", cfg).hint, "n <words>");
  assert.deepEqual(plain(run("n ").map(r => r.title)), ["Meeting notes", "Weekly report", "Reading list"], "the empty query too");
  assert.ok(!run("n").some(r => r.provider === "filters"), "the keyword alone is not the filter");
});

test("what it may print: lines that are not rows are skipped; actions map to Nodi's own", () => {
  const f = { keyword: "x", title: "X" };
  const rows = F.parse([
    '{"title": "exec", "action": {"exec": ["a", "b c"]}}',
    '{"title": "open", "action": {"open": "https://x.test/a"}}',
    '{"title": "copy", "action": {"copy": "text"}}',
    '{"title": "paste", "action": {"paste": "hi"}}',
    '{"title": "query", "action": {"query": "x more "}}',
    '{"title": "none"}',
    '[1, 2]', '"string"', 'nope', '{"title": ""}',
    '{"title": "two enters", "confirm": true, "badge": "3", "image": "/a/b.png", "actions": [{"title": "Copy it", "action": {"copy": "c"}}, {"title": "bad"}]}',
    '{"title": "relative image", "image": "a.png"}'
  ].join("\n"), f);
  assert.deepEqual(plain(rows.map(r => r.title)), ["exec", "open", "copy", "paste", "query", "none", "two enters", "relative image"]);
  assert.deepEqual(plain(rows[0].run), { kind: "exec", argv: ["a", "b c"] });
  assert.deepEqual(plain(rows[1].run), { kind: "open", target: "https://x.test/a" });
  assert.deepEqual(plain(rows[2].run), { kind: "copy", text: "text" });
  assert.deepEqual(plain(rows[3].run), { kind: "exec", argv: ["omarchy-menu-emoji-insert", "hi"] });
  assert.equal(rows[4].complete, "x more "); assert.equal(rows[4].run, null);
  assert.equal(rows[5].run, null);
  assert.equal(rows[6].confirm, true); assert.equal(rows[6].badge, "3"); assert.equal(rows[6].image, "/a/b.png");
  assert.deepEqual(plain(rows[6].actions.map(a => a.label)), ["Copy it"]);
  assert.equal(rows[7].image, "", "only an absolute path is a picture");
  assert.equal(rows[0].remember, false, "no id, not remembered");
  assert.equal(F.parse(Array.from({ length: 80 }, (_, i) => '{"title": "r' + i + '"}').join("\n"), f).length, F.LIMIT);
  assert.equal(F.parse('{"title": "' + "t".repeat(500) + '"}', f)[0].title.length, F.MAX.title);
});

test("a run that goes wrong says so; a bad action is no action", () => {
  const broken = Object.assign({}, cfg, { filters: [{ keyword: "b", title: "Broken", command: ["/usr/bin/false"] }] });
  const rows = Engine.run("b x", broken, services({ filter: read }));
  assert.equal(rows[0].title, "Broken could not answer");
  const slow = Object.assign({}, cfg, { filters: [{ keyword: "s", title: "Slow", command: ["/usr/bin/sleep", "5"], timeoutMs: 500 }] });
  assert.match(Engine.run("s x", slow, services({ filter: read }))[0].subtitle, /0.5 s/);
  const silent = Object.assign({}, cfg, { filters: [{ keyword: "q", title: "Quiet", command: ["/usr/bin/true"] }] });
  assert.equal(Engine.run("q x", silent, services({ filter: read }))[0].title, "Nothing from Quiet");
  const evil = Engine.run("n x", cfg, services({ filter: () => [{ key: "filter:n:e", title: "e", run: { kind: "exec", argv: [1] }, score: 97 }] }))[0];
  assert.equal(evil.run, null, "Run.js refuses a malformed run");
});

test("while a run is on its way the rows before stay; the first time, it says it is asking", () => {
  F.shown.n = undefined;
  assert.equal(run("n z", { filter: () => undefined })[0].title, "Asking Notes...");
  run("n meet");
  assert.deepEqual(plain(run("n meeti", { filter: () => undefined }).map(r => r.title)), ["Meeting notes"]);
});

test("the program gets the query as its last argument and NODI_QUERY, under its own deadline", () => {
  const argv = F.provider.sources.filter.argv(JSON.stringify({ keyword: "n", command: ["prog", "--flag"], query: "a b; $(x)", timeoutMs: 3000 }));
  assert.deepEqual(plain(argv), ["/usr/bin/timeout", "-k", "0.5", "3", "/usr/bin/env", "NODI_QUERY=a b; $(x)",
    "NODI_WINDOW_ADDRESS=", "NODI_WINDOW_CLASS=", "NODI_WINDOW_TITLE=", "NODI_WINDOW_PID=", "NODI_WINDOW_WORKSPACE=", "prog", "--flag", "a b; $(x)"]);
  assert.equal(F.provider.sources.filter.supersede, true, "a new keystroke ends the run before it");
  assert.equal(F.provider.sources.filter.sessionPath, true, "the session's PATH, for programs in ~/.local/bin");
});

test("only well-formed filters count", () => {
  assert.equal(F.list([{ keyword: "a b", command: ["x"] }, { keyword: "a", command: "x" }, { keyword: "a", command: [] },
                       { keyword: "a", command: [""] }, { keyword: "a", command: ["x", 1] }, { keyword: "ok", command: ["x"] }, null]).length, 1);
  assert.equal(F.list(undefined).length, 0);
  assert.equal(F.list([{ keyword: "a", command: ["FOO=1", "prog"] }, { keyword: "b", command: ["-i", "prog"] }]).length, 0, "nothing env would read as its own");
});

test("rows keep distinct keys: by id, else by place", () => {
  const rows = F.parse(['{"title": "Same"}', '{"title": "Same"}', '{"title": "x", "id": "Same"}'].join("\n"), { keyword: "k" });
  assert.deepEqual(plain(rows.map(r => r.key)), ["filter:k:#0:Same", "filter:k:#1:Same", "filter:k:id:Same"]);
});

test("a program that ignores TERM is ended when a newer keystroke replaces it", async () => {
  const { spawn } = await import("node:child_process");
  const { mkdtempSync, existsSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const Sources = load("lib/Sources.js");
  const dir = mkdtempSync(join(tmpdir(), "nodi-filter-"));
  const p = { keyword: "s", command: ["/usr/bin/bash", "-c", 'trap "" TERM; sleep 1.5; : > "$0/survived"', dir], query: "q", timeoutMs: 3000 };
  const argv = Sources.limited(F.provider.sources.filter.argv(JSON.stringify(p)), 10000, 1048576);
  const wrapper = spawn(argv[0], argv.slice(1), { stdio: "ignore" });
  await new Promise(r => setTimeout(r, 300));
  // What components/Reader.qml cancel() sends: TERM to the wrapper's
  // children, every 50 ms until the read has ended.
  let ended = false;
  wrapper.on("exit", () => { ended = true; });
  while (!ended) {
    spawn("/usr/bin/pkill", ["-TERM", "-P", String(wrapper.pid)]);
    await new Promise(r => setTimeout(r, 50));
  }
  await new Promise(r => setTimeout(r, 2200));
  assert.equal(existsSync(join(dir, "survived")), false, "it was killed before it could finish");
});
