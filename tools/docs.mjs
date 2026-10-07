// The user guide in docs/, held to the code (ROADMAP 83).
//
// Parts of it are written from the code, between markers such as
//   <!-- nodi:generated topics -->  ...  <!-- /nodi:generated -->
// "topics" every help topic Nodi has, with its examples and what each
// says (the same `?` shows, lib/Engine.js helpTopics); "keys" every key
// (the Keys topic); "settings" every setting config.default.json has, with
// its default. `node tools/docs.mjs` writes them; `--check` (make
// docs-check, in check and in CI) fails where a page says other than the
// code, and also on:
//   - a link to a file in the repository that is not there, or to a
//     heading a page does not have;
//   - a generated part missing, or there twice;
//   - a setting docs/settings.md names (a table's first column, or a
//     quoted name a colon follows) that is not one: a key of the
//     defaults, a provider's id, or one of EXTRA below;
//   - a `make` target a page names that is not there;
//   - long dashes, arrows, curly quotes, ellipses or middle dots in prose,
//     as tools/hygiene.mjs holds comments (other scripts, Tamil for one,
//     are for what Nodi shows and are let be).
// Hand-written pages say what the generated ones cannot: how to use it.

import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { load, root } from "../tests/js/load.mjs";
import { Engine, config, services } from "../tests/js/fixtures.mjs";

const check = process.argv.includes("--check");
const docs = join(root, "docs");
const read = p => readFileSync(p, "utf8");
const problems = [];

// ---------------------------------------------------------------- generated

const topics = Engine.helpTopics(config, services({}));
const keysTopic = topics.find(t => t.id === "shortcuts");

function code(s) { return "`" + String(s).replace(/`/g, "'") + "`" }

function topicsText() {
  const out = [];
  for (const t of topics) {
    if (t.id === "shortcuts") continue;
    out.push("### " + t.title, "", t.about.replace(/\s*$/, "") + (/[.!?]$/.test(t.about) ? "" : "."), "");
    for (const x of t.examples) {
      if (!x.q) continue;
      const said = x.note || x.hint || "";
      out.push("- " + code(x.q.trim() === "" ? x.q : x.q) + (said ? ": " + said.replace(/\s*$/, "") : ""));
    }
    out.push("");
  }
  return out.join("\n").trim();
}

function keysText() {
  const out = ["| Key | What it does |", "|---|---|"];
  for (const k of keysTopic.examples) out.push("| " + k.key.replace(/󰁝/g, "Up").replace(/󰁅/g, "Down").replace(/\s+/g, " ").trim() + " | " + k.does + " |");
  return out.join("\n");
}

const defaults = JSON.parse(read(join(root, "config.default.json")));

function settingsText() {
  const out = ["| Setting | Default |", "|---|---|"];
  for (const k of Object.keys(defaults)) {
    const v = defaults[k];
    const shown = Array.isArray(v) && v.length > 4 ? "a list of " + v.length + " (config.default.json)" : JSON.stringify(v);
    out.push("| " + code('"' + k + '"') + " | " + code(shown).replace(/\|/g, "\\|") + " |");
  }
  return out.join("\n");
}

const GENERATED = { topics: topicsText, keys: keysText, settings: settingsText };
const MARK = /<!-- nodi:generated (\w+) -->\n([\s\S]*?)<!-- \/nodi:generated -->/g;

const seen = {};
const pages = existsSync(docs) ? readdirSync(docs).filter(n => n.endsWith(".md")).map(n => join(docs, n)) : [];
for (const page of pages) {
  const text = read(page);
  const next = text.replace(MARK, (all, name, body) => {
    if (!GENERATED[name]) { problems.push(page.slice(root.length + 1) + ": no generated part called " + name); return all }
    seen[name] = (seen[name] || 0) + 1
    const fresh = GENERATED[name]() + "\n";
    if (check && fresh !== body) problems.push(page.slice(root.length + 1) + ": its " + name + " part says other than the code (node tools/docs.mjs writes it)");
    return "<!-- nodi:generated " + name + " -->\n" + fresh + "<!-- /nodi:generated -->";
  });
  if (!check && next !== text) writeFileSync(page, next);
}
for (const name of Object.keys(GENERATED)) if (seen[name] !== 1) problems.push("docs: the " + name + " part is in " + (seen[name] || 0) + " pages, not one");

// ---------------------------------------------------------------- held to the code

const all = pages.concat([join(root, "README.md"), join(root, "contrib/README.md")]);
const slug = h => h.toLowerCase().replace(/`/g, "").replace(/[^\w\- ]+/g, "").trim().replace(/ /g, "-");
const headings = p => new Set((read(p).match(/^#{1,6} .*$/gm) || []).map(h => slug(h.replace(/^#+ /, ""))));
const makefile = read(join(root, "Makefile"));
const targets = new Set((makefile.match(/^[a-z][\w-]*(?=:)/gm) || []));

for (const page of all) {
  const text = read(page);
  const rel = page.slice(root.length + 1);
  // Links to files here, and to their headings.
  for (const m of text.matchAll(/\]\(([^)\s]+)\)/g)) {
    const href = m[1];
    if (/^[a-z]+:/i.test(href)) continue;
    const [file, anchor] = href.split("#");
    const target = file ? resolve(dirname(page), file) : page;
    if (!existsSync(target)) { problems.push(rel + ": a link to " + href + ", which is not there"); continue; }
    if (anchor && target.endsWith(".md") && !headings(target).has(anchor)) problems.push(rel + ": a link to #" + anchor + " in " + (file || rel) + ", no such heading");
  }
  // `make x`.
  for (const m of text.matchAll(/`make ([a-z][\w-]*)/g)) if (!targets.has(m[1])) problems.push(rel + ": make " + m[1] + " is no target");
  // Plain ASCII prose, outside code (non-ASCII is for what Nodi shows).
  const prose = text.replace(/```[\s\S]*?```/g, "").replace(/`[^`\n]*`/g, "");
  for (const ch of ["\u2014", "\u2013", "\u2192", "\u201c", "\u201d", "\u2018", "\u2019", "\u2026", "\u00b7"]) if (prose.includes(ch)) problems.push(rel + ": " + JSON.stringify(ch) + " in prose");
}

// Every setting docs/settings.md names is a key of the defaults, a
// provider's id (a provider's section, lib/Engine.js contextFor), or one
// of these: keys the defaults leave out, and the keys of an entry in a
// list (a keyword, a snippet, a filter, an MCP server). Each is checked
// to be read somewhere in the code, so this list cannot outlive it.
const EXTRA = ["ics", "me", "language", "file", "preview", "mcpServers", "home", "clock24", "root", "contents", "dirs", "suggest",
               "disabled", "keyword", "title", "open", "run", "name", "text", "icon", "command", "args", "contrib", "list", "refresh",
               "rerun", "timeoutMs", "format", "placeholder"];
const settingsPage = join(docs, "settings.md");
if (existsSync(settingsPage)) {
  const source = ["lib", "providers", "components"].flatMap(d => readdirSync(join(root, d)).filter(n => /\.(js|qml)$/.test(n)).map(n => read(join(root, d, n)))).join("\n") + read(join(root, "Nodi.qml"));
  for (const k of EXTRA) if (!new RegExp("\\." + k + "\\b").test(source)) problems.push("tools/docs.mjs: \"" + k + "\" in EXTRA is read nowhere in the code");
  // A provider's id is a setting too: its own section (lib/Engine.js contextFor).
  const ids = load("providers/index.js").all.map(p => p.id);
  const known = new Set(Object.keys(defaults).concat(ids, EXTRA, Object.values(defaults).flatMap(v => v && typeof v === "object" && !Array.isArray(v) ? Object.keys(v) : [])));
  // A key: a table's first column, or a quoted name a colon follows.
  // An MCP server's name is yours, not a setting: what an mcpServers
  // object holds is left out of the scan, every server in it.
  let page = read(settingsPage);
  const OBJECT = /"mcpServers"\s*:\s*\{/g;
  for (let m = OBJECT.exec(page); m; m = OBJECT.exec(page)) {
    const open = m.index + m[0].length - 1;
    let depth = 0, end = open;
    for (; end < page.length; end++) { if (page[end] === "{") depth++; else if (page[end] === "}" && --depth === 0) break; }
    page = page.slice(0, open) + "{}" + page.slice(end + 1);
    OBJECT.lastIndex = open + 2;
  }
  const named = [...page.matchAll(/^\| `"([a-zA-Z]\w*)"` \|/gm), ...page.matchAll(/"([a-zA-Z]\w*)"\s*:/g)];
  for (const m of named) {
    const k = m[1];
    if (!known.has(k)) problems.push("docs/settings.md: \"" + k + "\" is no setting (a key of the defaults, a provider's id, or tools/docs.mjs EXTRA)");
  }
}

if (problems.length) { console.error(problems.map(p => "docs: " + p).join("\n")); process.exit(1); }
console.log(check ? "docs: as the code says" : "docs: written");
