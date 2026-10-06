// Shared fixtures: a Sri Lanka user's config, mocked rates, zones and clock,
// apps, windows and processes. Ported from omarchy-commandbar's tests.

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { load, root } from "./load.mjs";

export const Engine = load("lib/Engine.js");
export const Jsonc = load("lib/Jsonc.js");

export const defaults = Jsonc.parse(readFileSync(join(root, "config.default.json"), "utf8"));
export const config = Jsonc.merge(defaults, { currency: { home: "LKR", favorites: ["USD", "EUR", "INR"] }, time: { home: "Asia/Colombo" } });

export const rates = { rates: { USD: 1, LKR: 300.5, EUR: 0.9, INR: 83.2, GBP: 0.78, JPY: 150 }, updated: 1790000000, stale: false };
export const zones = {
  "Asia/Colombo": { offset: 330, abbr: "+0530" }, "UTC": { offset: 0, abbr: "UTC" }, "America/New_York": { offset: -240, abbr: "EDT" },
  "Europe/London": { offset: 60, abbr: "BST" }, "America/Los_Angeles": { offset: -420, abbr: "PDT" }, "Asia/Tokyo": { offset: 540, abbr: "JST" }
};
export const now = () => new Date(2026, 8, 23, 14, 0);   // 23 Sep 2026 14:00 local

const emojiFile = (process.env.OMARCHY_PATH || "/usr/share/omarchy") + "/shell/plugins/emojis/emojis.json";
export const emojis = existsSync(emojiFile) ? JSON.parse(readFileSync(emojiFile, "utf8"))
  : [{ e: "🔥", k: "fire burn hot flame" }, { e: "🎉", k: "party popper tada celebrate" }, { e: "👍", k: "thumbs up like yes" }];

export const processes = [
  { pid: 101, rss: 400000, cpu: 12.5, name: "chrome", args: "/opt/google/chrome/chrome" },
  { pid: 102, rss: 200000, cpu: 3.0, name: "chrome", args: "/opt/google/chrome/chrome --type=renderer" },
  { pid: 103, rss: 50000, cpu: 0.1, name: "Web Content", args: "/usr/lib/firefox/firefox -contentproc" },
  { pid: 104, rss: 90000, cpu: 20.0, name: "node", args: "node server.js" }
];

const app = (id, name, generic, actions, keywords) => ({ id, name, generic: generic || "", comment: "", keywords: keywords || [], icon: id, wmclass: "", actions: (actions || []).map((n, i) => ({ index: i, name: n })) });
export const apps = [
  app("brave-browser", "Brave", "Web Browser", ["New Window", "New Private Window"]),
  app("firefox", "Firefox", "Web Browser", ["New Window", "New Private Window"]),
  app("org.gnome.Nautilus", "Files", "File Manager", [], ["folder", "explorer"]),
  app("Alacritty", "Alacritty", "Terminal", [], ["shell", "prompt"]),
  app("code", "Visual Studio Code", "Text Editor", ["New Empty Window"]),
  app("org.localsend.localsend_app", "LocalSend", "File Sharing"),
  app("signal", "Signal", "Messenger"),
  app("org.pulseaudio.pavucontrol", "Volume Control", "Volume Control", [], ["sound", "mixer"])
];
// How often each row was run, as Nodi keeps it: key -> { n, t }.
export const history = { "app:firefox": { n: 12, t: new Date(2026, 8, 20).getTime() } };
export const launches = history;

export const windows = [
  { address: "0xa1", cls: "firefox", title: "Mozilla Firefox", workspace: "2", focus: 0 },   // the one you're in: never listed
  { address: "0xb1", cls: "brave-browser", title: "Netflix - Brave", workspace: "1", focus: 1 },
  { address: "0xb2", cls: "brave-browser", title: "GitHub - Brave", workspace: "3", focus: 3 },
  { address: "0xc1", cls: "org.gnome.Nautilus", title: "Images", workspace: "5", focus: 2 },
  { address: "0xd1", cls: "com.mitchellh.ghostty", title: "~/Code", workspace: "special:scratch", focus: 4 },
  { address: "$(rm -rf ~)", cls: "evil", title: "Evil window", workspace: "1", focus: 5 }
];

// ctx.request as components/Requests.qml answers it, from what a test
// holds: processes, rates, a directory listing, Omarchy's commands and
// keybindings, the developer lists, the clipboard's text, scripts. A read
// that would start (not a { fetch: false } look) is recorded in `asked` as
// its key, "rates" or "directory:/home/u".
// A filter's read as Requests settles it: what the parse threw is an error.
function filtered(read, param) {
  try { return read(JSON.parse(param), param); } catch (e) { return { failed: String(e) }; }
}

export function requester(data, asked) {
  return function(name, param, opts) {
    if (asked && !(opts && opts.fetch === false)) asked.push(param ? name + ":" + param : name);
    const value = name === "processes" ? data.processes
      : name === "rates" ? data.rates
      : name === "directory" ? (data.directory && data.directory.path === param ? data.directory : undefined)
      : name === "omarchy-commands" ? data.omarchyCommands
      : name === "keybindings" ? data.keybindings
      : name === "fonts" ? data.fonts
      : name === "power-profiles" ? data.powerProfiles
      : name === "notifications" ? data.notifications
      : name === "find" ? (data.found && data.found.q === param ? data.found.list : undefined)
      : name === "contents" ? data.contents
      : name === "projects" ? data.projects
      : name === "tmux" ? data.tmux
      : name === "ssh" ? data.ssh
      : name === "ports" ? data.ports
      : name === "services" ? data.userServices
      : name === "browser-history" ? data.browserHistory
      : name === "bookmarks" ? data.bookmarks
      : name === "prs" ? data.prs
      : name === "clipboard-text" ? data.clipboardText
      : name === "pkg-repo" ? data.pkgRepo
      : name === "pkg-aur" ? data.pkgAur
      : name === "define" ? data.define
      : name === "notes-file" ? data.notes
      : name === "suggest" ? data.suggest
      : name === "plugins" ? data.plugins
      : name === "agent-usage" ? data.agentUsage
      : name === "calendar" ? data.calendar
      : name === "chooser-folders" ? data.chooserFolders
      : name === "agent-sessions" ? data.agentSessions
      : name === "window-cwd" ? data.windowCwd
      : name === "ocr" ? data.ocr
      : name === "scripts" ? data.scripts
      : name === "script-output" ? (data.scriptOutput || {})[JSON.parse(param)[1]]
      : name === "filter" || name === "filter-list" || name === "filter-step" ? (typeof data.filter === "function" ? filtered(data.filter, param) : undefined) : undefined;
    if (value && value.failed) return { state: "error", error: value.failed };
    if (data.failed && data.failed[name]) return { state: "error", error: data.failed[name], value };
    return value === undefined || value === null ? { state: "pending" } : { state: "ready", value, error: "", at: 0 };
  };
}

export function services(extra) {
  const base = { rates, zones, now, emojis, processes, apps, windows: [], history, home: "/home/u" };
  const svc = Object.assign(base, extra || {});
  if (!svc.request) svc.request = requester(svc, svc.asked);
  return svc;
}

export function run(query, extra, cfg) {
  return Engine.run(query, cfg || config, services(extra));
}

export function top(query, extra, cfg) {
  const rows = run(query, extra, cfg);
  return rows[0] || null;
}
