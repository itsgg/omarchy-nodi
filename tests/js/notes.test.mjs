// Notes in one line (ROADMAP 68).
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { load, plain } from "./load.mjs";
import { run, Engine, config, services } from "./fixtures.mjs";

const N = load("providers/notes.js");
const mine = rows => rows.filter(r => r.provider === "notes");

test("note: one dated line added to the notes file, made if missing", () => {
  const row = mine(run("note call the  bank", {}))[0];
  assert.deepEqual([row.title, row.subtitle], ["Note: call the bank", "Adds a dated line to ~/Documents/notes.md"]);
  assert.deepEqual(plain([row.run.args, row.run.text]), [["/home/u/Documents/notes.md"], "call the bank"], "the note in the environment, never an argument");
  const dir = mkdtempSync(join(tmpdir(), "nodi-notes-"));
  try {
    const file = join(dir, "deep/notes.md");
    const add = (f, text) => execFileSync("/usr/bin/bash", ["-c", N.ADD, "nodi", f], { env: { PATH: "/usr/bin", NODI_TEXT: text } });
    add(file, "call the bank");
    add(file, "--not an option");
    const lines = readFileSync(file, "utf8").split("\n");
    assert.match(lines[0], /^- \d{4}-\d{2}-\d{2} \d{2}:\d{2} call the bank$/);
    assert.match(lines[1], /^- \d{4}-\d{2}-\d{2} \d{2}:\d{2} --not an option$/, "a leading dash is text");
    assert.equal(execFileSync("/usr/bin/bash", ["-c", N.READ, "nodi", join(dir, "none.md")]).toString(), "", "no file yet: nothing");
    const bare = join(dir, "bare.md");
    writeFileSync(bare, "no newline at the end");
    add(bare, "next");
    assert.match(readFileSync(bare, "utf8"), /^no newline at the end\n- \d{4}-\d{2}-\d{2} \d{2}:\d{2} next\n$/, "never glued to the last line (Sonnet 2026-10-06)");
  } finally { rmSync(dir, { recursive: true, force: true }); }
  const other = Engine.run("note x", Object.assign({}, config, { notes: { file: "~/notes/inbox.md" } }), services({}));
  assert.equal(mine(other)[0].subtitle, "Adds a dated line to ~/notes/inbox.md", "the file of nodi.json");
});

test("notes: lines that hold every word, the newest first, Enter opening it at its line", () => {
  const notes = N.linesOf("# Notes\n\n- 2026-10-01 09:00 call the bank\n- 2026-10-05 18:20 bank holiday on friday\nplain line about tea\n");
  const rows = mine(run("notes bank", { notes }));
  assert.deepEqual(plain(rows.map(r => [r.title, r.subtitle])), [["bank holiday on friday", "2026-10-05 18:20, line 4"], ["call the bank", "2026-10-01 09:00, line 3"]]);
  assert.deepEqual(plain(rows[0].run.args), ["/home/u/Documents/notes.md", "4"]);
  assert.match(rows[0].preview.text, /call the bank\n- 2026-10-05 18:20 bank holiday/);
  assert.deepEqual(plain(mine(run("notes bank friday", { notes })).map(r => r.title)), ["bank holiday on friday"], "every word");
  assert.equal(mine(run("notes ", { notes })).length, 4, "the last ones, newest first");
  assert.equal(mine(run("notes zzz", { notes }))[0].title, "No note holds \"zzz\"");
  assert.equal(mine(run("notes ", { notes: [] }))[0].title, "No notes yet");
  assert.ok(!run("notes", { notes }).some(r => /^note:\d/.test(r.key)), "the word alone is no mode: an app may be named so");
  assert.deepEqual(plain(N.linesOf("- 2026-10-01 09:00 crlf\r\n").map(l => [l.text, l.date])), [["crlf", "2026-10-01 09:00"]], "CRLF keeps its date");
  const big = N.linesOf("\u0001\ncut start\n- 2026-10-02 10:00 whole");
  assert.deepEqual(plain(big.map(l => [l.text, l.n])), [["whole", 0]], "a big file's cut first line dropped, no line numbers");
  const cutRows = mine(run("notes ", { notes: N.linesOf("\u0001\ncut\n- 2026-10-02 10:00 one\n- 2026-10-02 10:01 two") })).map(r => r.key);
  assert.equal(new Set(cutRows).size, 2, "each its own key");
});
