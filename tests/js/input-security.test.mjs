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
  assert.doesNotMatch(card, /\bReader\s*\{/);
  assert.equal((card.match(/StandardKey\.Paste/g) || []).length, 2);
  assert.equal((card.match(/acceptedButtons:\s*Qt\.MiddleButton/g) || []).length, 2);
  assert.equal((card.match(/\bDropArea\s*\{/g) || []).length, 2);
});
