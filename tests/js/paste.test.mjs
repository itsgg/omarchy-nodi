// A paste goes to the window the bar opened over (ROADMAP 69).
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, mkdirSync, chmodSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { load, plain } from "./load.mjs";

const Run = load("lib/Run.js");

test("which runs paste: Omarchy's pastes, never their copy-only form", () => {
  assert.equal(Run.pastes(Run.exec(["omarchy-menu-emoji-insert", "x"])), true);
  assert.equal(Run.pastes(Run.exec(["omarchy-clipboard-paste-text", "--shift-insert", "--history-index", "2"])), true);
  assert.equal(Run.pastes(Run.exec(["omarchy-clipboard-paste-text", "--copy-only", "--history-index", "2"])), false);
  assert.equal(Run.pastes(Run.exec(["omarchy-clipboard-paste-file", "image/png", "/a.png"])), true);
  assert.equal(Run.pastes(Run.copy("x")), false);
  assert.equal(Run.pastes(Run.exec(["firefox"])), false);
  assert.equal(Run.pastes(Run.shell('exec wtype -- "$1"', ["x"])), false, "a shell run is a paste only when marked");
  const marked = Run.pasting(Run.shell('exec wtype -- "$1"', ["x"]));
  assert.equal(Run.pastes(marked), true);
  assert.equal(Run.valid(marked), true);
  assert.equal(Run.command(marked, null, "", "0x5b8f")[2], Run.FOCUS_FIRST, "a marked shell run focuses first (Sonnet 2026-10-07)");
});

test("a paste's command focuses the window first; anything else, or no window, as it is", () => {
  const run = Run.exec(["omarchy-menu-emoji-insert", "hi"]);
  const argv = Run.command(run);
  const wrapped = Run.focusFirst(run, argv, "0x5b8f");
  assert.deepEqual(plain(wrapped.slice(0, 2).concat(wrapped.slice(3, 5))), ["/usr/bin/bash", "-c", "nodi-paste", "0x5b8f"]);
  assert.deepEqual(plain(wrapped.slice(5)), plain(argv));
  assert.equal(Run.focusFirst(run, argv, ""), argv, "no window known");
  assert.deepEqual(plain(Run.command(run, null, "", "0x5b8f")), plain(wrapped), "Run.command does it with the window given");
  assert.deepEqual(plain(Run.command(run, null, "")), plain(argv), "and without one, as before");
  assert.equal(Run.focusFirst(run, argv, "0xzz; rm"), argv, "an address is hex");
  const other = Run.exec(["firefox"]);
  const plainArgv = Run.command(other);
  assert.equal(Run.focusFirst(other, plainArgv, "0x5b8f"), plainArgv, "no paste: as it is");
});

test("focus first, then the paste as it was, its arguments untouched", () => {
  const dir = mkdtempSync(join(tmpdir(), "nodi-paste-"));
  try {
    mkdirSync(join(dir, "bin"));
    writeFileSync(join(dir, "bin/hyprctl"), '#!/bin/bash\nprintf "%s\\n" "$*" >> "$HOME/log"; echo ok\n');
    writeFileSync(join(dir, "bin/paster"), '#!/bin/bash\nprintf "paste [%s]\\n" "$1" >> "$HOME/log"\n');
    for (const f of ["hyprctl", "paster"]) chmodSync(join(dir, "bin", f), 0o755);
    execFileSync("/usr/bin/bash", ["-c", Run.FOCUS_FIRST, "nodi-paste", "0x5b8f", "paster", "it's $(not) run"], { env: { HOME: dir, PATH: join(dir, "bin") + ":/usr/bin" } });
    assert.deepEqual(readFileSync(join(dir, "log"), "utf8").trim().split("\n"),
                     ['dispatch hl.dsp.focus({ window = "address:0x5b8f" })', "paste [it's $(not) run]"]);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("the pastes that run through a shell are marked so", async () => {
  const { run } = await import("./fixtures.mjs");
  const { config } = await import("./fixtures.mjs");
  const snip = Object.assign({}, config, { snippets: [{ keyword: "sig", text: "Hi {cursor}there" }] });
  const { Engine, services } = await import("./fixtures.mjs");
  const row = Engine.run("sig", snip, services({}))[0];
  assert.equal(Run.pastes(row.run), true, "a snippet with its cursor moved back");
  assert.equal(Run.pastes(row.actions.find(a => a.label === "Type it out").run), true, "Type it out");
  const seq = run("paste the clipboard in sequence", {})[0];
  assert.equal(Run.pastes(seq.run), true, "a paste in sequence");
});
