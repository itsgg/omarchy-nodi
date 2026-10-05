.pragma library
.import "../lib/Match.js" as Match
.import "../lib/Menu.js" as Menu
.import "../lib/Run.js" as Run
.import "../lib/Score.js" as Score
.import "../lib/Toggles.js" as Toggles

// Omarchy's menu, searchable: every action in the default menu and the
// user's extension menu, with where it lives (Trigger > Toggle), hidden when
// its `when:` says it cannot work here, marked when its `checked:` says it is
// the current choice, and the toggles among them showing ON or OFF.
//
// Nodi.qml supplies ctx.menu = { items, order, when, checked } (lib/Menu.js)
// and ctx.toggleStates (lib/Toggles.js). Ranking is lib/Score.js's.

var LIMIT = 10

// Asked twice before they run: Enter arms the row, Enter again runs it.
var CONFIRM = { "system.logout": true, "system.reboot": true, "system.shutdown": true, "setup.reset": true }

// Installers and removers answer only a query that asks for them, except
// the ones that install no package (a web app, a TUI, a theme).
var GATED = /^(install|remove)(\.|$)/
var UNGATED = /^(install\.(webapp|tui|style)|remove\.(webapp|tui|theme))(\.|$)/
var GATE_WORDS = { install: "install", remove: "remove", uninstall: "remove" }

// What people call Omarchy's rows when they do not know the menu's word.
// Matched as aliases: the whole phrase names the row as its label does
// ("power off" is Shutdown, not LibreOffice by "OpenOffice"), part of it as
// a keyword. Written once and read, not asked of a model each time: the
// menu is the same on every Omarchy (ROADMAP 40). A word goes in only where
// it names that row and no other ("clock", "internet" and "sound" do not),
// and never over a row that names it by its own words: "reinstall" is
// Omarchy's reinstall command, never Reset Computer; "record screen" the
// action that records it, not the submenu (Fable 2026-10-05).
var SYNONYMS = {
  "system.lock": ["lock screen", "lock the screen"],
  "system.logout": ["log out", "sign out", "log off"],
  "system.shutdown": ["power off", "turn off", "shut down", "poweroff"],
  "system.reboot": ["restart computer", "restart the computer"],
  "system.suspend": ["sleep"],
  "system.screensaver": ["screen saver"],
  "learn.omarchy": ["manual", "docs", "documentation"],
  "learn.keybindings": ["shortcuts", "keyboard shortcuts", "hotkeys", "keys"],
  "style.theme": ["dark mode", "light mode", "colours", "colors", "appearance"],
  "style.background": ["wallpaper"],
  "trigger.capture.screenshot": ["screen shot", "print screen", "snip"],
  "trigger.capture.text": ["ocr", "extract text", "read text"],
  "trigger.capture.qr": ["qr code", "scan qr"],
  "trigger.capture.color": ["colour picker", "color picker", "eyedropper"],
  "setup.monitors": ["display", "displays", "resolution", "scaling"],
  "setup.input": ["keyboard", "mouse", "keyboard layout", "key repeat", "mouse speed", "trackpad speed"],
  "setup.keybindings": ["edit keybindings", "bindings"],
  "update.omarchy": ["update", "upgrade", "update system", "system update"],
  "update.process.shell": ["restart bar", "reload shell"],
  "system.hibernate": ["deep sleep"],
  "trigger.capture.screenrecord": ["screen recording", "screencast"],
  "trigger.capture.screenrecord.stop": ["stop recording"],
  "trigger.transcode": ["convert video", "compress video", "convert image"],
  "trigger.share.file": ["send file", "send files"],
  "trigger.share.receive": ["receive file", "receive files"],
  "trigger.toggle.idle-lock": ["caffeine", "keep awake", "prevent sleep"],
  "trigger.toggle.notifications": ["do not disturb", "silence notifications", "mute notifications"],
  "trigger.toggle.nightlight": ["night light", "blue light", "night mode", "warm screen"],
  "trigger.toggle.top-bar": ["hide bar", "show bar", "hide the bar", "top bar"],
  "trigger.tests.network-speedtest": ["internet speed", "speedtest", "bandwidth"],
  "trigger.tests.disk-speedtest": ["disk speed", "ssd speed"],
  "trigger.hardware.laptop-display": ["laptop screen", "internal display"],
  "trigger.hardware.mirror-display": ["mirror screen", "duplicate display", "projector"],
  "trigger.hardware.hybrid-gpu": ["graphics card", "nvidia"],
  "trigger.emoji": ["emoji picker", "emojis"],
  "trigger.reminder": ["remind me", "timer"],
  "style.font": ["fonts", "typeface"],
  "style.bar": ["status bar"],
  "style.bar.transparency": ["bar opacity", "transparent bar"],
  "setup.network.dns": ["name server", "nameserver"],
  "setup.default.browser": ["default browser"],
  "setup.default.terminal": ["default terminal"],
  "setup.default.editor": ["default editor"],
  "setup.default.agent": ["default agent", "coding agent"],
  "setup.plugin": ["extensions", "add ons"],
  "setup.security.fingerprint": ["fingerprint reader", "fingerprint login"],
  "setup.security.fido2": ["security key", "yubikey"],
  "setup.security.sshd": ["ssh server", "remote login"],
  "setup.reset": ["factory reset"],
  "update.timezone": ["time zone"],
  "update.time": ["date and time", "sync time"],
  "update.password.user": ["change password", "user password"],
  "update.password.drive": ["disk encryption", "luks"],
  "update.firmware": ["bios update", "fwupd"],
  "update.hardware.audio": ["restart audio", "fix sound", "no sound"],
  "update.hardware.wifi": ["restart wifi", "fix wifi"],
  "update.hardware.bluetooth": ["restart bluetooth", "fix bluetooth"],
  "update.themes": ["more themes"],
  "learn.hyprland": ["hyprland wiki"],
  "learn.arch": ["arch wiki"]
}

// Own keys only: a user's menu id can be `constructor`.
function own(table, id) { return Object.prototype.hasOwnProperty.call(table, id) ? table[id] : undefined }

function synonyms(id) { return own(SYNONYMS, id) || [] }

function leafWords(id) {
  return String(id).split(".").pop().replace(/[_-]+/g, " ")
}

// The words of the menus above an item, its labels and aliases.
function contextOf(ancestors) {
  var out = []
  for (var i = 0; i < ancestors.length; i++) out = out.concat([ancestors[i].label], ancestors[i].aliases)
  return out
}

// The words of the menus above an item.
function contextWords(ancestors) {
  var words = []
  var ctx = contextOf(ancestors)
  for (var i = 0; i < ctx.length; i++) words = words.concat(Match.words(ctx[i]))
  return words
}

// Some query word starts a word of an ancestor ("browser" for Defaults >
// Browser > Firefox), so the query is about that part of the menu.
function namesContext(words, qw) {
  for (var k = 0; k < qw.length; k++) {
    for (var w = 0; w < words.length; w++) if (words[w].indexOf(qw[k]) === 0) return true
  }
  return false
}

// A submenu of choices (Defaults > Terminal, Network > DNS) is a setting,
// not a place to go: "terminal" opens a terminal before it offers to change
// the default one.
function kindOf(item, toggle, menu) {
  if (item.kind !== "action") {
    for (var i = 0; i < menu.order.length; i++) {
      var child = menu.items[menu.order[i]]
      if (child && child.parent === item.id && child.checked) return "setting"
    }
    return "menu"
  }
  if (toggle) return "toggle"
  if (item.checked) return "setting"
  return "action"
}

function subtitleFor(item, crumb) {
  if (crumb && item.description) return crumb + ": " + item.description
  return crumb || item.description || "Omarchy menu"
}

// The keys that run a menu action, from the keybinding records when they
// have been read (providers/keys.js): "omarchy-toggle-idle" -> "SUPER CTRL + I".
function chordsByAction(ctx) {
  var got = ctx.request ? ctx.request("keybindings", "", { fetch: false }) : null
  var list = got && Array.isArray(got.value) ? got.value : []
  var out = Object.create(null)
  for (var i = 0; i < list.length; i++) if (list[i].dispatcher === "exec" && list[i].arg && !out[list[i].arg]) out[list[i].arg] = list[i].chord
  return out
}

function rowFor(hit, ctx, chords) {
  var item = hit.item
  var toggle = Toggles.byMenu(item.id)
  var chord = item.kind === "action" && chords ? chords[item.action] : ""
  var row = {
    key: "menu:" + item.id,
    title: item.label,
    subtitle: subtitleFor(item, hit.crumb) + (chord ? ", keys " + chord : ""),
    icon: item.icon || "󰣇",
    iconFont: item.iconFont,
    tier: hit.tier,
    kind: hit.kind,
    offset: hit.offset,
    copy: "",
    group: "Omarchy"
  }
  if (item.kind === "action") {
    row.run = Run.shell(item.action)
    if (own(CONFIRM, item.id)) row.confirm = true
    if (toggle) {
      var b = Toggles.badge((ctx.toggleStates || {})[toggle.id])
      row.badge = b.text
      row.badgeTone = b.tone
      row.toggle = toggle.id
      row.actionLabel = "Toggle"
    } else if (item.checked && ctx.menu.checked && ctx.menu.checked[item.id] === true) {
      row.badge = "Current"
      row.badgeTone = "on"
    }
  } else {
    // A submenu, a link or a provider list (fonts): open Omarchy's menu there.
    row.run = Run.exec(["omarchy-menu", "summon", item.kind === "link" ? item.target : item.id])
    row.actionLabel = "Open menu"
  }
  return row
}

// What each item is matched on, worked out once per menu: the ancestors,
// the words, the kind, the toggle. Nodi.qml makes a new menu object for
// every change (a file, a guard's answer), so one is never stale; on each
// keystroke this was most of the menu's time (tools/bench.sh).
var indexed = { menu: null, entries: [] }

function entriesOf(menu) {
  if (indexed.menu === menu) return indexed.entries
  var entries = []
  for (var n = 0; n < menu.order.length; n++) {
    var id = menu.order[n]
    var item = menu.items[id]
    if (!item || id === "root") continue
    if (item.provider === "apps") continue
    if (item.kind === "action" && !item.action) continue
    if (!Menu.visible(menu.items, id, menu.when)) continue
    var above = Menu.ancestors(menu.items, id)
    var toggle = Toggles.byMenu(id)
    entries.push({
      id: id, item: item, n: n, above: above, toggle: toggle,
      tree: GATED.test(id), ungated: UNGATED.test(id),
      contextWords: item.checked ? contextWords(above) : [],
      kind: kindOf(item, toggle, menu),
      crumb: above.map(function(a) { return a.label }).join(" > "),
      fields: Score.prepare({
        name: item.label,
        aliases: item.aliases.concat(synonyms(id)),
        keywords: [leafWords(id)].concat(toggle ? [toggle.keywords] : []),
        description: item.description,
        context: contextOf(above)
      })
    })
  }
  indexed = { menu: menu, entries: entries }
  return entries
}

var provider = {
  id: "menu",
  name: "Omarchy",
  icon: "󰣇",
  help: [
    { id: "omarchy", title: "Omarchy menu", icon: "󰣇", about: "Every action in Omarchy's menu, yours included, by name",
      examples: [{ q: "screenshot" }, { q: "dns", note: "Setup > Network > DNS, with the current one marked" },
                 { q: "settings", note: "Everything under Setup" }, { q: "install zed", note: "Installers answer only when asked" }] },
    { id: "toggles", title: "Toggles", icon: "󰔡", about: "Omarchy's toggles, each with its state",
      examples: [{ q: "gaps", note: "Window Gaps, ON or OFF" }, { q: "dnd", note: "Notifications, ON or OFF" }, { q: "stay awake" }] }
  ],
  match: function(query, ctx) {
    var menu = ctx.menu
    if (!menu || !menu.items || !Array.isArray(menu.order)) return []
    var q = Match.normalise(query)
    var qw = Match.words(q)
    if (q.length < 2 || qw.length === 0) return []

    // "install zed": only the install tree, matched on the rest.
    // Own keys: "constructor" is a word, not an installer gate (codex 2026-10-04).
    var gate = own(GATE_WORDS, qw[0]) || ""
    var words = gate ? qw.slice(1) : qw
    var text = gate ? words.join(" ") : q
    if (gate && words.length === 0) return []

    var hits = []
    var entries = entriesOf(menu)
    for (var n = 0; n < entries.length; n++) {
      var e = entries[n]
      // "install x" sees only the install tree, "remove x" only the remove
      // tree; without the word, only the installers that install no package.
      if (gate ? (!e.tree || e.id.indexOf(gate) !== 0) : (e.tree && !e.ungated)) continue
      // A choice among siblings (Defaults > Browser > Firefox) changes a
      // setting; it answers only a query that names where it lives, so
      // "firefox" opens Firefox and "default browser firefox" picks it.
      if (e.item.checked && !namesContext(e.contextWords, words)) continue
      var t = Score.tier(text, e.fields)
      if (!t) continue
      // An installer ranks under the row it installs for ("background" is
      // Style > Background before Install > Style > Background).
      var installs = e.tree ? -1 : 0
      var hit = { item: e.item, tier: t, kind: e.kind, offset: installs - e.above.length * 0.01, n: e.n, above: e.above, crumb: e.crumb }
      hit.score = Score.score(hit.tier, hit.kind) + hit.offset
      hits.push(hit)
    }

    // A submenu sits just under its best matching child that does something
    // and is named by more than where it lives: "update" runs the update
    // before it offers the Update menu, while "dns" offers the DNS menu
    // before the servers it would only reach through that menu's name.
    for (var i = 0; i < hits.length; i++) {
      var h = hits[i]
      if (h.item.kind === "action") continue
      var best = -1
      for (var j = 0; j < hits.length; j++) {
        var c = hits[j]
        if (c === h || (c.kind !== "action" && c.kind !== "toggle")) continue
        // Only a child named as well as the submenu: "update" for Update >
        // Omarchy (an alias), not "settings" for Setup > Input.
        if (Score.ORDER.indexOf(c.tier) > Score.ORDER.indexOf(h.tier)) continue
        if (c.above.some(function(a) { return a.id === h.item.id })) best = Math.max(best, c.score)
      }
      // Two points under: more than habit can give back (lib/Score.js HABIT_MAX).
      if (best >= 0 && h.score > best - 2) {
        h.offset += best - 2 - h.score
        h.score = best - 2
      }
    }

    hits.sort(function(a, b) { return b.score - a.score || a.n - b.n })
    var chords = chordsByAction(ctx)
    return hits.slice(0, LIMIT).map(function(hit) { return rowFor(hit, ctx, chords) })
  },
  // A saved row as the menu has it now: "menu:<id>", while it is shown.
  resolve: function(key, ctx) {
    var menu = ctx.menu
    if (!menu || !menu.items || !Array.isArray(menu.order) || String(key).indexOf("menu:") !== 0) return null
    var entries = entriesOf(menu)
    for (var i = 0; i < entries.length; i++) {
      var e = entries[i]
      if ("menu:" + e.id !== key) continue
      return rowFor({ item: e.item, tier: "exact", kind: e.kind, offset: 0, crumb: e.crumb }, ctx, chordsByAction(ctx))
    }
    return null
  }
}
