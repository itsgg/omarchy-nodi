// `nodi pick`: the rows a program hands the bar on stdin, how they rank as
// you type, what bin/nodi may ask for, and where the answer is written.

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { load, plain } from "./load.mjs";

const Pick = load("lib/Pick.js");
const Keys = load("lib/Keys.js");

test("plain lines are rows titled by the line, blank ones skipped, each keeping its line", () => {
  const rows = Pick.parse("alpha\n\n  \nbeta\r\ngamma\n", false);
  assert.deepEqual(plain(rows.map(r => [r.line, r.title])), [[0, "alpha"], [3, "beta"], [4, "gamma"]]);
  assert.equal(Pick.parse("x".repeat(1000), false)[0].title.length, 300, "a long line is cut for the row, never for the answer");
});

test("--json lines are rows as a script filter prints them; Enter only chooses, so no action is read", () => {
  const input = [
    JSON.stringify({ title: "Meeting", subtitle: "Monday", icon: "󰎞", badge: "3", preview: "## Notes", action: { exec: ["rm", "-rf", "/"] } }),
    "not json",
    JSON.stringify({ subtitle: "no title" }),
    JSON.stringify({ title: "Report", image: "relative.png" })
  ].join("\n");
  const rows = Pick.parse(input, true);
  assert.deepEqual(plain(rows.map(r => r.line)), [0, 3]);
  assert.equal(rows[0].subtitle, "Monday");
  assert.deepEqual(plain(rows[0].preview), { markdown: "## Notes" });
  assert.equal(rows[1].image, "", "an image must be an absolute path");
  const shown = Pick.rows("", rows);
  assert.ok(shown.every(r => !r.run && r.nodi === "pick" && r.actions.length === 0), "nothing a row says can run");
});

test("an empty field shows every row in order; typing ranks by Nodi's tiers, ties in the order given", () => {
  const rows = Pick.parse("Firefox private window\nOpen file\nFirefox\nfile manager\n", false);
  assert.deepEqual(plain(Pick.rows("", rows).map(r => r.title)), ["Firefox private window", "Open file", "Firefox", "file manager"]);
  assert.deepEqual(plain(Pick.rows("firefox", rows).map(r => r.title)), ["Firefox", "Firefox private window"], "the exact name first");
  assert.deepEqual(plain(Pick.rows("file", rows).map(r => r.title)), ["file manager", "Open file"], "a prefix before a later word");
  assert.deepEqual(plain(Pick.rows("zzz", rows)), []);
  const r = Pick.rows("open", rows)[0];
  assert.equal(r.key, "pick:1");
  assert.equal(Pick.lineOf(r.key), 1);
  assert.equal(Pick.lineOf("menu:x"), -1);
  assert.ok(Pick.rows("", rows).every(x => x.section === "" && !x.hero), "no section header over a pick");
});

test("a request names its own directory under the runtime directory, and nothing else", () => {
  const ok = Pick.request(JSON.stringify({ dir: "/run/user/1000/nodi-pick.Ab12Cd34", id: "Ab12Cd34", placeholder: "Which?", json: true }));
  assert.deepEqual(plain(ok), { dir: "/run/user/1000/nodi-pick.Ab12Cd34", id: "Ab12Cd34", placeholder: "Which?", json: true });
  for (const bad of [
    { dir: "/home/u", id: "x" },
    { dir: "/run/user/1000/nodi-pick.Ab12", id: "Other" },
    { dir: "/run/user/1000/../../home/u/nodi-pick.Ab12", id: "Ab12" },
    { dir: "relative/nodi-pick.Ab12", id: "Ab12" },
    { dir: "/tmp/x\n/nodi-pick.Ab12", id: "Ab12" },
    { dir: "/tmp/nodi-pick.Ab12", id: "Ab;12" },
    "not an object"
  ]) assert.equal(Pick.request(JSON.stringify(bad)), null, JSON.stringify(bad));
  assert.equal(Pick.request("{"), null);
});

test("the answer goes into the FIFO and nowhere else", () => {
  const dir = mkdtempSync(join(tmpdir(), "nodi-pick-test-"));
  try {
    const argv = Pick.answerArgv(dir, "pick 3");
    // No FIFO: nothing is made (and the writer says it wrote nothing).
    assert.throws(() => execFileSync(argv[0], argv.slice(1), { stdio: "ignore" }));
    assert.ok(!existsSync(join(dir, "answer")), "a missing FIFO is not created as a file");
    // A file in its place is left as it was.
    writeFileSync(join(dir, "answer"), "kept");
    assert.throws(() => execFileSync(argv[0], argv.slice(1), { stdio: "ignore" }));
    assert.equal(readFileSync(join(dir, "answer"), "utf8"), "kept");
    rmSync(join(dir, "answer"));
    execFileSync("/usr/bin/mkfifo", [join(dir, "answer")]);
    const got = execFileSync("/usr/bin/bash", ["-c", 'exec 3<>"$1"; "${@:2}"; IFS= read -r -t 3 a <&3; printf %s "$a"', "t", join(dir, "answer"), ...argv]).toString();
    assert.equal(got, "pick 3");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("in a pick, Enter chooses and nothing else acts: no actions, no fill-in, no copy", () => {
  const v = { palette: null, rows: 3, selected: 1, text: "fi", pick: true };
  assert.deepEqual(plain(Keys.decide({ name: "Return" }, v)), { do: "activate", index: 1 });
  for (const key of [{ name: "Tab" }, { name: "K", ctrl: true }, { name: "Return", ctrl: true }])
    assert.deepEqual(plain(Keys.decide(key, v)), { do: "nothing" }, JSON.stringify(key));
  assert.deepEqual(plain(Keys.decide({ name: "Escape" }, v)), { do: "clear" });
  assert.deepEqual(plain(Keys.decide({ name: "Escape" }, Object.assign({}, v, { text: "" }))), { do: "dismiss" });
});
