// Every `omarchy-shell <target> <function>` Nodi runs, checked against the
// installed Omarchy's shell, so a function renamed upstream (dndState became
// isDnd in 4.5) fails here rather than silently on his bar. Skipped where
// Omarchy is not installed.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { root } from "./load.mjs";

const SHELL = "/usr/share/omarchy/shell";

// Older Omarchy's names, called only after the current one fails.
const FALLBACKS = new Set(["notifications dndState"]);

function files(dir, keep, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) files(p, keep, out);
    else if (keep(name)) out.push(p);
  }
  return out;
}

// The calls written in Nodi's own source, as an argv or in a script.
function calls() {
  const out = [];
  const srcs = files(root, n => /\.(js|qml|sh)$/.test(n)).filter(f => !/^(tests|tools|docs|contrib)\//.test(relative(root, f)));
  for (const f of srcs) {
    // Code only: a comment names the command in prose.
    const text = readFileSync(f, "utf8").split("\n").filter(l => !/^\s*(\/\/|#)/.test(l)).join("\n");
    const where = relative(root, f);
    for (const m of text.matchAll(/\["omarchy-shell",\s*"([\w.-]+)",\s*"(\w+)"(?:,\s*"([\w.-]+)",\s*"(\w+)")?/g)) out.push({ where, args: m.slice(1).filter(Boolean) });
    for (const m of text.matchAll(/omarchy-shell (?:-q )?([\w.-]+) (\w+)(?: "?([\w.-]+)"? (\w+))?/g)) {
      if (m[2] === "call" && !m[3]) continue;   // a plugin named by a variable
      out.push({ where, args: m.slice(1).filter(Boolean) });
    }
  }
  return out;
}

// target -> the functions its IpcHandler (or ShellIpc, one that wraps it) has.
function handlers() {
  const out = new Map();
  for (const f of files(SHELL, n => n.endsWith(".qml"))) {
    const parts = readFileSync(f, "utf8").split(/\b(?:IpcHandler|ShellIpc)\s*\{/).slice(1);
    for (const part of parts) {
      const t = part.match(/^\s*target:\s*"([^"]+)"/m);
      if (!t) continue;
      const fns = out.get(t[1]) || new Set();
      for (const m of part.matchAll(/^\s*function (\w+)\s*\(/gm)) fns.add(m[1]);
      out.set(t[1], fns);
    }
  }
  return out;
}

// A plugin's functions, for `shell call <plugin id> <function>`.
function pluginFunctions(id) {
  for (const dir of readdirSync(join(SHELL, "plugins"))) {
    const manifest = join(SHELL, "plugins", dir, "manifest.json");
    if (!existsSync(manifest) || JSON.parse(readFileSync(manifest, "utf8")).id !== id) continue;
    const fns = new Set();
    for (const f of files(join(SHELL, "plugins", dir), n => n.endsWith(".qml")))
      for (const m of readFileSync(f, "utf8").matchAll(/\bfunction (\w+)\s*\(/g)) fns.add(m[1]);
    return fns;
  }
  return null;
}

test("the scan finds the calls Nodi makes", () => {
  const seen = calls().map(c => c.args.join(" "));
  for (const want of ["notifications isDnd", "osd show", "omarchy.power open", "shell call omarchy.clipboard confirmClearHistory"])
    assert.ok(seen.includes(want), want + " in " + JSON.stringify([...new Set(seen)]));
});

test("every omarchy-shell function Nodi calls exists in the installed Omarchy", { skip: !existsSync(join(SHELL, "shell.qml")) }, () => {
  const ipc = handlers();
  for (const c of calls()) {
    const [target, fn, plugin, pfn] = c.args;
    if (FALLBACKS.has(target + " " + fn)) continue;
    const fns = ipc.get(target);
    assert.ok(fns, c.where + ": no IPC target " + target);
    assert.ok(fns.has(fn), c.where + ": " + target + " has no " + fn);
    if (target === "shell" && fn === "call" && plugin) {
      const p = pluginFunctions(plugin);
      assert.ok(p, c.where + ": no plugin " + plugin);
      assert.ok(p.has(pfn), c.where + ": " + plugin + " has no " + pfn);
    }
  }
});
