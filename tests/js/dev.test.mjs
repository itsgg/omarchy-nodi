// Developer views: projects, tmux sessions, SSH hosts, man and tldr, ports,
// user services, browser history and pull requests.

import { test } from "node:test";
import assert from "node:assert/strict";
import { load, plain } from "./load.mjs";
import { Engine, config, services, run, top } from "./fixtures.mjs";

const D = load("providers/dev.js");
const projects = D.parseProjects("git\t/home/u/Work/GG/omarchy-nodi\ngit\t/home/u/Work/kalvi\nz\t18.0\t/home/u/Work\nz\t4.0\t/home/u/Work/kalvi\nnot a line\n", true);
const tmux = D.parseTmux("$0\twork\t1\t1\n$3\tlane.a\t3\t0\n\n");
const ssh = D.parseSsh("Host *\n  User x\nHost box web.example.com\n  HostName 1.2.3.4\nhost !bad\n");

test("the lists parse: one entry per path, repositories marked; sessions; hosts without patterns", () => {
  assert.deepEqual(plain(projects.map(p => [p.name, p.git])), [["omarchy-nodi", true], ["kalvi", true], ["Work", false]]);
  assert.deepEqual(plain(tmux), [{ id: "$0", name: "work", windows: 1, attached: true }, { id: "$3", name: "lane.a", windows: 3, attached: false }]);
  assert.deepEqual(plain(ssh), ["box", "web.example.com"]);
});

test("a project by its folder's name: a terminal there, the editor and lazygit in Ctrl+K", () => {
  const p = top("nodi", { projects });
  assert.equal(p.title, "omarchy-nodi"); assert.equal(p.subtitle, "~/Work/GG/omarchy-nodi, git");
  assert.deepEqual(plain(p.run.argv), ["uwsm-app", "--", "xdg-terminal-exec", "--dir=/home/u/Work/GG/omarchy-nodi"]);
  assert.deepEqual(plain(p.actions.map(a => a.label)), ["Open in your editor", "Open in lazygit", "Open in Files", "Copy the path"]);
  assert.deepEqual(plain(p.actions[1].run.argv), ["uwsm-app", "--", "xdg-terminal-exec", "--dir=/home/u/Work/GG/omarchy-nodi", "--", "lazygit"]);
});

test("tmux sessions, SSH hosts, man and tldr", () => {
  const t = run("tmux", { tmux }).filter(r => r.key.indexOf("tmux:") === 0);
  assert.deepEqual(plain(t.map(r => r.title)), ["work", "lane.a"]);
  assert.deepEqual(plain(t[1].run.argv.slice(-4)), ["tmux", "attach-session", "-t", "$3"], "by id, which a dotted name cannot break");
  assert.equal(t[0].subtitle, "tmux, 1 window, attached");
  assert.deepEqual(plain(top("ssh box", { ssh }).run.argv.slice(-3)), ["ssh", "--", "box"]);
  // No host named: `ssh` says where they are named, only once the config is read.
  const none = q => run(q, { ssh: [] }).filter(r => r.key === "ssh:none");
  assert.deepEqual(plain(none("ssh ").map(r => [r.title, r.run])), [["No host in ~/.ssh/config", null]]);
  assert.equal(none("ssh bo").length, 0, "a host being typed is no list");
  assert.ok(!run("ssh ", {}).some(r => r.key === "ssh:none"), "not before the read lands");
  assert.ok(!run("ssh ", { ssh }).some(r => r.key === "ssh:none"));
  assert.deepEqual(plain(top("man ls").run.argv.slice(-3)), ["man", "--", "ls"]);
  assert.deepEqual(plain(top("man printf 3").run.argv.slice(-4)), ["man", "--", "3", "printf"]);
  assert.deepEqual(plain(top("man --help 1").run.argv.slice(-4)), ["man", "--", "1", "--help"], "with a section too, a page is never an option");
  assert.equal(t[0].remember, false, "a session id is not replayed after tmux restarts");
  assert.deepEqual(plain(D.parseSsh('Host "build"\nHost=web\nHost db # production\nHost *.corp !bad ok\n#Host gone\nHost "two words"')),
                   ["build", "web", "db", "ok", "two words"], "ssh_config's quotes, = and comments");
  assert.deepEqual(plain(top("tldr tar").run.argv.slice(-3)), ["tldr", "--", "tar"]);
  assert.ok(!run("man ls; reboot").some(r => r.key && r.key.indexOf("man:") === 0), "a page name is a name, nothing more");
});

test("nothing from them for queries they do not name", () => {
  for (const q of ["firefox", "2+2", "lock"]) assert.ok(!run(q, { projects, tmux, ssh }).some(r => r.provider === "dev"), q);
});

const ports = D.parsePorts([
  'LISTEN 0 4096 127.0.0.53%lo:53 0.0.0.0:*',
  'LISTEN 0 511 [::1]:5173 [::]:* users:(("node",pid=99,fd=20))',
  'LISTEN 0 511 127.0.0.1:5173 0.0.0.0:* users:(("node",pid=99,fd=21))',
  'LISTEN 0 4096 0.0.0.0:17500 0.0.0.0:* users:(("dropbox",pid=4507,fd=74))',
  'LISTEN 0 128 *:631 *:*',
  'LISTEN 0 2048 127.0.0.1:8000 0.0.0.0:* users:(("gunicorn",pid=5002,fd=5),("gunicorn",pid=5001,fd=5),("gunicorn",pid=5000,fd=5))',
  'LISTEN 0 4096 127.0.0.54:53 0.0.0.0:*', 'garbage', ''].join("\n"));
const userServices = D.parseServices([
  "backup-sync.service loaded active running Backup: files synced",
  "app-gnome\\x2dkeyring\\x2dsecrets@autostart.service loaded inactive dead Secret Storage Service",
  "-bad.service loaded active running Starts with a dash",
  "dbus.socket loaded active running D-Bus User Message Bus Socket", ""].join("\n"));
const browserHistory = D.parseHistory(JSON.stringify([
  { url: "https://app.slack.com/client/T1", title: "Threads - Acme - Slack", visits: 5, at: 3 },
  { url: "https://github.com/itsgg/omarchy-nodi/pulls", title: "Pull requests", visits: 9, at: 2 },
  { url: "https://slack.com/help", title: "Slack help", visits: 1, at: 9 },
  { url: "chrome://settings/", title: "Settings", visits: 40, at: 1 },
  { url: "file:///etc/passwd", title: "passwd", visits: 2, at: 1 }]), true);
const prs = D.parsePrs(JSON.stringify([
  { number: 12, title: "Ports and services", repository: { nameWithOwner: "itsgg/omarchy-nodi" }, url: "https://github.com/itsgg/omarchy-nodi/pull/12", author: { login: "itsgg" } },
  { number: 7, title: "Fix the flake", repository: { nameWithOwner: "itsgg/kalvi" }, url: "https://github.com/itsgg/kalvi/pull/7", author: { login: "someone" } },
  { number: 1, title: "Not a link", repository: { nameWithOwner: "x/y" }, url: "javascript:alert(1)" }]), true);
const lists = { ports, userServices, browserHistory, prs };

test("ports parse: the process for your own sockets, one row per port and process, any address form", () => {
  assert.deepEqual(plain(ports), [
    { port: 53, name: "", addresses: ["127.0.0.53", "127.0.0.54"], pids: [] },
    { port: 631, name: "", addresses: ["*"], pids: [] },
    { port: 5173, name: "node", addresses: ["::1", "127.0.0.1"], pids: [99] },
    { port: 8000, name: "gunicorn", addresses: ["127.0.0.1"], pids: [5002, 5001, 5000] },
    { port: 17500, name: "dropbox", addresses: ["0.0.0.0"], pids: [4507] }]);
});

test("a socket systemd holds is never stopped, with its service or alone", () => {
  const sa = D.parsePorts(['LISTEN 0 4096 127.0.0.1:9000 0.0.0.0:* users:(("foo",pid=5,fd=3),("systemd",pid=928,fd=40))',
                           'LISTEN 0 4096 127.0.0.1:9001 0.0.0.0:* users:(("systemd",pid=928,fd=41),("bar",pid=6,fd=3))',
                           'LISTEN 0 4096 127.0.0.1:9002 0.0.0.0:* users:(("systemd",pid=928,fd=42))'].join("\n"));
  assert.deepEqual(plain(sa.map(p => [p.port, p.name, p.pids])), [[9000, "foo", [5]], [9001, "bar", [6]], [9002, "systemd", []]]);
  const rows = run("ports", { ports: sa }).filter(r => r.key && r.key.indexOf("port:") === 0);
  assert.equal(rows[2].subtitle, "127.0.0.1, socket activated");
  assert.ok(!rows[2].actions.some(a => /^Stop/.test(a.label)));
  assert.deepEqual(plain(rows[0].actions[1].run.argv), ["kill", "-TERM", "--", "5"]);
});

test("ports: Enter opens localhost, Ctrl+K stops the owner after asking; filter by port or process", () => {
  const all = run("ports", lists).filter(r => r.key && r.key.indexOf("port:") === 0);
  assert.deepEqual(plain(all.map(r => r.title)), [":53", ":631", ":5173 node", ":8000 gunicorn", ":17500 dropbox"]);
  assert.deepEqual(plain(all.map(r => r.subtitle)), ["127.0.0.53 +1, another user's", "all addresses, another user's", "::1 +1, pid 99",
                                                     "127.0.0.1, 3 processes", "all addresses, pid 4507"]);
  assert.deepEqual(plain(top("port 8000", lists).actions[1].run.argv), ["kill", "-TERM", "--", "5002", "5001", "5000"], "every holder, so a pre-fork server stops");
  const node = top("port 51", lists);
  assert.equal(node.title, ":5173 node");
  assert.deepEqual(plain(node.run), { kind: "open", target: "http://localhost:5173" });
  const stop = node.actions.find(a => a.label === "Stop node");
  assert.equal(stop.confirm, true);
  assert.deepEqual(plain(stop.run.argv), ["kill", "-TERM", "--", "99"]);
  assert.equal(top("ports drop", lists).title, ":17500 dropbox");
  assert.ok(!all[0].actions.some(a => /^Stop/.test(a.label)), "another user's socket has nothing to stop");
  assert.equal(top("ports", {}).title, "Reading ports...");
  assert.equal(top("ports", { failed: { ports: "ss failed" } }).title, "Could not read ports", "a failed read says so");
  assert.equal(top("services", { failed: { services: "no bus" } }).title, "Could not read your services");
  // Opened where it listens: localhost where both families do, else the one
  // family's loopback; any other address is itself, an IPv6 one in brackets
  // (codex 2026-10-04, 2026-10-05).
  const where = D.parsePorts([
    'LISTEN 0 5 192.168.1.20:8080 0.0.0.0:* users:(("lan",pid=7,fd=3))',
    'LISTEN 0 5 127.0.0.53%lo:5353 0.0.0.0:* users:(("dns",pid=8,fd=3))',
    'LISTEN 0 5 [fd00::5]:9090 [::]:* users:(("six",pid=9,fd=3))',
    'LISTEN 0 5 *:7000 *:* users:(("any",pid=10,fd=3))',
    'LISTEN 0 5 127.0.0.1:8081 0.0.0.0:* users:(("vfour",pid=11,fd=3))',
    'LISTEN 0 5 [::1]:8081 [::]:* users:(("vsix",pid=12,fd=3))',
    'LISTEN 0 5 0.0.0.0:8082 0.0.0.0:* users:(("wfour",pid=13,fd=3))',
    'LISTEN 0 5 [::]:8083 [::]:* users:(("wsix",pid=14,fd=3))'].join("\n"));
  const opened = n => plain(Engine.run("ports " + n, config, services({ ports: where }))[0].run.target);
  assert.equal(opened("lan"), "http://192.168.1.20:8080");
  assert.equal(opened("dns"), "http://127.0.0.53:5353");
  assert.equal(opened("six"), "http://[fd00::5]:9090");
  assert.equal(opened("any"), "http://localhost:7000");
  assert.equal(opened("vfour"), "http://127.0.0.1:8081", "IPv4's loopback alone: never localhost, which may be ::1");
  assert.equal(opened("vsix"), "http://[::1]:8081", "a server on the same port by IPv6 is opened by its own");
  assert.equal(opened("wfour"), "http://127.0.0.1:8082");
  assert.equal(opened("wsix"), "http://[::1]:8083");
});

test("projects are ranked before the list is cut", () => {
  const many = Array.from({ length: 9 }, (_, i) => ({ path: "/home/u/w/r" + i, name: "r" + i, git: true, score: 0 }))
    .concat([{ path: "/home/u/w/repo", name: "repo", git: true, score: 0 }]);
  const rows = Engine.run("repo", config, services({ projects: many })).filter(r => r.provider === "dev");
  assert.equal(rows[0].title, "repo", "the exact name, though it came last");
});

test("services parse escaped names and refuse one that reads as an option", () => {
  assert.deepEqual(plain(userServices.map(s => [s.name, s.active])), [["backup-sync", "active"], ["app-gnome-keyring-secrets@autostart", "inactive"]]);
  assert.equal(userServices[1].unit, "app-gnome\\x2dkeyring\\x2dsecrets@autostart.service");
});

test("services: Enter shows the logs, Ctrl+K restarts and stops or starts, the unit after --", () => {
  const s = top("services sync", lists);
  assert.equal(s.title, "backup-sync"); assert.equal(s.badge, "ON");
  assert.deepEqual(plain(s.run.argv.slice(-7)), ["journalctl", "--user", "-u", "backup-sync.service", "-n", "200", "-f"]);
  assert.deepEqual(plain(s.actions.map(a => a.label)), ["Restart", "Stop", "Status in a terminal"]);
  assert.deepEqual(plain(s.actions[1].run.argv), ["systemctl", "--user", "stop", "--", "backup-sync.service"]);
  assert.equal(s.actions[1].confirm, true);
  const k = top("service keyring", lists);
  assert.equal(k.title, "app-gnome-keyring-secrets@autostart");
  assert.equal(k.actions[1].label, "Start");
  assert.deepEqual(plain(k.actions[1].run.argv.slice(-1)), ["app-gnome\\x2dkeyring\\x2dsecrets@autostart.service"]);
  assert.equal(top("services storage", lists).title, "app-gnome-keyring-secrets@autostart", "by its description");
  assert.equal(run("services", lists).filter(r => r.key && r.key.indexOf("service:") === 0).length, 2);
});

test("history: every word in the title or address, most visited first, only web pages opened", () => {
  assert.deepEqual(plain(browserHistory.map(r => r.url)), ["https://app.slack.com/client/T1", "https://github.com/itsgg/omarchy-nodi/pulls", "https://slack.com/help"]);
  const hits = run("h slack", lists).filter(r => r.key && r.key.indexOf("history:") === 0);
  assert.deepEqual(plain(hits.map(r => r.title)), ["Threads - Acme - Slack", "Slack help"]);
  assert.deepEqual(plain(hits[0].run), { kind: "open", target: "https://app.slack.com/client/T1" });
  assert.equal(hits[0].subtitle, "app.slack.com/client/T1, 5 visits");
  assert.equal(top("history nodi pulls", lists).title, "Pull requests");
  assert.equal(top("h ", lists).title, "Browser history"); assert.equal(top("h ", lists).hint, "h <words>");
  assert.equal(top("h x", { failed: { "browser-history": "exit 1" } }).title, "No browser history to read");
  assert.throws(() => D.parseHistory("", false));
});

test("pull requests: open ones that involve you, filtered by words, links only", () => {
  const all = run("prs", lists).filter(r => r.key && r.key.indexOf("pr:") === 0);
  assert.deepEqual(plain(all.map(r => r.title)), ["#12 Ports and services", "#7 Fix the flake"]);
  assert.equal(all[1].subtitle, "itsgg/kalvi, by someone");
  assert.equal(top("pr kalvi", lists).title, "#7 Fix the flake");
  assert.deepEqual(plain(top("pr kalvi", lists).run), { kind: "open", target: "https://github.com/itsgg/kalvi/pull/7" });
  assert.equal(top("prs", { failed: { prs: "gh could not search" } }).title, "gh could not search", "said once");
});

test("the views take only their own words: no network read while typing print, portal or help", () => {
  for (const q of ["print", "portal", "pr", "port", "help", "hello", "servicenow"]) {
    const asked = [];
    run(q, Object.assign({ asked }, lists));
    assert.ok(!asked.some(k => ["ports", "services", "browser-history", "prs"].indexOf(k) !== -1), q + " asked " + asked.join(","));
  }
  const asked = [];
  run("prs", { asked });
  assert.ok(asked.indexOf("prs") !== -1, "prs asks gh");
  assert.ok(run("pr ", lists).some(r => r.key && r.key.indexOf("pr:") === 0), "pr and a space is the view");
});

test("a typed site opens: a URL, a domain with a known ending, localhost; never a file name (ROADMAP 55)", () => {
  assert.equal(D.typedUrl("github.com/itsgg"), "https://github.com/itsgg");
  assert.equal(D.typedUrl("https://x.test/a?b=c"), "https://x.test/a?b=c");
  assert.equal(D.typedUrl("localhost:3000"), "http://localhost:3000");
  assert.equal(D.typedUrl("192.168.1.1:8080/admin"), "http://192.168.1.1:8080/admin");
  assert.equal(D.typedUrl("www.wikipedia.org"), "https://www.wikipedia.org");
  for (const not of ["notes.md", "build.sh", "report.pdf", "e.g.", "a b.com", "2+2", "firefox", "config.json", "1.5", "1.5.md", "2.0.app", "999.999.999.999"]) assert.equal(D.typedUrl(not), "", not);
  assert.equal(D.typedUrl("1password.com"), "https://1password.com", "a name may start with a digit: a site, over https");
  assert.ok(D.fileLike("notes.org") && D.fileLike("main.cc") && !D.fileLike("www.example.org") && !D.fileLike("example.org/x") && !D.fileLike("github.com"));
  const windows = [{ address: "0xe1", cls: "emacs", title: "notes.org", workspace: "1", focus: 1 }];
  assert.equal(top("notes.org", { windows }).key, "window:0xe1", "an editor's window of that name over the site (Fable 2026-10-06)");
  assert.equal(top("main.cc", { windows: [{ address: "0xe2", cls: "code", title: "main.cc - nodi", workspace: "1", focus: 1 }] }).key, "window:0xe2");
  const files = [{ path: "/home/u/old/notes.org", name: "notes.org" }, { path: "/home/u/notes.org", name: "notes.org" }];
  assert.equal(top("notes.org", { files }).key, "file:/home/u/old/notes.org", "a recent file of that name, the newest, over the site (Fable 2026-10-06)");
  assert.equal(top("Notes.ORG", { files }).key, "file:/home/u/old/notes.org");
  assert.ok(!run("notes", { files }).some(r => r.key.indexOf("file:") === 0), "a name without its ending finds no file at root");
  assert.equal(top("wikipedia.org", { files }).title, "Open wikipedia.org", "nothing else named: the site");
  const guessed = run("main.cc");
  assert.equal(guessed[0].title, "Open main.cc");
  assert.ok(guessed.some(r => r.title === "Find files named main.cc"), "a guess leaves the fallbacks under it (Fable 2026-10-06)");
  assert.ok(!run("github.com").some(r => r.provider === "fallback"), "a site no file is named like: no fallbacks");
  assert.equal(top("Report 7.org", { files: [{ path: "/home/u/Report 7.org", name: "Report 7.org" }] }).key, "file:/home/u/Report 7.org",
               "a name with a space (Fable 2026-10-06)");
  assert.equal(top("github.com", { windows: [{ address: "0xe3", cls: "foot", title: "github.com", workspace: "1", focus: 1 }] }).title, "Open github.com",
               "an ending no file type uses: the site over everything");
  const row = top("github.com/itsgg");
  assert.deepEqual([row.title, row.subtitle, row.run.kind, row.run.target], ["Open github.com/itsgg", "github.com", "open", "https://github.com/itsgg"]);
  assert.notEqual(top("notes.md") && top("notes.md").title, "Open notes.md");
});

test("bookmarks: the folders walked, under bm and three at root (ROADMAP 55)", () => {
  const file = { roots: {
    bookmark_bar: { name: "Bookmarks bar", type: "folder", children: [
      { type: "url", name: "Omarchy manual", url: "https://learn.omacom.io/2/the-omarchy-manual" },
      { type: "folder", name: "Work", children: [{ type: "url", name: "Kanban board", url: "https://board.example.com/team" },
                                                  { type: "url", name: "Bad", url: "javascript:alert(1)" }] }] },
    other: { name: "Other bookmarks", type: "folder", children: [{ type: "url", name: "", url: "https://news.ycombinator.com/" }] } } };
  const bookmarks = D.parseBookmarks(JSON.stringify(file), true);
  assert.deepEqual(plain(bookmarks), [
    { title: "Omarchy manual", url: "https://learn.omacom.io/2/the-omarchy-manual", folder: "Bookmarks bar" },
    { title: "Kanban board", url: "https://board.example.com/team", folder: "Bookmarks bar > Work" },
    { title: "", url: "https://news.ycombinator.com/", folder: "Other bookmarks" }], "only web pages, each with its folders");
  assert.throws(() => D.parseBookmarks("", false));
  const bm = plain(run("bm kanban", { bookmarks }));
  assert.deepEqual(bm.map(r => [r.title, r.subtitle]), [["Kanban board", "board.example.com/team, Bookmarks bar > Work"]]);
  assert.equal(plain(run("bm", { bookmarks })).length, 3, "bm alone: every one");
  const root = plain(run("omarchy manual", { bookmarks }));
  assert.ok(root.some(r => r.key === "bookmark:https://learn.omacom.io/2/the-omarchy-manual"), "at root, by its words");
  assert.equal(plain(run("bm zzz", { bookmarks }))[0].title, "No bookmark matches zzz");
  assert.ok(!plain(run("bar", { bookmarks })).some(r => r.key.startsWith("bookmark:")), "a folder's name matches no bookmark");
  assert.equal(plain(run("bm", {}))[0].title, "Reading bookmarks...");
  // No Bookmarks file reads as {}: none saved, which is no error (the live check 2026-10-06).
  const none = plain(run("bm ", { bookmarks: D.parseBookmarks("{}", true) }))[0];
  assert.deepEqual([none.title, none.subtitle], ["No bookmarks saved", "None in Chromium, Brave or Chrome"]);
  assert.equal(plain(run("bm ", { failed: { bookmarks: "not JSON" } }))[0].title, "Could not read the bookmarks", "a real failure says so");
});

