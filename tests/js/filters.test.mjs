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
const Rows = load("lib/Rows.js");
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

// A list (ROADMAP 57): read once, found as you type, at root with "root".
const listed = { keyword: "n", title: "Notes", icon: "󰎞", command: [SCRIPT], list: true, root: true };
const runList = (q, f, extra) => Engine.run(q, Object.assign({}, config, { filters: [f || listed] }), services(Object.assign({ filter: read }, extra || {})));

test("a list is read once, with no query, and found as you type under its keyword", () => {
  const asked = [];
  assert.deepEqual(plain(runList("n meet", null, { asked }).map(r => r.title)), ["Meeting notes"]);
  assert.deepEqual(plain(runList("n re", null, { asked }).map(r => r.title)), ["Reading list", "Weekly report"], "the name's start before a word inside it");
  assert.deepEqual(plain(runList("n ", null, { asked }).map(r => r.title)), ["Meeting notes", "Weekly report", "Reading list"], "no words: all, in its order");
  assert.equal(new Set(asked.filter(a => a.startsWith("filter-list:"))).size, 1, "one read for every query");
  assert.ok(!asked.some(a => a.startsWith("filter:")), "no run on a keystroke");
  const argv = F.provider.sources["filter-list"].argv(asked[0].slice("filter-list:".length));
  assert.deepEqual(plain(argv.slice(-1)), [SCRIPT], "no query argument");
  assert.ok(argv.includes("NODI_QUERY=") && argv.includes("NODI_WINDOW_ADDRESS="), "nothing of the query or the window");
});

test("with root, three of a list's rows in any search, ranked as things to open, from the second letter", () => {
  const rows = runList("meeting");
  const m = rows.find(r => r.provider === "filters");
  assert.deepEqual([m.title, m.tier, m.kind, m.group], ["Meeting notes", "prefix", "item", "Notes"]);
  assert.ok(!runList("m").some(r => r.provider === "filters"), "one letter: none");
  assert.ok(!runList("meeting", Object.assign({}, listed, { root: false })).some(r => r.provider === "filters"), "without root: only under its keyword");
  assert.ok(!Engine.run("meeting", cfg, services({ filter: read })).some(r => r.provider === "filters"), "a filter that is no list never runs at root");
  assert.equal(runList("re").filter(r => r.provider === "filters").length, 2);
  assert.deepEqual(plain(runList("n meetng").map(r => r.title)), ["Meeting notes"], "under the keyword, a typo finds it");
  assert.ok(!runList("meetng").some(r => r.provider === "filters"), "at root, clean matches only");
});

test("a row's complete is what Tab fills in, its match more words to find it by", () => {
  const f = { keyword: "x", title: "X" };
  const [a] = F.parse(['{"title": "Kickoff", "match": "meeting agenda", "complete": "x kickoff ", "action": {"open": "https://x.test"}}'].join("\n"), f);
  assert.deepEqual([a.complete, a.match], ["x kickoff ", "meeting agenda"]);
  const n = Rows.normalize(a, { id: "filters", name: "X" }, 0, 0);
  assert.ok(Rows.canComplete(n), "Tab fills it in, Enter opens it");
  const lists = [{ title: "Kickoff", match: "meeting agenda" }, { title: "Retro" }];
  assert.deepEqual(plain(F.named({ keyword: "x" }, lists, "agenda").map(h => [h.row.title, h.tier])), [["Kickoff", "keyword"]], "found by its match");
});

test("refresh and rerun set how long rows stand; rerun rows ask the bar to ask again", () => {
  const age = f => F.provider.sources[f.list ? "filter-list" : "filter"].maxAgeMs(F.paramOf(Object.assign({ keyword: "n", command: ["x"] }, f), "q", {}));
  assert.equal(age({}), 3000, "a filter's rows for a query: 3 s");
  assert.equal(age({ list: true }), 600000, "a list: 10 minutes");
  assert.equal(age({ list: true, refresh: "30m" }), 1800000);
  assert.equal(age({ list: true, refresh: "1s" }), 10000, "10 s at least");
  assert.equal(age({ list: true, refresh: "soon" }), 600000, "what is no duration: the default");
  assert.equal(age({ rerun: "2s" }), 1600, "a little under its pace, so each tick finds it due");
  assert.equal(age({ rerun: "100ms" }), 400, "half a second at least");
  assert.equal(age({ list: true, rerun: "2s" }), 600000, "a list follows its refresh, never rerun (Sonnet 2026-10-06)");
  const src = F.provider.sources;
  assert.deepEqual([!!src["filter-list"].concurrent, !!src["filter-list"].supersede, !!src.filter.supersede], [true, false, true],
                   "a list on a reader of its own, never ended by another read");
  const many = Array.from({ length: 1200 }, (_, i) => JSON.stringify({ title: "row " + i })).join("\n");
  assert.deepEqual([F.parse(many, { keyword: "c" }).length, F.parse(many, { keyword: "c", list: true }).length], [50, 1000], "a list keeps more");
  const live = F.parse('{"title": "CPU 12%"}', { keyword: "c", rerunMs: 2000 })[0];
  assert.equal(Rows.normalize(live, { id: "filters", name: "C" }, 0, 0).liveMs, 2000);
  assert.equal(Rows.normalize({ title: "x", liveMs: 100 }, { id: "p", name: "P" }, 0, 0).liveMs, 0, "under 500 ms: none");
});

// A root list's rows from a stub ctx: what the request holds, as given.
const stubCtx = (got, settings) => ({ settings: settings || [listed], request: () => got, window: null });

test("at root: three at most, by initials too, and a failed refresh keeps its rows", () => {
  const rows = F.parse(["Note one", "Note two", "Note three", "Note four", "Weekly report"].map(t => JSON.stringify({ title: t, id: t })).join("\n"),
                       { keyword: "n", list: true });
  const titles = (q, got, settings) => plain(F.provider.match(q, stubCtx(got, settings)).map(r => r.title));
  assert.deepEqual(titles("note", { state: "ready", value: rows }), ["Note one", "Note two", "Note three"], "three at most");
  assert.deepEqual(titles("wr", { state: "ready", value: rows }), ["Weekly report"], "its initials (Sonnet 2026-10-06)");
  assert.deepEqual(titles("weekly", { state: "error", error: "x", value: rows }), ["Weekly report"], "a failed refresh keeps the rows");
  assert.deepEqual(titles("n weekly", { state: "error", error: "x", value: rows }), ["Weekly report"], "under the keyword too");
  assert.deepEqual(titles("n weekly", { state: "error", error: "boom" }), ["Notes could not answer"], "nothing kept: the error");
  const twice = [listed, Object.assign({}, listed, { title: "Other" })];
  assert.deepEqual(titles("weekly", { state: "ready", value: rows }, twice), ["Weekly report"], "a keyword is its first filter's");
});
