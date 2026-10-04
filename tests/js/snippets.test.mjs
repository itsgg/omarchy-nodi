// Snippets and keyword links with placeholders: filled in the bar, pasted
// the way Omarchy pastes an emoji, links opened with every value encoded.

import { test } from "node:test";
import assert from "node:assert/strict";
import { load, plain } from "./load.mjs";
import { config, run, top } from "./fixtures.mjs";

const P = load("lib/Placeholders.js");
const now = new Date(2026, 8, 23, 14, 5, 9);   // Wednesday 23 September 2026
const fill = (t, typed, env) => plain(P.fill(t, typed, Object.assign({ now }, env || {})));

test("dates: the defaults, any pattern, quoted text, offsets", () => {
  assert.equal(fill("{date} {time} {day}").text, "2026-09-23 14:05 Wednesday");
  assert.equal(fill("{datetime}").text, "2026-09-23 14:05");
  assert.equal(fill('{date format="d MMMM yyyy"}').text, "23 September 2026");
  assert.equal(fill('{date format="EEE, d MMM yy \'at\' h:mm a"}').text, "Wed, 23 Sep 26 at 2:05 PM");
  assert.equal(fill('{date offset="+1d"}').text, "2026-09-24");
  assert.equal(fill('{date offset="-1M" format="MMM"}').text, "Aug");
  assert.equal(fill('{datetime offset="+1w+2h"}').text, "2026-09-30 16:05");
  const jan31 = new Date(2026, 0, 31, 9, 0);
  assert.equal(fill('{date offset="+1M"}', "", { now: jan31 }).text, "2026-02-28", "a month later clamps to its last day");
  assert.equal(fill('{date offset="+1y"}', "", { now: new Date(2028, 1, 29) }).text, "2029-02-28");
});

test("arguments: one takes all, several take a word each and the last the rest, quotes hold spaces, defaults fill in", () => {
  assert.equal(fill("hi {q}!", "  Ravi  Kumar ").text, "hi Ravi  Kumar!");
  assert.equal(fill("{argument}", "x y").text, "x y");
  const t = 'Meet {argument name="who"} at {argument name="when" default="3pm"} about {argument name="what"}';
  assert.equal(fill(t, "Ravi 4pm the plan for Q4").text, "Meet Ravi at 4pm about the plan for Q4");
  assert.equal(fill(t, '"Ravi Kumar" 4pm plan').text, "Meet Ravi Kumar at 4pm about plan");
  assert.deepEqual(fill(t, "Ravi").missing, ["what"]);
  assert.deepEqual(fill('{argument name="a"} {argument name="b" default="B"}', "x").text, "x B");
  assert.deepEqual(fill('{argument name="a"}{argument name="a"}', "x").text, "xx", "one name is one argument");
  assert.deepEqual(fill("{q}", "").missing, [""]);
  assert.equal(P.hint(t), "who, when, what");
});

test("only the names it knows are placeholders: JSON and code stay as written", () => {
  assert.equal(fill('{"a": {q}} {cursor} {Date} {date foo}').text, '{"a": } {cursor} {Date} {date foo}');
  assert.equal(fill("{clipboard}", "", { clipboard: "copied" }).text, "copied");
  assert.equal(fill("{q}", "a b&c", { encode: encodeURIComponent }).text, "a%20b%26c");
  assert.match(fill("{uuid}").text, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});

const snippets = [
  { keyword: "sig", name: "Signature", text: "Regards,\nGanesh" },
  { keyword: "mt", name: "Meeting", text: 'Meet {argument name="who"} at {argument name="when" default="3pm"}' },
  { keyword: "cl", name: "Quote the clipboard", text: "> {clipboard}" },
  { name: "No keyword", text: "plain text" },
  { keyword: "bad word", text: "x" }, { keyword: "empty", text: "" }
];
const cfg = Object.assign({}, config, { snippets });
const snip = (q, extra) => run(q, extra, cfg).filter(r => r.key && r.key.indexOf("snippet:") === 0);

test("a snippet by its keyword: Enter pastes through Omarchy's emoji insert, Ctrl+K copies or types it", () => {
  const s = top("sig", {}, cfg);
  assert.equal(s.title, "Signature"); assert.equal(s.badge, "sig");
  assert.equal(s.subtitle, "Regards, ...");
  assert.deepEqual(plain(s.run.argv), ["omarchy-menu-emoji-insert", "Regards,\nGanesh"]);
  assert.equal(s.copy, "Regards,\nGanesh");
  assert.deepEqual(plain(s.actions.map(a => a.label)), ["Copy", "Type it out"]);
  assert.deepEqual(plain(s.actions[1].run.args), ["Regards,\nGanesh"], "typed text is an argument, never shell");
  assert.equal(top("signature", {}, cfg).title, "Signature", "by its name");
});

test("arguments after the keyword; one missing fills the keyword in instead of pasting", () => {
  const m = top("mt Ravi", {}, cfg);
  assert.equal(m.subtitle, "Meet Ravi at 3pm");
  assert.deepEqual(plain(m.run.argv.slice(-1)), ["Meet Ravi at 3pm"]);
  assert.equal(m.remember, false, "a filled-in snippet is a moment");
  const bare = top("mt", {}, cfg);
  assert.equal(bare.subtitle, "who, when (3pm)"); assert.equal(bare.hint, "mt <who> [when]");
  assert.equal(bare.run, null); assert.equal(bare.complete, "mt ");
  assert.ok(run("mt Ravi", {}, cfg).every(r => r.provider === "snippets" || r.provider === "fallback"), "the keyword and a space own the bar");
});

test("the clipboard as it is now, read only when a snippet asks for it", () => {
  const asked = [];
  run("sig", { asked }, cfg);
  assert.ok(asked.indexOf("clipboard-text") === -1, "no read for a snippet without it");
  assert.equal(top("cl", { asked }, cfg).subtitle, "Reading the clipboard...");
  assert.ok(asked.indexOf("clipboard-text") !== -1);
  assert.deepEqual(plain(top("cl", { clipboardText: "copied\ntext" }, cfg).run.argv.slice(-1)), ["> copied\ntext"]);
  assert.equal(top("cl", { clipboardText: "" }, cfg).copy, "> ");
});

test("only a snippet or link with no placeholder is remembered: history replays what it stored", () => {
  assert.equal(top("sig", {}, cfg).remember, true);
  const dated = Object.assign({}, config, { snippets: [{ keyword: "tdy", name: "Today", text: "{date}" }] });
  assert.equal(top("tdy", {}, dated).remember, false, "a date would come back stale");
  assert.equal(top("cl", { clipboardText: "secret" }, cfg).remember, false, "the clipboard never lands in history");
  assert.equal(top("today", {}, links).remember, false);
  assert.equal(top("gc", { clipboardText: "x" }, links).remember, false);
  const cmd = run("google the clipboard", {}, links).find(r => r.title === "Google the clipboard");
  assert.ok(cmd && !cmd.run && cmd.complete === "gc ", "the command row fills the keyword in rather than reading the clipboard");
  const asked = [];
  run("calendar", { asked }, links);
  assert.ok(asked.indexOf("clipboard-text") === -1, "no clipboard read for a query that does not show it");
});

test("snip lists every usable snippet and filters by words; none set says where to add them", () => {
  assert.deepEqual(plain(snip("snip ", { clipboardText: "x" }).map(r => r.title)), ["Signature", "Meeting", "Quote the clipboard", "No keyword"]);
  assert.deepEqual(plain(snip("snippets regards").map(r => r.title)), ["Signature"]);
  assert.equal(top("snip ").title, "No snippets yet");
  assert.ok(!snip("snipe", {}).length && !run("snipe", {}, cfg).some(r => r.provider === "snippets"), "snipe is not snip");
});

const links = Object.assign({}, config, { keywords: config.keywords.concat([
  { keyword: "tr", title: "Translate", open: 'https://translate.google.com/?sl=auto&tl={argument name="to" default="en"}&text={argument name="text"}' },
  { keyword: "today", title: "Calendar today", open: 'https://calendar.google.com/calendar/r/day/{date format="yyyy/M/d"}' },
  { keyword: "gc", title: "Google the clipboard", open: "https://www.google.com/search?q={clipboard}" }
]) });

test("keyword links take the same placeholders, what is typed and copied encoded, a date as written", () => {
  assert.deepEqual(plain(top("g a&b", {}, links).run), { kind: "open", target: "https://www.google.com/search?q=a%26b" });
  assert.equal(top("tr ta good morning", {}, links).run.target, "https://translate.google.com/?sl=auto&tl=ta&text=good%20morning");
  assert.equal(top("tr fr", {}, links).subtitle, "Opens translate.google.com"); assert.equal(top("tr fr", {}, links).hint, "tr [to] <text>", "to has a default");
  assert.equal(top("today", {}, links).run.target, "https://calendar.google.com/calendar/r/day/2026/9/23");
  assert.equal(top("gc", { clipboardText: "a b" }, links).run.target, "https://www.google.com/search?q=a%20b");
  assert.equal(top("gc", {}, links).subtitle, "Reading the clipboard...");
  assert.equal(top("g", {}, links).subtitle, "Opens google.com"); assert.equal(top("g", {}, links).hint, "g <search>");
  const all = Object.assign({}, config, { keywords: [{ keyword: "td", title: "Defaults", open: 'https://x.test/{argument name="a" default="A"}/{argument name="b" default="B"}' }] });
  assert.equal(top("td", {}, all).run.target, "https://x.test/A/B", "every argument defaulted opens at once");
});

test("fallbacks run only links with one argument and no clipboard", () => {
  const fb = run("zzqx nothing answers this", {}, links).filter(r => r.provider === "fallback").map(r => r.key);
  assert.ok(fb.indexOf("fallback:g") !== -1);
  assert.ok(fb.indexOf("fallback:tr") === -1 && fb.indexOf("fallback:gc") === -1 && fb.indexOf("fallback:today") === -1, fb.join(","));
});

test("Nodi settings opens nodi.json in your editor, and no snippets yet offers it", () => {
  const s = top("nodi settings");
  assert.equal(s.title, "Nodi settings");
  assert.deepEqual(plain(s.run.argv), ["omarchy-launch-editor", "/home/u/.config/omarchy/extensions/nodi.json"]);
  assert.deepEqual(plain(top("snip ").run.argv), ["omarchy-launch-editor", "/home/u/.config/omarchy/extensions/nodi.json"]);
});

test("a run keyword taking {q}, typed alone, asks for it rather than running with nothing", () => {
  const cfg = Object.assign({}, config, { keywords: [{ keyword: "up", title: "Say", run: 'notify-send "{q}"' }] });
  const r = top("up", {}, cfg);
  assert.equal(r.hint, "up <text>"); assert.ok(!r.run);
  assert.equal(top("up hello", {}, cfg).run.kind, "shell");
});

test("dates: an apostrophe in quoted text, and an offset out of range moves nothing", () => {
  const P = load("lib/Placeholders.js");
  const at = new Date(2026, 8, 23, 23, 0);
  assert.equal(P.formatDate(at, "HH 'o''clock'"), "23 o'clock");
  assert.equal(P.formatDate(at, "''yy"), "'26");
  assert.equal(P.formatDate(new Date(NaN), "yyyy"), "", "a date out of range is nothing, not a throw");
  assert.equal(P.fill('{date format="MMM" offset="+999999999d"}', "", { now: at }).text, "Sep");
});
