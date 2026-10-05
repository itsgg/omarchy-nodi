// Matching in every script (lib/Match.js): text folded before it is split,
// accents off, words split only on separators, so Tamil, Cyrillic and Han
// have words and "beyonce" finds "Beyoncé" (ROADMAP 33). The same checks
// run in Qt's engine in tests/qml/MatchTest.qml.

import { test } from "node:test";
import assert from "node:assert/strict";
import { load, plain } from "./load.mjs";
import { run } from "./fixtures.mjs";

const Match = load("lib/Match.js");
const Score = load("lib/Score.js");
// Letters in order as Score asks: on folded text, over its word starts.
const inOrder = (n, t) => Match.inOrder(Match.fold(n), Match.fold(t), Match.starts(Match.fold(t)));

test("fold: lower case, accents off, other scripts kept", () => {
  assert.equal(Match.fold("Résumé"), "resume");
  assert.equal(Match.fold("Beyoncé"), "beyonce");
  assert.equal(Match.fold("Straße Æble Øre Łódź"), "strasse aeble ore lodz");
  assert.equal(Match.fold("Москва"), "москва");
  assert.equal(Match.fold("தமிழ்"), "தமிழ்".normalize("NFD"), "Tamil's signs are letters: decomposed, never dropped");
  assert.equal(Match.fold("plain ascii"), "plain ascii");
  assert.equal(Match.folded("Résumé"), "resume", "kept the same");
});

test("words: only separators split, every other character is a letter", () => {
  assert.deepEqual(plain(Match.words("Résumé 2026.pdf")), ["resume", "2026", "pdf"], "not r, sum");
  assert.deepEqual(plain(Match.words("தமிழ் விக்கிப்பீடியா - Chromium")), ["தமிழ்", "விக்கிப்பீடியா", "chromium"].map(w => w.normalize("NFD")));
  assert.deepEqual(plain(Match.words("Москва - Википедия")), ["москва", "википедия"]);
  assert.deepEqual(plain(Match.words("東京 \u2014 天気")), ["東京", "天気"], "an em dash separates; Han characters are letters");
  assert.deepEqual(plain(Match.words("\ud83d\udd25 Hot \u201cquoted\u201d stuff\u2026")), ["hot", "quoted", "stuff"], "emoji, curly quotes and an ellipsis separate");
  assert.deepEqual(plain(Match.words("VSCodium")), ["vs", "codium", "vscodium"], "the case split as before");
  assert.equal(Match.collapse("wi-fi 6"), "wifi6");
  assert.equal(inOrder("bync", "Beyoncé"), true, "letters in order on the folded text");
});

test("the tiers fold the query and the name alike", () => {
  const t = (q, name) => Score.tier(q, { name });
  assert.equal(t("beyonce", "Beyoncé - CUFF IT"), "prefix");
  assert.equal(t("beyoncé", "Beyonce"), "exact");
  assert.equal(t("pokemon data", "Pokémon Database"), "prefix");
  assert.equal(t("data pokemon", "Pokémon Database"), "words");
  assert.equal(t("விக்கி", "தமிழ் விக்கிப்பீடியா"), "words");
  assert.equal(t("моск", "Москва - Википедия"), "prefix");
  assert.equal(t("résumé", "Control the menu (toggle / summon)"), "", "no false hit from a split word");
  assert.equal(t("pass", "1Password"), "prefix", "a leading numeral is still skipped");
  assert.equal(t("zip", "7-Zip"), "prefix");
  assert.equal(t("моск", "Москва").length > 0, true, "a name that starts with a letter of another script is no numeral-led name");
});

test("the providers' own searches fold too", () => {
  const cb = run("cb resume", { clipboard: [{ type: "text", text: "My Résumé, final" }, { type: "text", text: "groceries" }] });
  assert.deepEqual(plain(cb.map(r => r.title)).filter(t => /sum/i.test(t)), ["My Résumé, final"]);
  const recent = run("recent cafe", { files: [{ path: "/home/u/Café menu.pdf", name: "Café menu.pdf" }, { path: "/home/u/a.txt", name: "a.txt" }] });
  assert.ok(recent.some(r => r.title === "Café menu.pdf"), JSON.stringify(recent.map(r => r.title)));
});

test("what the first fold missed: emoji-glued words, punctuation-led names, accented camel case, kill and themes (Fable 2026-10-05)", () => {
  assert.equal(inOrder("nts", "📝Notes"), true, "a word start after an emoji glued to it");
  assert.equal(inOrder("ir", "x firefox"), false, "a separator two back starts no word (Fable 2026-10-05)");
  assert.equal(inOrder("frfx", "Firefox"), true);
  assert.equal(inOrder("xfr", "Firefox"), false, "the first letter at a word start");
  assert.equal(inOrder("f", "Firefox"), false, "two letters at least");
  assert.equal(inOrder("abc", "With desktop + microphone audio + webcam"), false, "letters spread over a long label are no match");
  assert.equal(inOrder("new", "Network"), true);
  assert.equal(inOrder("fx", "Foot Firefox"), true, "a later start when the first is too far (Fable 2026-10-05)");
  assert.equal(inOrder("sn", "Stop Screenrecording"), true);
  const t = (q, name) => Score.tier(q, { name });
  assert.equal(t("beta", "(beta) app"), "prefix");
  assert.equal(t("net", ".NET SDK"), "prefix");
  assert.equal(t("hash", "#hashtag"), "prefix");
  assert.equal(Match.unled("plain"), null, "a name that starts with a letter has no lead");
  assert.deepEqual(plain(Match.words("CaféBar")), ["cafe", "bar", "cafebar"], "the accent off before the case split");
  const killed = run("kill cafe", { processes: [{ pid: 7, rss: 1, cpu: 0, name: "café-server", args: "/opt/café/server" }] });
  assert.ok(plain(killed).some(r => /café-server/.test(r.title)), JSON.stringify(plain(killed).map(r => r.title)));
});
