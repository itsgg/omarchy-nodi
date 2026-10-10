// providers/agents.js's session lookup, run against a stand-in: a process
// named claude under this test, in a window a stand-in hyprctl lists, with
// a session record and a transcript whose last prompt is private. What it
// reads comes back in its JSON and reaches no program's arguments, where
// another local user could read it in /proc (the marketplace's review of
// f444138, 2026-10-10: the prompt went to jq as --arg said).
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, chmodSync, readFileSync, rmSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { load, plain } from "./load.mjs";

const A = load("providers/agents.js");

test("a session's prompt, window title, folder and arguments reach jq in its environment, never its arguments", async () => {
  const t = realpathSync(mkdtempSync(join(tmpdir(), "nodi-sessions-")));
  const bin = join(t, "bin"), work = join(t, "work dir");
  mkdirSync(bin); mkdirSync(work);
  const said = "secret prompt about the merger", title = "secret window title";
  writeFileSync(join(bin, "hyprctl"), '#!/bin/bash\n[ "$1" = clients ] && printf \'[{"pid": %s, "address": "0xabc123", "class": "foot", "title": "%s"}]\\n\' "$FAKE_WIN_PID" "$FAKE_TITLE"\n');
  // Each program the script starts by name logs its arguments.
  for (const p of ["jq", "tac", "stat", "sed", "readlink", "cut", "head"])
    writeFileSync(join(bin, p), '#!/bin/bash\nprintf "%s\\n" "$*" >> "$JQ_LOG"\nexec /usr/bin/' + p + ' "$@"\n');
  writeFileSync(join(bin, "tmux"), "#!/bin/bash\nexit 1\n");
  for (const f of ["hyprctl", "jq", "tac", "stat", "sed", "readlink", "cut", "head", "tmux"]) chmodSync(join(bin, f), 0o755);
  // A process named claude, this test its parent and so in the window.
  const agent = spawn("/usr/bin/bash", ["-c", 'exec -a claude /usr/bin/bash -c "sleep 30; :" nodi "secret argument"'], { cwd: work, stdio: "ignore" });
  // And one whose arguments sum past the 128 KB an environment string
  // holds (Fable 2026-10-10): listed still, its arguments cut.
  const big = "y".repeat(100000);
  const long = spawn("/usr/bin/bash", ["-c", 'exec -a claude /usr/bin/bash -c "sleep 30; :" nodi "$0" "$0"', big], { cwd: work, stdio: "ignore" });
  try {
    await new Promise(r => setTimeout(r, 300));
    mkdirSync(join(t, ".claude/sessions"), { recursive: true });
    writeFileSync(join(t, ".claude/sessions", agent.pid + ".json"), JSON.stringify({ sessionId: "s1", cwd: work, entrypoint: "cli" }));
    const project = join(t, ".claude/projects", work.replace(/[^A-Za-z0-9]/g, "-"));
    mkdirSync(project, { recursive: true });
    writeFileSync(join(project, "s1.jsonl"), [
      { type: "user", message: { content: "an older question" } },
      { type: "assistant", message: { content: [{ type: "text", text: "an answer" }] } },
      { type: "user", message: { content: said } }].map(l => JSON.stringify(l)).join("\n") + "\n");
    const log = join(t, "jq.log");
    const r = spawnSync("/usr/bin/bash", ["-c", A.provider.sources["agent-sessions"].argv()[2]], { encoding: "utf8",
      env: { PATH: bin + ":/usr/bin:/bin", HOME: t, JQ_LOG: log, FAKE_WIN_PID: String(process.pid), FAKE_TITLE: title } });
    assert.equal(r.status, 0, r.stderr);
    const mine = plain(A.provider.sources["agent-sessions"].parse(r.stdout, true)).filter(x => x.pid === String(agent.pid));
    assert.equal(mine.length, 1, r.stdout);
    assert.deepEqual([mine[0].tool, mine[0].said, mine[0].title, mine[0].cwd, mine[0].address], ["claude", said, title, work, "0xabc123"]);
    assert.deepEqual(mine[0].argv, ["-c", "sleep 30; :", "nodi", "secret argument"], "its arguments, each whole");
    const cut = plain(A.provider.sources["agent-sessions"].parse(r.stdout, true)).filter(x => x.pid === String(long.pid));
    assert.equal(cut.length, 1, "a session with long arguments is listed");
    assert.deepEqual(cut[0].argv.map(x => x.length), [2, 11, 4, 4096, 4096], "each argument at most 4 KB");
    const argvs = readFileSync(log, "utf8");
    for (const secret of [said, title, "secret argument", "work dir", "work-dir", "s1.jsonl"]) assert.ok(!argvs.includes(secret), "in an argument: " + secret);
  } finally {
    agent.kill(); long.kill();
    rmSync(t, { recursive: true, force: true });
  }
});
