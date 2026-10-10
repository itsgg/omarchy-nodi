// A stand-in omarchy-shell for the scripts that show Nodi's own toast
// (lib/Run.js TOAST, `nodi_toast`): it keeps each call's arguments, the
// toast it carried, and the modes of the folder and the file that carried
// it, so a test can say what was shown and that no word of it was in an
// argument (the marketplace's review, 2026-10-10).
import { writeFileSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

export function toastShell(dir) {
  const argv = join(dir, "toast-argv"), toasts = join(dir, "toasts"), modes = join(dir, "toast-modes");
  writeFileSync(join(dir, "omarchy-shell"), [
    "#!/usr/bin/bash",
    `printf '%s\\n' "$*" >> ${JSON.stringify(argv)}`,
    `case \${5-} in @file:*) p=\${5#@file:}; cat -- "$p" >> ${JSON.stringify(toasts)}; echo >> ${JSON.stringify(toasts)}; stat -c %a "\${p%/*}" "$p" | paste -sd ' ' >> ${JSON.stringify(modes)} ;; esac`,
    "echo ok", ""].join("\n"), { mode: 0o755 });
}

const read = f => { try { return readFileSync(f, "utf8") } catch (e) { return "" } };

// Each toast shown, { title, body }, in order.
export const toasts = dir => read(join(dir, "toasts")).split("\n").filter(Boolean).map(l => JSON.parse(l));
// Every argument each call had, a line a call.
export const toastArgv = dir => read(join(dir, "toast-argv"));
// "700 600" a call: the folder's mode and the file's.
export const toastModes = dir => read(join(dir, "toast-modes")).trim().split("\n").filter(Boolean);
// The carrying folders left behind in `runtime` (none, once each call ends).
export const carriersLeft = runtime => readdirSync(runtime).filter(f => f.startsWith("nodi-ipc."));
