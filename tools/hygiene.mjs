// The rules PLAN.md sets that a test of behaviour would not catch:
//
//   1. Every Process clears its environment, and only Reader.qml has one:
//      a reader added straight into Nodi.qml would inherit the shell's.
//      The one exception is Ask.qml's session, which is not a reader: one
//      process held open with stdin, the agent started by the constant
//      script in lib/Agents.js (spec), that needs the user's environment
//      for the agent's own credentials.
//   2. No provider builds a shell string from data: `bash -c` appears only
//      in lib/Run.js and in constant scripts, and every row a corpus of
//      queries produces has a run the contract accepts.
//   3. Prose stays ASCII: no long dashes, arrows, curly quotes, ellipsis
//      characters or middle dots in comments or text, outside the lines that
//      accept them as input.
//   4. A program started without a Process goes through Run.js or names its
//      program: Quickshell.execDetached takes Run.command(...), an argv
//      built in the same function by Run.command or Hotkey.releaseArgv,
//      Pick.answerArgv(...) (a constant script, its data as arguments, as
//      releaseArgv's), or an array whose first element is a program's name,
//      never a shell (review T5).

import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const problems = [];
const read = rel => readFileSync(join(root, rel), "utf8");
const files = dir => readdirSync(join(root, dir)).filter(f => /\.(js|qml|mjs|sh|md|py)$/.test(f)).map(f => join(dir, f));

// 1. Processes
for (const rel of ["Nodi.qml", ...files("components")]) {
  const src = read(rel);
  const count = (src.match(/^\s*Process\s*\{/gm) || []).length;
  const allowed = rel === "components/Reader.qml" || (rel === "components/Ask.qml" && count === 1 && /var argv = ask\.program \|\| \(ask\.spec && ask\.spec\.argv\)/.test(src) && /proc\.command = argv\n/.test(src));
  if (!allowed && count > 0) problems.push(`${rel}: a Process outside Reader.qml`);
  if (rel === "components/Reader.qml" && !/clearEnvironment:\s*true/.test(src)) problems.push(`${rel}: Process without clearEnvironment`);
}

// 1b. Names the shell assigns into a plugin on load (shell.qml's panel
// loader): declared readonly, the first assignment throws and the shell never
// registers the plugin (2026-10-02, omarchyPath).
{
  const src = read("Nodi.qml");
  for (const name of ["omarchyPath", "shell", "manifest", "barWidgetRegistry", "pluginRegistry", "service"])
    if (new RegExp("readonly\\s+property\\s+\\w+\\s+" + name + "\\b").test(src)) problems.push(`Nodi.qml: ${name} is assigned by the shell and must not be readonly`);
}

// 2. Shell strings. Scope: providers/*.js. The script after "bash" or
// "/usr/bin/bash" and "-c" or "-lc", and the first argument of Run.shell,
// must be string literals joined by +, or an UPPER_CASE name declared in
// the same file as such; data goes in as the arguments after it. The run
// contract's `shell` kind is for text the user or Omarchy wrote, and those
// three are named below (agy 2026-10-03). Not judged: lib/ (Run.js is the
// contract this protects), template literals, a script returned by a
// helper.
const WRITTEN = {
  "providers/keywords.js": ["cmd.run"],               // a keyword's `run` as written; what is typed is its $1
  "providers/menu.js": ["item.action"],               // a menu row's action
  "providers/shell.js": ["cmd"]                       // the command line typed after `>`
};
function literalsOnly(expr) {
  const rest = expr.replace(/'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"/g, "").replace(/[\s+]/g, "");
  return rest === "" && /['"]/.test(expr);
}
// The expression from `at` up to the comma or bracket that ends it.
function scriptArgument(src, at) {
  let i = at, out = "", quote = "", depth = 0;
  for (; i < src.length; i++) {
    const c = src[i];
    if (quote) { out += c; if (c === "\\") { out += src[++i]; continue; } if (c === quote) quote = ""; continue; }
    if (c === "'" || c === '"') { quote = c; out += c; continue; }
    if (c === "(" || c === "[") depth++;
    else if (c === ")" || c === "]") { if (depth === 0) break; depth--; }
    else if (c === "," && depth === 0) break;
    out += c;
  }
  return out.trim();
}
for (const rel of files("providers")) {
  const src = read(rel);
  const re = /["'](?:\/usr\/bin\/)?bash["']\s*,\s*["']-l?c["']\s*,|\bRun\.shell\(/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    const expr = scriptArgument(src, m.index + m[0].length);
    const name = expr.match(/^[A-Z][A-Z0-9_]*$/);
    const decl = name && src.match(new RegExp("(?:var|const|let)\\s+" + name[0] + "\\s*=\\s*([\\s\\S]*?)\\n(?=\\S|\\n)"));
    const ok = (WRITTEN[rel] || []).includes(expr) || (name ? !!decl && literalsOnly(decl[1]) : literalsOnly(expr));
    if (!ok) problems.push(`${rel}:${src.slice(0, m.index).split("\n").length}: a shell script that is not a constant: ${expr.slice(0, 60)}`);
  }
  if (/target:\s*["'][^"']*["']\s*\+/.test(src)) problems.push(`${rel}: a command target built by concatenation`);
}

// 3. ASCII prose
const BANNED = new RegExp("[\\u2012-\\u2015\\u2190-\\u21ff\\u2018\\u2019\\u201c\\u201d\\u2026\\u00b7\\u2212]");
const INPUT_LINE = /CONNECTOR|var ops = |TARGET_SEP|\(\?:to\|and\|until/;
for (const rel of ["Nodi.qml", "PLAN.md", "README.md", "ROADMAP.md", ...files("components"), ...files("lib"), ...files("providers"), ...files("tests/js"), ...files("tools")]) {
  let src;
  try { src = read(rel); } catch (e) { continue; }
  src.split("\n").forEach((line, i) => {
    if (BANNED.test(line) && !INPUT_LINE.test(line)) problems.push(`${rel}:${i + 1}: non-ASCII punctuation: ${line.trim().slice(0, 80)}`);
  });
}

// 4. Detached programs. Scope: Nodi.qml and components/*.qml. Not judged:
// what Run.command builds (tests/js/run.test.mjs) and the arguments after
// a named program.
for (const rel of ["Nodi.qml", ...files("components")]) {
  const src = read(rel);
  const lines = src.split("\n");
  lines.forEach((line, i) => {
    for (const m of line.matchAll(/Quickshell\.execDetached\(\s*/g)) {
      const arg = line.slice(m.index + m[0].length);
      const named = arg.match(/^\[\s*["']([^"']+)["']/);
      let ok = /^(Run\.command|Pick\.answerArgv)\(/.test(arg) || (!!named && !/(^|\/)(ba|z|da|k|mk|c|tc|fi)?sh$/.test(named[1]));
      if (/^argv\s*\)/.test(arg)) {
        // The nearest assignment above, inside the same function.
        for (let j = i - 1; j >= 0 && !/^\s*function\s|^\s*Component\.on/.test(lines[j]); j--) {
          const a = lines[j].match(/\bargv\s*=\s*(.*)$/);
          if (a) { ok = /^(?:\w+\s*\?\s*)?(Run\.command|Hotkey\.releaseArgv)\(/.test(a[1].trim()); break; }
        }
      }
      if (!ok) problems.push(`${rel}:${i + 1}: execDetached with an argv that is neither Run.command's nor a named program: ${arg.slice(0, 60)}`);
    }
  });
}

if (problems.length) {
  console.error(problems.join("\n"));
  process.exit(1);
}
console.log("hygiene: ok");
