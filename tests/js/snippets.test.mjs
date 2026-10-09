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
  assert.equal(fill('{"a": {q}} {Cursor} {Date} {date foo}').text, '{"a": } {Cursor} {Date} {date foo}');
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
  assert.deepEqual(plain(s.run), { kind: "paste", text: "Regards,\nGanesh" });
  assert.equal(s.copy, "Regards,\nGanesh");
  assert.deepEqual(plain(s.actions.map(a => a.label)), ["Copy", "Type it out"]);
  assert.deepEqual([s.actions[1].run.args, s.actions[1].run.text], [undefined, "Regards,\nGanesh"], "typed text is in the environment, never shell or an argument");
  assert.equal(top("signature", {}, cfg).title, "Signature", "by its name");
});

test("arguments after the keyword; one missing fills the keyword in instead of pasting", () => {
  const m = top("mt Ravi", {}, cfg);
  assert.equal(m.subtitle, "Meet Ravi at 3pm");
  assert.equal(m.run.text, "Meet Ravi at 3pm");
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
  assert.equal(top("cl", { clipboardText: "copied\ntext" }, cfg).run.text, "> copied\ntext");
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

test("when nothing matches, Enter on Ask asks at once (ROADMAP 87)", () => {
  const ask = run("make the screen dimmer zzqx", {}, config).find(r => r.key === "fallback:ask");
  assert.ok(ask, "offered");
  assert.equal(ask.nodi, "askWith", "Enter asks, as the selection's rows do");
  assert.deepEqual(plain(ask.ask), { question: "make the screen dimmer zzqx", message: "make the screen dimmer zzqx", context: "" });
  assert.equal(ask.remember, false, "the bar learns nothing from it");
  assert.equal(ask.subtitle, "Claude", "named by the agent Ask holds");
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

test("a run keyword taking $1, typed alone, asks for it rather than running with nothing", () => {
  const cfg = Object.assign({}, config, { keywords: [{ keyword: "up", title: "Say", run: 'notify-send "$1"' }] });
  const r = top("up", {}, cfg);
  assert.equal(r.hint, "up <text>"); assert.ok(!r.run);
  assert.equal(top("up hello", {}, cfg).run.kind, "shell");
});

test("dates: an apostrophe in quoted text, a long offset, and one past any date", () => {
  const P = load("lib/Placeholders.js");
  const at = new Date(2026, 8, 23, 23, 0);
  assert.equal(P.formatDate(at, "HH 'o''clock'"), "23 o'clock");
  assert.equal(P.formatDate(at, "''yy"), "'26");
  assert.equal(P.formatDate(new Date(NaN), "yyyy"), "", "a date out of range is nothing, not a throw");
  assert.equal(P.fill('{date format="MMM" offset="+100001m"}', "", { now: at }).text, "Dec", "ten weeks in minutes is a move (codex 2026-10-05)");
  assert.equal(P.fill('{date format="MMM" offset="+999999999d"}', "", { now: at }).text, "", "past what a date holds: nothing, not a throw");
  assert.equal(P.fill('{date format="MMM" offset="+9999999999999999999999y"}', "", { now: at }).text, "");
  assert.equal(P.fill('{date format="MMM" offset="+' + "9".repeat(320) + 'y"}', "", { now: at }).text, "", "digits past a number: no date either (Fable 2026-10-05)");
});

test("the placeholders Alfred and Raycast have: cursor, an older clipboard entry, a snippet, random (ROADMAP 61)", () => {
  const c = fill("Dear {cursor},\nRegards");
  assert.deepEqual([c.text, c.cursorBack], ["Dear ,\nRegards", 9], "the marker gone, and the Left keys from its place to the end");
  assert.equal(fill("{cursor}x{cursor}y").cursorBack, 2, "the first marker counts");
  assert.equal(fill("plain").cursorBack, 0);
  assert.equal(fill("a 🎉{cursor}b").cursorBack, 1);
  assert.equal(fill("{cursor}கொ").cursorBack, 1, "a Tamil consonant with its vowel sign is one place (Fable 2026-10-06)");
  assert.equal(fill("{cursor}நன்றி").cursorBack, 3, "na, n with virama, ri: three places");
  assert.equal(fill("{cursor}e\u0301").cursorBack, 1, "a letter and its accent");
  assert.equal(fill("{cursor}\ud83c\uddee\ud83c\uddf3\ud83c\uddf1\ud83c\uddf0").cursorBack, 2, "two flags");
  assert.equal(fill("{cursor}\ud83d\udc68\u200d\ud83d\udc69\u200d\ud83d\udc67").cursorBack, 1, "a family joined by zero-width joiners");
  assert.equal(fill("{cursor}\ud83d\udc4d\ud83c\udffd").cursorBack, 1, "a skin tone");
  assert.deepEqual(["அஃது", "සිංහල", "ਪੰਜਾਬੀ", "हिन्दी"].map(t => fill("{cursor}" + t).cursorBack), [3, 3, 3, 2],
                   "aytham a letter, Sinhala's and Gurmukhi's signs marks, a conjunct one place (Fable 2026-10-06; lib/Graphemes.js)");
  const env = { clipboard: "now", clipboardHistory: ["now", "before", "older"] };
  assert.equal(fill('{clipboard} {clipboard offset="1"} {clipboard offset="2"} [{clipboard offset="9"}]', "", env).text, "now before older []");
  assert.equal(fill('{clipboard offset="1"}', "", env).clipboard, false, "an offset reads the history only, not the clipboard now");
  assert.equal(fill("{clipboard}", "", env).clipboard, true);
  // Filled one level deep (the live check 2026-10-06: its {random} came through as written).
  assert.equal(fill('Hi {snippet name="sig"}', "", { snippets: { sig: 'Regards, {random from="x"}' } }).text, "Hi Regards, x");
  assert.equal(fill('[{snippet name="a"}]', "", { snippets: { a: 'A{snippet name="b"}', b: "B" } }).text, "[A]", "a snippet in it is empty: no recursion");
  const inc = fill('{snippet name="s"}{cursor}!', "", { snippets: { s: "x{cursor}y" } });
  assert.deepEqual([inc.text, inc.cursorBack], ["xy!", 1], "its cursor dropped, the outer one kept");
  assert.equal(fill('{snippet name="s"}', "", { snippets: { s: '{argument name="who" default="you"}' } }).text, "you", "its arguments their defaults");
  // Its {clipboard} is read for it (Fable 2026-10-06: it was never read).
  const withClip = fill('Hi {snippet name="sig"}', "", { snippets: { sig: "Sent: {clipboard}" }, clipboard: "now" });
  assert.deepEqual([withClip.text, withClip.clipboard], ["Hi Sent: now", true]);
  assert.equal(P.clipboardNeedsNow(P.parse('{snippet name="sig"}'), { sig: "{clipboard}" }), true);
  assert.equal(P.clipboardNeedsNow(P.parse('{snippet name="sig"}'), { sig: '{clipboard offset="1"}' }), false, "an older entry is history, always there");
  assert.equal(fill('{snippet name="none"}').text, "");
  const r = (n) => () => n;
  assert.equal(fill('{random from="a, b ,c"}', "", { random: r(0.5) }).text, "b");
  assert.equal(fill('{random min="1" max="6"}', "", { random: r(0.999) }).text, "6");
  assert.equal(fill('{random min="5" max="1"}').text, "");
});


test("a snippet with no keyword, its help, and a saved one that is gone", () => {
  const S = load("providers/snippets.js");
  const settings = [{ name: "Letter", text: 'Dear {argument name="who"},' }, { keyword: "sig", name: "Signature", text: "Regards" }];
  const cfg = Object.assign({}, config, { snippets: settings });
  const letter = run("snip letter", {}, cfg).find(r => r.title === "Letter");
  assert.equal(letter.subtitle, "No keyword in nodi.json", "its arguments wait for a keyword it does not have");
  const help = plain(S.provider.help({ settings }));
  assert.deepEqual(help[0].examples.map(e => [e.q, e.note]), [["snip ", "Every snippet"], ["Letter ", "Letter, then who"], ["sig", "Signature"]]);
  assert.equal(S.provider.resolve("snippet:gone", { settings }), null);
});

test("a date placeholder's seconds", () => {
  const P = load("lib/Placeholders.js");
  assert.equal(P.formatDate(new Date(2026, 8, 23, 14, 5, 7), "HH:mm:ss"), "14:05:07");
});
