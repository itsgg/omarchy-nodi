// Translation by Claude (ROADMAP 48): providers/translate.js.
import { test } from "node:test";
import assert from "node:assert/strict";
import { config, run, top } from "./fixtures.mjs";

const stale = text => ({ selection: { text, fresh: false } });

test("tr: a language by code or name, then the text, to Claude; the selection when no text (ROADMAP 48)", () => {
  const r = top("tr ta good morning");
  assert.deepEqual([r.title, r.nodi, r.ask.question, r.ask.context], ["Translate to Tamil", "askWith", "Translate to Tamil: good morning", ""]);
  assert.match(r.ask.message, /^Translate the text below to Tamil\..*<text>\ngood morning\n<\/text>$/s);
  assert.equal(top("tr French bonjour mes amis").ask.message.includes("<text>\nbonjour mes amis\n"), true, "by name");
  assert.equal(top("tr good morning").title, "Translate to English", "no language: nodi.json's, else English");
  assert.equal(top("tr good morning", {}, { ...config, translate: { language: "Tamil" } }).title, "Translate to Tamil");
  assert.equal(top("tr hi there").ask.message.includes("<text>\nhi there\n"), true, "a code that is a word is text");
  assert.equal(top("tr hindi hi there").title, "Translate to Hindi");
  const s = top("tr tamil", stale("good night"));
  assert.deepEqual([s.ask.question, s.ask.context], ["Translate to Tamil: the selection", "selection"]);
  assert.equal(top("tr tamil").hint, "tr <language> <text>", "nothing to translate yet");
});

test("<text> in <language> at root, by name only", () => {
  const r = top("good morning in tamil");
  assert.deepEqual([r.title, r.ask.question], ["Translate to Tamil", "Translate to Tamil: good morning"]);
  assert.ok(run("weather in thai").some(x => x.provider === "fallback"), "a guess: the fallbacks under it (Fable 2026-10-06)");
  for (const q of ["zoom in", "log in google", "5 km in mi", "100 usd in inr", "3pm in tokyo", "hello in ta"])
    assert.ok(!run(q).some(x => x.provider === "translate"), q);
});
