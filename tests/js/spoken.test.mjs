// What a screen reader is told of an answer (ROADMAP 71): its words,
// without Markdown's marks.
import { test } from "node:test";
import assert from "node:assert/strict";
import { load } from "./load.mjs";

const M = load("lib/Markdown.js");

test("spoken: an answer's words, the marks gone, snake_case kept", () => {
  assert.equal(M.spoken("## Ports\n\nUse **ss**, from `iproute2`:\n\n```sh\nss -tulpn\n```\n\n- *-t* TCP\n1. see [the man page](https://x.test/ss)"),
    "Ports Use ss, from iproute2: ss -tulpn -t TCP see the man page");
  assert.equal(M.spoken("keep my_var_name and 2 * 3 * 4"), "keep my_var_name and 2 * 3 * 4");
  assert.equal(M.spoken(""), "");
  // Asterisks in numbers are no marks (Sonnet 2026-10-06: 2**10 was "210").
  assert.equal(M.spoken("5*3 and 4*2, 2**10, x = 2**3 + 2**4, a*b*c"), "5*3 and 4*2, 2**10, x = 2**3 + 2**4, a*b*c");
  assert.equal(M.spoken("see [wiki](https://en.wikipedia.org/wiki/Foo_(bar)) ok"), "see wiki ok", "a link with parentheses");
  assert.equal(M.spoken("2024) was a year"), "2024) was a year");
  assert.equal(M.spoken("| Port | Process |\n|---|---|\n| 5173 | node |"), "Port, Process. 5173, node.", "a table, its rule gone, its cells apart");
  assert.equal(M.spoken("one two three four five six", 12), "one two, and more", "cut at a word");
  // A pipe outside a table is a pipe (Sonnet 2026-10-06).
  assert.equal(M.spoken("cat f | grep x"), "cat f | grep x");
  assert.equal(M.spoken("Use `ls | wc -l` to count."), "Use ls | wc -l to count.");
  assert.equal(M.spoken("a || b"), "a || b");
  assert.equal(M.spoken("Port | Process\n--- | ---\n5173 | node"), "Port, Process. 5173, node.", "a table without edge pipes, by its rule");
  // Long input costs what a short one does.
  const started = Date.now();
  M.spoken(" ".repeat(100000) + "x" + "\t".repeat(100000) + "[".repeat(100000), 600);
  assert.ok(Date.now() - started < 1000, "100 KB of spaces, tabs and brackets in under a second");
});
