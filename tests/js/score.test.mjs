// The scoring table and the history it learns from.

import { test } from "node:test";
import assert from "node:assert/strict";
import { load, plain } from "./load.mjs";
import { run } from "./fixtures.mjs";

const Score = load("lib/Score.js");
const History = load("lib/History.js");

test("tiers, best first", () => {
  const m = { name: "Visual Studio Code", generic: "Text Editor", aliases: ["code"], keywords: ["ide", "programming"], description: "Edit text files", context: ["Develop"] };
  const t = q => Score.tier(q, m);
  assert.equal(t("visual studio code"), "exact");
  assert.equal(t("code"), "exact", "an alias said exactly");
  assert.equal(t("visualstudiocode"), "exact", "the name without its spaces");
  assert.equal(t("visu"), "prefix");
  assert.equal(t("studio code"), "words");
  assert.equal(t("text ed"), "words", "the generic name names an app by its words");
  assert.equal(t("vsc"), "acronym");
  assert.equal(t("tudio"), "substring");
  assert.equal(t("program"), "keyword");
  assert.equal(t("files"), "description");
  assert.equal(t("develop"), "context");
  assert.equal(t("zzz"), "");
});

test("digits name only the name", () => {
  const pinta = { name: "Pinta", generic: "Image Editor", keywords: ["2d", "paint"] };
  assert.equal(Score.tier("2+2", pinta), "");
  assert.equal(Score.tier("2", pinta), "");
  assert.equal(Score.tier("2d", pinta), "keyword", "a word with letters still reaches keywords");
  assert.equal(Score.tier("1pass", { name: "1Password" }), "prefix");
});

test("one letter names only the start of a name's word", () => {
  assert.equal(Score.tier("w", { name: "Brave", generic: "Web Browser" }), "");
  assert.equal(Score.tier("b", { name: "Brave", generic: "Web Browser" }), "prefix");
  assert.equal(Score.tier("c", { name: "Visual Studio Code" }), "words");
});

test("typos: one edit from five letters, two from eight, the first letter kept", () => {
  assert.equal(Score.tier("screnshot", { name: "Screenshot" }), "typoName");
  assert.equal(Score.tier("bluetoth", { name: "Bluetooth" }), "typoName");
  assert.equal(Score.tier("chrme", { name: "Chrome" }), "typoName");
  assert.equal(Score.tier("night", { name: "Light" }), "", "not the first letter");
  assert.equal(Score.tier("nght", { name: "Night" }), "", "too short for a typo");
  assert.equal(Score.tier("screnshot region", { name: "Screenshot", keywords: ["region"] }), "fuzzy");
  assert.equal(Score.tier("remove steam", { name: "Moonlight", keywords: ["remote", "steam"] }), "", "a typo only in the name's own words");
  assert.equal(Score.tier("pass", { name: "1Password" }), "prefix", "leading numerals skipped");
});

test("a typo in the generic name or a keyword names a row too, under one in the name; plurals try their singular (ROADMAP 36)", () => {
  const foot = { name: "Foot", generic: "Terminal", keywords: ["shell", "console"] };
  assert.equal(Score.tier("termnal", foot), "typoWord", "the generic name");
  assert.equal(Score.tier("consle", foot), "typoWord", "a keyword");
  assert.equal(Score.tier("termnal", { name: "Terminal", whole: true }), "typoName");
  assert.equal(Score.tier("termnal", Object.assign({ whole: true }, foot)), "", "a catalogue row by whole words takes no typo in its other words");
  assert.ok(Score.score("typoWord", "app") < Score.score("typoName", "action"), "a typo in a name beats one in an app's generic name, whatever the kind");
  assert.ok(Score.score("fuzzy", "app") + Score.HABIT_MAX < Score.score("context", "app") && Score.score("typoName", "app") < Score.score("context", "app"),
    "every typo under every clean tier");
  assert.equal(Score.tier("notes", { name: "Xournal++", generic: "Note-taking application" }), "keyword", "notes tries note, as a keyword at best");
  assert.equal(Score.tier("touchs", { name: "Touchpad" }), "typoName", "a word being typed is no plural (\"touch\" is no word of Touchpad), a typo at most: under Touchscreen's prefix");
  assert.equal(Score.tier("apps", { name: "Xournal++", generic: "Note-taking application" }), "", "\"app\" starts application but is no word of it (Fable 2026-10-05)");
  assert.equal(Score.tier("touchs", { name: "Touchscreen" }), "prefix");
  assert.equal(Score.queryParts("glass").singular, null, "a double s is not a plural");
  assert.equal(Score.queryParts("bus").singular, null, "under four letters, no singular");
  assert.equal(Score.queryParts("open notes").singular.q, "open note");
  assert.equal(Score.tier("files", { name: "Power profile" }), "", "the stem inside a word is no match (Fable 2026-10-05)");
  assert.equal(Score.tier("apps", { name: "Switch theme", description: "the app's look" }), "", "nor in a description");
  assert.equal(Score.loose("typoWord") && Score.loose("fuzzy") && !Score.loose("context"), true);
});

test("letters in order only where asked", () => {
  assert.equal(Score.tier("frfx", { name: "Firefox", letters: true }), "fuzzy");
  assert.equal(Score.tier("frfx", { name: "Firefox" }), "");
  assert.equal(Score.tier("fire", { name: "Firmware" }), "");
});

test("kind decides between rows named equally well", () => {
  const app = Score.score("prefix", "app"), action = Score.score("prefix", "action"), setting = Score.score("prefix", "setting");
  assert.ok(app > action && action > setting);
  assert.ok(Score.score("exact", "action") > Score.score("prefix", "app"), "a whole tier outweighs a kind");
  assert.ok(Score.score("exact", "answer") > Score.score("exact", "app"));
  assert.ok(Score.score("prefix", "hint") < Score.score("keyword", "app"), "a hint never beats an app it names");
});

test("habit: up to six points, decaying after a week", () => {
  const now = Date.UTC(2026, 9, 2);
  const day = 86400000;
  assert.equal(Score.habit(undefined, now), 0);
  const fresh = Score.habit({ n: 10, t: now }, now);
  assert.ok(fresh > 1 && fresh <= Score.HABIT_MAX, String(fresh));
  assert.equal(Score.habit({ n: 1000, t: now }, now), Score.HABIT_MAX);
  assert.equal(Score.habit({ n: 10, t: now - 6 * day }, now), fresh, "full for a week");
  assert.ok(Score.habit({ n: 10, t: now - 30 * day }, now) < fresh);
  assert.ok(Score.habit({ n: 10, t: now - 400 * day }, now) > 0, "never to nothing");
  // Under the smallest gap of either table: habit orders equals, nothing else.
  const gaps = [];
  for (const table of [Score.TIER, Score.KIND]) {
    const v = Object.values(table).sort((a, b) => b - a);
    for (let i = 1; i < v.length; i++) if (v[i - 1] !== v[i]) gaps.push(v[i - 1] - v[i]);
  }
  assert.ok(Score.HABIT_MAX < Math.min(...gaps), "habit " + Score.HABIT_MAX + " against the smallest gap " + Math.min(...gaps));
});

test("answers keep their order and leave status rows alone", () => {
  const rows = Score.answers([{ title: "a", score: 99 }, { title: "b", score: 98 }, { title: "Fetching", score: 40 }]);
  assert.equal(rows[0].kind, "answer"); assert.equal(rows[0].tier, "exact");
  assert.ok(rows[0].offset > rows[1].offset);
  assert.equal(rows[2].score, 40); assert.equal(rows[2].kind, undefined);
  assert.equal(Score.answers([{ title: "sun", score: 70 }], "keyword")[0].tier, "keyword");
});

test("history: record, prune, migrate, forget, round-trip", () => {
  const now = 1790000000000;
  let h = History.record({}, "app:foot", now);
  h = History.record(h, "app:foot", now + 1);
  assert.deepEqual(plain(h), { "app:foot": { n: 2, t: now + 1 } });
  const picks = History.pick({}, "t", "app:foot", now);
  assert.deepEqual(plain(History.load(History.serialize(h, picks))), { rows: plain(h), picks: plain(picks) });
  assert.deepEqual(plain(History.load("not json")), { rows: {}, picks: {} });
  assert.deepEqual(plain(History.load('{"rows":{"x":{"n":"1","t":2}}}')), { rows: {}, picks: {} }, "a malformed entry is dropped");
  assert.deepEqual(plain(History.fromLaunches({ firefox: 12, "Disk Usage": 2, "../x": 3, "-x": 1, zero: 0 }, now)),
                   { "app:firefox": { n: 12, t: now }, "app:Disk Usage": { n: 2, t: now } }, "an id as lib/Run.js allows one");
  const f = History.forget(h, picks, "app:foot");
  assert.deepEqual(plain(f), { rows: {}, picks: {} });
  assert.ok(History.knows(h, {}, "app:foot") && History.knows({}, picks, "app:foot") && !History.knows({}, {}, "app:foot"));
  let big = {};
  for (let i = 0; i < History.LIMIT + 5; i++) big["k" + i] = { n: 1, t: i };
  const pruned = History.record(big, "new", 1e15);
  assert.equal(Object.keys(pruned).length, History.LIMIT);
  assert.ok(pruned.new && !pruned.k0, "the oldest go first");
});

test("picks: five rows a query, the oldest queries dropped", () => {
  let p = {};
  for (let i = 0; i < 7; i++) p = History.pick(p, "t", "k" + i, 1000 + i);
  assert.deepEqual(Object.keys(p.t).sort(), ["k2", "k3", "k4", "k5", "k6"]);
  for (let i = 0; i < History.QUERIES + 3; i++) p = History.pick(p, "q" + i, "k", 2000 + i);
  assert.equal(Object.keys(p).length, History.QUERIES);
  assert.ok(!p.t && !p.q0 && p["q" + (History.QUERIES + 2)]);
});

test("recall: the same query in full, a shorter one at seven tenths, decaying", () => {
  const now = Date.UTC(2026, 9, 2), day = 86400000;
  const picks = History.pick({}, "t", "app:foot", now);
  const full = Score.recall(picks, "t", "app:foot", now);
  assert.ok(full >= 6 && full <= Score.PICK_MAX, String(full));
  assert.equal(Score.recall(picks, "te", "app:foot", now), full * 0.7, "\"t\" remembered while \"te\" is typed");
  assert.equal(Score.recall(picks, "x", "app:foot", now), 0);
  assert.equal(Score.recall(picks, "t", "app:other", now), 0);
  assert.ok(Score.recall(picks, "t", "app:foot", now + 60 * day) < full);
  assert.ok(Score.score("fuzzy", "app") + Score.PICK_MAX < Score.score("exact", "app"), "a remembered typo never beats an exact name");
});

test("recall: a longer query remembered lifts the shorter one typed, by half and less the less typed (ROADMAP 34)", () => {
  const now = Date.UTC(2026, 9, 2);
  let picks = History.pick({}, "spotify", "app:spotify", now);
  const full = Score.recall(picks, "spotify", "app:spotify", now);
  const sp = Score.recall(picks, "sp", "app:spotify", now), s = Score.recall(picks, "s", "app:spotify", now);
  assert.ok(Math.abs(sp - full * 0.5 * (0.5 + 0.5 * 2 / 7)) < 1e-9, String(sp));
  assert.ok(s > full / 4 && s < sp && sp < full / 2, "half at most, a quarter at least, more the more typed");
  assert.equal(Score.recall(picks, "sx", "app:spotify", now), 0, "only queries the stored one starts with");
  picks = History.pick(picks, "s", "app:spotify", now);
  assert.equal(Score.recall(picks, "s", "app:spotify", now), Score.recall(picks, "s", "app:spotify", now), "kept per keystroke");
  assert.ok(Score.recall(picks, "s", "app:spotify", now) >= full * 0.9, "picked for the query itself: the exact pick's full worth wins");
});

test("learning reaches the first letters: an app picked by its whole name comes first sooner", () => {
  const apps = [{ id: "slack", name: "Slack", generic: "", comment: "", keywords: [], icon: "", wmclass: "", actions: [] },
                { id: "spotify", name: "Spotify", generic: "", comment: "", keywords: [], icon: "", wmclass: "", actions: [] }];
  const top = (q, picks) => run(q, { apps, history: {}, picks })[0].key;
  assert.equal(top("s", {}), "app:slack", "alphabetical with nothing learnt");
  const now = new Date(2026, 8, 23, 14, 0).getTime();
  assert.equal(top("s", { spotify: { "app:spotify": { n: 2, t: now } } }), "app:spotify", "picked twice as \"spotify\": first at \"s\"");
});

test("snapshots: what an empty bar needs to run a row again", () => {
  const Rows = load("lib/Rows.js");
  const Run = load("lib/Run.js");
  const row = Rows.normalize({ key: "menu:x", title: "Screenshot", subtitle: "Trigger > Capture", icon: "S", kind: "action", tier: "exact", run: Run.shell("omarchy-capture-screenshot") }, { id: "menu", name: "Omarchy" }, 0, 0);
  const s = History.snapshot(row);
  assert.equal(s.title, "Screenshot"); assert.equal(s.provider, "menu"); assert.deepEqual(plain(s.run), { kind: "shell", script: "omarchy-capture-screenshot" });
  assert.equal(History.snapshot(Rows.normalize({ title: "4", copy: "4" }, { id: "math", name: "Calculator" }, 0, 0)), null, "nothing to run, nothing to offer");
  const h = History.record({}, "menu:x", 5, s);
  assert.equal(History.record(h, "menu:x", 6)["menu:x"].s.title, "Screenshot", "a later run without a snapshot keeps the old one");
  assert.equal(History.load(History.serialize(h, {})).rows["menu:x"].s.title, "Screenshot");
});

test("a query or key named like a prototype is stored like any other", () => {
  let picks = {};
  for (const q of ["__proto__", "constructor", "toString"]) picks = History.pick(picks, q, "app:x", 1000);
  assert.deepEqual(Object.keys(picks), ["__proto__", "constructor", "toString"]);
  const back = History.load(History.serialize({}, picks)).picks;
  assert.deepEqual(Object.keys(back), ["__proto__", "constructor", "toString"]);
  assert.ok(Score.recall(back, "__proto__", "app:x", 1000) > 0);
  assert.equal(Score.recall({}, "constructor", "name", 1000), 0, "nothing borrowed from Object");
  assert.equal(History.knows({}, {}, "constructor"), false);
  const rows = History.record({}, "__proto__", 1000);
  assert.deepEqual(Object.keys(rows), ["__proto__"]);
});

test("a generic name takes words, not digits: 2+2 is not a 2D graphics editor", () => {
  const m = { name: "Pinta", generic: "2D graphics editor" };
  assert.equal(Score.tier("2+2", m), "");
  assert.equal(Score.tier("graph", m), "words");
});

test("a word split by its case is matched whole too", () => {
  const Match = load("lib/Match.js");
  assert.deepEqual(plain(Match.words("GitHub - Brave")), ["git", "hub", "brave", "github"]);
  assert.deepEqual(plain(Match.words("org.gnome.Nautilus")), ["org", "gnome", "nautilus"], "nothing added where nothing was split");
  assert.equal(Score.tier("github", { name: "Pull requests on GitHub", whole: true }), "words");
  assert.equal(Score.tier("youtube", { name: "Search YouTube" }), "words");
  assert.equal(Score.tier("hub", { name: "GitHub Desktop" }), "words", "the parts still name it");
  assert.equal(Score.tier("ghd", { name: "GitHub Desktop" }), "acronym", "the old initials still start the new ones");
  assert.equal(Score.tier("gihtub", { name: "Open GitHub" }), "typoName", "a typo of the whole word");
});


test("a word under three letters names a row by its name or keywords, not by its description alone (ROADMAP 35)", () => {
  const foot = { name: "Foot", generic: "Terminal", description: "A wayland native terminal emulator" };
  assert.equal(Score.tier("wa", foot), "", "\"wa\" starts wayland, in the description only");
  assert.equal(Score.tier("wayland", foot), "description", "a whole word there still names it");
  assert.equal(Score.tier("native term", foot), "description", "longer words from the description and the generic name");
  const cmd = { name: "omarchy hyprland window pop", whole: true, description: "Toggle to pop-out a tile to stay fixed on a display basis" };
  assert.equal(Score.tier("wi fi", cmd), "", "two short words that start description words are no match");
  const wifi = { name: "Wi-Fi", keywords: ["wireless"], description: "Turn the radio on or off" };
  assert.equal(Score.tier("wi fi", wifi), "exact", "where the name has them, as before");
  assert.equal(Score.tier("wi radio", wifi), "description", "a short word the name holds, the rest from the description");
  assert.equal(Score.tier("radio on", wifi), "", "on is in the description only");
});
