// Enter on a row whose action is Nodi's own (lib/NodiActions.js).

import { test } from "node:test";
import assert from "node:assert/strict";
import { load, plain } from "./load.mjs";

const N = load("lib/NodiActions.js");
const Prefs = load("lib/Prefs.js");

const state = (over = {}) => ({
  query: "", now: 10000, prefs: Prefs.empty(), aliasRow: null, wordAsk: null, armedKey: "",
  selection: "", cameFrom: { address: "0x1", stableId: "", width: 0, monitor: 0 }, answers: [],
  conversations: [], pickSession: null, askBusy: false, proposal: null, shooting: false,
  resultAction: () => null, answer: { message: "", keyword: "", question: "", conversation: "" },
  screens: () => ({ focused: null, all: [] }), ...over
});
const decide = (row, over) => plain(N.decide(row, state(over)));
const steps = effects => effects.map(e => e.do === "call" ? (e.on ? e.on + "." : "") + e.fn : e.do === "set" ? "set " + e.key : e.do);

test("a row of no branch of its own only redraws the bar", () => {
  assert.deepEqual(decide({ nodi: "nothing" }), [{ do: "recompute" }]);
  assert.deepEqual(decide({ nodi: "saveAlias" }), [{ do: "recompute" }], "no alias being made");
  assert.deepEqual(decide({ nodi: "askWith" }), [{ do: "recompute" }], "no question");
});

test("an alias is saved for the row it was made for, and the field emptied", () => {
  const row = { key: "app:firefox", title: "Firefox", provider: "apps", run: { kind: "app", id: "firefox" } };
  const e = decide({ nodi: "saveAlias" }, { aliasRow: row, query: "ff" });
  assert.deepEqual(steps(e), ["savePrefs", "set aliasRow", "text", "recompute"]);
  assert.equal(e[1].value, null);
  assert.deepEqual(e[2], { do: "text", text: "", cursor: false });
  assert.match(JSON.stringify(e[0].args[0]), /"ff"/);
});

test("Allow waits out the moment after the card shows", () => {
  assert.deepEqual(decide({ nodi: "askAllow" }, { proposal: { at: 9800 } }), []);
  assert.deepEqual(decide({ nodi: "askAllow" }), [], "nothing proposed is no Allow");
  assert.deepEqual(steps(decide({ nodi: "askAllow" }, { proposal: { at: 9000 } })), ["ask.allow", "recompute"]);
  assert.deepEqual(steps(decide({ nodi: "askDeny" })), ["ask.deny", "recompute"]);
});

test("a resumed session puts the field on ask only when Ask resumed it", () => {
  const e = decide({ nodi: "askResume", data: { index: 2 } });
  assert.deepEqual(e[0].args, [2]);
  assert.deepEqual(e[0].then, [{ do: "text", text: "ask ", cursor: true }]);
  assert.deepEqual(e[1], { do: "recompute" });
});

test("a result action is proposed, opened, typed or asked by what it holds", () => {
  const at = action => ({ resultAction: i => (i === 0 ? { turn: "t1", action } : null) });
  assert.deepEqual(decide({ nodi: "askResult", data: { index: 1 } }, at({})), []);
  assert.deepEqual(steps(decide({ nodi: "askResult", data: { index: 0 } }, at({ exec: ["x"] }))), ["ask.proposeResultAction", "recompute"]);
  const open = decide({ nodi: "askResult", data: { index: 0 } }, at({ open: "https://a" }));
  assert.deepEqual(open[0].args, ["https://a", { ask: true, turn: "t1" }]);
  assert.deepEqual(decide({ nodi: "askResult", data: { index: 0 } }, at({ query: 4 }))[0], { do: "text", text: "4", cursor: true });
  const prompt = decide({ nodi: "askResult", data: { index: 0 } }, at({ prompt: "why" }));
  assert.deepEqual(steps(prompt), ["text", "dispatchAsk", "recompute"]);
  assert.deepEqual(prompt[1].args, ["why", "why", "", "ask"]);
  assert.deepEqual(steps(decide({ nodi: "askResult", data: { index: 0 } }, at({ other: 1 }))), ["recompute"]);
});

test("an Ask about the selection carries it in NODI_SELECTION", () => {
  const ask = { question: "fix", message: "fix: x", context: "selection", purpose: "fix", file: "" };
  const e = decide({ nodi: "askWith", ask }, { selection: "x" });
  assert.deepEqual(e[0].args, ["fix", "fix: x", "selection", "fix", { NODI_SELECTION: "x" }, null, ""]);
  assert.deepEqual(decide({ nodi: "askWith", ask }, {})[0].args[4], {});
});

test("New question recycles Ask unless it is busy, back on its prefix", () => {
  assert.deepEqual(decide({ nodi: "askNew" }, { askBusy: true }), []);
  assert.deepEqual(steps(decide({ nodi: "askNew" })), ["ask.recycle", "set directAskAgent", "text", "recompute"]);
  const direct = decide({ nodi: "askNew", data: { prefix: "codex" } });
  assert.deepEqual(steps(direct), ["ask.recycle", "text", "recompute"]);
  assert.equal(direct[1].text, "codex ");
});

test("a question about the window is shot at its monitor's scale, 1280 wide at most", () => {
  const ask = { question: "what is this", message: "m", context: "", purpose: "window" };
  const w = { address: "0x1", stableId: "abc", width: 1600, monitor: 2 };
  const screens = () => ({ focused: { id: 1, lastIpcObject: { scale: 1 } }, all: [{ id: 2, lastIpcObject: { scale: 1.5 } }] });
  const e = decide({ nodi: "askWindow", ask }, { cameFrom: w, screens });
  assert.deepEqual(steps(e), ["set askRows", "holdShotAsk", "shot.run", "text", "recompute"]);
  assert.deepEqual(e[0].value, { turn: "", rows: {} });
  assert.deepEqual(e[2].args[0].slice(-2), ["abc", (1280 / 2400).toFixed(3)]);
  const small = decide({ nodi: "askWindow", ask }, { cameFrom: { ...w, width: 800, monitor: 9 }, screens });
  assert.equal(small[2].args[0].at(-1), "1");
  assert.deepEqual(decide({ nodi: "askWindow", ask }, { cameFrom: { ...w, stableId: "" } }), []);
  assert.deepEqual(decide({ nodi: "askWindow", ask }, { cameFrom: w, shooting: true }), []);
});

test("ask and askAs send only while Ask is free", () => {
  assert.deepEqual(decide({ nodi: "ask" }, { query: " ask  why " })[0].args, ["why", "why", "", "ask"]);
  assert.deepEqual(steps(decide({ nodi: "ask" }, { query: "ask why", askBusy: true })), ["recompute"]);
  assert.deepEqual(steps(decide({ nodi: "ask" }, { query: "ask " })), ["recompute"]);
  const as = decide({ nodi: "askAs", data: { question: "q", id: "codex" } });
  assert.deepEqual(as[0].args, ["q", "q", "", "ask", null, null, null, "codex"]);
  assert.deepEqual(steps(decide({ nodi: "askAs", data: { question: "q", id: "codex" } }, { shooting: true })), ["recompute"]);
});

test("a confirm word runs its row only when typed exactly, the query given back", () => {
  const word = { word: "send", query: "mail", run: { kind: "exec", argv: ["x"] }, toggle: "", key: "k", snap: null, title: "Send", undoable: false };
  assert.deepEqual(decide({ nodi: "runWord" }, { wordAsk: word, query: "sen" }), []);
  const e = decide({ nodi: "runWord" }, { wordAsk: word, query: " send " });
  assert.deepEqual(steps(e), ["set wordAsk", "text", "execute"]);
  assert.deepEqual(e[1], { do: "text", text: "mail", cursor: false });
  assert.deepEqual(e[2].args, [word.run, "", "k", null, "Send", false]);
});

test("undo and clearing reminders take a second Enter", () => {
  assert.deepEqual(decide({ nodi: "undo", key: "undo:1" }), [{ do: "set", key: "armedKey", value: "undo:1" }]);
  assert.deepEqual(steps(decide({ nodi: "undo", key: "undo:1" }, { armedKey: "undo:1" })), ["set armedKey", "runUndo"]);
  assert.deepEqual(steps(decide({ nodi: "remindClear", key: "r" }, { armedKey: "r" })), ["set armedKey", "clearReminders", "finish"]);
  assert.deepEqual(steps(decide({ nodi: "remindClear", key: "r" })), ["set armedKey"]);
});

test("a streamed answer starts, or goes to Ask when it is one or names files", () => {
  const answers = [{ keyword: "a", title: "Assistant", command: ["my-ask"] }, { keyword: "ask", command: ["x"] }];
  const e = decide({ nodi: "answerFresh" }, { query: "a why", answers });
  assert.deepEqual(steps(e), ["answer.start", "recompute"]);
  assert.equal(e[0].args[0].fresh, true);
  assert.equal(e[0].args[0].question, "why");
  const retry = decide({ nodi: "answer" }, { query: "a why", answers, answer: { message: "why, with more", keyword: "a", question: "why", conversation: "" } });
  assert.equal(retry[0].args[0].message, "why, with more");
  const mention = decide({ nodi: "answer" }, { query: "a read @f:/tmp/x", answers });
  assert.deepEqual(steps(mention), ["dispatchAsk"]);
  assert.deepEqual(mention[0].args.slice(-2), [false, "a read @f:/tmp/x"]);
  assert.deepEqual(steps(decide({ nodi: "answer" }, { query: "zz why", answers })), ["recompute"]);
});

test("a failed agent's question moves to another, only once it is chosen", () => {
  const d = { id: "codex", question: "q", message: "m", context: "" };
  const direct = decide({ nodi: "askAgentFallback", data: { ...d, direct: true } });
  assert.deepEqual(steps(direct), ["prepareDirectAsk", "text", "recompute"]);
  assert.equal(direct[0].need, true);
  assert.equal(direct[1].text, "codex q");
  const chosen = decide({ nodi: "askAgentFallback", data: d });
  assert.deepEqual(steps(chosen), ["selectAskAgent", "ask.prepare", "text", "recompute"]);
  assert.deepEqual(chosen[1].args, ["q", "m", ""]);
});

test("kept conversations reopen, move to a terminal, or are forgotten", () => {
  const conversations = [{ id: "c1", keyword: "a", title: "A", turns: [] }];
  assert.deepEqual(decide({ nodi: "answerResume", data: { id: "none" } }, { conversations }), []);
  assert.deepEqual(steps(decide({ nodi: "answerResume", data: { id: "c1" } }, { conversations })), ["answer.resume", "text", "recompute"]);
  const run = { kind: "exec", argv: ["chat"] };
  const chat = decide({ nodi: "answerChat", key: "k", title: "T", data: { id: "c1", run } },
    { conversations, answer: { conversation: "c1", keyword: "a", question: "", message: "" } });
  assert.deepEqual(steps(chat), ["set conversations", "saveConversations", "answer.reset", "execute"]);
  assert.deepEqual(chat[3].args, [run, "", "k", null, "T", false]);
  assert.deepEqual(steps(decide({ nodi: "answerChat", key: "k", data: { id: "c1", run } }, { conversations })), ["set conversations", "saveConversations", "execute"]);
  assert.deepEqual(steps(decide({ nodi: "answerNew" }, { answer: { keyword: "a" } })), ["answer.reset", "text", "recompute"]);
  assert.deepEqual(steps(decide({ nodi: "answerNew" })), ["answer.reset", "recompute"]);
});

test("steps, desktops, reminders, the tray and picks end the bar their way", () => {
  assert.deepEqual(steps(decide({ nodi: "filterNext", next: { keyword: "w" } })), ["stepInto"]);
  assert.deepEqual(steps(decide({ nodi: "filterDone" })), ["finish"]);
  const desk = decide({ nodi: "saveDesktop", subtitle: "2 apps", data: { name: "work", apps: [{ id: "firefox" }] } });
  assert.deepEqual(steps(desk).slice(-2), ["toast", "finish"]);
  assert.deepEqual(desk.at(-2).args, ["Desktop \"work\" saved", "2 apps"]);
  assert.deepEqual(steps(decide({ nodi: "remindSet", data: { minutes: 5 } })), ["setReminder", "finish"]);
  assert.deepEqual(steps(decide({ nodi: "forgetDesktop", data: { name: "work" } })), ["savePrefs", "text", "recompute"]);
  const tray = decide({ nodi: "tray", key: "tray:1" });
  assert.deepEqual(steps(tray), ["tray.trigger"]);
  assert.deepEqual(steps(tray[0].then), ["finish"]);
  assert.deepEqual(decide({ nodi: "pick", key: "pick:x" }, { pickSession: { id: 1 } }), []);
  assert.deepEqual(decide({ nodi: "pick", key: "pick:x" }), [{ do: "recompute" }], "no pick open");
});
