// Developer views: projects, tmux sessions, SSH hosts, man and tldr, ports,
// user services, browser history and pull requests.

import { test } from "node:test";
import assert from "node:assert/strict";
import { load, plain } from "./load.mjs";
import { run, top } from "./fixtures.mjs";

const D = load("providers/dev.js");
const projects = D.parseProjects("git\t/home/u/Work/GG/omarchy-nodi\ngit\t/home/u/Work/kalvi\nz\t18.0\t/home/u/Work\nz\t4.0\t/home/u/Work/kalvi\nnot a line\n", true);
const tmux = D.parseTmux("$0\takshi\t1\t1\n$3\tlane.a\t3\t0\n\n");
const ssh = D.parseSsh("Host *\n  User x\nHost box web.example.com\n  HostName 1.2.3.4\nhost !bad\n");

test("the lists parse: one entry per path, repositories marked; sessions; hosts without patterns", () => {
  assert.deepEqual(plain(projects.map(p => [p.name, p.git])), [["omarchy-nodi", true], ["kalvi", true], ["Work", false]]);
  assert.deepEqual(plain(tmux), [{ id: "$0", name: "akshi", windows: 1, attached: true }, { id: "$3", name: "lane.a", windows: 3, attached: false }]);
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
  assert.deepEqual(plain(t.map(r => r.title)), ["akshi", "lane.a"]);
  assert.deepEqual(plain(t[1].run.argv.slice(-4)), ["tmux", "attach-session", "-t", "$3"], "by id, which a dotted name cannot break");
  assert.equal(t[0].subtitle, "tmux, 1 window, attached");
  assert.deepEqual(plain(top("ssh box", { ssh }).run.argv.slice(-3)), ["ssh", "--", "box"]);
  assert.deepEqual(plain(top("man ls").run.argv.slice(-3)), ["man", "--", "ls"]);
  assert.deepEqual(plain(top("man printf 3").run.argv.slice(-3)), ["man", "3", "printf"]);
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
  "akshi-mirror.service loaded active running Akshi: the vault mirrored to Dropbox",
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
});

test("services parse escaped names and refuse one that reads as an option", () => {
  assert.deepEqual(plain(userServices.map(s => [s.name, s.active])), [["akshi-mirror", "active"], ["app-gnome-keyring-secrets@autostart", "inactive"]]);
  assert.equal(userServices[1].unit, "app-gnome\\x2dkeyring\\x2dsecrets@autostart.service");
});

test("services: Enter shows the logs, Ctrl+K restarts and stops or starts, the unit after --", () => {
  const s = top("services mirror", lists);
  assert.equal(s.title, "akshi-mirror"); assert.equal(s.badge, "ON");
  assert.deepEqual(plain(s.run.argv.slice(-7)), ["journalctl", "--user", "-u", "akshi-mirror.service", "-n", "200", "-f"]);
  assert.deepEqual(plain(s.actions.map(a => a.label)), ["Restart", "Stop", "Status in a terminal"]);
  assert.deepEqual(plain(s.actions[1].run.argv), ["systemctl", "--user", "stop", "--", "akshi-mirror.service"]);
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
