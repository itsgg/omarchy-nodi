.pragma library
.import "Match.js" as Match
.import "Hotkey.js" as Hotkey
.import "Starters.js" as Starters
.import "WindowRules.js" as WindowRules

// What you set on rows from Ctrl+K, kept in ~/.local/state/nodi/prefs.json
// (state, not cache: clearing a cache must not lose them):
//
//   aliases     a word of yours that names a row: "ff" for Firefox
//   favourites  rows the empty bar shows first
//   hidden      rows never shown, until you show them again ("hidden ")
//   hotkeys     a chord of yours that runs a row from anywhere ("SUPER + F")
//   links       rows a deeplink names, so `runRow` finds them later
//   pins        clipboard entries kept first under `cb`, with what they
//               hold, so a pin outlives Omarchy's history (ROADMAP 54)
//   desktops    which app was on which workspace, by a name of yours
//               (providers/desktops.js, ROADMAP 60)
//   tried       the starters whose lesson was reached, by id: each goes
//               once it has been (lib/Starters.js, ROADMAP 77)
//   rules       window rules by class: the workspace an app opens on and
//               whether it floats (lib/WindowRules.js, ROADMAP 79)
//
// Each keeps the row's snapshot (lib/History.js snapshot), so an alias
// finds its row even when no provider would answer the alias, and the
// home and the hidden list can show and run a row without asking for it.
// ROADMAP item 16, research 3.

var VERSION = 1

function map() { return Object.create(null) }

function empty() { return { aliases: map(), favourites: [], hidden: [], hotkeys: map(), links: map(), pins: [], desktops: [], tried: [], rules: map() } }

// A window rule as kept: { app, workspace, float }, with at least one of
// the two set; null otherwise.
function ruleOf(r) {
  if (!r || typeof r !== "object") return null
  var ws = typeof r.workspace === "string" && WindowRules.WORKSPACE.test(r.workspace) ? r.workspace : ""
  var fl = r.float === true
  if (!ws && !fl) return null
  return { app: typeof r.app === "string" ? r.app.replace(/[\x00-\x1f\x7f]/g, "").slice(0, 120) : "", workspace: ws, float: fl }
}

// A saved desktop: { name, at, apps: [{ id, cls, name, workspace }] }, an
// app by its desktop id and the window class it had, on a numbered
// workspace; a named or special one is never saved. Twenty desktops of
// fifty apps at most, the newest first.
var DESKTOP_MAX = 20
var DESKTOP_APPS = 50
var WORKSPACE = /^[1-9]\d{0,2}$/
var DESKTOP_APP_ID = /^[A-Za-z0-9][^\/\x00-\x1f\x7f-\x9f]{0,199}$/

function desktopName(name) {
  var n = String(name || "").replace(/\s+/g, " ").trim()
  return n && n.length <= 40 && !/[\x00-\x1f]/.test(n) ? n : ""
}

function desktopOf(d) {
  if (!d || typeof d !== "object" || !Array.isArray(d.apps)) return null
  var name = desktopName(d.name)
  if (!name) return null
  var apps = []
  for (var i = 0; i < d.apps.length && apps.length < DESKTOP_APPS; i++) {
    var a = d.apps[i]
    if (!a || typeof a.id !== "string" || !DESKTOP_APP_ID.test(a.id) || typeof a.workspace !== "string" || !WORKSPACE.test(a.workspace)) continue
    apps.push({ id: a.id, cls: typeof a.cls === "string" ? a.cls.slice(0, 200) : "", name: typeof a.name === "string" ? a.name.slice(0, 120) : a.id,
                workspace: a.workspace })
  }
  return apps.length ? { name: name, at: Number(d.at) || 0, apps: apps } : null
}

function desktopFor(p, name) {
  var n = desktopName(name).toLowerCase()
  var all = (p && p.desktops) || []
  for (var i = 0; i < all.length; i++) if (all[i].name.toLowerCase() === n) return all[i]
  return null
}

// With `name` saved as `apps`, in place of one of that name; null when
// there is nothing to save.
function withDesktop(p, name, apps, nowMs) {
  var d = desktopOf({ name: name, apps: apps, at: nowMs })
  if (!d) return null
  var c = copy(p)
  c.desktops = [d].concat(c.desktops.filter(function(x) { return x.name.toLowerCase() !== d.name.toLowerCase() })).slice(0, DESKTOP_MAX)
  return c
}

function withoutDesktop(p, name) {
  var n = desktopName(name).toLowerCase()
  var c = copy(p)
  c.desktops = c.desktops.filter(function(x) { return x.name.toLowerCase() !== n })
  return c
}

// A pinned clipboard entry: { key, kind: "text", text } or { key, kind:
// "image", path, mime }. A text pin is kept whole in this file and pasted
// as one argument, which Linux caps at 128 KB (MAX_ARG_STRLEN), so one
// over 64 KB in UTF-8 is not offered (Fable 2026-10-06); an image is kept
// by its path, which Omarchy names by its hash and has never removed
// (seen 2026-10-06).
var PIN_MAX = 50
var PIN_TEXT_MAX = 65536

// Whether a text is at most PIN_TEXT_MAX bytes in UTF-8. Each UTF-16 unit
// is one to three bytes (a pair four), so most texts are settled by
// their length without a count.
function textFits(s) {
  if (s.length > PIN_TEXT_MAX) return false
  if (s.length * 3 <= PIN_TEXT_MAX) return true
  var n = 0
  for (var i = 0; i < s.length; i++) {
    var c = s.charCodeAt(i)
    n += c < 0x80 ? 1 : c < 0x800 ? 2 : c >= 0xd800 && c < 0xdc00 ? 4 : c >= 0xdc00 && c < 0xe000 ? 0 : 3
  }
  return n <= PIN_TEXT_MAX
}

function pinOf(e) {
  if (!e || typeof e !== "object" || typeof e.key !== "string" || !e.key) return null
  if (e.kind === "text" && typeof e.text === "string" && e.text && textFits(e.text)) return { key: e.key, kind: "text", text: e.text }
  if (e.kind === "image" && typeof e.path === "string" && e.path.charAt(0) === "/")
    return { key: e.key, kind: "image", path: e.path, mime: /^image\/[a-z0-9.+-]+$/i.test(String(e.mime || "")) ? String(e.mime) : "image/png" }
  return null
}

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

// Why `text`, prefs.json as read, is no prefs, or "": a file that does
// not parse, or holds no object, is never read as empty prefs and then
// written over, which lost every alias, favourite, hotkey and rule a
// trailing comma stood among (2026-10-09). An empty file is none yet.
function problem(text) {
  var t = String(text || "")
  if (!t.trim()) return ""
  var d
  try { d = JSON.parse(t) } catch (e) { return String((e && e.message) || e) }
  return d && typeof d === "object" && !Array.isArray(d) ? "" : "it holds no object"
}

// What a read of prefs.json does, given what was held: `held` { loaded,
// text, broken }, the text last read or written and why it was no prefs.
// { act: "none" } when it is read again as it was; else { act: "broken",
// why } (nothing saved over it), or { act: "take", prefs, text }.
function reread(held, text) {
  var t = String(text || "")
  if (held && held.loaded && t === held.text && !held.broken) return { act: "none" }
  var why = problem(t)
  if (why) return { act: "broken", why: why }
  return { act: "take", prefs: load(t), text: t }
}

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
  var seenPins = map()
  for (var pi = 0; Array.isArray(data.pins) && pi < data.pins.length && p.pins.length < PIN_MAX; pi++) {
    var pin = pinOf(data.pins[pi])
    if (pin && !seenPins[pin.key]) { seenPins[pin.key] = true; p.pins.push(pin) }
  }
  var seenDesktops = map()
  for (var di = 0; Array.isArray(data.desktops) && di < data.desktops.length && p.desktops.length < DESKTOP_MAX; di++) {
    var dk = desktopOf(data.desktops[di])
    if (dk && !seenDesktops[dk.name.toLowerCase()]) { seenDesktops[dk.name.toLowerCase()] = true; p.desktops.push(dk) }
  }
  // Starters' ids only, each once: nothing else is read back as one.
  for (var ti = 0; Array.isArray(data.tried) && ti < data.tried.length; ti++) {
    var t = data.tried[ti]
    if (Starters.IDS.indexOf(t) !== -1 && p.tried.indexOf(t) === -1) p.tried.push(t)
  }
  var rs = data.rules && typeof data.rules === "object" && !Array.isArray(data.rules) ? data.rules : {}
  var kept = 0
  for (var cls in rs) {
    if (kept >= WindowRules.MAX) break
    var rule = WindowRules.validClass(cls) ? ruleOf(rs[cls]) : null
    if (!rule) continue
    p.rules[cls] = rule
    // One more than fits in hyprctl's one argument is left out.
    if (WindowRules.fits(p.rules)) kept++
    else delete p.rules[cls]
  }
  return p
}

// Without a prototype, so an alias named "__proto__" is saved as one.
function plainOf(m) { var o = Object.create(null); for (var k in m) o[k] = m[k]; return o }

function serialize(p) {
  return JSON.stringify({ version: VERSION, aliases: plainOf(p.aliases), favourites: p.favourites, hidden: p.hidden,
                          hotkeys: plainOf(p.hotkeys), links: plainOf(p.links), pins: p.pins, desktops: p.desktops || [],
                          tried: p.tried || [],
                          rules: plainOf(p.rules || map()) })
}

function copy(p) {
  var c = empty()
  for (var k in p.aliases) c.aliases[k] = p.aliases[k]
  for (var h in p.hotkeys) c.hotkeys[h] = p.hotkeys[h]
  for (var l in p.links) c.links[l] = p.links[l]
  c.favourites = p.favourites.slice()
  c.hidden = p.hidden.slice()
  c.pins = (p.pins || []).slice()
  c.desktops = (p.desktops || []).slice()
  c.tried = (p.tried || []).slice()
  for (var r in p.rules || {}) c.rules[r] = p.rules[r]
  return c
}

// The rule for a window's class changed as `change` says ({ workspace:
// "3" } or "" to stop, { float: true } or false); gone once it holds
// neither. Null when the class is not one Hyprland could report, the
// workspace is not a numbered one, or there would be too many.
function withRule(p, cls, app, change) {
  if (!WindowRules.validClass(cls) || !change || typeof change !== "object") return null
  var before = (p.rules && p.rules[cls]) || { app: "", workspace: "", float: false }
  var next = { app: app ? String(app) : before.app, workspace: before.workspace, float: before.float }
  if ("workspace" in change) {
    if (change.workspace !== "" && !WindowRules.WORKSPACE.test(String(change.workspace))) return null
    next.workspace = String(change.workspace)
  }
  if ("float" in change) next.float = change.float === true
  if (!(p.rules && p.rules[cls]) && Object.keys(p.rules || {}).length >= WindowRules.MAX) return null
  var c = copy(p)
  var kept = ruleOf(next)
  if (kept) c.rules[cls] = kept
  else delete c.rules[cls]
  return WindowRules.fits(c.rules) ? c : null
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

function isPinned(p, key) { return !!p && has(p.pins || [], key) }

// Pinned first, newest pin on top; unpinned when it was pinned.
function toggledPin(p, key, pin) {
  var c = copy(p)
  if (has(c.pins, key)) { c.pins = c.pins.filter(function(e) { return e.key !== key }); return c }
  var e = pinOf(pin && { key: key, kind: pin.kind, text: pin.text, path: pin.path, mime: pin.mime })
  if (!e) return null
  c.pins = [e].concat(c.pins).slice(0, PIN_MAX)
  return c
}
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

// A starter's lesson was reached; null when it was already, or no
// starter has that id.
function withTried(p, id) {
  if (Starters.IDS.indexOf(id) === -1 || (p.tried || []).indexOf(id) !== -1) return null
  var c = copy(p)
  c.tried.push(id)
  return c
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
