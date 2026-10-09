// The answers and the matching of apps, windows and processes, case by
// case, on Nodi's run contract.

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Engine, config, defaults, rates, zones, now, emojis, processes, apps, launches, windows, services, run, top, requester } from "./fixtures.mjs";
import { plain, load, root } from "./load.mjs";

const Rows = load("lib/Rows.js");

function expectTop(query, want, extra) {
  const row = top(query, extra);
  const title = row ? row.title : null;
  // "No rows" is nothing answering: the fallbacks (search instead) aside.
  if (want === null) assert.equal(run(query, extra).filter(r => r.provider !== "fallback").length, 0, `${JSON.stringify(query)} should have no rows, got ${title}`);
  else if (want instanceof RegExp) assert.match(String(title), want, JSON.stringify(query));
  else assert.equal(title, want, JSON.stringify(query));
}

test("calculator", () => {
  for (const [q, want] of [["2+3*4", "14"], ["2^10", "1,024"], ["15% of 200", "30"], ["200+10%", "220"], ["200 - 15%", "170"],
    ["sqrt(16)", "4"], ["2pi", "6.283185307"], ["3(4+1)", "15"], ["3x4", "12"], ["10 % 3", "1"], ["10 mod 4", "2"], ["2 ^ 10 % 3", "1"], ["2^3%5", "3"], ["0x10", "16"], ["0xff + 1", "256"], ["-10 % 3", "2"], ["10 % 3 * 2", "2"],
    ["0.1+0.2", "0.3"], ["1,000 * 3", "3,000"], ["max(1,5,3)", "5"], ["-2^2", "-4"], ["5!", "120"], ["1/0", "∞"], ["2e3+1", "2,001"]]) expectTop(q, want);
  for (const q of ["hello", "42", "(1+2"]) expectTop(q, null);
  // The empty bar answers no sum: with no history it says what to try (ROADMAP 77).
  assert.deepEqual(plain(run("", { history: {} }).map(r => r.key)),
    ["starter:app", "starter:windows", "starter:clipboard", "starter:answers", "starter:actions"], "only starters on a first open");
});

test("currency", () => {
  for (const [q, want] of [["100 usd to lkr", "30,050 LKR"], ["100usd in eur", "90 EUR"], ["$50", "15,025 LKR"], ["€20 to inr", /^1,848\.89 INR$/],
    ["50 eur", /LKR$/], ["usd lkr", "300.5 LKR"], ["usd to lkr", "300.5 LKR"], ["12*50 usd", "180,300 LKR"], ["1 lkr", /USD$/]]) expectTop(q, want);
  expectTop("usd", null);
  assert.equal(top("100 usd to lkr").subtitle, "100 USD to LKR, rates as of " + Engine.formatDate(rates.updated));
  // Before any rates are saved, a code beyond the common ones is still read
  // as one, and asks for them (codex 2026-10-05).
  const asked = [];
  const first = Engine.run("100 usd to rub", config, services({ rates: undefined, asked }));
  assert.equal(first[0].title, "Fetching exchange rates...");
  assert.ok(asked.includes("rates"), JSON.stringify(asked));
  // Stale by the clock now, however long ago the rates were read.
  const nowS = Math.floor(services().now().getTime() / 1000);
  const past = Object.assign({}, rates, { next: nowS - 2 * 86400 });
  const fresh = Object.assign({}, rates, { next: nowS + 3600 });
  assert.match(Engine.run("100 usd to lkr", config, services({ rates: past }))[0].subtitle, /\(stale\)$/);
  assert.doesNotMatch(Engine.run("100 usd to lkr", config, services({ rates: fresh }))[0].subtitle, /stale/);
});

test("time zones and dates", () => {
  for (const [q, want] of [["time", /Colombo/], ["time in tokyo", /Tokyo/], ["tokyo time", /Tokyo/], ["3pm lkt to pst", "02:30 Los Angeles"],
    ["15:30 in london", "11:00 London"], ["9am to tokyo", "12:30 Tokyo"], ["11pm to tokyo", "02:30 Tokyo (+1 day)"],
    ["days until dec 25", /^93 days/], ["today + 45 days", "Sat, 7 Nov 2026"], ["2026-01-01 to 2026-09-23", /^265 days/],
    ["next friday", "Fri, 25 Sep 2026"], ["days since jan 1", /^265 days/], ["in 2 weeks", "Wed, 7 Oct 2026"],
    ["until christmas", /^93 days/], ["dec 25", "Fri, 25 Dec 2026"]]) expectTop(q, want);
  // An offset past what a Date can hold is no date, not "NaN".
  for (const q of ["in 99999999999 days", "9999999999 days from now", "today + 99999999999 days"])
    assert.ok(!run(q).some(r => /NaN|undefined/.test(r.title + r.subtitle + r.copy)), q);
  assert.match(top("3pm lkt to pst").subtitle, /^15:00 Colombo \(UTC\+5:30\) to Los Angeles \(UTC-7\)$/);
  // A date with no year counts from the last one or to the next one that
  // falls (codex 2026-10-05), and a year under 100 stays itself.
  const at = iso => services({ now: () => new Date(iso) });
  const timeTop = (q, iso) => Engine.run(q, config, at(iso)).filter(r => r.provider === "time")[0];
  assert.match(timeTop("days since dec 25", "2026-10-05T10:00").title, /^284 days/, "since the last one, not the next");
  assert.match(timeTop("days until feb 29", "2026-10-05T10:00").subtitle, /29 Feb 2028$/, "to the next leap day");
  assert.match(timeTop("days until feb 29", "2024-03-01T10:00").subtitle, /29 Feb 2028$/, "never March 1");
  assert.match(timeTop("days since feb 29", "2026-10-05T10:00").subtitle, /^Thu, 29 Feb 2024/);
  assert.equal(timeTop("days until feb 30", "2026-10-05T10:00"), undefined, "a day no year has");
  assert.equal(timeTop("0099-01-01", "2026-10-05T10:00").copy, "0099-01-01");
  assert.equal(timeTop("0099-01-01 + 1 day", "2026-10-05T10:00").title, "Fri, 2 Jan 0099");
  assert.match(timeTop("today + 9000 years", "2026-10-05T10:00").title, / 11026$/, "a year past 9999 whole");
  // Without years, the second date follows the first (Fable 2026-10-05).
  assert.match(timeTop("feb 29 to mar 1", "2026-10-05T10:00").title, /^1 day/);
  assert.match(timeTop("dec 25 to jan 1", "2026-10-05T10:00").title, /^7 days/);
  assert.match(timeTop("jan 1 to sep 23", "2026-10-05T10:00").title, /^265 days/);
});

test("units", () => {
  for (const [q, want] of [["5 km to mi", "3.1069 mi"], ["5km in miles", "3.1069 mi"], ["180 lb to kg", "81.6466 kg"], ["72f", "22.2222 °C"],
    ["100 c to f", "212 °F"], ["0 k to c", "-273.15 °C"], ["5 ft 11 in to cm", "180.34 cm"], ["5 in to cm", "12.7 cm"],
    ["2 cups in ml", "473.1765 mL"], ["90 min to hours", "1.5 h"], ["10 gb to mb", "10,000 MB"], ["1 gib in mb", "1,073.7418 MB"],
    ["60 mph", "96.5606 km/h"], ["1,500 m to km", "1.5 km"], ["1 acre to m2", "4,046.8564 m²"]]) expectTop(q, want);
  for (const q of ["5 min", "5 kg to km"]) expectTop(q, null);
  const r = top("5 km");
  assert.equal(r.title, "3.1069 mi"); assert.equal(r.copy, "3.1069"); assert.equal(r.subtitle, "5 km to mi, Length");
  assert.equal(top("in 2 weeks").title, "Wed, 7 Oct 2026");
  assert.equal(top("2026-01-01 to 2026-09-23").provider, "time");
});

test("keywords: open, run, and quoting", () => {
  const g = top("g foo bar");
  assert.equal(g.title, "Search Google: foo bar");
  assert.equal(g.subtitle, "Opens google.com");
  assert.deepEqual(plain(g.run), { kind: "open", target: "https://www.google.com/search?q=foo%20bar" });
  assert.equal(top("g").title, "Search Google"); assert.equal(top("g").hint, "g <search>");
  // Never a row that does nothing (his screenshot 2026-10-06): alone, it
  // opens the site; with text selected just before, it searches that.
  assert.deepEqual(plain(top("g ").run), { kind: "open", target: "https://www.google.com" });
  const sel = run("g ", { selection: { text: "nodi launcher", fresh: true } });
  assert.deepEqual([sel[0].title, sel[0].run.target], ["Search Google: nodi launcher", "https://www.google.com/search?q=nodi%20launcher"]);
  assert.ok(!run("g ", { selection: { text: "old", fresh: false } }).some(r => /: old$/.test(r.title)), "not a stale selection");
  assert.equal(plain(run("b64 ", { selection: { text: "hi", fresh: true } }))[0].copy, "aGk=", "b64 alone takes the selection");
  assert.equal(top("yt x").subtitle, "Opens youtube.com");
  assert.equal(top("g foo & bar").run.target, "https://www.google.com/search?q=foo%20%26%20bar");

  // A run keyword's words are its "$1": Nodi never writes them into the
  // command, so nothing typed can change it, be split or be globbed, in any
  // context the command uses it (codex 2026-10-05 found two the {q} lexer
  // missed, arithmetic and backticks; it was replaced).
  const say = (template, q) => {
    const cfg = { providers: ["keywords"], keywords: [{ keyword: "x", run: template }] };
    const row = Engine.run("x " + q, cfg, {})[0];
    assert.equal(row.run.kind, "shell");
    assert.equal(row.run.script, template, "the command as written");
    assert.equal(row.remember, false, "a search is not learned");
    assert.equal(row.subtitle, "Runs " + template);
    return execFileSync("bash", ["-c", row.run.script, "nodi", ...row.run.args], { cwd: root, stdio: ["ignore", "pipe", "pipe"] }).toString();
  };
  const nasty = "$(echo pwned) `id` \"x\" it's  two  *";
  assert.equal(say("printf '<%s>' \"$1\"", nasty), "<" + nasty + ">");
  assert.equal(say("printf '<%s>' \"$(echo \"$1\")\"", nasty), "<" + nasty + ">", "inside $( ) as in any script");
  // The two that ran what was typed through {q} (codex 2026-10-05): the
  // command now holds no text of the query, and an arithmetic use of $1 is
  // the command's own, as in any script; quoted, a backtick's is one word.
  assert.equal(say("printf '<%s>' \"`printf '%s' \"$1\"`\"", "two words"), "<two words>");
  // A template still written with {q} says how to write it, and runs nothing.
  const cfg = { providers: ["keywords"], keywords: [{ keyword: "x", title: "Say", run: "notify-send {q}" }] };
  const old = Engine.run("x hello", cfg, {})[0];
  assert.equal(old.run, null);
  assert.match(old.subtitle, /Write "\$1" where \{q\} is/);
});

test("emoji", () => {
  expectTop(":fire", /fire/); expectTop("emoji thumbs up", /thumbs up/); expectTop(":", "Emoji");
  assert.equal(run(":")[0].hint, ":<word>", "the pattern sits under the field, not in a row");
  // A colon query never falls through to the rest of Nodi, where Enter on
  // ":screenshot" would take a screenshot.
  expectTop(":zzqx", "No emoji matches \"zzqx\"");
  assert.ok(run(":screenshot").every(r => r.provider === "emoji" && !r.run));
  const r = top(":fire");
  assert.equal(r.icon, "🔥"); assert.equal(r.copy, "🔥");
  assert.deepEqual(plain(r.run), { kind: "exec", argv: ["omarchy-menu-emoji-insert", "🔥"] });
  const c = Engine.run(":fire", { providers: ["emoji"], emoji: { onEnter: "copy" } }, { emojis })[0];
  assert.equal(c.run, null); assert.equal(c.copy, "🔥");
});

test("a pid is matched whole; a kill row is never learned or run again (codex 2026-10-05)", () => {
  const withNumber = processes.concat([{ pid: 300, rss: 1000, cpu: 0, name: "python", args: "python -m http.server 104" }]);
  const byPid = run("kill 104", { processes: withNumber }).filter(r => r.provider === "processes");
  assert.deepEqual(plain(byPid.map(r => r.title)), ["Quit node"], "pid 104, not the server with 104 in its arguments");
  assert.equal(byPid[0].confirm, false, "named by its pid");
  assert.equal(top("kill chrome").remember, false, "Quit all names this moment's pids");
  const History = load("lib/History.js");
  const saved = History.snapshot(Object.assign({}, top("kill chrome"), { remember: true }));
  assert.equal(History.replayable(saved), false);
  const history = { "kill:all:chrome": { n: 9, t: services().now().getTime(), s: saved } };
  assert.ok(!Engine.run("", config, services({ history })).some(r => r.key === "kill:all:chrome"), "a kill saved before is not on the home");
  assert.equal(History.replayable(History.snapshot(top("firefox"))), true);
});

test("processes", () => {
  const extra = { asked: [] };
  expectTop("kill", "Quit node", extra); expectTop("kill chrome", "Quit all 2 \"chrome\" processes", extra);
  expectTop("kill web", "Quit Web Content", extra); expectTop("kill zzz", /^No process/, extra);
  expectTop("kill -9 node", "Force quit node", extra); expectTop("killer", null, extra);
  // Named, one Enter; not named (the busiest, or found by its arguments), two.
  assert.equal(top("kill node", extra).confirm, false);
  assert.equal(top("kill", extra).confirm, true);
  assert.equal(top("kill server.js", extra).title, "Quit node");
  assert.equal(top("kill server.js", extra).confirm, true, "found only in its arguments");
  assert.equal(top("kill chrome", extra).confirm, false, "a group you named");
  assert.equal(top("kill n", extra).confirm, true, "one letter names nothing");
  assert.equal(top("kill nod", extra).confirm, false, "three letters of its name do");
  const shells = processes.concat([
    { pid: 201, rss: 4000, cpu: 0.1, name: "bash", args: "bash -c 'echo zoom'" },
    { pid: 202, rss: 4000, cpu: 0.1, name: "bash", args: "bash -c 'sleep; zoom'" }]);
  const g = top("kill zoom", { processes: shells });
  assert.match(g.title, /^Quit all 2 "bash"/);
  assert.equal(g.confirm, true, "a group found only through its arguments asks twice");
  const rows = run("kill chrome", extra);
  assert.deepEqual(plain(rows[0].run.argv), ["kill", "-TERM", "101", "102"]);
  assert.deepEqual(plain(rows[1].run.argv), ["kill", "-TERM", "101"]);
  assert.deepEqual(plain(top("kill -9 node", extra).run.argv), ["kill", "-KILL", "104"]);
  assert.ok(extra.asked.includes("processes"));
  assert.equal(Engine.run("kill x", { providers: ["processes"] }, { request: requester({}) })[0].title, "Reading your processes...");
  assert.equal(Engine.run("kill x", { providers: ["processes"] }, { request: requester({ failed: { processes: "ps failed" } }) })[0].title, "Could not list your processes");
  // Every kill target is "kill -SIG" and pids, nothing from names or args.
  const all = ["kill", "kill chrome", "kill web", "kill -9 chrome"].flatMap(x => run(x, extra)).filter(r => r.run);
  assert.ok(all.length > 0 && all.every(r => r.run.argv[0] === "kill" && /^-(TERM|KILL)$/.test(r.run.argv[1]) && r.run.argv.slice(2).every(p => /^\d+$/.test(p))));
  // Force quit is one Ctrl+K away, after the row's own Quit.
  const labels = Rows.actionsFor(top("kill node", extra), {}).map(a => a.label);
  assert.deepEqual(plain(labels.slice(0, 2)), ["Quit", "Force quit"]);
  assert.deepEqual(plain(Rows.actionsFor(top("kill node", extra), {})[1].run.argv), ["kill", "-KILL", "104"]);
});

test("apps", () => {
  for (const [q, want] of [["brave", "Brave"], ["firefox", "Firefox"], ["fire", "Firefox"], ["ff", "Firefox"], ["files", "Files"],
    ["nautilus", "Files"], ["term", "Alacritty"], ["vsc", "Visual Studio Code"], ["studio code", "Visual Studio Code"], ["local", "LocalSend"],
    ["brave new window", "New Window"], ["firefox priv", "New Private Window"], ["frfx", "Firefox"]]) expectTop(q, want);
  expectTop("zzzq", null);
  const rows = run("brave");
  assert.deepEqual(plain(rows[0].run), { kind: "app", id: "brave-browser" });
  assert.equal(rows[1].title, "New Window"); assert.deepEqual(plain(rows[1].run), { kind: "app", id: "brave-browser", action: 0 });
  assert.equal(rows[2].title, "New Private Window"); assert.equal(rows[0].image, "brave-browser");
  const f = run("f").map(r => r.title);
  assert.equal(f[0], "Firefox", "launch history orders equal matches"); assert.ok(f.includes("Files"));
  assert.deepEqual(plain(run("web browser").map(r => r.title).slice(0, 2).sort()), ["Brave", "Firefox"]);
  assert.equal(run("2+2").length, 1);
  // A bare "volume" is a normal search, so an app called Volume Control is
  // still found; so is "volume control", which the Volume mode cannot answer.
  assert.ok(run("volume").some(r => r.title === "Volume Control"));
  assert.equal(top("volume control").title, "Volume Control");
  assert.equal(top("file manager").title, "Files", "a prefix mode with no answer gives the query back");
  assert.equal(top("f report", { files: [{ path: "/home/u/report.pdf", name: "report.pdf" }] }).title, "report.pdf");
});

test("windows", () => {
  const extra = { windows };
  const r = run("brave", extra);
  assert.equal(r[0].run.kind, "window"); assert.equal(r[0].run.address, "0xb1"); assert.equal(r[1].run.address, "0xb2");
  assert.equal(r[2].run.kind, "app"); assert.equal(r[2].actionLabel, "Open new"); assert.equal(r[0].image, "brave-browser");
  for (const [q, want] of [["netflix", "Netflix - Brave"], ["images", "Images"], ["nautilus", "Images"], ["ghostty", "~/Code"], ["w git", "GitHub - Brave"], ["w github", "GitHub - Brave"], ["w zzz", /^No window/]]) expectTop(q, want, extra);
  assert.ok(run("github", extra).some(x => x.run && x.run.address === "0xb2"), "a title's camel-case word, whole");
  const w = run("w ", extra);
  assert.equal(w.map(x => x.run && x.run.address).join(), "0xb1,0xc1,0xb2,0xd1");
  assert.equal(w[3].subtitle, "Ghostty, scratchpad");
  assert.equal(run("firefox", extra)[0].run.kind, "app");
  assert.ok(!run("mozilla", extra).some(x => x.run && x.run.kind === "window"), "the window you are in is not offered");
  const all = ["w ", "evil", "w evil", "brave"].flatMap(x => run(x, extra)).filter(x => x.run && x.run.kind === "window");
  assert.ok(all.every(x => /^0x[0-9a-f]+$/.test(x.run.address)), "window targets are hex addresses only");
  assert.ok(run("w", extra).every(x => !x.run || x.run.kind !== "window"), "a bare w is a normal search");
  // Under `w`, the window itself beside the list (ROADMAP 78); found by
  // name among other rows, none, so typing an app's name keeps the card
  // as it was; and none with "windows": { "preview": false }.
  assert.deepEqual(plain(w[0].preview), { title: w[0].title, subtitle: w[0].subtitle, window: "0xb1" });
  assert.ok(r.every(x => !x.preview), "brave: no window pictures among the app's rows");
  const off = Engine.run("w ", Object.assign({}, config, { windows: { preview: false } }), services(extra));
  assert.ok(off.length === w.length && off.every(x => !x.preview), "turned off: no pane");
});

test("windows: a web app's window is its app's, by the site Chromium names it after (Fable 2026-10-06)", () => {
  const apps = [{ id: "Slack", name: "Slack", wmclass: "", generic: "", comment: "", keywords: [], icon: "Slack", actions: [],
                  exec: 'omarchy-launch-webapp "https://app.slack.com/client/TAGQSSBA9/activity-inbox"' }];
  const windows = [{ address: "0xf1", cls: "chrome-app.slack.com__client_TAGQSSBA9_activity-inbox-Default", title: "! Activity - Fluxon - Slack", workspace: "3", focus: 1 }];
  const r = run("slack", { apps, windows });
  assert.deepEqual([r[0].run.address, r[0].subtitle], ["0xf1", "Slack, workspace 3"], "switches to it, named by its app");
  assert.equal(r[1].actionLabel, "Open new");
});

test("windows: center and pin act on the window that had the focus", () => {
  assert.deepEqual(plain(top("center window").run), { kind: "exec", argv: ["hyprctl", "dispatch", "hl.dsp.window.center()"] });
  assert.deepEqual(plain(top("pin window").run), { kind: "exec", argv: ["hyprctl", "dispatch", "hl.dsp.window.pin()"] });
  assert.equal(top("centre").title, "Center window");
});

test("windows: of many, the most recent are kept", () => {
  // Hyprland lists windows in its own order, not by focus.
  const many = Array.from({ length: 12 }, (_, i) => ({ address: "0xe" + i.toString(16), cls: "brave-browser", title: "Tab " + i, workspace: "1", focus: 12 - i }));
  const kept = run("brave", { windows: many }).filter(x => x.run && x.run.kind === "window").map(x => x.run.address);
  assert.equal(kept.length, 8);
  assert.equal(kept[0], "0xeb", "the most recent first");
  assert.ok(!kept.includes("0xe0"), "the least recent left out");
});

test("commands are found from the search box", () => {
  for (const [q, want] of [["emo", "Search emoji"], ["curr", "Convert currency"], ["goo", "Search Google"], ["kil", "Kill a process"],
    ["date", "Date calculator"], ["help", "Show everything"], ["exchange", "Convert currency"]]) expectTop(q, want);
  const clock = run("clock");
  assert.match(clock[0].title, /Colombo/); assert.ok(clock.some(r => r.title === "World clock" && r.complete === "time"));
  const c = top("curr");
  assert.equal(c.complete, "100 usd to lkr"); assert.equal(c.select, true); assert.equal(c.copy, ""); assert.equal(c.run, null);
  assert.ok(run("kill").every(r => r.title !== "Kill a process"), "no command row for the mode you are in");
  assert.equal(top("2+2").title, "4"); assert.equal(run("2+2").length, 1);
});

test("layout: sections, hero answers, mode chips", () => {
  const b = run("brave", { windows }), sums = run("2+2"), fx = run("50 eur");
  assert.equal(b[0].section, "Windows"); assert.equal(b[1].section, ""); assert.equal(b[2].section, "Apps"); assert.equal(b[0].hero, false);
  assert.ok(sums[0].hero); assert.equal(sums[0].section, "");
  assert.ok(fx[0].hero); assert.equal(fx[1].section, "Currency");
  const m = x => (Engine.mode(x, config) || {}).label || "";
  assert.equal(m(":fire"), "Emoji"); assert.equal(m("kill "), "Processes"); assert.equal(m("w git"), "Windows");
  assert.equal(m("g cats"), "Search Google"); assert.equal(m("2+2"), ""); assert.equal(m("w"), "");
  assert.equal(m("volume 50"), "Volume"); assert.equal(m("volume"), ""); assert.equal(m("cb "), "Clipboard"); assert.equal(m("f x"), "Files");
  assert.equal(m("~/"), "Path"); assert.equal(m("f"), "");
});

test("neutral defaults: USD, the system zone", () => {
  const svc = { zones, now, localZone: "Europe/London", emojis, request: requester({ rates, processes }) };
  const eur = Engine.run("50 eur", defaults, svc).map(r => r.title);
  assert.match(eur[0], /USD$/); assert.match(eur[1], /GBP$/);
  assert.match(Engine.run("time", defaults, svc)[0].title, /London/);
  assert.equal(Engine.run("curr", defaults, svc)[0].complete, "100 eur to usd");
  assert.ok(!JSON.stringify(defaults).includes("LKR"));
  assert.match(Engine.run("100 rupees", defaults, { request: requester({ rates }) })[0].subtitle, /INR to USD/);
  assert.match(run("100 rupees")[0].subtitle, /^100 LKR/);
  assert.match(run("rs 500 to usd")[0].subtitle, /^500 LKR to USD/);
});

test("the exchange-rate API is asked only by currency queries", () => {
  const asked = [];
  const svc = q => { const log = []; return { rates, zones, now, emojis, processes, request: (n, p, o) => { const r = requester({ rates, processes }, log)(n, p, o); if (log.includes("rates")) asked.push(q); log.length = 0; return r; } }; };
  const yes = ["100 usd to eur", "$50", "50 eur", "usd lkr", "12*50 usd"];
  const no = ["2+2", "time", "hello", "?", ":fire", "curr", "kill", "g usd", "days until dec 25", ""];
  for (const x of yes.concat(no)) Engine.run(x, config, svc(x));
  // With no rates held, a conversion says it is fetching, or why it cannot.
  assert.equal(Engine.run("100 usd to eur", config, { zones, now, request: requester({}) })[0].title, "Fetching exchange rates...");
  const down = Engine.run("100 usd to eur", config, { zones, now, request: requester({ failed: { rates: "Could not reach open.er-api.com" } }) })[0];
  assert.equal(down.title, "Could not fetch exchange rates"); assert.equal(down.subtitle, "Could not reach open.er-api.com");
  assert.ok(yes.every(x => asked.includes(x)), "asked for " + asked.join(" | "));
  assert.ok(no.every(x => !asked.includes(x)));
});

test("help", () => {
  const topics = run("?").map(r => r.title);
  assert.deepEqual(plain(topics.slice(0, 4)), ["Keys", "Yours", "Open an app", "Switch window"], "Nodi's own keys first, then what you set (ROADMAP 75)");
  const keysTopic = run("?shortcuts");
  assert.deepEqual(plain(keysTopic.map(r => r.badge)).slice(-7), ["Shift 󰁝 󰁅", "Shift PgUp PgDn", "Ctrl D U", "Ctrl R", "Ctrl W", "Ctrl E F B", "Esc"]);
  assert.ok(keysTopic.every(r => r.help && !r.run && !r.complete), "a key is said, not filled in");
  assert.equal(run("?shortcuts")[0].section, "Keys");
  assert.equal(topics[topics.length - 1], "Keywords");
  assert.ok(run("?").every(r => r.help && !r.run && !r.copy && r.actionLabel === "Show"));
  const u = run("?units");
  assert.equal(u[0].section, "Units"); assert.equal(u[0].title, "5 km to mi"); assert.equal(u[0].subtitle, "= 3.1069 mi"); assert.ok(u[0].select);
  const k = run("?kill");
  assert.equal(k[0].subtitle, "Your processes, busiest first"); assert.equal(k[0].select, false); assert.equal(k[0].complete, "kill ");
  assert.match(run("?emoji")[1].subtitle, /^= 🔥 fire/);
  const kw = run("?keywords");
  assert.equal(kw[0].title, "g"); assert.equal(kw[0].subtitle, "Search Google. Opens google.com");
  const asked = [];
  const svc = { rates, zones, now, emojis, processes, apps, windows: [], launches, request: requester({ rates, processes }, asked) };
  for (const x of ["?", "?kill", "?currency", "?units", "?time", "?money"]) Engine.run(x, config, svc);
  assert.deepEqual(asked, [], "browsing help reads nothing");
  assert.ok(run("?money").some(r => r.helpTopic === "currency"), "help finds a topic by its command keywords");
  const m = run("?in"), none = run("?zzqx");
  assert.ok(m.some(r => r.helpTopic === "time") && m.some(r => r.helpTopic === "units"));
  assert.equal(none.length, 1); assert.match(none[0].title, /^No topic matches/);
  const chip = x => (Engine.mode(x, config) || {}).label;
  assert.equal(chip("?"), "Help"); assert.equal(chip("?units"), "Help: Units");
  assert.equal(top(" ? ").title, "Keys");
});

test("home: an empty bar shows the rows run most, then reminders", () => {
  const Run = load("lib/Run.js");
  const t = now().getTime();
  const snap = (title, extra) => Object.assign({ title, subtitle: "", icon: "", kind: "app", provider: "apps", run: Run.app(title.toLowerCase()) }, extra || {});
  const history = {
    "app:firefox": { n: 20, t, s: snap("Firefox") },
    "app:foot": { n: 3, t, s: snap("Foot") },
    "app:old": { n: 50, t: t - 200 * 86400000, s: snap("Old") },
    "app:nosnap": { n: 99, t },
    "toggle:wifi": { n: 6, t, s: snap("Wi-Fi", { kind: "toggle", provider: "system", toggle: "wifi", run: Run.exec(["true"]) }) },
    "bad": { n: 9, t, s: snap("Bad", { run: { kind: "exec", argv: [] } }) }
  };
  const reminders = [{ unit: "r1", label: "Tea", remaining: "5m", atTime: "17:05", seconds: 300 }, { unit: "r2", label: "Stretch", remaining: "40m", atTime: "17:40", seconds: 2400 }];
  const rows = run("", { history, reminders, toggleStates: { wifi: { on: false, value: "0" } } });
  // Firefox 20 runs; Wi-Fi 6; Foot 3; Old 50 runs two hundred days ago,
  // halved every 30 days to under one (ROADMAP 38: a count ages now). Six
  // rows of history are a home of its own: no starters (ROADMAP 77).
  assert.deepEqual(plain(rows.map(r => r.title)), ["Firefox", "Wi-Fi", "Foot", "Old", "Tea", "Stretch"]);
  assert.equal(rows.find(r => r.title === "Wi-Fi").badge, "OFF", "toggles show their state now, not when they were run");
  assert.equal(rows[0].section, "Recent");
  assert.equal(rows[4].section, "Reminders");
  assert.deepEqual(plain(rows[4].run.argv), ["omarchy-reminder", "show"]);
  assert.deepEqual(plain(run("", { history: {} }).map(r => r.provider)), Array(5).fill("starter"), "nothing run yet: only what to try (ROADMAP 77)");
});

test("a city is looked up as the table's own key, never an Object method", () => {
  assert.ok(!run("constructor time").some(r => r.provider === "time" && /Looking up/.test(r.title)));
});

test("a section header only over a group of more than one row", () => {
  const rows = Engine.group([{ group: "A", title: "a1" }, { group: "B", title: "b1" }, { group: "B", title: "b2" }]);
  assert.deepEqual(JSON.parse(JSON.stringify(rows.map(r => r.section))), ["", "B", ""]);
});

test("a theme's preview fills its tile, where an app's icon sits inset", () => {
  const r = run("theme ", { themes: { list: [{ name: "Tokyo Night", preview: "/x/preview.png" }], current: "Tokyo Night" } })[0];
  assert.equal(r.imageFill, true);
  assert.equal(run("firefox")[0].imageFill, false);
});

test("a mode's words show under the field: the chip carries them", () => {
  assert.match(Engine.mode("vol 60", config).hint, /^volume <0-100>/);
  assert.equal(Engine.mode(":fi", config).hint, ":<word>");
  assert.equal(Engine.mode("firefox", config), null);
});

test("an app's subtitle says what it is, never its name again", () => {
  const entry = (name, fields) => Object.assign({ id: name, name, generic: "", comment: "", keywords: [], icon: "", wmclass: "", actions: [], exec: "", terminal: false }, fields);
  const list = [
    entry("Netflix", { comment: "Netflix", exec: 'omarchy-launch-webapp "https://www.netflix.com"' }),
    entry("Slack", { comment: "Slack", exec: 'omarchy-launch-webapp "https://app.slack.com/client/T0/C0"' }),
    entry("HEY", { comment: "HEY", exec: "omarchy-webapp-handler-hey %u" }),
    entry("Disk Usage", { exec: 'xdg-terminal-exec --app-id=TUI.float -e bash -c "dua i /"' }),
    entry("Htop", { comment: "htop", exec: "htop", terminal: true }),
    entry("REAPER", { comment: "REAPER", exec: '"/home/u/.local/opt/REAPER/reaper" %F' }),
    entry("Neovim", { generic: "Text Editor", comment: "Edit text files", exec: "nvim %F", terminal: true }),
    entry("Stremio", { comment: "Freedom To Stream" }),
    entry("Intranet", { comment: "Intranet", exec: 'omarchy-launch-webapp "https://me:secret@intra.example.com:8443/home"' }),
    entry("Local", { comment: "Local", exec: "/usr/share/omarchy/bin/omarchy-launch-webapp 'HTTP://[::1]:8080/'" }),
    entry("Bare", { comment: "Bare", exec: "omarchy-launch-webapp https://WWW.Example.org" })
  ];
  const said = name => Engine.run(name, config, services({ apps: list })).find(r => r.key === "app:" + name).subtitle;
  assert.equal(said("Netflix"), "Web app, netflix.com");
  assert.equal(said("Slack"), "Web app, app.slack.com", "the host only, not the page");
  assert.equal(said("HEY"), "Email, web app", "Omarchy's own, described without a model");
  assert.equal(said("Disk Usage"), "Disk usage explorer, terminal app");
  assert.equal(said("Htop"), "Terminal app", "a comment that is the name in another case is no description");
  assert.equal(said("REAPER"), "Application");
  assert.equal(said("Neovim"), "Text Editor");
  assert.equal(said("Stremio"), "Freedom To Stream");
  assert.equal(said("Intranet"), "Web app, intra.example.com", "never the user or password before the host");
  assert.equal(said("Local"), "Web app, [::1]");
  assert.equal(said("Bare"), "Web app, example.org");

  // What a model wrote, for the apps whose entry says nothing (lib/Describe.js).
  const Describe = load("lib/Describe.js");
  const asked = Describe.wanted(list, {}, a => !a.generic && (!a.comment || a.comment.toLowerCase() === a.name.toLowerCase()));
  const descriptions = Describe.parse('{"Netflix": "Streaming films and series", "REAPER": "Digital audio workstation", "Htop": "Process viewer"}', asked);
  const told = name => Engine.run(name, config, services({ apps: list, descriptions })).find(r => r.key === "app:" + name).subtitle;
  assert.equal(told("Netflix"), "Streaming films and series, netflix.com");
  assert.equal(told("REAPER"), "Digital audio workstation");
  assert.equal(told("Htop"), "Process viewer, terminal app");
  assert.equal(told("Neovim"), "Text Editor", "an entry's own description first");
  assert.equal(told("Slack"), "Web app, app.slack.com", "nothing written for it: the site alone");
});

test("the empty field suggests an example a provider that is on answers", () => {
  const Menu = load("lib/Menu.js");
  const merged = Menu.merge([Menu.parseItems(readFileSync(join(root, "tests/js/fixtures/menu.jsonc"), "utf8"))]);
  const menu = { items: merged.items, order: merged.order, when: {}, checked: {} };
  const Dev = load("providers/dev.js");
  const ports = Dev.parsePorts('LISTEN 0 511 127.0.0.1:5173 0.0.0.0:* users:(("node",pid=4211,fd=20))');
  const extra = { menu, toggleStates: {}, ports };
  const seen = new Set();
  for (let n = 0; n < 40; n++) {
    const text = Engine.placeholder(config, n);
    const q = text.match(/^Search, or try "(.*)"$/)[1];
    if (seen.has(q)) continue;
    seen.add(q);
    const want = Engine.EXAMPLES.find(e => e.q === q).provider;
    assert.equal(run(q, extra)[0].provider, want, q);
  }
  assert.equal(seen.size, Engine.EXAMPLES.length, "every example comes round");
  const noCurrency = Object.assign({}, config, { providers: config.providers.filter(p => p !== "currency") });
  for (let n = 0; n < 40; n++) assert.ok(!Engine.placeholder(noCurrency, n).includes("usd"), "never a provider that is off");
  assert.equal(Engine.placeholder(Object.assign({}, config, { providers: [] }), 3), "Search");
});


test("a word named like an object's own property is a word (codex 2026-10-04)", () => {
  const Menu = load("lib/Menu.js");
  const items = Menu.parseItems('{ "root": { "label": "Omarchy" }, "tools.constructor": { "label": "Constructor", "action": "notify-send built" } }');
  const merged = Menu.merge([items]);
  const menu = { items: merged.items, order: merged.order, when: {}, checked: {} };
  assert.ok(run("constructor", { menu, toggleStates: {} }).some(r => r.key === "menu:tools.constructor"), "not an installer gate");
  const O = load("providers/omarchy.js");
  const commands = O.parse(readFileSync(join(root, "tests/js/fixtures/omarchy-commands.json"), "utf8"));
  assert.ok(run("omarchy version", { omarchyCommands: commands }).some(r => r.provider === "omarchy"));
  // A command named so is found by its name, where the inherited lookup
  // made "constructor" an installer gate that hid it (codex 2026-10-05:
  // the version query above passes either way).
  const built = O.parse(JSON.stringify({ ok: true, commands: [{ route: "omarchy constructor", binary: "omarchy-constructor", group: "constructor",
    name: "", summary: "Build a thing", requires_sudo: false, hidden: false, args: "", examples: [], aliases: [],
    filename_route: "omarchy constructor", routes: ["omarchy constructor"] }] }));
  for (const q of ["omarchy constructor", "constructor"])
    assert.ok(run(q, { omarchyCommands: built }).some(r => r.provider === "omarchy" && r.title === "Build a thing"), q);
  const Sources = load("lib/Sources.js");
  assert.deepEqual(plain(Sources.themes("constructor\t/p\ntoString\t\n").list.map(t => t.name)), ["Constructor", "ToString"]);
  for (const q of ["constructor(2)", "10 constructor to usd", "valueOf 3"]) assert.ok(run(q).every(r => r.provider !== "math" && r.provider !== "currency"), q);
});

test("a folder listing that failed says so, never Reading... for ever (codex 2026-10-05)", () => {
  const r = Engine.run("/etc/", config, services({ failed: { directory: "Output limit exceeded" } }))[0];
  assert.deepEqual([r.title, r.subtitle], ["Cannot read /etc", "Output limit exceeded"]);
  assert.match(Engine.run("/etc/", config, services({}))[0].title, /^Reading \/etc/, "pending is still reading");
});

test("a saved app action is the same action after the app is updated, or nothing (codex 2026-10-05)", () => {
  const A = load("providers/apps.js");
  const Run = load("lib/Run.js");
  const ff = (actions) => ({ id: "firefox", name: "Firefox", generic: "", comment: "", keywords: [], icon: "firefox", wmclass: "", actions });
  const before = ff([{ index: 0, id: "new-window", name: "New Window" }, { index: 1, id: "new-private-window", name: "New Private Window" }]);
  const row = Engine.run("firefox new private", config, services({ apps: [before] })).find(r => r.title === "New Private Window");
  assert.equal(row.key, "app:firefox:#new-private-window");
  assert.deepEqual(plain(row.run), { kind: "app", id: "firefox", action: 1, actionId: "new-private-window" });
  // Updated: the private window moved to the front.
  const after = ff([{ index: 0, id: "new-private-window", name: "New Private Window" }, { index: 1, id: "new-window", name: "New Window" }]);
  const ctx = { apps: [after], windows: [], descriptions: {} };
  assert.deepEqual(plain(A.provider.resolve(row.key, ctx).run), { kind: "app", id: "firefox", action: 0, actionId: "new-private-window" }, "found by its id");
  // Dropped: nothing, never the action at its old place.
  assert.equal(A.provider.resolve(row.key, { apps: [ff([{ index: 0, id: "new-window", name: "New Window" }, { index: 1, id: "profiles", name: "Profiles" }])] }), null);
  // A run saved with its old place runs nothing when that place holds another action now.
  const commands = { "new-window": ["firefox", "--new-window"], "new-private-window": ["firefox", "--private-window"] };
  const appAction = (id, index, actionId) => { const a = after.actions[index]; return a && (!actionId || a.id === actionId) ? commands[a.id] : null; };
  assert.equal(Run.command(row.run, appAction), null);
  assert.equal(Run.problem({ kind: "app", id: "firefox", action: 0, actionId: "" }), "bad action id");
});

test("a mode that answers nothing gives the query to the rest of Nodi (codex 2026-10-05 asked)", () => {
  const fonts = { list: ["JetBrainsMono Nerd Font"], current: "" };
  const fm = { id: "font-manager", name: "Font Manager", generic: "", comment: "", keywords: [], icon: "x", wmclass: "", actions: [] };
  assert.equal(Engine.run("font manager", config, services({ fonts, apps: [fm] }))[0].title, "Font Manager");
  assert.equal(Engine.run("font jet", config, services({ fonts, apps: [fm] }))[0].provider, "lists");
});

test("a colour keeps its alpha, base64 its trailing spaces, mod its remainder, a list its empty marker (codex 2026-10-05)", () => {
  const see = run("#ff000080").filter(r => r.provider === "devtools");
  assert.deepEqual(plain(see.map(r => r.copy)), ["#FF000080", "rgb(255, 0, 0, 0.5)", "hsl(0, 100%, 50%, 0.5)"]);
  assert.equal(see[0].swatch, "#80FF0000", "Qt's form for the swatch, alpha first");
  assert.equal(run("#ff5722").filter(r => r.provider === "devtools")[0].copy, "#FF5722", "an opaque colour is as before");
  assert.equal(run("b64 encode hello ").find(r => r.key === "b64:encode").copy, "aGVsbG8g");
  assert.equal(run("b64 encode a\n").find(r => r.key === "b64:encode").copy, "YQo=", "a pasted newline is kept");
  for (const [q, want] of [["1 mod 1e20", "1"], ["-1 mod 3", "2"], ["1 mod -3", "-2"], ["-10 % 3", "2"], ["9 mod 3", "0"]])
    assert.equal(run(q).find(r => r.provider === "math").copy, want, q);
  const L = load("providers/lists.js");
  assert.deepEqual(plain(L.parseList("@current\t\nHack Nerd Font\n  \nHack Nerd Font\n", true)), { current: "", list: ["Hack Nerd Font"] });
  assert.deepEqual(plain(L.parseList("@current\tHack\nHack\nJet\n", true)), { current: "Hack", list: ["Hack", "Jet"] });
});

test("an app action saved by its place is found again by its name, or not run (Fable 2026-10-05)", () => {
  const ff = (actions) => ({ id: "firefox", name: "Firefox", generic: "", comment: "", keywords: [], icon: "firefox", wmclass: "", actions });
  const now = ff([{ index: 0, id: "new-private-window", name: "New Private Window" }, { index: 1, id: "new-window", name: "New Window" }]);
  const saved = { run: { kind: "app", id: "firefox", action: 1 }, confirm: false, title: "New Private Window", subtitle: "Firefox", provider: "apps", kind: "app" };
  const history = { "app:firefox:1": { n: 5, t: services().now().getTime(), s: saved } };
  const home = Engine.run("", config, services({ history, apps: [now] }));
  const row = home.find(r => r.key === "app:firefox:1");
  assert.deepEqual(plain(row.run), { kind: "app", id: "firefox", action: 0, actionId: "new-private-window" }, "by its name, at its new place");
  const gone = Engine.run("", config, services({ history, apps: [ff([{ index: 0, id: "new-window", name: "New Window" }, { index: 1, id: "profiles", name: "Profiles" }])] }));
  assert.ok(!gone.some(r => r.key === "app:firefox:1"), "no action of that name: not on the home, never the action at its old place");
  const History = load("lib/History.js");
  assert.equal(History.replayable(saved), false);
  assert.equal(History.replayable(Object.assign({}, saved, { run: { kind: "app", id: "firefox", action: 0, actionId: "x" } })), true);
});

test("a run that reads $1 only inside single quotes takes no words (Fable 2026-10-05)", () => {
  const cfg = { providers: ["keywords"], keywords: [{ keyword: "ip", run: "ip -4 route get 1 | awk '{print $1}'" }, { keyword: "say", run: "notify-send \"$1\"" }] };
  assert.equal(Engine.run("ip", cfg, {})[0].run.kind, "shell", "runs as typed, awk's $1 its own");
  assert.equal(Engine.run("say", cfg, {})[0].run, null, "a real $1 asks for words");
});

test("labels that remove a doubt: a paste names where it lands; Tab puts a sum's answer in the field (ROADMAP 56)", () => {
  const Rows = load("lib/Rows.js");
  const apps = [{ id: "chromium", name: "Chromium", wmclass: "", generic: "", comment: "", keywords: [], icon: "", actions: [] }];
  assert.equal(Rows.pasteTarget({ class: "chromium" }, apps), "Chromium", "the app's own name");
  assert.equal(Rows.pasteTarget({ class: "com.mitchellh.ghostty" }, []), "Ghostty", "else the class made readable");
  assert.equal(Rows.pasteTarget({ class: "org.telegram.desktop" }, []), "Telegram", "a generic last part gives way");
  assert.equal(Rows.pasteTarget({ class: "" }, apps), "");
  assert.equal(Rows.pasteTarget(null, apps), "");
  // A web app's window, as Chromium names it on this machine (hyprctl clients, 2026-10-06; Fable).
  const web = [{ id: "Slack", name: "Slack", exec: 'omarchy-launch-webapp "https://app.slack.com/client/TAGQSSBA9/activity-inbox"' },
               { id: "Basecamp", name: "Basecamp", exec: "omarchy-launch-webapp https://launchpad.37signals.com" },
               { id: "Discord", name: "Discord", exec: "chromium --app=https://discord.com/app" }];
  assert.equal(Rows.pasteTarget({ class: "chrome-app.slack.com__client_TAGQSSBA9_activity-inbox-Default" }, web), "Slack");
  assert.equal(Rows.pasteTarget({ class: "brave-launchpad.37signals.com__-Default" }, web), "Basecamp", "no path; another browser");
  assert.equal(Rows.pasteTarget({ class: "chrome-www.youtube.com__-Default" },
                                [{ id: "YouTube", name: "YouTube", exec: 'omarchy-launch-webapp "https://www.youtube.com/"' }]), "YouTube",
               "a site's root keeps its underscores (his YouTube window, 2026-10-06)");
  assert.equal(Rows.pasteTarget({ class: "chrome-discord.com__app-Default" }, web), "Discord", "--app=");
  assert.equal(Rows.pasteTarget({ class: "chrome-discord.com__app-Default" }, []), "discord.com", "no entry: its site");
  assert.equal(Rows.pasteTarget({ class: "chrome-discord.com__channels_@me-Default" }, web), "discord.com", "another path is another app");
  assert.equal(Rows.pasteTarget({ class: "chrome-localhost__admin-Default" }, []), "localhost", "a local web app (Fable 2026-10-06)");
  assert.equal(Rows.pasteTarget({ class: "chrome-192.168.1.1__x-Default" }, []), "192.168.1.1");
  const cb = run("cb hello", { clipboard: [{ type: "text", text: "hello world" }], window: { class: "chromium" }, apps })[0];
  assert.equal(cb.actionLabel, "Paste into Chromium");
  const History = load("lib/History.js");
  const pasted = run("sig", { window: { class: "chromium" }, apps }, { ...config, snippets: [{ name: "Sig", keyword: "sig", text: "x" }] })[0];
  assert.equal(pasted.actionLabel, "Paste into Chromium");
  assert.equal(History.snapshot(pasted).actionLabel, "Paste", "saved, it says Paste: the window is the live row's to name, never the saved one's (Fable 2026-10-06)");
  assert.equal(run("cb hello", { clipboard: [{ type: "text", text: "hello world" }] })[0].actionLabel, "Paste", "no window known: as before");
  const sum = run("12*8")[0];
  assert.equal(sum.complete, "96");
  assert.ok(Rows.canComplete(sum), "Tab fills it");
});

test("= or calc alone: the answers copied before, newest first (ROADMAP 56)", () => {
  const history = {
    "math:96": { n: 2, t: 200, s: { title: "96", subtitle: "= 12*8", provider: "math", kind: "answer", run: { kind: "copy", text: "96" } } },
    "math:1.18059e+21": { n: 1, t: 100, s: { title: "1.18059e+21", subtitle: "= 2^70", provider: "math", kind: "answer", run: { kind: "copy", text: "1.180591621e+21" } } },
    "math:1,234.5": { n: 1, t: 300, s: { title: "1,234.5", subtitle: "= 2469/2", provider: "math", kind: "answer", run: { kind: "copy", text: "1234.5" } } },
    "app:firefox": { n: 9, t: 400, s: { title: "Firefox", provider: "apps", run: { kind: "app", id: "firefox" } } }
  };
  const rows = plain(run("=", { history }));
  assert.deepEqual(rows.map(r => [r.title, r.subtitle]), [["1,234.5", "= 2469/2"], ["96", "= 12*8"], ["1.18059e+21", "= 2^70"]]);
  assert.equal(rows[0].copy, "1234.5", "copied as a number");
  assert.equal(rows[2].copy, "1.180591621e+21", "the full value the answer copied, not its shown rounding");
  assert.notEqual(plain(run("calc", { history }))[0].title, "1,234.5", "calc is LibreOffice Calc's, not the history's");
  assert.equal(plain(run("=", { history: {} }))[0].title, "No answers yet");
  // As the bar keeps it: Enter on the answer runs its copy and records
  // its snapshot (Nodi.qml execute); the home never offers it again.
  const History = load("lib/History.js");
  const sum = run("2^70")[0];
  assert.equal(sum.run.kind, "copy");
  const kept = History.record({}, sum.key, 500, History.snapshot(sum));
  assert.deepEqual(plain(run("=", { history: kept })).map(r => [r.title, r.copy]), [["1.18059e+21", "1.180591621e+21"]],
                   "a copied sum is listed (Fable 2026-10-06: none was)");
  assert.ok(!run("", { history: kept }).some(r => r.key === sum.key), "a sum's answer is a moment, not a recent row");
  const Prefs = load("lib/Prefs.js");
  const keeps = row => plain(Rows.actionsFor(row, { prefs: Prefs.empty() }).map(a => a.label)).includes("Add to favourites");
  assert.ok(!keeps(sum), "a sum is not kept");
  const snip = { ...config, snippets: [{ name: "Sig", keyword: "sig", text: "Regards,\nGanesh" }] };
  assert.ok(keeps(run("sig", {}, snip)[0]), "a snippet by its keyword is (Fable 2026-10-06: the kind gate took it away)");
});


test("an ISO date is the date's, not a sum (2026-10-09)", () => {
  const rows = run("2026-10-09");
  assert.equal(rows[0].provider, "time", rows.map(r => r.provider + ": " + r.title).join(" | "));
  assert.equal(rows[0].title, "Fri, 9 Oct 2026");
  assert.ok(!rows.some(r => r.provider === "math"), "no 2,007");
  assert.equal(top("2026-1-9").provider, "time");
  assert.equal(top("10-5").title, "5", "a subtraction is still one");
  assert.equal(top("2026 - 10 - 9").provider, "math", "spaced out, it is sums");
  assert.equal(top("2026-02-29").title, "1,995", "no such day: a sum (codex's review, 2026-10-09)");
  assert.equal(top("2026-13-40").provider, "math");
});

test("the zones whose offsets are read: every city's zone once, then the ones set, once", () => {
  const Tz = load("lib/tzcities.js");
  const zones = plain(Tz.allZones(["Asia/Colombo", "Mars/Olympus", "Mars/Olympus", ""]));
  assert.equal(new Set(zones).size, zones.length, "each once");
  assert.ok(zones.includes("Asia/Tokyo") && zones.includes("America/Los_Angeles"), "the cities' zones");
  assert.equal(zones.filter(z => z === "Asia/Colombo").length, 1, "a set zone a city has already is not added again");
  assert.equal(zones.at(-1), "Mars/Olympus", "a set zone no city has comes after them");
  assert.deepEqual(plain(Tz.allZones()).length, zones.length - 1, "none set: the cities' alone");
});

test("time: a 12-hour clock when asked, a day back, and the zones still being read", () => {
  const twelve = Object.assign({}, config, { time: Object.assign({}, config.time, { clock24: false }) });
  assert.equal(run("time in tokyo", {}, twelve)[0].title, "5:30 pm Tokyo");
  assert.equal(run("3am lkt to pst", {}, twelve)[0].title, "2:30 pm Los Angeles (-1 day)");
  assert.equal(top("1am lkt to pst").title, "12:30 Los Angeles (-1 day)");
  assert.deepEqual(plain(run("time in tokyo", { zones: null }).slice(0, 1).map(r => [r.title, r.subtitle])), [["Looking up time zones...", "Time"]]);
  assert.equal(top("10 days ago").title, "Sun, 13 Sep 2026");
  assert.equal(top("10 days ago").subtitle, "10 days ago");
  // At the end of what a Date can hold, no Feb 29 is left to count to.
  const late = services({ now: () => new Date(275760, 2, 1) });
  assert.equal(Engine.run("days until feb 29", config, late).filter(r => r.provider === "time").length, 0);
});

test("currency: the rates as the service sends them, and an answer that is no rates is refused", () => {
  const C = load("providers/currency.js");
  const parse = C.provider.sources.rates.parse;
  assert.deepEqual(plain(parse(JSON.stringify({ result: "success", rates: { USD: 1, LKR: 300 }, time_last_update_unix: 10, time_next_update_unix: 20 }), true)),
                   { rates: { USD: 1, LKR: 300 }, updated: 10, next: 20 });
  assert.throws(() => parse("", false), /Could not reach open.er-api.com/);
  assert.throws(() => parse(JSON.stringify({ result: "error", "error-type": "quota-reached" }), true), /unexpected response/);
  assert.throws(() => parse(JSON.stringify({ result: "success", rates: "none" }), true), /unexpected response/);
});

test("units: a result under one keeps four significant figures, not four places", () => {
  assert.equal(top("1 g to kg").copy, "0.001");
  assert.equal(top("1 mm to km").copy, "0.000001");
});

test("a sum that does not parse is no answer: a token out of place, a function without its brackets", () => {
  for (const q of ["2 * )", "sqrt 4", "sqrt(4"]) assert.ok(!run(q).some(r => r.provider === "math"), q);
});

test("a row's footer word: Copy for a row that copies, nothing for one that does nothing", () => {
  assert.equal(Rows.actionLabel({ copy: "x" }), "Copy");
  assert.equal(Rows.actionLabel({}), "");
});

test("every provider, and one that throws costs its own rows, never the query: its rows, its help, its commands", async () => {
  const { warnings } = await import("./load.mjs");
  const Registry = load("providers/index.js");
  assert.equal(Engine.providers(), Registry.all, "the registry's list as it is");
  assert.equal(Engine.providers().length, 39);
  const units = Registry.all.find(p => p.id === "units");
  const snippets = Registry.all.find(p => p.id === "snippets");
  const filters = Registry.all.find(p => p.id === "filters");
  const was = { match: units.match, help: snippets.help, commands: filters.commands };
  units.match = () => { throw new Error("boom") };
  snippets.help = () => { throw new Error("no help") };
  filters.commands = () => { throw new Error("no commands") };
  try {
    const before = warnings.length;
    const rows = run("5 km to mi");
    assert.ok(!rows.some(r => r.provider === "units"), "the one that threw: none of its rows");
    assert.ok(rows.length > 0, "the rest still answer");
    const topics = run("?");
    assert.ok(topics.length > 5 && !topics.some(r => /Snippets/.test(r.title)), "the help, without the one whose help threw");
    // A command of another provider's, not a fallback, which shows whatever
    // happened to the commands (Cursor's review, 2026-10-10).
    assert.ok(run("search packages").some(r => r.provider === "packages" && r.title === "Search packages"), "commands of the rest still found");
    const said = warnings.slice(before).join("\n");
    assert.match(said, /nodi: provider units failed: Error: boom/);
    assert.match(said, /nodi: help for snippets failed: Error: no help/);
    assert.match(said, /nodi: commands for filters failed: Error: no commands/);
  } finally { units.match = was.match; snippets.help = was.help; filters.commands = was.commands; }
  assert.equal(top("5 km to mi").provider, "units", "put back: it answers again");
});
