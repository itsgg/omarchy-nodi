// Descriptions a model writes for the apps whose desktop entry has none:
// what is sent, what is kept, and when an app is asked again.

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { load, plain } from "./load.mjs";

const STOCK = (process.env.OMARCHY_PATH || "/usr/share/omarchy") + "/applications";

const Describe = load("lib/Describe.js");

const entry = (id, fields) => Object.assign({ id, name: id, generic: "", comment: "", exec: "", terminal: false }, fields);
const netflix = entry("Netflix", { comment: "Netflix", exec: 'omarchy-launch-webapp "https://www.netflix.com"' });
const slack = entry("Slack", { exec: 'omarchy-launch-webapp "https://app.slack.com/client/T0WORKSPACE/activity-inbox"' });
const ncdu = entry("Disk Space", { exec: 'xdg-terminal-exec --app-id=TUI.float -e bash -c "ncdu /"' });
const reaper = entry("cockos-reaper", { name: "REAPER", exec: '"/home/u/.local/opt/REAPER/reaper" %F' });
const firefox = entry("firefox", { name: "Firefox", generic: "Web Browser", exec: "/usr/lib/firefox/firefox %u" });
const needs = app => !app.generic;

test("only a site's host and a program's name are sent, never a path or arguments", () => {
  const list = Describe.wanted([netflix, slack, ncdu, reaper, firefox], {}, needs);
  assert.deepEqual(plain(list.map(w => w.item)), [
    { id: "Netflix", name: "Netflix", site: "netflix.com" },
    { id: "Slack", name: "Slack", site: "app.slack.com" },
    { id: "Disk Space", name: "Disk Space", program: "ncdu", terminal: true },
    { id: "cockos-reaper", name: "REAPER", program: "reaper" }
  ]);
  assert.ok(!JSON.stringify(Describe.argv("haiku", list, "/tmp")).includes("T0WORKSPACE"), "Slack's workspace id stays here");
  assert.equal(Describe.program("env FOO=1 /usr/bin/obsidian --flag %U"), "obsidian");
  assert.equal(Describe.program("xdg-terminal-exec --app-id=TUI.tile -e omarchy-launch-docker"), "omarchy-launch-docker");
  assert.equal(Describe.site("omarchy-launch-webapp 'HTTPS://me:pw@WWW.Example.org:8443/x'"), "example.org");
});

test("the request is one argument after a constant script", () => {
  const argv = Describe.argv("haiku", Describe.wanted([netflix], {}, needs), "/home/u/.cache/nodi/ask");
  assert.deepEqual(plain(argv.slice(0, 5)), ["bash", "-lc", 'cd -- "$1" && shift && exec claude "$@"', "nodi-describe", "/home/u/.cache/nodi/ask"]);
  assert.ok(argv[argv.length - 1].includes('"site":"netflix.com"'));
  assert.ok(argv.includes("--safe-mode") && argv.includes("--strict-mcp-config"));
});

test("an answer is read as id to text, fences and all; a junk answer is nothing", () => {
  const list = Describe.wanted([netflix, slack, ncdu], {}, needs);
  const got = plain(Describe.parse('```json\n{"Netflix": "Streaming films and series", "Slack": "Netflix", "Disk Space": "' + "x".repeat(80) + '", "Other": "y"}\n```', list));
  assert.deepEqual(Object.keys(got), ["Netflix", "Slack", "Disk Space"], "only the apps asked about");
  assert.equal(got.Netflix.text, "Streaming films and series");
  assert.equal(got.Slack.text, "Netflix", "another app's name is a description of sorts; only its own name is refused");
  assert.equal(got["Disk Space"].text, "", "too long to be a subtitle");
  assert.equal(plain(Describe.parse('{"Netflix": "Netflix"}', list)).Netflix.text, "", "its own name is no description");
  assert.equal(plain(Describe.parse('{"Netflix": "Line\\none"}', list)).Netflix.text, "Line one");
  assert.equal(Describe.parse("I cannot help with that", list), null);
  assert.equal(Describe.parse('{"apps": [{"Netflix": "Streaming"}]}', list), null, "keyed by anything but the ids: a failed ask");
  assert.equal(plain(Describe.parse('{"Netflix": "Streaming films."}', list)).Netflix.text, "Streaming films");
  assert.equal(Describe.parse('["Streaming"]', list), null);
});

test("an app is asked again only when its name or command changes", () => {
  const known = Describe.parse('{"Netflix": "Streaming films and series", "Slack": ""}', Describe.wanted([netflix, slack], {}, needs));
  assert.equal(Describe.wanted([netflix, slack], known, needs).length, 0, "an empty answer is kept too");
  assert.equal(Describe.of(known, netflix), "Streaming films and series");
  const moved = Object.assign({}, netflix, { exec: 'omarchy-launch-webapp "https://www.netflix.com/browse"' });
  assert.equal(Describe.of(known, moved), "");
  assert.deepEqual(plain(Describe.wanted([moved], known, needs).map(w => w.item.id)), ["Netflix"]);
});

test("the cache file is read leniently and written whole", () => {
  const known = Describe.parse('{"Netflix": "Streaming films and series"}', Describe.wanted([netflix], {}, needs));
  const again = Describe.load(Describe.serialize(known));
  assert.equal(Describe.of(again, netflix), "Streaming films and series");
  assert.deepEqual(plain(Describe.load("not json")), {});
  assert.deepEqual(Object.keys(Describe.load('{"a": {"for": 1, "text": "x"}, "__proto__": {"for": "x", "text": "y"}}')), ["__proto__"]);
});

test("Omarchy's own apps are described without asking", () => {
  const stock = [
    entry("YouTube", { exec: "omarchy-launch-webapp https://youtube.com/" }),
    entry("HEY", { exec: "omarchy-webapp-handler-hey %u" }),
    entry("Docker", { exec: "xdg-terminal-exec --app-id=TUI.tile -e omarchy-launch-docker-tui" }),
    entry("Discord", { comment: "Discord", exec: 'omarchy-launch-webapp "https://discord.com/app"' })
  ];
  assert.deepEqual(plain(stock.map(a => Describe.of({}, a))), ["Videos", "Email", "Docker containers", "Chat and voice calls"]);
  assert.equal(Describe.wanted(stock, {}, needs).length, 0, "none of them is sent");
  assert.equal(Describe.of({}, netflix), "", "an app Omarchy does not install waits for the model");
});


// Read from this machine's Omarchy: every app it ships without a comment of
// its own is in the table, so the table cannot fall behind unnoticed.
test("every app Omarchy installs without a description is in the table", { skip: !existsSync(STOCK) }, () => {
  const missing = [];
  for (const f of readdirSync(STOCK).filter(n => n.endsWith(".desktop"))) {
    const text = readFileSync(join(STOCK, f), "utf8");
    const get = k => ((text.match(new RegExp("^" + k + "=(.*)$", "m")) || [])[1] || "").trim();
    const name = get("Name"), comment = get("Comment"), generic = get("GenericName");
    if ((comment && comment.toLowerCase() !== name.toLowerCase()) || generic) continue;
    if (!Describe.of({}, { id: f.replace(/\.desktop$/, ""), name, exec: get("Exec") })) missing.push(name + " (" + get("Exec") + ")");
  }
  assert.deepEqual(missing, []);
});

test("descriptions kept, then the new ones over them", () => {
  const D = load("lib/Describe.js");
  const m = D.merged({ a: { for: "1", text: "old a" }, b: { for: "1", text: "b" } }, { a: { for: "2", text: "new a" }, c: { for: "1", text: "c" } });
  assert.deepEqual(plain(m), { a: { for: "2", text: "new a" }, b: { for: "1", text: "b" }, c: { for: "1", text: "c" } });
  assert.deepEqual(plain(D.merged({}, {})), {});
});
