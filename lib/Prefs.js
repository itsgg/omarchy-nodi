.pragma library
.import "Match.js" as Match
.import "Hotkey.js" as Hotkey

// What you set on rows from Ctrl+K, kept in ~/.local/state/nodi/prefs.json
// (state, not cache: clearing a cache must not lose them):
//
//   aliases     a word of yours that names a row: "ff" for Firefox
//   favourites  rows the empty bar shows first
//   hidden      rows never shown, until you show them again ("hidden ")
//   hotkeys     a chord of yours that runs a row from anywhere ("SUPER + F")
//   links       rows a deeplink names, so `runRow` finds them later
//
// Each keeps the row's snapshot (lib/History.js snapshot), so an alias
// finds its row even when no provider would answer the alias, and the
// home and the hidden list can show and run a row without asking for it.
// ROADMAP item 16, research 3.

var VERSION = 1

function map() { return Object.create(null) }

function empty() { return { aliases: map(), favourites: [], hidden: [], hotkeys: map(), links: map() } }

function entry(e) {
  return e && typeof e === "object" && typeof e.key === "string" && e.key && e.s && typeof e.s === "object" && e.s.run ? { key: e.key, s: e.s } : null
}

function list(v) {
  var out = []
  var seen = map()
  for (var i = 0; Array.isArray(v) && i < v.length; i++) {
    var e = entry(v[i])
    if (e && !seen[e.key]) { seen[e.key] = true; out.push(e) }
  }
  return out
}

function normalise(alias) { return Match.normalise(String(alias || "")).trim() }

function load(text) {
  var p = empty()
  var data
  try { data = JSON.parse(text || "{}") } catch (e) { return p }
  if (!data || typeof data !== "object") return p
  var a = data.aliases && typeof data.aliases === "object" ? data.aliases : {}
  for (var k in a) {
    var e = entry(a[k])
    var n = normalise(k)
    if (e && n) p.aliases[n] = e
  }
  p.favourites = list(data.favourites)
  p.hidden = list(data.hidden)
  var h = data.hotkeys && typeof data.hotkeys === "object" ? data.hotkeys : {}
  // By the combo's canonical name, so "super+f" written by hand is the
  // SUPER + F Hyprland reports, and two spellings of one combo are one.
  for (var c in h) {
    var he = entry(h[c])
    var combo = Hotkey.parseCombo(c)
    if (he && combo) p.hotkeys[Hotkey.comboString(combo.mask, combo.key)] = he
  }
  var l = data.links && typeof data.links === "object" ? data.links : {}
  for (var lk in l) { var le = entry(l[lk]); if (le && le.key === lk) p.links[lk] = le }
  return p
}

// Without a prototype, so an alias named "__proto__" is saved as one.
function plainOf(m) { var o = Object.create(null); for (var k in m) o[k] = m[k]; return o }

function serialize(p) {
  return JSON.stringify({ version: VERSION, aliases: plainOf(p.aliases), favourites: p.favourites, hidden: p.hidden,
                          hotkeys: plainOf(p.hotkeys), links: plainOf(p.links) })
}

function copy(p) {
  var c = empty()
  for (var k in p.aliases) c.aliases[k] = p.aliases[k]
  for (var h in p.hotkeys) c.hotkeys[h] = p.hotkeys[h]
  for (var l in p.links) c.links[l] = p.links[l]
  c.favourites = p.favourites.slice()
  c.hidden = p.hidden.slice()
  return c
}

function aliasFor(p, query) {
  var n = normalise(query)
  return n && p && p.aliases[n] ? p.aliases[n] : null
}

function aliasesOf(p, key) {
  var out = []
  for (var k in (p && p.aliases) || {}) if (p.aliases[k].key === key) out.push(k)
  return out.sort()
}

function has(listOf, key) {
  for (var i = 0; i < listOf.length; i++) if (listOf[i].key === key) return true
  return false
}

function isFavourite(p, key) { return !!p && has(p.favourites, key) }
function isHidden(p, key) { return !!p && has(p.hidden, key) }

// An alias names one row; naming another moves it. An alias that is empty
// after normalising is refused (null), and so is one the bar answers before
// any alias: help ("?...") and the hidden list ("hidden") (Fable 2026-10-02).
function withAlias(p, alias, key, snap) {
  var n = normalise(alias)
  if (!n || n.charAt(0) === "?" || n === "hidden" || !key || !snap) return null
  var c = copy(p)
  c.aliases[n] = { key: key, s: snap }
  return c
}

function withoutAlias(p, alias) {
  var c = copy(p)
  delete c.aliases[normalise(alias)]
  return c
}

function toggledFavourite(p, key, snap) {
  var c = copy(p)
  if (has(c.favourites, key)) c.favourites = c.favourites.filter(function(e) { return e.key !== key })
  else if (key && snap) c.favourites.push({ key: key, s: snap })
  return c
}

function hiddenRow(p, key, snap) {
  var c = copy(p)
  if (key && snap && !has(c.hidden, key)) c.hidden.push({ key: key, s: snap })
  return c
}

function shownRow(p, key) {
  var c = copy(p)
  c.hidden = c.hidden.filter(function(e) { return e.key !== key })
  return c
}

// A hotkey runs one row; giving a row a new one replaces its old one.
function withHotkey(p, combo, key, snap) {
  if (!combo || !key || !snap) return null
  var c = copy(p)
  for (var k in c.hotkeys) if (c.hotkeys[k].key === key) delete c.hotkeys[k]
  c.hotkeys[combo] = { key: key, s: snap }
  return c
}

function withoutHotkey(p, key) {
  var c = copy(p)
  for (var k in c.hotkeys) if (c.hotkeys[k].key === key) delete c.hotkeys[k]
  return c
}

function hotkeyOf(p, key) {
  for (var k in (p && p.hotkeys) || {}) if (p.hotkeys[k].key === key) return k
  return ""
}

function withLink(p, key, snap) {
  if (!key || !snap) return null
  var c = copy(p)
  c.links[key] = { key: key, s: snap }
  return c
}

// The snapshot a deeplink or a hotkey runs: the one it was set with, or
// what the home or an alias keeps of the row.
function snapshotFor(p, key, history) {
  for (var c in p.hotkeys) if (p.hotkeys[c].key === key) return p.hotkeys[c].s
  if (p.links[key]) return p.links[key].s
  for (var a in p.aliases) if (p.aliases[a].key === key) return p.aliases[a].s
  for (var i = 0; i < p.favourites.length; i++) if (p.favourites[i].key === key) return p.favourites[i].s
  var h = history && Object.prototype.hasOwnProperty.call(history, key) ? history[key] : null
  return h && h.s ? h.s : null
}
