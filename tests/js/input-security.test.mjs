import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { root } from "./load.mjs";

const card = readFileSync(join(root, "components/Card.qml"), "utf8");
const nodi = readFileSync(join(root, "Nodi.qml"), "utf8");
const homeSources = readFileSync(join(root, "components/HomeSources.qml"), "utf8");
const ask = readFileSync(join(root, "components/Ask.qml"), "utf8");

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
  const call = nodi.slice(start, end).match(/windowCwdReader\.run\(([^\n]*)\)/);
  assert.ok(call, "the read is started in startAsk");
  assert.match(call[1], /Sources\.cwdArgv\(\)/, "the argv is fixed: no pid in it");
  assert.match(call[1], /env:\s*env/, "the pid is carried in the reader's environment");
  assert.match(nodi.slice(start, end), /Sources\.sameWindow\(root\.windows, address, pid\)[\s\S]*windowCwdReader\.run/, "only for a window the list still holds");
  assert.match(nodi, /Sources\.sameWindow\(root\.windows, tag\.address, tag\.pid\)/, "and checked again before the answer is taken");
  assert.doesNotMatch(nodi, /snapshot\.window\.address|window:\s*\{[^}]*address/, "the address is not put in the snapshot");
  assert.doesNotMatch(nodi, /prepareDirectAsk[\s\S]{0,400}snapshot/, "a prepared ask collects nothing");
});

test("prompt context is built only where a turn is sent, and never logged", () => {
  assert.equal((ask.match(/PromptContext\.build\(/g) || []).length, 1, "built once, at the prompt");
  for (const file of [ask, nodi]) assert.doesNotMatch(file, /console\.\w+\([^)]*(snapshot|PromptContext|promptMeta)/i);
});

test("explicit paste advances the cursor and agent paste waits for confirmation", () => {
  const insert = nodi.slice(nodi.indexOf("  function insertPaste("),
                            nodi.indexOf("\n  function ", nodi.indexOf("  function insertPaste(") + 1));
  assert.match(insert, /field\.insert\(start,\s*value\)[\s\S]*field\.cursorPosition\s*=\s*start\s*\+\s*value\.length/);
  const resultStart = nodi.indexOf('row.nodi === "askResult"');
  const result = nodi.slice(resultStart,
                            nodi.indexOf('row.nodi === "askWith"', resultStart));
  assert.match(result, /resultAction\.paste\s*!==\s*undefined[\s\S]*proposeResultAction/);
  assert.doesNotMatch(result, /Run\.paste|Run\.copy/);
  assert.match(ask, /ExternalRows\.actionOf\(item\.action,\s*\{[\s\S]*paste:\s*true/);
});

test("Ask serializes cwd lookup and rebuilds resumed session authority", () => {
  const start = nodi.slice(nodi.indexOf("  function startAsk("),
                           nodi.indexOf("\n  function ", nodi.indexOf("  function startAsk(") + 1));
  assert.match(start, /root\.pendingAsk\s*\|\|\s*askSession\.busy\(\)/);
  const resume = ask.slice(ask.indexOf("  function beginResume("),
                           ask.indexOf("\n  function ", ask.indexOf("  function beginResume(") + 1));
  assert.match(resume, /ask\.clearSessionScope\(\)/);
  assert.match(resume, /ask\.sessionServers\s*=\s*ask\.makeSessionServers\(\)/);
  const response = ask.slice(ask.indexOf('kind === "resume"'),
                             ask.indexOf('kind.indexOf("config:")'));
  assert.match(response, /ask\.configureSession\(m\.result\)/);
  const up = ask.slice(ask.indexOf("  function sessionUp("),
                       ask.indexOf("\n  function ", ask.indexOf("  function sessionUp(") + 1));
  assert.match(up, /ask\.caps\.list\s*&&\s*ask\.caps\.resume/);
  const recycle = ask.slice(ask.indexOf("  function recycle("),
                            ask.indexOf("\n  function ", ask.indexOf("  function recycle(") + 1));
  assert.match(recycle, /Acp\.cancel\(ask\.sessionId\)[\s\S]*ask\.turn\s*=\s*null/);
});

test("a window's picture question is snapshotted when chosen, and sent as it was", () => {
  const chosen = nodi.slice(nodi.indexOf('row.nodi === "askWindow"'), nodi.indexOf('row.nodi === "ask")'));
  assert.match(chosen, /root\.shotAsk\s*=\s*Object\.assign\(\{\},\s*row\.ask,\s*\{\s*captured:\s*root\.askCapture\(/, "taken at the row's invocation");
  const done = nodi.slice(nodi.indexOf("id: windowShot"), nodi.indexOf("What the agent found for one turn"));
  assert.equal((done.match(/a\.captured\)/g) || []).length, 1, "the capture sends that snapshot");
  assert.match(done, /Qt\.callLater\(function\(\) \{ root\.startAsk\(/, "after the reader has ended, which startAsk refuses while it reports");
  assert.doesNotMatch(done, /askContext|askCapture|cameFrom/, "nothing is read again when the picture is done");
});

test("watched files use FileView only for notifications and a bounded descriptor reader for bytes", () => {
  const view = homeSources.match(/FileView\s*\{([\s\S]*?)\n\s*\}/);
  assert.ok(view);
  assert.match(view[1], /preload:\s*false/);
  assert.match(view[1], /blockLoading:\s*true/);
  assert.match(view[1], /blockAllReads:\s*true/);
  assert.doesNotMatch(homeSources, /\.text\s*\(/);
  assert.match(homeSources, /Parser\.readArgv\(/);

  const open = nodi.slice(nodi.indexOf("  function open("), nodi.indexOf("  function close("));
  assert.doesNotMatch(open, /watchedHome|readArgv|homeSourceReader/, "opening the bar does not start a watched-source process");
});
