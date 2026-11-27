// What a screen reader is told of an answer (ROADMAP 71): its words,
// without Markdown's marks.
import { test } from "node:test";
import assert from "node:assert/strict";
import { runInContext } from "node:vm";
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
  // Long input costs what a short one does: it is cut before any pattern
  // runs. Counted, not timed, as a wall-clock bound failed on a busy
  // machine: no split or replace in spoken() sees more than the cut keeps.
  const proto = runInContext("String.prototype", M), real = { split: proto.split, replace: proto.replace };
  let longest = 0;
  for (const name of Object.keys(real))
    proto[name] = function(...a) { longest = Math.max(longest, this.length); return real[name].apply(this, a) };
  try { M.spoken(" ".repeat(100000) + "x" + "\t".repeat(100000) + "[".repeat(100000), 600); }
  finally { Object.assign(proto, real); }
  assert.ok(longest > 0, "the patterns ran");
  assert.ok(longest <= 600 * 4, "300 KB of spaces, tabs and brackets, cut to " + longest + " characters before its patterns");
});
