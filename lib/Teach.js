.pragma library

// The keys for what was just run by hand (ROADMAP 86): a row run from the
// bar that has keys of its own (an Omarchy menu action's binding, a
// binding found under `keys `, a hotkey he gave the row) shows them in
// Omarchy's own on-screen display as the bar closes, the keyboard's glyph
// and the keys, as its volume and brightness show theirs. The first three
// times a row, then never; `"teach": false` turns it off. Whether it
// teaches anything is measured by `make picks` (tools/picks.mjs): a taught
// row picked from the bar less after its hints may be a key now in use,
// or a thing no longer done: the bar cannot see a key pressed outside it.

var TIMES = 3
var DURATION_MS = 2000

// The keys a row has: its own (`keys`, from Omarchy's binding records),
// else a hotkey of his that Nodi holds for it now (`bound`, combo to row
// key, as Hotkey.planRows binds them): one that something else holds was
// never bound, and would be taught as keys that do another thing (Fable
// 2026-10-07); "" for none.
function keysFor(row, bound) {
  if (!row) return ""
  if (row.keys) return String(row.keys)
  for (var combo in bound || {}) if (Object.prototype.hasOwnProperty.call(bound, combo) && bound[combo] === row.key) return combo
  return ""
}

// Whether a row's keys are still to be shown: fewer than TIMES so far, and
// counted again from nothing when its keys change.
function due(taught, key, keys) {
  if (!key || !keys) return false
  var t = taught && Object.prototype.hasOwnProperty.call(taught, key) ? taught[key] : null
  return !t || t.keys !== keys || (Number(t.count) || 0) < TIMES
}

// The record with this showing counted: { key: { keys, count, first, last } }.
function noted(taught, key, keys, now) {
  var out = {}
  for (var k in taught || {}) if (Object.prototype.hasOwnProperty.call(taught, k)) out[k] = taught[k]
  var t = out[key] && out[key].keys === keys ? out[key] : null
  out[key] = { keys: keys, count: (t ? Number(t.count) || 0 : 0) + 1, first: t ? t.first : now, last: now }
  return out
}

// What `omarchy-osd`, Omarchy's on-screen display, is given: its
// keyboard glyph and the keys, for two seconds. The program is named where
// it is started (Nodi.qml teach), as tools/hygiene.mjs asks.
function osdArgs(keys) {
  return ["-i", "keyboard", "-m", String(keys), "-d", String(DURATION_MS)]
}

// Whether the hints teach (`make picks`): for each taught row, his picks
// of it from a typed query (the pick log keeps no others) in the two
// weeks before its first hint and in the two weeks after, the days after
// counted so far. Fewer after may be a key in use, or a thing no longer
// done; as many is a hint that taught nothing. The pick that showed the
// hint is before it, at the same millisecond too.
var WINDOW_MS = 14 * 24 * 3600 * 1000
function measure(taught, picks, now) {
  var out = []
  for (var k in taught || {}) {
    if (!Object.prototype.hasOwnProperty.call(taught, k)) continue
    var t = taught[k], before = 0, after = 0
    for (var i = 0; i < (picks || []).length; i++) {
      var p = picks[i]
      if (!p || p.key !== k) continue
      if (p.at >= t.first - WINDOW_MS && p.at <= t.first) before++
      else if (p.at > t.first && p.at < t.first + WINDOW_MS) after++
    }
    out.push({ key: k, keys: t.keys, shown: t.count, first: t.first, before: before, after: after,
               daysAfter: Math.round(Math.max(0, Math.min(WINDOW_MS, now - t.first)) / 864e5 * 10) / 10 })
  }
  return out.sort(function(a, b) { return a.first - b.first })
}

function parse(text) {
  var o
  try { o = JSON.parse(String(text || "")) } catch (e) { return {} }
  if (!o || typeof o !== "object" || Array.isArray(o)) return {}
  var out = {}
  for (var k in o) {
    var t = o[k]
    if (Object.prototype.hasOwnProperty.call(o, k) && t && typeof t === "object" && typeof t.keys === "string" && Number(t.count) > 0)
      out[k] = { keys: t.keys, count: Number(t.count), first: Number(t.first) || 0, last: Number(t.last) || 0 }
  }
  return out
}

function serialize(taught) { return JSON.stringify(taught || {}) }
