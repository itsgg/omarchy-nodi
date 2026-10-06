// Coding agents (ROADMAP 61): their limits from Omarchy's usage records,
// and their sessions running in a terminal.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { load, plain } from "./load.mjs";
import { Engine, config, services, run } from "./fixtures.mjs";

const A = load("providers/agents.js");
const now = () => new Date(Date.UTC(2026, 9, 6, 16, 0));
const usage = [
  { id: "claude", name: "Claude Code", limits: [{ label: "Session (5-hour)", percent: 0.27, resetsAt: "2026-10-06T19:30:00+00:00" },
                                                { label: "Weekly (7-day)", percent: 0.94, resetsAt: "2026-10-08T20:00:00+00:00" },
                                                { label: "Fable Weekly", title: "Fable Weekly", percent: 1.0, resetsAt: "2026-10-08T20:00:00+00:00" }] },
  { id: "codex", name: "Codex", limits: [{ label: "5h window", percent: 0.5, resetsAt: "2026-10-06T17:12:00+00:00" }] },
  { id: "fireworks", name: "Fireworks", limits: [] }
];

test("usage: each limit, its share and when it resets", () => {
  const rows = run("usage", { agentUsage: usage, now }).filter(r => r.key.startsWith("agents:limit"));
  assert.deepEqual(plain(rows.map(r => [r.title, r.badge])), [["Claude Code: 27% of Session (5-hour)", "27%"], ["Claude Code: 94% of Weekly (7-day)", "94%"],
    ["Claude Code: 100% of Fable Weekly", "100%"], ["Codex: 50% of 5h window", "50%"]]);
  const clock = d => String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
  assert.equal(rows[0].subtitle, "resets in 3 h 30 min, at " + clock(new Date(Date.UTC(2026, 9, 6, 19, 30))), "at the local clock");
  assert.match(rows[1].subtitle, /^resets on (Thu 8|Fri 9) Oct at \d\d:\d\d$/, "past a day, by its date");
  assert.equal(rows[3].subtitle.startsWith("resets in 1 h 12 min"), true);
  assert.equal(run("usage", { now }).find(r => r.provider === "agents").title, "Reading the usage records...");
  assert.equal(run("usage", { agentUsage: [], now }).find(r => r.provider === "agents").title, "No usage recorded");
});

test("the empty bar: an agent's highest limit at 80% or more, and it starts no read", () => {
  const asked = [];
  const home = Engine.run("", config, services({ agentUsage: usage, now, asked })).filter(r => r.provider === "agents");
  assert.deepEqual(plain(home.map(r => r.title)), ["Claude Code: 100% of Fable Weekly"], "one an agent, its highest; Codex at 50% is not shown");
  assert.ok(!asked.includes("agent-usage"), "the home only looks");
});

test("sessions: in a terminal, the busiest first, Enter focusing it", () => {
  const sessions = [
    { tool: "claude", pid: "11", cwd: "/home/u/Work/kalvi", address: "0xa1", cls: "foot", title: "kalvi", said: "is the reviewer running", at: 100 },
    { tool: "codex", pid: "12", cwd: "/home/u", address: "0xb2", cls: "foot", title: "Configure pi", said: "", at: 0 },
    { tool: "claude", pid: "13", cwd: "/home/u/x", address: "bad", cls: "foot", title: "?", said: "", at: 200 }];
  const rows = run("agents", { agentSessions: sessions }).filter(r => r.key.startsWith("agents:session"));
  assert.deepEqual(plain(rows.map(r => [r.title, r.subtitle])), [["Claude Code in ~/Work/kalvi", "\"is the reviewer running\""], ["Codex in ~", "Configure pi"]]);
  assert.deepEqual(plain(rows[0].run), { kind: "window", address: "0xa1" });
  assert.equal(rows[0].remember, false);
  assert.equal(run("agents", { agentSessions: [] }).find(r => r.provider === "agents").title, "No agent session in a terminal");
});

test("the usage read: each record as it is, nothing for none", () => {
  const dir = mkdtempSync(join(tmpdir(), "nodi-agents-"));
  try {
    const sh = () => execFileSync("/usr/bin/bash", ["-c", A.USAGE], { env: { HOME: dir, PATH: "/usr/bin" } }).toString();
    assert.equal(sh(), "", "no records");
    mkdirSync(join(dir, ".local/state/omarchy/agents/usage"), { recursive: true });
    writeFileSync(join(dir, ".local/state/omarchy/agents/usage/claude.json"), JSON.stringify(usage[0], null, 2));
    writeFileSync(join(dir, ".local/state/omarchy/agents/usage/broken.json"), "{ nope");
    assert.deepEqual(plain(A.lines(sh()).map(r => r.id)), ["claude"], "one line a record, a broken one skipped");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("a session by its own arguments, never a prompt's words; no single answer, no SDK run, none of Akshi's", () => {
  const is = (c, home) => A.isSession(Object.assign({ cwd: "/home/u/x" }, c), home || "/home/u");
  assert.equal(is({ tool: "claude", argv: ["--continue"], entrypoint: "cli" }), true);
  assert.equal(is({ tool: "claude", argv: ["fix the exec path"] }), true, "a prompt that says exec (Sonnet 2026-10-06)");
  assert.equal(is({ tool: "claude", argv: ["-p", "hi"] }), false);
  assert.equal(is({ tool: "claude", argv: ["--print"] }), false);
  assert.equal(is({ tool: "claude", argv: [], entrypoint: "sdk-cli" }), false, "an SDK run");
  assert.equal(is({ tool: "codex", argv: ["exec", "do it"] }), false);
  assert.equal(is({ tool: "codex", argv: ["app-server"] }), false);
  assert.equal(is({ tool: "codex", argv: ["-p", "work"] }), true, "codex's -p is a profile");
  assert.equal(is({ tool: "codex", argv: ["resume"] }), true);
  assert.equal(is({ tool: "codex", argv: ["--dangerously-bypass-approvals-and-sandbox", "exec", "x"] }), false, "a flag before its subcommand (Sonnet 2026-10-06)");
  assert.equal(is({ tool: "codex", argv: ["-m", "exec", "hi"] }), true, "exec as a flag's value is no subcommand");
  assert.equal(is({ tool: "claude", argv: [], cwd: "/home/u/Akshi" }), false, "Akshi's (his ruling)");
  assert.equal(is({ tool: "claude", argv: [], cwd: "/home/u/Akshix" }), true, "only Akshi's own folder");
  assert.equal(is({ tool: "node", argv: [] }), false);
});

test("the reset said plainly: minutes, hours, a date past a day, and a record older than its reset", () => {
  const at = (h, m) => Date.UTC(2026, 9, 6, h, m);
  const nowMs = at(16, 0);
  const clock = ms => { const d = new Date(ms); return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0"); };
  assert.equal(A.resets(at(19, 0), nowMs), "resets in 3 h, at " + clock(at(19, 0)));
  assert.equal(A.resets(at(16, 45), nowMs), "resets in 45 min, at " + clock(at(16, 45)));
  assert.equal(A.resets(at(17, 5), nowMs), "resets in 1 h 5 min, at " + clock(at(17, 5)));
  assert.match(A.resets(Date.UTC(2026, 9, 12, 12, 0), nowMs), /^resets on (Mon|Sun|Tue) 1[123] Oct at \d\d:\d\d$/, "past a day, by its date");
  assert.equal(A.resets(at(15, 0), nowMs), "reset at " + clock(at(15, 0)) + "; the record is older");
  assert.equal(A.resets(NaN, nowMs), "");
});

test("sessions from the script's lines: windowed, by isSession", () => {
  const sessions = [
    { tool: "claude", pid: "1", cwd: "/home/u/a", address: "0xa", argv: ["-p"], said: "", at: 9 },
    { tool: "claude", pid: "2", cwd: "/home/u/Akshi", address: "0xb", argv: [], said: "", at: 8 },
    { tool: "codex", pid: "3", cwd: "/home/u/c", address: "0xc", argv: ["-p", "work"], said: "", at: 7 }];
  assert.deepEqual(plain(run("agents", { agentSessions: sessions }).filter(r => r.key.startsWith("agents:session")).map(r => r.title)), ["Codex in ~/c"]);
});
