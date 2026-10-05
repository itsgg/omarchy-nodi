// Answers that stream (providers/answers.js): what Enter starts, which rows
// each phase shows, when the pane shows the answer, and Escape stopping it.
// components/Answer.qml itself is tested in Quickshell (tests/qml/AnswerTest.qml).

import { test } from "node:test";
import assert from "node:assert/strict";
import { load, plain } from "./load.mjs";
import { Engine, config, services } from "./fixtures.mjs";

const A = load("providers/answers.js");
const Keys = load("lib/Keys.js");
const Pane = load("lib/Pane.js");

const helper = { keyword: "a", title: "Assistant", icon: "󰚩", command: ["my-ask", "--markdown"] };
const cfg = Object.assign({}, config, { answers: [helper] });
const run = (q, answer) => Engine.run(q, cfg, services(answer ? { answer } : {}));
const window = { address: "0x5b8f", class: "foot", title: "vim", pid: "5438", workspace: "2" };

test("Enter's run: the question last and as NODI_QUERY, the window as NODI_WINDOW_*, two minutes by default", () => {
  const s = plain(A.spec("a  why is it slow ", [helper], window));
  assert.deepEqual(s.argv, ["/usr/bin/env", "NODI_QUERY=why is it slow", "NODI_WINDOW_ADDRESS=0x5b8f", "NODI_WINDOW_CLASS=foot",
    "NODI_WINDOW_TITLE=vim", "NODI_WINDOW_PID=5438", "NODI_WINDOW_WORKSPACE=2", "my-ask", "--markdown", "why is it slow"]);
  assert.deepEqual([s.keyword, s.title, s.question, s.timeoutMs], ["a", "Assistant", "why is it slow", 120000]);
  assert.equal(A.spec("a q", [Object.assign({}, helper, { timeoutMs: 9e9 })]).timeoutMs, 600000, "ten minutes at most");
  assert.equal(A.spec("a q", [Object.assign({}, helper, { timeoutMs: 10 })]).timeoutMs, 1000);
  assert.equal(A.spec("a ", [helper]), null, "no question, no run");
  assert.equal(A.spec("b q", [helper]), null);
  assert.equal(A.spec("a q", [Object.assign({}, helper, { command: ["X=1", "sh"] })]), null, "a command env(1) would misread is refused, as a filter's is");
});

test("typing asks nothing; Enter on the one row asks", () => {
  const rows = run("a why is it slow");
  assert.deepEqual(plain(rows.map(r => [r.title, r.nodi, r.provider])), [["Assistant: why is it slow", "answer", "answers"]]);
  assert.equal(rows[0].run, null, "the row itself runs nothing");
  assert.equal(run("a ")[0].hint, "a <question>");
  assert.deepEqual(plain(Engine.mode("a q", cfg)), { label: "Assistant", icon: "󰚩", hint: "a <question>" });
});

test("each phase of an answer, for the question it answers; another question is asked anew", () => {
  const st = (phase, extra) => Object.assign({ phase, keyword: "a", question: "q", text: "", error: "" }, extra || {});
  assert.equal(run("a q", st("waiting"))[0].title, "Asking Assistant...");
  const streaming = run("a q", st("streaming", { text: "## Partial" }))[0];
  assert.deepEqual([streaming.title, streaming.subtitle, streaming.copy, !!streaming.nodi], ["Answering...", "Esc stops it", "", false]);
  const done = run("a q", st("done", { text: "## Answer\n\nIt is the cache." }));
  assert.deepEqual(plain(done.map(r => r.title)), ["Paste the answer", "Copy the answer", "Ask again"]);
  assert.equal(done[0].run.argv[0], "omarchy-menu-emoji-insert");
  assert.equal(done[1].run.text, "## Answer\n\nIt is the cache.");
  assert.equal(done[2].nodi, "answer");
  assert.equal(run("a q", st("stopped", { text: "half" }))[0].subtitle, "Stopped, 4 characters");
  assert.deepEqual(plain(run("a q", st("stopped")).map(r => r.title)), ["Stopped before it said anything; ask again"]);
  const err = run("a q", st("error", { error: "it ran past 120 s" }))[0];
  assert.deepEqual([err.title, err.nodi], ["Could not answer: it ran past 120 s", "answer"]);
  assert.equal(run("a other", st("done", { text: "x" }))[0].title, "Assistant: other", "a changed question is a new one");
});

test("the pane shows the answer only while the query is its question", () => {
  const a = { phase: "streaming", keyword: "a", question: "q" };
  assert.ok(A.shown("a q", [helper], a));
  assert.ok(A.shown("  a   q ", [helper], a), "spaces round it do not change the question");
  assert.ok(!A.shown("a q2", [helper], a));
  assert.ok(!A.shown("a q", [helper], Object.assign({}, a, { phase: "idle" })));
  assert.ok(!A.shown("b q", [helper, Object.assign({}, helper, { keyword: "b" })], a), "another answer's keyword");
  const p = plain(Pane.choose({ answer: { question: "q", title: "Assistant", text: "**hi**" }, row: null }));
  assert.deepEqual(p, { title: "q", subtitle: "Assistant", markdown: "**hi**", follow: true });
  assert.equal(Pane.choose({ paletteOpen: true, answer: { question: "q", title: "t", text: "x" } }), null, "Ctrl+K's actions hide it");
  assert.equal(Pane.choose({ ask: { question: "q", model: "haiku", text: "" }, row: null }), null, "Claude's answer shows once it has words");
  const row = { title: "r", subtitle: "s", preview: { title: "own" } };
  assert.equal(Pane.choose({ row }).title, "own");
  assert.deepEqual(plain(Pane.choose({ row: { title: "r", subtitle: "s" }, anyPreview: true })), { title: "r", subtitle: "s" });
  assert.equal(Pane.choose({ row: { title: "r" }, anyPreview: false }), null);
});

test("Escape stops an answer on its way before it clears or closes anything", () => {
  const v = { palette: null, rows: 1, selected: 0, text: "a q", answering: true, aliasing: true, armed: true };
  assert.deepEqual(plain(Keys.decide({ name: "Escape" }, v)), { do: "stopAnswer" });
  assert.deepEqual(plain(Keys.decide({ name: "Escape" }, Object.assign({}, v, { answering: false, aliasing: false, armed: false }))), { do: "clear" });
});
