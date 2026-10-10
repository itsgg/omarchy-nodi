.pragma library

// Nodi's own reminders (2026-10-10): `remind 15 call mom` is kept by the
// bar, in ~/.local/state/nodi/reminders.json (its 0700 folder), and shown
// as its own toast when due. Omarchy's reminder put the words in the
// arguments of systemd-run, of the timer's bash and of each notification
// it sent, and its popups put them in bash arguments again, where another
// local user can read them in /proc (the marketplace's review of f444138).
// Due by the wall clock, looked at every few seconds and at the shell's
// start, so one due while the machine slept or the shell was off is shown
// as soon as it can be, said as late. Pure: Nodi.qml keeps the list.
//
// A reminder is { id, at, set, message }: due at `at` (ms), set at `set`.

var MAX = 50
var MESSAGE_MAX = 200
var MAX_MINUTES = 7 * 24 * 60
// Shown more than a minute after it was due: said as late.
var LATE_MS = 60000

function pad(n) { return (n < 10 ? "0" : "") + n }

function clock(ms, h24) {
  var d = new Date(ms)
  if (h24) return pad(d.getHours()) + ":" + pad(d.getMinutes())
  return (d.getHours() % 12 || 12) + ":" + pad(d.getMinutes()) + (d.getHours() < 12 ? " AM" : " PM")
}

// "5 min", "1 h 20 min", "2 h".
function span(ms) {
  var m = Math.max(1, Math.round(ms / 60000))
  if (m < 60) return m + " min"
  var h = Math.floor(m / 60), r = m % 60
  return h + " h" + (r ? " " + r + " min" : "")
}

function message(text) {
  return String(text === undefined || text === null ? "" : text).replace(/[\u0000-\u001f\u007f]+/g, " ").trim().slice(0, MESSAGE_MAX)
}

// { list, entry } with one more, due `minutes` from `nowMs`; null when the
// minutes are out of range or fifty are already set.
function add(list, minutes, text, nowMs, id) {
  var l = list || []
  var m = Number(minutes)
  if (!(m >= 1 && m <= MAX_MINUTES) || l.length >= MAX) return null
  var entry = { id: String(id), at: nowMs + Math.round(m * 60000), set: nowMs, message: message(text) }
  return { list: l.concat([entry]), entry: entry }
}

// Those due at `nowMs`, to show, and the rest, to keep.
function due(list, nowMs) {
  var fire = [], keep = []
  for (var i = 0; i < (list || []).length; i++) (list[i].at <= nowMs ? fire : keep).push(list[i])
  return { fire: fire, keep: keep }
}

// The pending ones, soonest first.
function pending(list) {
  return (list || []).slice().sort(function(a, b) { return a.at - b.at })
}

function remove(list, id) {
  return (list || []).filter(function(r) { return r.id !== String(id) })
}

// What a reminder's row says: its words, and when.
function describe(r, nowMs, h24) {
  return { title: r.message || "Reminder",
           subtitle: (r.at > nowMs ? "In " + span(r.at - nowMs) : "Now") + ", at " + clock(r.at, h24) }
}

// The toast it is shown as: its words, and when it was set for; one shown
// late says when it was due.
function toast(r, nowMs, h24) {
  var lateBy = nowMs - r.at
  return { title: r.message || "Reminder",
           body: lateBy > LATE_MS ? "Due at " + clock(r.at, h24) + ", " + span(lateBy) + " ago: the bar was not running then"
                                  : "Set at " + clock(r.set, h24) + " for " + span(r.at - r.set) }
}

// The file's reminders; anything that is not one is left out.
function parse(text) {
  var o
  try { o = JSON.parse(String(text || "")) } catch (e) { return [] }
  var l = o && Array.isArray(o.reminders) ? o.reminders : []
  var out = []
  for (var i = 0; i < l.length && out.length < MAX; i++) {
    var r = l[i]
    if (!r || typeof r !== "object" || typeof r.id !== "string" || typeof r.at !== "number" || !isFinite(r.at) || typeof r.set !== "number" || !isFinite(r.set)) continue
    out.push({ id: r.id, at: Number(r.at), set: Number(r.set), message: message(r.message) })
  }
  return out
}

// Why the file's text is no list of reminders, or "" (an empty file, or
// none yet, is one): a file with an error is neither read nor written
// over, as prefs.json is not (Fable 2026-10-10: its reminders were lost).
function broken(text) {
  var t = String(text || "")
  if (!t.trim()) return ""
  var o
  try { o = JSON.parse(t) } catch (e) { return "it is not JSON" }
  return o && typeof o === "object" && Array.isArray(o.reminders) ? "" : "it holds no list of reminders"
}

// The file's list and those set before it was read (in the moment after
// the shell's start), each id once, at most MAX (Fable 2026-10-10: the
// read replaced them).
function merged(fromFile, held) {
  var seen = Object.create(null), out = []
  var all = (fromFile || []).concat(held || [])
  for (var i = 0; i < all.length && out.length < MAX; i++) {
    if (seen[all[i].id]) continue
    seen[all[i].id] = true
    out.push(all[i])
  }
  return out
}

function serialize(list) {
  return JSON.stringify({ version: 1, reminders: list || [] }, null, 2) + "\n"
}
