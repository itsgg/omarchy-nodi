.pragma library
.import "../lib/Run.js" as Run
.import "../lib/Score.js" as Score

// Every Omarchy command, from `omarchy commands --json` (285 a person can
// run on 4.0.4), read through the "omarchy-commands" source below, at load
// and again after an hour:
//   [{ route, binary, group, summary, requires_sudo, args, aliases, prints }]
//
// Omarchy's menu is its curated surface and this is its catalog, so the
// catalog sits under the menu: a command ranks two points under a submenu
// named as well (kind "command"), and one that a menu action already runs
// is left to that menu row. `omarchy ` opens the whole catalog, those
// included. A command opens in Omarchy's floating terminal, as Omarchy's
// menu opens what prints or asks, unless it acts on the desktop directly;
// one that needs an argument fills in `> omarchy <route> ` for the run mode.

// Groups Omarchy's own help calls helpers, detection or checks: what its
// scripts call, not what a person runs.
var HIDDEN_GROUPS = { battery: true, clipboard: true, cmd: true, config: true, dev: true, file: true, hw: true,
                      installed: true, migrate: true, monitor: true, notification: true, osd: true, pkg: true,
                      power: true, shell: true, show: true, state: true, sudo: true }

// A command whose whole answer is its exit status shows a person nothing,
// and one whose summary says it serves the shell, the bar, a theme switch
// or the boot is plumbing too, in Omarchy's own words.
// "Used by" opens a sentence there; "the editor used by" is a person's.
var PROBE = /^(returns? (true|success)|check (if|whether)|watch)\b|\b(for the shell|for the bar|bar-friendly|on boot)\b|(^|[.(]\s*)used by\b/i

// Groups whose commands act on the desktop and print nothing: run as they
// are. Anything else opens in the terminal, where what it prints, asks or
// keeps running is seen and can be closed: a benchmark, a gum prompt run
// bare, a receiver that waits for files (Fable 2026-10-02).
var DIRECT_GROUPS = { agent: true, audio: true, bluetooth: true, brightness: true, capture: true, hyprland: true,
                      launch: true, menu: true, restart: true, system: true, toggle: true, voxtype: true }

// One whose answer is text is run where the text can be read, even in a
// desktop group ("Print the name of the focused monitor").
var PRINTS = /^(print|show|list|returns?|display)\b/i

// What closes, removes, overwrites or powers off asks for a second Enter,
// as the menu's Reset and power rows do, judged by Omarchy's own words; the
// whole refresh group, which its help calls "Reset config to defaults"
// ("refresh applications" copies over your launchers, Fable 2026-10-02).
var CONFIRM = /\b(remove|reinstall|reset|overwrite|delete|prune|wipe|factory|reboot|shut ?down|log ?out|close all)\b/i

// Installers and removers answer only "install x" and "remove x", as in the
// menu (providers/menu.js), "uninstall" being "remove".
var GATE_WORDS = { install: "install", remove: "remove", uninstall: "remove" }

var BINARY = /^omarchy-[a-z0-9-]+$/

function words(route) { return String(route || "").replace(/^omarchy\s+/, "") }

// Anything outside brackets ("<theme-name>", "prompt", "label paths") is an
// argument the command cannot run without.
function needsArgument(args) {
  var a = String(args || "")
  while (/\[[^\[\]]*\]/.test(a)) a = a.replace(/\[[^\[\]]*\]/g, "")
  return /\S/.test(a)
}

function inTerminal(cmd) {
  return !!cmd.requires_sudo || !!cmd.prints || DIRECT_GROUPS[cmd.group] !== true
}

function terminalRun(binary) { return Run.exec(["omarchy-launch-floating-terminal-with-presentation", binary]) }

// The commands a person may run, from the parsed JSON.
function parse(text) {
  var data
  try { data = JSON.parse(text) } catch (e) { return [] }
  var list = data && Array.isArray(data.commands) ? data.commands : []
  var out = []
  for (var i = 0; i < list.length; i++) {
    var c = list[i]
    if (!c || c.hidden || HIDDEN_GROUPS[c.group] === true || !BINARY.test(String(c.binary || ""))) continue
    var summary = String(c.summary || "").replace(/\.$/, "")
    if (PROBE.test(summary)) continue
    out.push({
      route: String(c.route || ""), binary: String(c.binary), group: String(c.group || ""),
      summary: summary, requires_sudo: c.requires_sudo === true, prints: PRINTS.test(summary),
      args: String(c.args || ""), aliases: Array.isArray(c.aliases) ? c.aliases.map(words) : []
    })
  }
  return out
}

// The omarchy-* programs Omarchy's menu runs, so the catalog leaves them to
// it. Cached per menu: the tree changes only when it is read again.
var menuCache = { menu: null, binaries: null }

function menuBinaries(menu) {
  if (!menu || !menu.items) return Object.create(null)
  if (menuCache.menu === menu) return menuCache.binaries
  var found = Object.create(null)
  for (var i = 0; i < (menu.order || []).length; i++) {
    var item = menu.items[menu.order[i]]
    var names = item && item.action ? item.action.match(/\bomarchy-[a-z0-9-]+/g) : null
    for (var j = 0; names && j < names.length; j++) found[names[j]] = true
  }
  menuCache = { menu: menu, binaries: found }
  return found
}

// What each command is matched on, worked out once per catalog read
// rather than on every keystroke (tools/bench.sh).
var fieldsCache = { list: null, fields: null }

function fieldsOf(list) {
  if (fieldsCache.list === list) return fieldsCache.fields
  var fields = list.map(function(c) {
    return Score.prepare({ name: words(c.route), aliases: c.aliases, whole: true,
      keywords: [c.group, c.binary.replace(/^omarchy-/, "").replace(/-/g, " ")], description: c.summary })
  })
  fieldsCache = { list: list, fields: fields }
  return fields
}

function rowFor(cmd, tier) {
  var route = cmd.route
  var row = {
    key: "omarchy:" + cmd.binary,
    // The summary's first sentence, without its full stop as most have none
    // (7 of 367 run to a second; a long first one still elides).
    title: String(cmd.summary || route).split(/\.\s/)[0].replace(/\.$/, ""),
    subtitle: route + (cmd.args ? " " + cmd.args : ""),
    icon: "󰣇",
    tier: tier,
    kind: "command",
    copy: "",
    group: "Omarchy commands"
  }
  if (cmd.group === "refresh" || CONFIRM.test(route + " " + cmd.summary)) row.confirm = true
  if (needsArgument(cmd.args)) {
    row.complete = "> " + route + " "
    row.actionLabel = "Fill in"
    row.actions = [{ label: "Copy the command", icon: "󰆏", run: Run.copy(route) }]
    return row
  }
  row.run = inTerminal(cmd) ? terminalRun(cmd.binary) : Run.exec([cmd.binary])
  if (inTerminal(cmd)) row.actionLabel = "Run in terminal"
  row.actions = [
    inTerminal(cmd) ? { label: "Run without a terminal", icon: "󰐊", run: Run.exec([cmd.binary]) }
                    : { label: "Run in a terminal", icon: "󰆍", run: terminalRun(cmd.binary) },
    { label: "Copy the command", icon: "󰆏", run: Run.copy(route) }
  ]
  if (cmd.requires_sudo) row.badge = "sudo"
  return row
}

var LIMIT = 8

var provider = {
  id: "omarchy",
  name: "Omarchy commands",
  icon: "󰣇",
  modes: [{ pattern: /^\s*omarchy\s/i, label: "Omarchy", icon: "󰣇", exclusive: true }],
  sources: {
    "omarchy-commands": {
      argv: function() { return ["/usr/bin/bash", "-c", "omarchy commands --json"] },
      parse: function(text, ok) { if (!ok) throw "omarchy commands failed"; return parse(text) },
      maxAgeMs: 60 * 60 * 1000,
      // A list that failed to read (the shell up before omarchy is) is
      // tried again on an open a minute later, not an hour.
      retryMs: 60 * 1000,
      timeoutMs: 10000,
      maxBytes: 4194304
    }
  },
  commands: [
    { title: "Omarchy commands", keywords: "omarchy command commands cli", text: "Every omarchy command by name", complete: "omarchy " }
  ],
  help: [
    { id: "omarchy-commands", title: "Omarchy commands", icon: "󰣇", about: "Every command of Omarchy's command center",
      examples: [{ q: "omarchy ", note: "The whole catalog, the menu's own commands included" },
                 { q: "capture text", note: "OCR a region of the screen" },
                 { q: "omarchy theme set", note: "Fills in > omarchy theme set, for the theme's name" }] }
  ],
  match: function(query, ctx) {
    var got = ctx.request ? ctx.request("omarchy-commands") : { state: "pending" }
    var list = Array.isArray(got.value) ? got.value : []
    var whole = /^\s*omarchy\s/i.test(String(query))
    // The prefix goes before the trim: "omarchy " is the whole catalog.
    var q = String(query || "").replace(/^\s*omarchy(\s+|$)/i, "").trim().toLowerCase().replace(/\s+/g, " ")
    if (list.length === 0 || (!whole && q.length < 2)) return []
    var inMenu = whole ? null : menuBinaries(ctx.menu)
    var first = q.split(" ")[0]
    // Own keys: "constructor" is a word, not an installer gate (codex 2026-10-04).
    var gate = Object.prototype.hasOwnProperty.call(GATE_WORDS, first) ? GATE_WORDS[first] : ""
    if (gate && q === first && !whole) return []
    var text = gate ? gate + q.slice(first.length) : q
    var hits = []
    var fields = fieldsOf(list)
    for (var i = 0; i < list.length; i++) {
      var c = list[i]
      if (inMenu && inMenu[c.binary]) continue
      var gated = c.group === "install" || c.group === "remove"
      if (!whole && (gated ? c.group !== gate : !!gate)) continue
      var t = !text ? "prefix" : Score.tier(text, fields[i])
      if (t) hits.push({ c: c, t: t, s: Score.TIER[t] })
    }
    hits.sort(function(a, b) { return b.s - a.s || (a.c.route < b.c.route ? -1 : 1) })
    return (whole ? hits : hits.slice(0, LIMIT)).map(function(h) { return rowFor(h.c, h.t) })
  },
  // A saved row as the catalog has it now: "omarchy:<binary>". Only a look:
  // a home view does not start the catalog's read.
  resolve: function(key, ctx) {
    var got = ctx.request ? ctx.request("omarchy-commands", "", { fetch: false }) : null
    var list = got && Array.isArray(got.value) ? got.value : []
    for (var i = 0; i < list.length; i++) if ("omarchy:" + list[i].binary === key) return rowFor(list[i], "exact")
    return null
  }
}
