// How a row asks before it runs: not at all, a second Enter, or a word
// typed; the risk a provider names; and the exact command the pane shows
// first (lib/Rows.js, lib/Run.js describe, lib/Pane.js, lib/Engine.js wordPrompt).

import { test } from "node:test";
import assert from "node:assert/strict";
import { load, plain } from "./load.mjs";
import { Engine, config, services } from "./fixtures.mjs";

const Run = load("lib/Run.js");
const Rows = load("lib/Rows.js");
const History = load("lib/History.js");
const Pane = load("lib/Pane.js");
const Prefs = load("lib/Prefs.js");
const F = load("providers/filters.js");

const P = { id: "t", name: "T" };
const norm = (r) => Rows.normalize(Object.assign({ title: "Send report", run: Run.exec(["mailer", "send"]) }, r), P, 0, 0);

test("the command as a shell would read it back, each kind", () => {
  assert.equal(Run.describe(Run.exec(["helper", "act", "run", "a b", "it's", "$(x)", "--flag=1"])), "helper act run 'a b' 'it'\\''s' '$(x)' --flag=1");
  assert.equal(Run.describe(Run.shell('rm -f "$1"', ["/tmp/a b"])), 'rm -f "$1"\n\n$1 = \'/tmp/a b\'');
  assert.equal(Run.describe(Run.shell("systemctl reboot")), "systemctl reboot");
  assert.equal(Run.describe(Run.open("https://x.test/a?b=c&d")), "gio open 'https://x.test/a?b=c&d'");
  assert.equal(Run.describe(Run.app("firefox")), "gtk-launch firefox.desktop");
  assert.equal(Run.describe(Run.copy("secret")), "Copy to the clipboard:\nsecret");
  assert.equal(Run.describe(Run.focus("0xab")), "Focus the window at 0xab");
  assert.equal(Run.describe({ kind: "exec", argv: [] }), "", "nothing for a run that would not run");
});

test("a word asks for that word; a word that is not one, or no run, asks nothing more than it can", () => {
  const w = norm({ confirmWord: "send", risk: "Mails 40 people" });
  assert.deepEqual([w.confirm, w.confirmWord, w.risk], [true, "send", "Mails 40 people"], "a word is a confirm row");
  assert.equal(norm({ confirmWord: "two words", confirm: true }).confirmWord, "", "a word with a space is a second Enter");
  assert.equal(norm({ confirmWord: "x".repeat(41) }).confirm, false);
  assert.equal(Rows.normalize({ title: "No run", confirmWord: "send" }, P, 0, 0).confirmWord, "", "nothing to run, nothing to confirm");
  assert.equal(norm({ risk: "r".repeat(900) }).risk.length, 500);
  const plainRow = norm({ showsCommand: true });
  assert.equal(Pane.choose({ row: plainRow }), null, "the command pane is for a row that asks");
  assert.equal(Pane.hasPane(plainRow), false);
  assert.equal(norm({ showsCommand: true, confirm: true }).showsCommand, true);
  const a = Rows.normalize({ title: "x", run: Run.copy("x"), actions: [{ label: "Delete", run: Run.exec(["rm", "f"]), confirmWord: "delete", risk: "Gone" }] }, P, 0, 0).actions[0];
  assert.deepEqual([a.confirm, a.confirmWord, a.risk], [true, "delete", "Gone"], "an action asks as a row does");
});

test("a row that asks gets no hotkey or link, and its home row asks the same", () => {
  const w = norm({ confirmWord: "send", risk: "Mails 40 people", key: "t:send" });
  const acts = Rows.actionsFor(w, { prefs: Prefs.empty(), knows: () => false }).map(x => x.label);
  assert.ok(!acts.some(l => /hotkey|deeplink/i.test(l)), JSON.stringify(acts));
  assert.equal(Rows.actionsFor(w, null)[0].confirmWord, "send", "Ctrl+K's own action asks for the word too");
  const s = History.snapshot(w);
  assert.deepEqual([s.confirm, s.confirmWord, s.risk], [true, "send", "Mails 40 people"]);
  const history = { "t:send": { n: 3, t: Date.now(), s } };
  const home = Engine.run("", config, services({ history }));
  const row = home.find(r => r.key === "t:send");
  assert.ok(row, "the row is on the home");
  assert.deepEqual([row.confirm, row.confirmWord, row.risk], [true, "send", "Mails 40 people"]);
});

test("a script filter's line asks with true or a word, names its risk, and shows its command", () => {
  const rows = F.parse([
    JSON.stringify({ title: "Send", action: { exec: ["mailer", "send"] }, confirm: "send", risk: "Mails 40 people", preview: "## Draft" }),
    JSON.stringify({ title: "Archive", action: { exec: ["mailer", "archive"] }, confirm: true }),
    JSON.stringify({ title: "Read", action: { exec: ["mailer", "read"] } }),
    JSON.stringify({ title: "Wide", action: { exec: ["mailer", "x"] }, confirm: "two words", actions: [{ title: "Purge", action: { exec: ["mailer", "purge"] }, confirm: "purge", risk: "All of it" }] })
  ].join("\n"), { keyword: "m", title: "Mail", icon: "" }).map(r => Rows.normalize(r, P, 0, 0));
  assert.deepEqual(plain(rows.map(r => [r.title, r.confirm, r.confirmWord, r.showsCommand])),
    [["Send", true, "send", true], ["Archive", true, "", true], ["Read", false, "", true], ["Wide", true, "", true]], "a program's rows all want their commands seen; only those that ask show them");
  assert.equal(Pane.choose({ row: rows[2] }), null, "Read asks nothing: no command pane");
  assert.equal(rows[0].risk, "Mails 40 people");
  assert.deepEqual(plain([rows[3].actions[0].confirmWord, rows[3].actions[0].risk]), ["purge", "All of it"]);
});

test("the pane: a row's own preview until it is armed or its word asked, then the exact command and the risk", () => {
  const send = norm({ confirmWord: "send", risk: "Mails 40 people", showsCommand: true, preview: { markdown: "## Draft" } });
  assert.deepEqual(plain(Pane.choose({ row: send })), { markdown: "## Draft" }, "its own preview first");
  const archive = norm({ confirm: true, showsCommand: true, title: "Archive", run: Run.exec(["mailer", "archive", "inbox 2"]) });
  assert.deepEqual(plain(Pane.choose({ row: archive })),
    { title: "Archive", subtitle: "Enter twice to run it", labels: [], text: "mailer archive 'inbox 2'", mono: true }, "no preview of its own: the command");
  assert.equal(Pane.choose({ row: archive, armed: true }).subtitle, "Enter again to run it");
  const word = plain(Pane.choose({ word: { title: "Send report", word: "send", run: Run.exec(["mailer", "send"]), risk: "Mails 40 people" } }));
  assert.deepEqual(word, { title: "Send report", subtitle: "Type send to run it", labels: [["Risk", "Mails 40 people"]], text: "mailer send", mono: true });
  const reboot = norm({ confirm: true, title: "Reboot", run: Run.shell("systemctl reboot") });
  assert.equal(Pane.choose({ row: reboot, armed: true }), null, "a built-in row that asks keeps the look it had");
  assert.ok(Pane.hasPane(archive) && !Pane.hasPane(reboot));
});

test("a Ctrl+K action that asks shows its command and risk too, for a row that shows commands (a check 2026-10-05)", () => {
  // The row itself need not ask: its provider shows commands, its action asks.
  const row = norm({ showsCommand: true, title: "Weekly report" });
  const action = { label: "Purge", run: Run.exec(["mailer", "purge", "all mail"]), confirm: true, risk: "Deletes everything" };
  assert.deepEqual(plain(Pane.choose({ paletteOpen: true, palette: { row, action, armed: false } })),
    { title: "Purge", subtitle: "Enter twice to run it", labels: [["Risk", "Deletes everything"]], text: "mailer purge 'all mail'", mono: true });
  assert.equal(Pane.choose({ paletteOpen: true, palette: { row, action, armed: true } }).subtitle, "Enter again to run it");
  assert.equal(Pane.choose({ paletteOpen: true, palette: { row, action: Object.assign({}, action, { confirm: false }), armed: false } }), null, "an action that does not ask: no pane");
  const plainAct = { label: "Run", run: Run.exec(["my-notes", "open"]), confirm: false };
  assert.deepEqual(plain(Pane.choose({ paletteOpen: true, palette: { row, action: plainAct, actions: [plainAct, action], armed: false } })), { title: "Run" },
    "while another action asks, this one keeps the pane with its label: the card's width holds");
  assert.equal(Pane.choose({ paletteOpen: true, palette: { row, action: plainAct, actions: [plainAct], armed: false } }), null, "none asks: no pane");
  assert.equal(Pane.choose({ paletteOpen: true, palette: { row: norm({ confirm: true }), action, armed: false } }), null, "a built-in row's actions keep the look they had");
  assert.equal(Pane.choose({ paletteOpen: true, row }), null);
});

test("the word prompt runs only on the word, as given", () => {
  const w = { title: "Send report", word: "Send", run: Run.exec(["mailer", "send"]), risk: "" };
  const before = plain(Engine.wordPrompt("send", w))[0];
  assert.deepEqual([before.title, before.nodi, before.hint], ["Type Send to run Send report", "", "Send"], "the case counts");
  assert.equal(before.subtitle, "mailer send", "the command when no risk is named");
  const right = plain(Engine.wordPrompt(" Send ", w))[0];
  assert.deepEqual([right.title, right.nodi, right.actionLabel], ["Run Send report", "runWord", "Run"]);
  assert.equal(plain(Engine.wordPrompt("", Object.assign({}, w, { risk: "Mails 40 people" })))[0].subtitle, "Mails 40 people");
});

test("Ctrl+K typed for: the pane holds its width with no action matching (ROADMAP 52)", () => {
  const row = norm({ showsCommand: true, actions: [{ label: "Send", run: Run.exec(["mail"]), confirm: true }] });
  const actions = Rows.actionsFor(row, null);
  assert.deepEqual(plain(Pane.choose({ paletteOpen: true, palette: { row, action: null, actions } })), { title: "No action matches" });
  assert.equal(Pane.choose({ paletteOpen: true, palette: { row: norm({}), action: null, actions: [] } }), null, "no pane to hold");
});
