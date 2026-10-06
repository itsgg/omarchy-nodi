// The desktop's motion and contrast preferences (ROADMAP 73).
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, chmodSync, rmSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { load, plain } from "./load.mjs";

const A = load("lib/Appearance.js");

test("appearance: the portal's contrast and reduced motion, and Hyprland's animations", () => {
  const off = '{"option": "animations:enabled", "bool": true, "set": true }';
  assert.deepEqual(plain(A.parse("({'org.freedesktop.appearance': {'contrast': <uint32 0>, 'color-scheme': <uint32 1>}},)\n" + off)),
    { highContrast: false, reducedMotion: false }, "as this machine answers");
  assert.deepEqual(plain(A.parse("({'org.freedesktop.appearance': {'contrast': <uint32 1>, 'reduced-motion': <uint32 1>}},)\n" + off)),
    { highContrast: true, reducedMotion: true });
  assert.deepEqual(plain(A.parse("\n" + '{"option": "animations:enabled", "bool": false}')), { highContrast: false, reducedMotion: true },
    "no portal; Hyprland's animations off");
  assert.deepEqual(plain(A.parse("\n" + '{"int": 0}')), { highContrast: false, reducedMotion: true }, "an older hyprctl's int");
  assert.deepEqual(plain(A.parse("")), { highContrast: false, reducedMotion: false }, "nothing read: as before");
});

test("appearance: the probe's two lines, from gdbus and hyprctl", () => {
  const dir = mkdtempSync(join(tmpdir(), "nodi-appearance-"));
  try {
    const bin = join(dir, "bin");
    mkdirSync(bin);
    writeFileSync(join(bin, "gdbus"), "#!/usr/bin/bash\nprintf \"({'org.freedesktop.appearance': {'contrast': <uint32 1>}},)\\n\"\n");
    writeFileSync(join(bin, "hyprctl"), '#!/usr/bin/bash\nprintf \'{\\n  "option": "animations:enabled",\\n  "bool": false\\n}\\n\'\n');
    chmodSync(join(bin, "gdbus"), 0o755);
    chmodSync(join(bin, "hyprctl"), 0o755);
    const out = execFileSync("/usr/bin/bash", ["-c", A.PROBE], { env: { PATH: bin + ":/usr/bin:/bin" } }).toString();
    assert.deepEqual(plain(A.parse(out)), { highContrast: true, reducedMotion: true });
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
