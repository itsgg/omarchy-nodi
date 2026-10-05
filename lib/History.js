.pragma library
.import "Score.js" as Score
.import "Run.js" as Run

// What Nodi remembers of what you run, kept in ~/.cache/nodi/history.json:
//
//   rows   per row key, how many times and when last: lib/Score.js turns an
//          entry into habit, a tie-break
//   picks  per query typed, which rows were picked for it: lib/Score.js
//          turns that into recall, which can move a row up
//
// A row entry may carry a snapshot (`s`: its title, icon and run) so an
// empty bar can offer it again. Kept: keys, the queries typed, and those
// snapshots; never clipboard text, since clipboard rows are not remembered.

var LIMIT = 500
var QUERIES = 300
var PER_QUERY = 5

// Every map here is keyed by text from outside: row keys, and queries as
// typed. None has a prototype, so a query typed as `__proto__` or
// `constructor` is stored like any other (Fable 2026-10-02).
function map() { return Object.create(null) }

var SNAP_FIELDS = ["title", "subtitle", "icon", "iconFont", "image", "kind", "provider", "group", "toggle", "actionLabel"]

function clip(text, max) {
  var s = String(text || "")
  return s.length > max ? s.slice(0, max) : s
}

// Providers whose rows name a moment, never a thing to run again: a saved
// one (from before a row said so, or by a key that once did) is never
// shown or run. A kill row's pids belong to processes that may be gone and
// their numbers reused (codex 2026-10-05: "Quit all" was remembered).
var MOMENTS = { processes: true }

// An app's action saved by its place alone (before actions had ids) is
// not run from its snapshot either: the place may hold another action now
// (Fable 2026-10-05); the apps provider finds it again by name if it can.
function moment(s) { return !!s && Object.prototype.hasOwnProperty.call(MOMENTS, String(s.provider || "")) }

function replayable(s) {
  if (!s || !s.run || moment(s)) return false
  var r = s.run
  return !(r.kind === "app" && r.action !== undefined && r.action !== null && !r.actionId)
}

// What of a normalized row an empty bar needs to show and run it again.
function snapshot(row) {
  if (!row || !row.run) return null
  var s = { run: row.run, confirm: !!row.confirm }
  // A row that asks for a word or names a risk asks the same when it is
  // run again from the home or an alias.
  if (row.confirmWord) s.confirmWord = clip(row.confirmWord, 40)
  if (row.risk) s.risk = clip(row.risk, 500)
  if (row.undoable) s.undoable = true
  for (var i = 0; i < SNAP_FIELDS.length; i++) s[SNAP_FIELDS[i]] = clip(row[SNAP_FIELDS[i]], 160)
  return s
}

function entries(obj, withSnapshots) {
  var out = map()
  if (!obj || typeof obj !== "object") return out
  for (var k in obj) {
    var e = obj[k]
    if (!e || typeof e.n !== "number" || typeof e.t !== "number") continue
    out[k] = { n: e.n, t: e.t }
    if (withSnapshots && e.s && typeof e.s === "object" && e.s.run && typeof e.s.title === "string") out[k].s = e.s
  }
  return out
}

// { rows, picks } from the file's text; anything unreadable is empty.
function load(text) {
  try {
    var data = JSON.parse(text)
    var picks = map()
    var raw = data && data.picks && typeof data.picks === "object" ? data.picks : {}
    for (var q in raw) {
      var e = entries(raw[q])
      if (Object.keys(e).length > 0) picks[q] = e
    }
    return { rows: entries(data && data.rows, true), picks: picks }
  } catch (e2) {
    return { rows: map(), picks: map() }
  }
}

function serialize(rows, picks) {
  return JSON.stringify({ version: 2, rows: rows || {}, picks: picks || {} })
}

// Picks after `key` was picked for `query`: the query's own list keeps its
// five most recent rows, and the oldest queries go past QUERIES.
function pick(picks, query, key, nowMs) {
  var next = map()
  for (var q in picks || {}) next[q] = picks[q]
  if (!query) return next
  var own = map()
  for (var k in next[query] || {}) own[k] = next[query][k]
  own[key] = Score.bump(own[key], nowMs)
  var keys = Object.keys(own).sort(function(a, b) { return own[b].t - own[a].t })
  var kept = map()
  for (var i = 0; i < keys.length && i < PER_QUERY; i++) kept[keys[i]] = own[keys[i]]
  next[query] = kept
  var queries = Object.keys(next)
  if (queries.length > QUERIES) {
    var newest = function(q2) { var t = 0; for (var k2 in next[q2]) t = Math.max(t, next[q2][k2].t); return t }
    queries.sort(function(a, b) { return newest(a) - newest(b) })
    for (var j = 0; j < queries.length - QUERIES; j++) delete next[queries[j]]
  }
  return next
}

// The old bar's launch counts ({ "firefox": 12 }) as history, dated now, so
// the apps he uses keep their lead after the move to Nodi.
function fromLaunches(launches, nowMs) {
  var out = map()
  for (var id in launches || {}) {
    var n = Number(launches[id])
    if (n > 0 && Run.DESKTOP_ID.test(id)) out["app:" + id] = { n: Math.min(1000, n), t: nowMs }
  }
  return out
}

// History after one more run of `key` (with the row's snapshot when given),
// the oldest entries dropped past LIMIT.
function record(history, key, nowMs, snap) {
  var next = map()
  var keys = Object.keys(history || {})
  for (var i = 0; i < keys.length; i++) next[keys[i]] = history[keys[i]]
  var bumped = Score.bump(next[key], nowMs)
  var s = snap || (next[key] && next[key].s)
  if (s) bumped.s = s
  next[key] = bumped
  keys = Object.keys(next)
  if (keys.length > LIMIT) {
    keys.sort(function(a, b) { return next[a].t - next[b].t })
    for (var j = 0; j < keys.length - LIMIT; j++) delete next[keys[j]]
  }
  return next
}

// Rows and picks without `key`: "Reset ranking" in Ctrl+K.
function forget(rows, picks, key) {
  var nextRows = map()
  for (var k in rows || {}) if (k !== key) nextRows[k] = rows[k]
  var nextPicks = map()
  for (var q in picks || {}) {
    var own = map()
    var any = false
    for (var k2 in picks[q]) if (k2 !== key) { own[k2] = picks[q][k2]; any = true }
    if (any) nextPicks[q] = own
  }
  return { rows: nextRows, picks: nextPicks }
}

// Whether there is anything to reset for `key`.
function has(obj, key) { return !!obj && Object.prototype.hasOwnProperty.call(obj, key) }

function knows(rows, picks, key) {
  if (has(rows, key)) return true
  for (var q in picks || {}) if (has(picks[q], key)) return true
  return false
}
