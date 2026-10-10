// tools/installed.sh and `make install` agree on what is Nodi: an agent's
// own folder (.claude, whose worktrees are whole copies of the tree) and
// Python's bytecode are never copied, a copy an older install left is
// deleted, and the check does not count them (2026-10-10: a drive's
// worktrees went into the installed plugin; Cursor's review: excluded,
// they would have stayed there for good).
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { root } from "./load.mjs";

test("install hides .claude and __pycache__, deletes an older install's copy of each, and the check does not count them", () => {
  const rsync = readFileSync(join(root, "Makefile"), "utf8").split("\n").find(l => l.includes("rsync -a"));
  const flags = ["-a", "--checksum", "--delete"].filter(f => rsync.includes(" " + f + " "))
    .concat([...rsync.matchAll(/--(exclude|filter) '([^']+)'/g)].flatMap(m => ["--" + m[1], m[2]]));
  assert.deepEqual(flags.slice(0, 3), ["-a", "--checksum", "--delete"]);
  for (const x of [".claude", "__pycache__"]) assert.ok(flags.includes("H " + x), "make install hides " + x);
  const dest = mkdtempSync(join(tmpdir(), "nodi-installed-"));
  try {
    // An older install's: copies of both, and a .git, which stays.
    mkdirSync(join(dest, ".claude/worktrees/x"), { recursive: true });
    writeFileSync(join(dest, ".claude/worktrees/x/Nodi.qml"), "stale");
    mkdirSync(join(dest, "lib/__pycache__"), { recursive: true });
    writeFileSync(join(dest, "lib/__pycache__/ics.cpython-314.pyc"), "stale");
    mkdirSync(join(dest, ".git"));
    writeFileSync(join(dest, ".git/HEAD"), "ref: refs/heads/main\n");
    execFileSync("rsync", [...flags, root + "/", dest + "/"]);
    assert.ok(!existsSync(join(dest, ".claude")) && !existsSync(join(dest, "lib/__pycache__")), "an older install's copies are gone");
    assert.ok(existsSync(join(dest, ".git/HEAD")), "an excluded .git is left alone");
    assert.ok(existsSync(join(dest, "Nodi.qml")));
    const check = () => spawnSync("/usr/bin/bash", [join(root, "tools/installed.sh"), dest], { encoding: "utf8" });
    // Made after the copy, as Python or an agent would: not counted.
    mkdirSync(join(dest, "lib/__pycache__"), { recursive: true });
    writeFileSync(join(dest, "lib/__pycache__/ics.cpython-314.pyc"), "made later");
    assert.match(check().stdout, /^installed: the copy matches the repository/);
    writeFileSync(join(dest, "lib/Run.js"), "changed");
    const changed = check();
    assert.equal(changed.status, 1);
    assert.match(changed.stdout, /the copy differs from the repository/, "a file of Nodi's that differs still counts");
  } finally { rmSync(dest, { recursive: true, force: true }); }
});
