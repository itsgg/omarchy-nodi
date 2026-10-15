import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { root } from "./load.mjs";

const card = readFileSync(join(root, "components/Card.qml"), "utf8");
const nodi = readFileSync(join(root, "Nodi.qml"), "utf8");

test("the card keeps no editable TextInput alive", () => {
  assert.doesNotMatch(card, /\bTextInput\s*\{/);
  assert.equal((card.match(/\bTextEdit\s*\{/g) || []).length, 2);
});

test("all native paste paths are replaced by the bounded reader", () => {
  assert.match(nodi, /timeoutMs:\s*2000/);
  assert.match(nodi, /maxBytes:\s*65536/);
  assert.match(nodi, /id:\s*pasteReader[\s\S]*?terminateLines:\s*false/,
    "explicit paste keeps exact clipboard text instead of Reader's synthetic line ending");
  assert.doesNotMatch(card, /\bReader\s*\{/);
  assert.equal((card.match(/StandardKey\.Paste/g) || []).length, 2);
  assert.equal((card.match(/acceptedButtons:\s*Qt\.MiddleButton/g) || []).length, 2);
  assert.equal((card.match(/\bDropArea\s*\{/g) || []).length, 2);
});

test("a window's working directory is read once, bounded, and only as an Ask starts", () => {
  const reads = nodi.match(/Sources\.cwdArgv\(/g) || [];
  assert.equal(reads.length, 1, "one place starts the read");
  const start = nodi.indexOf("  function startAsk(");
  const end = nodi.indexOf("\n  function ", start + 1);
  assert.ok(start > 0 && end > start);
  assert.ok(nodi.slice(start, end).includes("Sources.cwdArgv("), "inside startAsk, which only a chosen Ask action calls");
  const reader = nodi.match(/Reader\s*\{\s*id:\s*windowCwdReader([\s\S]*?)\n  \}/);
  assert.ok(reader, "its own reader, so every limit applies");
  assert.ok(Number(reader[1].match(/timeoutMs:\s*(\d+)/)[1]) <= 1000, "a deadline of a second at most");
  assert.ok(Number(reader[1].match(/maxBytes:\s*(\d+)/)[1]) <= 8192, "what it may print is capped");
  assert.doesNotMatch(nodi, /prepareDirectAsk[\s\S]{0,400}snapshot/, "a prepared ask collects nothing");
});

test("prompt context is built only where a turn is sent, and never logged", () => {
  const ask = readFileSync(join(root, "components/Ask.qml"), "utf8");
  assert.equal((ask.match(/PromptContext\.build\(/g) || []).length, 1, "built once, at the prompt");
  for (const file of [ask, nodi]) assert.doesNotMatch(file, /console\.\w+\([^)]*(snapshot|PromptContext|promptMeta)/i);
});
