// The notification history as rows: found by what they said, newest first,
// Enter doing what clicking the toast did.

import { test } from "node:test";
import assert from "node:assert/strict";
import { load, plain } from "./load.mjs";
import { run, top, now } from "./fixtures.mjs";

const N = load("providers/notifications.js");
const Pane = load("lib/Pane.js");
const Rows = load("lib/Rows.js");
const at = now().getTime();
const text = [
  JSON.stringify({ app: "omarchy-action", summary: "Process crashed: chromium", body: "Click to diagnose with AI", glyph: "x", execArgv: JSON.stringify(["omarchy-agent-crash", "123"]), timestamp: at - 3600e3 }),
  JSON.stringify({ app: "Nodi", summary: "nodi.json has an error", body: "line 3: expected , or }", glyph: "", execArgv: "", timestamp: at - 60e3 }),
  JSON.stringify({ app: "x", summary: "Bad action", body: "", execArgv: "rm -rf ~", timestamp: at - 120e3 }),
  JSON.stringify({ app: "x", summary: "Dash", body: "", execArgv: JSON.stringify(["-c", "x"]), timestamp: at - 200e3 }),
  "not json",
  JSON.stringify({ app: "x", body: "no summary", timestamp: at })
].join("\n");
const notifications = N.parse(text, true);

test("the history parses, newest first, an action only when it is an argv", () => {
  assert.deepEqual(plain(notifications.map(n => n.summary)), ["nodi.json has an error", "Bad action", "Dash", "Process crashed: chromium"]);
  assert.equal(notifications[2].argv, null, "a program that reads as an option never runs, as in the shell");
  assert.deepEqual(plain(notifications[3].argv), ["omarchy-agent-crash", "123"]);
  assert.equal(notifications[1].argv, null, "a string that is not a JSON argv never runs");
  assert.throws(() => N.parse("", false));
});

test("found by what they said, Enter does what the click did", () => {
  const crash = top("crashed", { notifications });
  assert.equal(crash.title, "Process crashed: chromium");
  assert.equal(crash.subtitle, "omarchy-action, Click to diagnose with AI, 1 h ago");
  assert.deepEqual(plain(crash.run), { kind: "exec", argv: ["omarchy-agent-crash", "123"] });
  const err = top("nodi.json", { notifications });
  assert.deepEqual(plain(err.run), { kind: "copy", text: "nodi.json has an error: line 3: expected , or }" });
  assert.equal(err.actionLabel, "Copy");
  const all = run("notifications", { notifications }).filter(r => r.provider === "notifications");
  assert.deepEqual(plain(all.map(r => r.title)), ["nodi.json has an error", "Bad action", "Dash", "Process crashed: chromium"]);
  assert.ok(!run("lock", { notifications }).some(r => r.provider === "notifications"));
});

test("multiline notification labels stay inside one result row while copy keeps the full text", () => {
  const multiline = [{
    app: "Agent",
    summary: "Review complete\nwith findings",
    body: "First line\n\nSecond\tline",
    glyph: "",
    argv: null,
    at
  }];
  const row = top("review complete", { notifications: multiline });
  assert.equal(row.title, "Review complete with findings");
  assert.equal(row.subtitle, "Agent, First line Second line, just now");
  assert.equal(row.copy, "Review complete\nwith findings: First line\n\nSecond\tline");
  assert.deepEqual(plain(row.run), { kind: "copy", text: row.copy });
  assert.equal(row.fullTitle, "Review complete\nwith findings");
  assert.equal(row.fullSubtitle, "Agent, First line\n\nSecond\tline, just now");
  assert.deepEqual(plain(Pane.choose({ row, anyPreview: true })),
    { title: row.fullTitle, subtitle: row.fullSubtitle });
  assert.ok(plain(Rows.actionsFor(row, {})).some(a =>
    a.label === "Copy title" && a.run.text === row.fullTitle));
});

test("the history read from Omarchy's own folder, and a day old said in days", async () => {
  const { mkdtempSync, mkdirSync, writeFileSync, rmSync } = await import("node:fs");
  const { execFileSync } = await import("node:child_process");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const home = mkdtempSync(join(tmpdir(), "nodi-notes-home-"));
  try {
    const dir = join(home, ".local/state/omarchy/notifications/history");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "1.json"), JSON.stringify({ app: "Mail", summary: "Two days old", body: "", timestamp: at - 2 * 86400e3 }, null, 2));
    writeFileSync(join(dir, "2.json"), JSON.stringify({ app: "Mail", summary: "Just now", body: "", timestamp: at - 1000 }));
    const argv = N.provider.sources.notifications.argv("", { home });
    const read = N.parse(execFileSync(argv[0], argv.slice(1)).toString(), true);
    assert.deepEqual(plain(read.map(n => n.summary)), ["Just now", "Two days old"], "each file one line, a pretty-printed one too");
    const old = top("two days", { notifications: read });
    assert.equal(old.subtitle, "Mail, 2 d ago");
    const none = N.provider.sources.notifications.argv("", { home: join(home, "nobody") });
    assert.equal(execFileSync(none[0], none.slice(1)).toString(), "", "no history: nothing, not a failure");
  } finally { rmSync(home, { recursive: true, force: true }); }
});
