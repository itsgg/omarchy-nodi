.pragma library
.import "Run.js" as Run
.import "History.js" as History
.import "Prefs.js" as Prefs
.import "AskTools.js" as AskTools

// What `nodi mcp` (bin/nodi, ROADMAP 45) may run, for Nodi.qml: the rows
// another agent's search found, the rows a proposal showed him, and the
// rules a key's run is refused by. Nodi keeps the maps and starts what
// runs; nothing here starts a program.

// Rows a search found, by key, with when: a run names one no hotkey or
// history holds, for ten minutes, the last 64.
var FOUND_MS = 10 * 60 * 1000
var FOUND_MAX = 64
// Rows a proposal showed, kept until his Enter runs one: the last eight.
var SHOWN_MAX = 8

function foundRow(found, key, now) {
  var f = found[String(key || "")]
  return f && now - f.at < FOUND_MS ? f.row : null
}

// The found rows with a search's added: a new map and order, the oldest
// past 64 gone.
function keepFound(found, order, rows, now) {
  var next = {}
  var keys = order.slice()
  for (var k in found) next[k] = found[k]
  for (var i = 0; i < rows.length; i++) {
    if (!next[rows[i].key]) keys.push(rows[i].key)
    next[rows[i].key] = { row: rows[i], at: now }
  }
  while (keys.length > FOUND_MAX) delete next[keys.shift()]
  return { rows: next, order: keys }
}

// What a run does, said on one line: a copy keeps its text, a script its
// arguments (Fable 2026-10-06: the first line alone lost both).
function oneLine(text) {
  var t = String(text || "").replace(/\s*\n+\s*/g, " ").trim()
  return t.length > 300 ? t.slice(0, 297) + "..." : t
}

function asks(r) {
  return r.confirmWord ? "a typed word" : r.confirm ? "a second Enter" : ""
}

// A row as an agent reads it; a row that asks says how.
function agentData(r) {
  return { key: r.key, title: r.title, subtitle: r.subtitle, kind: r.kind, asks: asks(r) }
}

// `nodi mcp`'s search answer: each row with what it runs.
function searchReply(rows) {
  return JSON.stringify(rows.map(function(r) {
    var d = agentData(r)
    d.command = oneLine(Run.describe(r.run))
    if (r.risk) d.risk = r.risk
    return d
  }))
}

// What a key runs: { s: its snapshot, remember }, or null. With `agent`,
// a row `nodi mcp`'s search found runs as found, the fresher of the two,
// a moment's row (a kill) included, as Claude's run would, and is
// remembered only if its provider says so; else the saved row, as its
// provider gives it now (`resolve(key, saved)`, lib/Engine.js resolve),
// never a moment's.
function keySnapshot(key, agent, found, prefs, history, now, resolve) {
  var hit = agent ? foundRow(found, key, now) : null
  if (hit) return { s: History.snapshot(hit), remember: !!hit.remember }
  var saved = Prefs.snapshotFor(prefs, key, history)
  var live = saved ? resolve(key, saved) : null
  var s = live ? History.snapshot(live) : saved
  return History.replayable(s) ? { s: s, remember: true } : null
}

// A row shown to propose, kept in `shown` (changed in place) unless it
// asks for a typed word, which is never run for an agent; the new order.
function keepShown(shown, order, key, a) {
  if (!a.s.confirmWord) shown[key] = a
  var keys = order.filter(function(x) { return x !== key }).concat([key])
  while (keys.length > SHOWN_MAX) delete shown[keys.shift()]
  return keys
}

// What a row is, for `nodi mcp` to show before it is run.
function describeReply(key, s) {
  return JSON.stringify({ key: key, title: String(s.title || ""), subtitle: String(s.subtitle || ""), command: Run.describe(s.run),
                          risk: String(s.risk || ""), asks: s.confirmWord ? "a typed word" : s.confirm ? "a second Enter" : "" })
}

// A proposed row runs only as it was shown, once: taken out of `shown`
// (changed in place) with the new order, or null when none is kept
// (evicted, or the shell reloaded since; Fable 2026-10-06).
function takeShown(shown, order, key) {
  if (!shown[key]) return null
  var a = shown[key]
  delete shown[key]
  return { a: a, order: order.filter(function(x) { return x !== key }) }
}

// Whether a key's row may run, and as what. `o` is
//   { key, a (keySnapshot's or a shown row), confirmed, agent, proposed,
//     homeCurrent(run, key, token), appAction }
// and the answer { refusal } said back to bin/nodi, or { s, argv, remember }.
function runPlan(o) {
  var k = o.key
  var s = o.a ? o.a.s : null
  var remember = o.a ? o.a.remember : false
  // An agent's run at once takes only a row no word of its own reaches
  // (AskTools.refusedAtOnce); any other it proposes.
  var refused = o.agent === true && !o.proposed && s ? AskTools.refusedAtOnce(k, s.provider) : ""
  if (refused) return { refusal: refused }
  if (s && s.provider === "home" && !o.homeCurrent(s.run, k, s.homeExecution))
    return { refusal: "watched row is no longer current" }
  // Watched by its title unless the Undoer runs it and says so itself,
  // as Nodi's execute() has it: the Undoer takes an argv, and a watched
  // run is a command and its environment since its title left the
  // arguments (2026-10-09).
  var argv = s ? Run.command(s.run, o.appAction, s.undoable && s.run.kind === "exec" ? "" : String(s.title || "")) : null
  if (!argv) return { refusal: "unknown row" }
  // A row that asks before it runs is run from the bar only: `nodi run`
  // names any remembered row, where a hotkey or a link is never given one.
  if (s.confirmWord) return { refusal: "it asks for a typed word; open it in the bar" }
  if (s.confirm && o.confirmed !== true) return { refusal: "it asks before it runs; open it in the bar" }
  return { s: s, argv: argv, remember: remember }
}
