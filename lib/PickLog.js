.pragma library

// Every row run from what was typed (ROADMAP 42), for the ranking harness
// to learn from his own use (Q H 1, H 5): the query at each keystroke of
// that open, the row picked, its place in the list, and the first rows
// shown, as keys. Kept as the last MAX in ~/.cache/nodi/picks-log.json:
// the queries typed in that open, up to TRAIL, a repeat or an empty field
// dropped, ones given up before the pick among them (lib/History.js keeps
// only the one picked from); no title or text of a row.

var MAX = 1000
var TRAIL = 40
var SHOWN = 8

function entry(at, trail, query, key, rows) {
  var keys = (rows || []).map(function(r) { return String(r && r.key || "") })
  var i = keys.indexOf(key)
  return { at: at, trail: (trail || []).slice(-TRAIL), query: String(query || ""), key: String(key), rank: i === -1 ? 0 : i + 1,
           shown: keys.slice(0, SHOWN) }
}

// The trail after one more keystroke: the query as normalised, a repeat dropped.
function typed(trail, query) {
  var t = (trail || []).slice(-(TRAIL - 1))
  if (query && t[t.length - 1] !== query) t.push(query)
  return t
}

function add(list, e) {
  var out = (list || []).concat([e])
  return out.length > MAX ? out.slice(out.length - MAX) : out
}

function parse(text) {
  try {
    var v = JSON.parse(text)
    return Array.isArray(v) ? v.filter(function(e) { return e && typeof e.at === "number" && typeof e.key === "string" }).slice(-MAX) : []
  } catch (err) { return [] }
}

function serialize(list) { return JSON.stringify(list || []) }

// How the picks went: the median place of the row picked, the share picked
// first, and the median letters typed before the pick.
function summary(list) {
  var l = list || []
  var ranks = l.map(function(e) { return e.rank }).filter(function(r) { return r > 0 }).sort(function(a, b) { return a - b })
  var letters = l.map(function(e) { return String(e.query || "").replace(/\s+/g, "").length }).sort(function(a, b) { return a - b })
  var mid = function(a) { return a.length ? a[Math.floor(a.length / 2)] : 0 }
  return { picks: l.length, medianRank: mid(ranks), first: l.filter(function(e) { return e.rank === 1 }).length, medianLetters: mid(letters) }
}
