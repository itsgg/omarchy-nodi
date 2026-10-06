// Files (ROADMAP 64): names in any search, contents under `in`, kinds.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { load, plain } from "./load.mjs";
import { run, Engine, config, services } from "./fixtures.mjs";

const F = load("providers/files.js");
const Keys = load("lib/Keys.js");
const files = rows => rows.filter(r => r.provider === "files");
const list = [
  { path: "/home/u/Documents/q4 report.pdf", name: "q4 report.pdf", dir: false },
  { path: "/home/u/Work/report.md", name: "report.md", dir: false },
  { path: "/home/u/Work/old/report-2024.md", name: "report-2024.md", dir: false },
  { path: "/home/u/x/reports", name: "reports", dir: true },
  { path: "/home/u/y/report.txt", name: "report.txt", dir: false }];

test("at root, three files by name from the third letter, every word in the name, guesses under the apps", () => {
  const rows = files(run("report", { found: { q: "report", list } }));
  assert.equal(rows.length, 3, "three at most");
  assert.deepEqual(plain(rows.map(r => [r.kind, r.guess])), [["file", true], ["file", true], ["file", true]]);
  assert.deepEqual(plain(files(run("q4 report", { found: { q: "report", list } })).map(r => r.title)), ["q4 report.pdf"], "by the longest word, every word in the name");
  const asked = [];
  run("re", { asked });
  run("12*8", { asked });
  assert.ok(!asked.some(k => k.startsWith("find")), "two letters or a sum: no search");
  assert.ok(!files(Engine.run("report", Object.assign({}, config, { files: { root: false } }), services({ found: { q: "report", list } }))).length, "root: false");
});

test("a file found keeps the web's searches and Ask under it, and the selection where it was (Sonnet 2026-10-06)", () => {
  const before = run("goldfish", {});
  assert.equal(before[0].provider, "fallback");
  const after = run("goldfish", { found: { q: "goldfish", list: [{ path: "/home/u/my-goldfish.txt", name: "my-goldfish.txt", dir: false }] } });
  assert.ok(after.some(r => r.provider === "files") && after.some(r => r.provider === "fallback"), "the fallbacks stay");
  const at = Keys.reselect({ query: "goldfish", key: before[0].key, index: 0 }, after, "goldfish");
  assert.equal(after[at].key, before[0].key, "the selection holds as the file lands");
});

test("a file is under an app named as well", () => {
  const apps = [{ id: "code", name: "Visual Studio Code", generic: "Text Editor", comment: "", keywords: [], icon: "code", wmclass: "", actions: [] }];
  const rows = run("code", { apps, found: { q: "code", list: [{ path: "/home/u/Learn/code", name: "code", dir: true }] } });
  const app = rows.findIndex(r => r.provider === "apps"), file = rows.findIndex(r => r.provider === "files");
  assert.ok(app !== -1 && file !== -1 && app < file, JSON.stringify(rows.map(r => r.title)));
});

test("find and f by kind; a kind word alone is a name", () => {
  assert.deepEqual(plain(F.kindOf("img cat", true)), { kind: "img", rest: "cat" });
  assert.deepEqual(plain(F.kindOf("doc", true)), { kind: "", rest: "doc" }, "find doc: files named doc");
  assert.deepEqual(plain(F.kindOf("img")), { kind: "img", rest: "" }, "f img: every recent image");
  assert.deepEqual(plain(F.kindOf("dir proj")), { kind: "", rest: "dir proj" }, "recent files are never folders");
  const argv = F.provider.sources.find.argv(F.findParam("img", "cat"), { home: "/home/u" });
  assert.ok(argv.includes("-e") && argv.includes("png") && argv.at(-2) === "cat" && argv.at(-1) === "/home/u");
  assert.deepEqual(plain(F.provider.sources.find.argv(F.findParam("dir", "proj"), { home: "/home/u" }).slice(-5)), ["--type", "d", "--", "proj", "/home/u"]);
  assert.deepEqual(plain(F.provider.sources.find.argv("cat", { home: "/home/u" }).slice(-3)), ["--", "cat", "/home/u"], "no kind: as before");
  const recent = [{ path: "/home/u/a.png", name: "a.png" }, { path: "/home/u/b.pdf", name: "b.pdf" }];
  assert.deepEqual(plain(files(run("f img", { files: recent })).map(r => r.title)), ["a.png"]);
  assert.deepEqual(plain(files(run("f doc b", { files: recent })).map(r => r.title)), ["b.pdf"]);
});

test("in: files that hold the words; never a date's 'in 2 weeks', with any spaces; .env is a word", () => {
  const contents = [{ path: "/home/u/Work/plan.md", line: 12, text: "the budget for Q4" }];
  const rows = files(run("in budget", { contents }));
  assert.deepEqual(plain(rows.map(r => [r.title, r.subtitle])), [["plan.md", "~/Work, line 12: the budget for Q4"]]);
  for (const q of ["in 2 weeks", "in  2 weeks", "in -3d"]) assert.ok(!files(run(q, {})).length, q);
  assert.equal(Engine.mode("in .env", config).label, "In files");
  assert.equal(files(run("in ab", {}))[0].title, "Search inside files", "three letters or more");
  const none = Engine.run("in budget", Object.assign({}, config, { files: { contents: ["relative/dir"] } }), services({}));
  assert.equal(files(none)[0].title, "No folder to search", "nothing for ripgrep to read until its deadline");
  assert.throws(() => F.provider.sources.contents.parse("", false), /took over 2 s/);
});

test("in reads ripgrep's JSON as it is written: any case, the first line, once a file, a newline in a name kept whole", () => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "nodi-in-")));
  try {
    mkdirSync(join(dir, "w"));
    writeFileSync(join(dir, "w/plan.md"), "intro\nThe Budget for q4\nbudget again\n");
    writeFileSync(join(dir, "w/other.md"), "nothing here\n");
    writeFileSync(join(dir, "w/odd\n/etc/passwd"), "budget\n", { flag: "w" });
  } catch (e) { /* a name with a newline may not be made here */ }
  try {
    const argv = F.provider.sources.contents.argv(JSON.stringify({ q: "budget", dirs: [join(dir, "w")] }));
    const out = execFileSync(argv[0], argv.slice(1)).toString();
    const got = plain(F.provider.sources.contents.parse(out, true));
    assert.deepEqual(got.filter(h => h.path.endsWith("plan.md")), [{ path: join(dir, "w/plan.md"), line: 2, text: "The Budget for q4" }]);
    assert.ok(!got.some(h => h.path === "/etc/passwd"), "a name with a newline is never another path");
    const gone = F.provider.sources.contents.argv(JSON.stringify({ q: "budget", dirs: [join(dir, "w"), join(dir, "not-there")] }));
    assert.ok(plain(F.provider.sources.contents.parse(execFileSync(gone[0], gone.slice(1)).toString(), true)).some(h => h.path.endsWith("plan.md")),
              "a folder that is not there is left out, the search goes on (Sonnet 2026-10-06)");
    const miss = F.provider.sources.contents.argv(JSON.stringify({ q: "zzqx-none", dirs: [join(dir, "w"), join(dir, "not-there")] }));
    assert.deepEqual(plain(F.provider.sources.contents.parse(execFileSync(miss[0], miss.slice(1)).toString(), true)), [], "no match is an answer, exit 0");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
