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

test("Enter's run: the question as NODI_QUERY, last only when the answer says so, the window as NODI_WINDOW_*, two minutes by default", () => {
  const s = plain(A.spec("a  why is it slow ", [helper], window));
  // In no argument by default: any local user can read one in /proc (the
  // marketplace's review, 2026-10-10).
  assert.deepEqual(s.argv, ["my-ask", "--markdown"]);
  assert.deepEqual(plain(A.spec("a why", [Object.assign({}, helper, { argument: true })]).argv), ["my-ask", "--markdown", "why"], "\"argument\": true");
  assert.deepEqual(plain(A.spec("a why", [Object.assign({}, helper, { argument: "yes" })]).argv), ["my-ask", "--markdown"], "only true");
  assert.deepEqual(s.env, { NODI_QUERY: "why is it slow", NODI_WINDOW_ADDRESS: "0x5b8f", NODI_WINDOW_CLASS: "foot",
    NODI_WINDOW_TITLE: "vim", NODI_WINDOW_PID: "5438", NODI_WINDOW_WORKSPACE: "2" }, "the window's title in no argument");
  const handed = plain(A.spec("a why", [Object.assign({}, helper, { argument: true })], window, "Earlier context\n\nwhy"));
  assert.deepEqual([handed.env.NODI_QUERY, handed.argv[handed.argv.length - 1], handed.message],
                   ["Earlier context\n\nwhy", "Earlier context\n\nwhy", "Earlier context\n\nwhy"],
                   "a handoff keeps its displayed question while both input forms receive its full context");
  assert.deepEqual([s.keyword, s.title, s.question, s.timeoutMs], ["a", "Assistant", "why is it slow", 120000]);
  assert.equal(A.spec("a q", [Object.assign({}, helper, { timeoutMs: 9e9 })]).timeoutMs, 600000, "ten minutes at most");
  assert.equal(A.spec("a q", [Object.assign({}, helper, { timeoutMs: 10 })]).timeoutMs, 1000);
  assert.equal(A.spec("a ", [helper]), null, "no question, no run");
  assert.equal(A.spec("b q", [helper]), null);
  assert.equal(A.spec("a q", [Object.assign({}, helper, { command: ["-i", "sh"] })]), null, "a command timeout would misread is refused, as a filter's is");
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
  assert.equal(done[0].run.kind, "paste");
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
  const p = plain(Pane.choose({ answer: { question: "q", title: "Assistant", text: "**hi**", seq: 3 }, row: null }));
  assert.deepEqual(p, { title: "q", subtitle: "Assistant", markdown: "**hi**", follow: true, round: 3, busy: false, status: "" },
                   "each run its round, so asked again it starts at its top");
  // While it runs, the spinner turns, and until its first words it says so
  // (his report 2026-10-11: the pane said nothing for seconds).
  const asking = plain(Pane.choose({ answer: { question: "q", title: "Perplexity", text: "", seq: 4, busy: true }, row: null }));
  assert.deepEqual([asking.busy, asking.status, asking.markdown], [true, "Asking Perplexity...", ""]);
  const first = plain(Pane.choose({ answer: { question: "q", title: "Perplexity", text: "Med", seq: 4, busy: true }, row: null }));
  assert.deepEqual([first.busy, first.status], [true, ""], "its words, the spinner still turning");
  assert.equal(Pane.choose({ paletteOpen: true, answer: { question: "q", title: "t", text: "x" } }), null, "Ctrl+K's actions hide it");
  assert.equal(Pane.choose({ ask: { question: "q", model: "haiku", text: "" }, row: null }), null, "nothing asked, nothing on its way: no pane");
  // From the Enter that asks (his report 2026-10-07): open at once, saying
  // what it waits on, then its words, then why it failed if it did.
  const asked = { question: "q", agent: "Claude", model: "haiku", text: "", busy: true, status: "Searching the bar for lock" };
  assert.deepEqual(plain(Pane.choose({ ask: asked, row: null })),
    { title: "q", subtitle: "Claude, haiku", text: "", follow: true, busy: true, status: "Searching the bar for lock..." });
  const words = plain(Pane.choose({ ask: Object.assign({}, asked, { text: "Ran" }), row: null }));
  assert.deepEqual([words.text, words.busy, words.status], ["Ran", true, ""], "its words in place of the status, the spinner on");
  const done = plain(Pane.choose({ ask: Object.assign({}, asked, { text: "Ran Lock.", busy: false }), row: null }));
  assert.deepEqual([done.busy, done.status], [false, ""]);
  const failed = plain(Pane.choose({ ask: Object.assign({}, asked, { busy: false, error: "Claude stopped: exit 1" }), row: null }));
  assert.deepEqual([failed.text, failed.busy], ["Could not ask: Claude stopped: exit 1", false], "the pane stays open with why");
  assert.equal(plain(Pane.choose({ ask: Object.assign({}, asked, { text: "Half", busy: false, error: "cut" }), row: null })).text, "Half\n\nCould not ask: cut");
  const row = { title: "r", subtitle: "s", preview: { title: "own" } };
  assert.equal(Pane.choose({ row }).title, "own");
  assert.deepEqual(plain(Pane.choose({ row: { title: "r", subtitle: "s" }, anyPreview: true })), { title: "r", subtitle: "s" });
  assert.equal(Pane.choose({ row: { title: "r" }, anyPreview: false }), null);
});

test("Escape stops an answer on its way before it clears or closes anything", () => {
  const v = { palette: null, rows: 1, selected: 0, text: "a q", answering: true, prompting: true, armed: true };
  assert.deepEqual(plain(Keys.decide({ name: "Escape" }, v)), { do: "stopAnswer" });
  assert.deepEqual(plain(Keys.decide({ name: "Escape" }, Object.assign({}, v, { answering: false, prompting: false, armed: false }))), { do: "dismiss" });
});

test("an answer found from the search box by its title, Enter writing its keyword", () => {
  const row = run("assistant").find(r => r.title === "Assistant" && r.complete === "a ");
  assert.ok(row, "the answer's command row");
});

// The blocks an answer is drawn in while it streams (lib/Markdown.js
// blocks(), components/PreviewPane.qml): cut at blank lines outside fenced
// code, so a fence, a table and a list each stay whole.
test("an answer is cut into blocks at blank lines outside fences", () => {
  const Markdown = load("lib/Markdown.js");
  const md = "# T\n\npara one\nline two\n\n```\ncode\n\nmore\n```\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n\n- x\n- y\n\nlast par";
  assert.deepEqual(plain(Markdown.blocks(md)), ["# T", "para one\nline two", "```\ncode\n\nmore\n```", "| a | b |\n|---|---|\n| 1 | 2 |", "- x\n- y", "last par"]);
  assert.deepEqual(plain(Markdown.blocks("")), []);
  assert.deepEqual(plain(Markdown.blocks("```\nopen fence\n\nstill code")), ["```\nopen fence\n\nstill code"], "an unclosed fence runs to the end");
  assert.deepEqual(plain(Markdown.blocks("~~~~\n```\n\n~~~~\n\nafter")), ["~~~~\n```\n\n~~~~", "after"], "closed only by its own mark, as long");
});

// What joins blocks stays in one block, each block being a document of its
// own.
test("a loose list, a list item's continuation and a fence on a list item stay one block", () => {
  const Markdown = load("lib/Markdown.js");
  assert.deepEqual(plain(Markdown.blocks("Intro.\n\n- one\n\n- two\n\n  more of two\n\nAfter.")),
                   ["Intro.", "- one\n\n- two\n\n  more of two", "After."]);
  assert.deepEqual(plain(Markdown.blocks("1. step\n\n2. step\n\nDone.")), ["1. step\n\n2. step", "Done."]);
  assert.deepEqual(plain(Markdown.blocks("- ```html\n  <b>\n\n  </b>\n  ```\n\nAfter.")), ["- ```html\n  <b>\n\n  </b>\n  ```", "After."]);
});

test("an answer with a reference-style link is one block", () => {
  const Markdown = load("lib/Markdown.js");
  assert.deepEqual(plain(Markdown.blocks("See [Qt][qt].\n\nMore.\n\n[qt]: https://qt.io")), ["See [Qt][qt].\n\nMore.\n\n[qt]: https://qt.io"]);
});

// --- conversations (Raycast's Quick AI, his ask 2026-10-11) -------------------

test("how long a conversation follows its last answer, and the chat command", () => {
  assert.equal(A.freshOf({}), 600000, "ten minutes unless set");
  assert.equal(A.freshOf({ fresh: "30m" }), 1800000);
  assert.equal(A.freshOf({ fresh: "never" }), -1, "always follows");
  assert.equal(A.freshOf({ fresh: "0" }), 0, "never follows");
  assert.equal(A.freshOf({ fresh: "5s" }), 60000, "a minute at least");
  assert.equal(A.freshOf({ fresh: "soon" }), 600000);
  assert.equal(A.spec("a q", [helper], window).freshMs, 600000);
  const chat = { chat: ["chat-agent", "-s", "{conversation}", "--x={conversation}"] };
  assert.deepEqual(plain(A.chatArgv(chat, "nodi-a-1")), ["chat-agent", "-s", "nodi-a-1", "--x=nodi-a-1"]);
  assert.equal(A.chatArgv({ chat: ["-x"] }, "nodi-a-1"), null, "no option for a program");
  assert.equal(A.chatArgv({ chat: "chat-agent" }, "nodi-a-1"), null, "an argv, not a string");
  assert.equal(A.chatArgv(chat, "a b; rm -rf"), null, "an id is only letters, digits, dots, dashes and underscores");
  assert.deepEqual(plain(A.chatRun(chat, "nodi-a-1").argv), ["uwsm-app", "--", "xdg-terminal-exec", "--", "chat-agent", "-s", "nodi-a-1", "--x=nodi-a-1"]);
});

test("a conversation going: a follow-up, a new one, and carrying it to a terminal", () => {
  const chatty = Object.assign({}, helper, { chat: ["chat-agent", "-s", "{conversation}"] });
  const ccfg = Object.assign({}, config, { answers: [chatty] });
  const crun = (q, answer) => Engine.run(q, ccfg, services({ answer }));
  const going = { phase: "done", keyword: "a", question: "first", text: "One.", error: "", running: false, conversation: "nodi-a-1", follows: true };
  const next = plain(crun("a and then", going));
  assert.deepEqual(next.map(r => [r.key, r.nodi, r.subtitle]), [
    ["answer:a:ask", "answer", "Follows up on: first"],
    ["answer:a:fresh", "answerFresh", "Assistant starts afresh"]]);
  const done = plain(crun("a first", going));
  assert.deepEqual(done.map(r => r.key), ["answer:a:paste", "answer:a:copy", "answer:a:again", "answer:a:chat", "answer:a:new"]);
  assert.deepEqual([done[3].nodi, done[3].data.id], ["answerChat", "nodi-a-1"], "handed on through Nodi, which lets it go");
  assert.deepEqual(done[3].data.run.argv.slice(-3), ["chat-agent", "-s", "nodi-a-1"]);
  assert.equal(done[3].data.run.unwatched, true, "a terminal he closes is no failure");
  assert.equal(done[4].nodi, "answerNew");
  const typing = plain(crun("a ", going));
  assert.deepEqual(typing.map(r => r.key), ["answer:a:empty", "answer:a:chat", "answer:a:new"], "an empty follow-up offers both, under the hint");
  assert.equal(typing.find(r => r.key === "answer:a:empty").subtitle, "A follow-up, then Enter");
  // Without a chat command, no terminal; with no conversation going, neither row.
  assert.ok(!plain(run("a first", going)).some(r => r.key === "answer:a:chat"));
  assert.ok(!plain(crun("a first", Object.assign({}, going, { follows: false }))).some(r => r.key === "answer:a:new" || r.key === "answer:a:chat"));
  // A question while it still answers another: say so, never two at once.
  const busy = plain(crun("a another", Object.assign({}, going, { phase: "streaming", running: true })));
  assert.deepEqual(busy.map(r => r.key), ["answer:a:busy"]);
});

test("the thread shows while a follow-up is typed, not over another keyword's", () => {
  const a = { phase: "done", keyword: "a", question: "first", running: false, follows: true };
  assert.ok(A.shown("a ", [helper], a), "the empty follow-up shows the conversation");
  assert.ok(A.shown("a a new question", [helper], a), "and a typed one");
  assert.ok(!A.shown("a new", [helper], Object.assign({}, a, { follows: false })), "an old conversation does not");
  assert.ok(A.shown("a ", [helper], Object.assign({}, a, { follows: false, reopened: true })),
            "a reopened conversation is visible even when fresh 0 disables follow-ups");
  assert.ok(!A.shown("a new", [helper], Object.assign({}, a, { running: true, phase: "streaming" })), "nor one still answering another question");
  assert.ok(!A.shown("b q", [helper, Object.assign({}, helper, { keyword: "b" })], a));
});

test("asking the same answer again keeps a transferred request; another question does not", () => {
  const a = { phase: "error", keyword: "a", question: "translate this", message: "translate this\n\n<text>வணக்கம்</text>" };
  assert.equal(A.retryMessage("a translate this", [helper], a), a.message);
  assert.equal(A.retryMessage("a another", [helper], a), undefined);
  assert.equal(A.retryMessage("b translate this", [helper, Object.assign({}, helper, { keyword: "b" })], a), undefined);
});

test("the pane draws a conversation: each question set apart, the newest last, its own Markdown as text", () => {
  const p = plain(Pane.choose({ answer: { question: "# not a heading", title: "Perplexity", text: "Two.", seq: 2, busy: false,
                                          turns: [{ question: "first [link](x)", text: "One." }] }, row: null }));
  assert.equal(p.subtitle, "Perplexity, 2 questions");
  assert.equal(p.markdown, "> **first \\[link\\]\\(x\\)**\n\nOne.\n\n---\n\n> **\\# not a heading**\n\nTwo.");
  const asking = plain(Pane.choose({ answer: { question: "q2", title: "Perplexity", text: "", seq: 3, busy: true, turns: [{ question: "q1", text: "One." }] }, row: null }));
  assert.equal(asking.status, "", "the thread is there to read while it asks: no status in its place");
  assert.ok(asking.busy);
  const ask = plain(Pane.choose({ ask: { question: "q2", agent: "Claude", text: "Two.", busy: false, turns: [{ question: "q1", answer: "One." }] }, row: null }));
  assert.equal(ask.text, "› q1\n\nOne.\n\n──────\n\n› q2\n\nTwo.");
  assert.equal(ask.subtitle, "Claude, 2 questions");
});


test("a chat command must name the conversation, and the window is today's setting", () => {
  assert.equal(A.chatArgv({ chat: ["chat-agent", "--repl"] }, "nodi-a-1"), null, "a chat that never names it would open another");
  assert.equal(A.freshFor([helper, Object.assign({}, helper, { keyword: "b", fresh: "0" })], "b"), 0);
  assert.equal(A.freshFor([helper], "a"), 600000);
  assert.equal(A.freshFor([helper], "gone"), 0, "a keyword no answer has follows nothing");
});

test("a long thread keeps its newest turn whole, the oldest going first", () => {
  const big = "x".repeat(40000);
  const p = plain(Pane.choose({ answer: { question: "now", title: "T", text: "The answer now.", seq: 1, busy: false,
                                          turns: [{ question: "oldest", text: big }, { question: "middle", text: big }, { question: "last", text: "short" }] }, row: null }));
  assert.ok(p.markdown.length <= 60000, "under the pane's cap: " + p.markdown.length);
  assert.ok(p.markdown.endsWith("> **now**\n\nThe answer now."), "the newest whole, last");
  assert.ok(p.markdown.startsWith("*Earlier turns are not shown.*"), "says what it left out");
  assert.ok(p.markdown.includes("> **middle**") && !p.markdown.includes("> **oldest**"), "the oldest goes first");
  const ask = plain(Pane.choose({ ask: { question: "now", agent: "Claude", text: "Answer.", busy: false, turns: [{ question: "old", answer: big }, { question: "older", answer: big }] }, row: null }));
  assert.ok(ask.text.length <= 60000 && ask.text.endsWith("\u203a now\n\nAnswer.") && ask.text.startsWith("(Earlier turns are not shown.)"));
});


// Recent conversations, as Raycast keeps recent Quick AI chats (his ask, 2026-10-12).
test("a keyword with nothing typed lists its recent conversations, a moved one reopening in its terminal", () => {
  const C = load("lib/Conversations.js");
  const chatty = Object.assign({}, helper, { chat: ["my-chat", "--session", "{conversation}"] });
  const ccfg = Object.assign({}, config, { answers: [chatty, Object.assign({}, helper, { keyword: "b" })] });
  const now = Date.UTC(2026, 9, 12, 12, 0, 0);
  let kept = [];
  kept = C.record(kept, { id: "nodi-a-1", keyword: "a", title: "Assistant", at: now - 2 * 3600000, turns: [{ question: "oldest", text: "1" }] });
  kept = C.record(kept, { id: "nodi-a-2", keyword: "a", title: "Assistant", at: now - 60000 * 5, turns: [{ question: "newest", text: "2" }, { question: "more", text: "3" }] });
  kept = C.record(kept, { id: "nodi-b-1", keyword: "b", title: "Assistant", at: now, turns: [{ question: "other keyword", text: "x" }] });
  kept = C.moved(kept, "nodi-a-1");
  const rows = plain(Engine.run("a ", ccfg, services({ conversations: kept, now: () => new Date(now) })));
  assert.deepEqual(rows.map(r => r.key), ["answer:a:empty", "answer:a:kept:nodi-a-2", "answer:a:kept:nodi-a-1"], "newest first, this keyword's only");
  assert.deepEqual([rows[1].title, rows[1].subtitle, rows[1].nodi], ["newest", "2 questions, 5 min ago", "answerResume"]);
  assert.deepEqual([rows[2].subtitle, rows[2].nodi], ["1 question, 2 h ago, in the terminal", "answerChat"]);
  assert.deepEqual(rows[2].data.run.argv.slice(-3), ["my-chat", "--session", "nodi-a-1"]);
  // Without a chat command, a moved conversation has nowhere to reopen: not listed.
  const plainCfg = Object.assign({}, config, { answers: [helper] });
  assert.deepEqual(plain(Engine.run("a ", plainCfg, services({ conversations: kept, now: () => new Date(now) }))).map(r => r.key),
                   ["answer:a:empty", "answer:a:kept:nodi-a-2"]);
  const reopened = { phase: "done", keyword: "a", question: "newest", text: "2", conversation: "nodi-a-2",
                     reopened: true, follows: false, running: false };
  assert.deepEqual(plain(Engine.run("a ", ccfg, services({ answer: reopened, conversations: kept, now: () => new Date(now) }))).map(r => r.key),
                   ["answer:a:empty", "answer:a:kept:nodi-a-1"], "the open conversation is not listed as another recent one");
});

test("moved conversations without a chat command do not hide older conversations that can reopen", () => {
  const C = load("lib/Conversations.js");
  let kept = C.record([], { id: "open", keyword: "a", title: "Assistant", at: 1, turns: [{ question: "still here", text: "x" }] });
  for (let i = 0; i < 9; i++) {
    kept = C.record(kept, { id: "moved-" + i, keyword: "a", title: "Assistant", at: i + 2, moved: true,
                            turns: [{ question: "in a terminal", text: "x" }] });
  }
  const rows = plain(Engine.run("a ", cfg, services({ conversations: kept })));
  assert.ok(rows.some(r => r.key === "answer:a:kept:open"), "skipped terminal-only entries do not use the eight visible places");
});

test("the conversation store: the newest last, replaced by id, bounded, and robust to a bad file", () => {
  const C = load("lib/Conversations.js");
  let list = [];
  for (let i = 0; i < C.MAX + 5; i++) list = C.record(list, { id: "c" + i, keyword: "a", title: "t", at: i, turns: [{ question: "q" + i, text: "x" }] });
  assert.equal(list.length, C.MAX);
  assert.equal(list[0].id, "c5", "the oldest go first");
  list = C.record(list, { id: "c10", keyword: "a", title: "t", at: 999, turns: [{ question: "again", text: "y" }] });
  assert.equal(list.length, C.MAX);
  assert.equal(list[list.length - 1].turns[0].question, "again", "a recorded one moves to newest, replaced whole");
  assert.equal(C.record([], { id: "bad id; rm", keyword: "a", turns: [{ question: "q", text: "x" }] }).length, 0, "an id is a safe word");
  assert.equal(C.record([], { id: "c", keyword: "a", turns: [] }).length, 0, "nothing answered, nothing kept");
  assert.deepEqual(plain(C.parse("not json")), []);
  assert.deepEqual(plain(C.parse(JSON.stringify([{ id: "ok", keyword: "a", turns: [{ question: "q", text: "t" }] }, { junk: true }, 5]))).map(c => c.id), ["ok"]);
  assert.equal(C.described(C.parse(JSON.stringify([{ id: "old", keyword: "a", turns: [{ question: "q", text: "t" }] }]))[0], Date.now()),
               "1 question, some time ago", "a recovered entry without a timestamp does not claim an absurd age");
  const effective = C.parse(C.serialize(C.record([], {
    id: "fallback", keyword: "a", turns: [{ question: "translate this", message: "translate this\n\n<text>வணக்கம்</text>", text: "hello" }]
  })))[0].turns[0];
  assert.deepEqual(plain(effective), { question: "translate this", text: "hello" },
                   "selected text and Ask transcripts are not persisted");
  const legacy = C.parse(JSON.stringify([{ id: "legacy", keyword: "a",
    turns: [{ question: "q", message: "q\n\n<text>private</text>", text: "t" }] }]))[0];
  assert.deepEqual(plain(legacy.turns[0]), { question: "q", text: "t" },
                   "loading an older saved turn strips its effective request");
  assert.equal(C.parse(C.serialize(list)).length, C.MAX, "round-trips");
  assert.equal(C.find(list, "c10").turns[0].question, "again");
  assert.equal(C.moved(list, "c10").find(c => c.id === "c10").moved, true);
});

test("conversation state loaded after a completed answer merges by id, with the in-memory answer newest", () => {
  const C = load("lib/Conversations.js");
  assert.equal(typeof C.merge, "function", "the store exposes its startup merge");
  const disk = [
    { id: "same", keyword: "a", title: "Old", at: 1, turns: [{ question: "old", text: "disk" }] },
    { id: "disk", keyword: "a", title: "Disk", at: 2, turns: [{ question: "saved", text: "yes" }] }
  ];
  const memory = [
    { id: "same", keyword: "a", title: "New", at: 3, turns: [{ question: "new", text: "memory" }] },
    { id: "memory", keyword: "a", title: "Memory", at: 4, turns: [{ question: "just answered", text: "yes" }] }
  ];
  const merged = C.merge(disk, memory);
  assert.deepEqual(plain(merged.map(c => [c.id, c.turns[0].question])), [
    ["disk", "saved"], ["same", "new"], ["memory", "just answered"]
  ]);
});

test("a terminal opened for him is never watched: closing it is no failure", () => {
  const Run = load("lib/Run.js");
  const argv = ["uwsm-app", "--", "xdg-terminal-exec", "--", "my-chat"];
  const watched = Run.command(Run.exec(argv), null, "Continue in terminal");
  const unwatched = Run.command(Run.terminal(argv), null, "Continue in terminal");
  assert.ok(JSON.stringify(watched).includes("nodi_toast"), "an ordinary command is watched");
  assert.ok(!JSON.stringify(unwatched).includes("nodi_toast"), "a terminal is not");
  assert.ok(JSON.stringify(unwatched).includes("xdg-terminal-exec"));
});
