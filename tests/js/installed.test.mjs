// tools/installed.sh and `make install` agree on what is Nodi: agent and
// review scratch folders and Python's bytecode are never copied, a copy an older install left is
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

test("install hides scratch folders and __pycache__, deletes an older install's copy of each, and the check does not count them", () => {
  const rsync = readFileSync(join(root, "Makefile"), "utf8").split("\n").find(l => l.includes("rsync -a"));
  const flags = ["-a", "--checksum", "--delete"].filter(f => rsync.includes(" " + f + " "))
    .concat([...rsync.matchAll(/--(exclude|filter) '([^']+)'/g)].flatMap(m => ["--" + m[1], m[2]]));
  assert.deepEqual(flags.slice(0, 3), ["-a", "--checksum", "--delete"]);
  const hidden = [".claude", ".worktrees", ".superpowers", "__pycache__"];
  for (const x of hidden) assert.ok(flags.includes("H " + x), "make install hides " + x);
  const dest = mkdtempSync(join(tmpdir(), "nodi-installed-"));
  try {
    // An older install's: copies of both, and a .git, which stays.
    mkdirSync(join(dest, ".claude/worktrees/x"), { recursive: true });
    writeFileSync(join(dest, ".claude/worktrees/x/Nodi.qml"), "stale");
    mkdirSync(join(dest, ".worktrees/x"), { recursive: true });
    writeFileSync(join(dest, ".worktrees/x/Nodi.qml"), "stale");
    mkdirSync(join(dest, ".superpowers/sdd"), { recursive: true });
    writeFileSync(join(dest, ".superpowers/sdd/report.md"), "stale");
    mkdirSync(join(dest, "lib/__pycache__"), { recursive: true });
    writeFileSync(join(dest, "lib/__pycache__/ics.cpython-314.pyc"), "stale");
    mkdirSync(join(dest, ".git"));
    writeFileSync(join(dest, ".git/HEAD"), "ref: refs/heads/main\n");
    execFileSync("rsync", [...flags, root + "/", dest + "/"]);
    for (const x of hidden) assert.ok(!existsSync(join(dest, x)) && !existsSync(join(dest, "lib", x)),
                                     "an older installed " + x + " is gone");
    assert.ok(existsSync(join(dest, ".git/HEAD")), "an excluded .git is left alone");
    assert.ok(existsSync(join(dest, "Nodi.qml")));
    const check = () => spawnSync("/usr/bin/bash", [join(root, "tools/installed.sh"), dest], { encoding: "utf8" });
    // Made after the copy, as Python or an agent would: not counted.
    mkdirSync(join(dest, "lib/__pycache__"), { recursive: true });
    writeFileSync(join(dest, "lib/__pycache__/ics.cpython-314.pyc"), "made later");
    mkdirSync(join(dest, ".worktrees/x"), { recursive: true });
    writeFileSync(join(dest, ".worktrees/x/Nodi.qml"), "made later");
    mkdirSync(join(dest, ".superpowers/sdd"), { recursive: true });
    writeFileSync(join(dest, ".superpowers/sdd/report.md"), "made later");
    assert.match(check().stdout, /^installed: the copy matches the repository/);
    writeFileSync(join(dest, "lib/Run.js"), "changed");
    const changed = check();
    assert.equal(changed.status, 1);
    assert.match(changed.stdout, /the copy differs from the repository/, "a file of Nodi's that differs still counts");
  } finally { rmSync(dest, { recursive: true, force: true }); }
});
