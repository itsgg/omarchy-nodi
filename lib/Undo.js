.pragma library
.import "Run.js" as Run
.import "Rows.js" as Rows
.import "Score.js" as Score

// Undo: an action that says how to take it back. A row or a Ctrl+K action
// marked `undoable` (lib/Rows.js) is run by Nodi, which reads what it
// prints (components/Undoer.qml); when its last line of JSON is
//
//   {"undo": {"exec": ["argv", ...], "title": "Unsend the report"}}
//
// Nodi offers that command as a row for ten minutes: first on the empty
// bar, and found by its title or by "undo". The title is optional ("Undo "
// and the action's title without it). Enter twice runs it, once; an undo
// is not itself undone.

var KEEP_MS = 10 * 60 * 1000
var ICON = "󰕌"

// The undo an action's output names, or null: { title, run }.
function parse(text, actionTitle) {
  var lines = String(text || "").split("\n")
  for (var i = lines.length - 1; i >= 0; i--) {
    var line = lines[i].trim()
    if (!line) continue
    if (line.charAt(0) !== "{") return null
    var o
    try { o = JSON.parse(line) } catch (e) { return null }
    var u = o && typeof o === "object" ? o.undo : null
    if (!u || typeof u !== "object" || !Array.isArray(u.exec)) return null
    var run = Run.exec(u.exec)
    if (!Run.valid(run)) return null
    var title = typeof u.title === "string" && u.title.trim() ? u.title.trim().slice(0, 200) : "Undo " + String(actionTitle || "the last action").slice(0, 190)
    return { title: title, run: run }
  }
  return null
}

// The entries still offered at `nowMs`.
function live(entries, nowMs, keepMs) {
  var keep = keepMs || KEEP_MS
  return (entries || []).filter(function(e) { return e && nowMs - e.at < keep && nowMs >= e.at - 1000 })
}

function ago(ms) {
  var m = Math.floor(ms / 60000)
  return m < 1 ? "Just now" : m === 1 ? "A minute ago" : m + " minutes ago"
}

// The rows for the entries, as a provider returns them: all of them for
// the empty bar (query ""), else those the query names, by their title or
// by "undo". Newest first.
function raw(entries, query, nowMs) {
  var list = live(entries, nowMs).slice().reverse()
  var q = String(query || "").trim()
  var out = []
  for (var i = 0; i < list.length; i++) {
    var e = list[i]
    var tier = q ? Score.tier(q, { name: e.title, keywords: ["undo", "revert", "take back"] }) : ""
    if (q && !tier) continue
    out.push({
      key: e.key, title: e.title, subtitle: ago(nowMs - e.at) + ", Enter twice undoes it", icon: ICON,
      tier: tier, kind: "action", score: q ? undefined : 300 - i, copy: "", run: e.run, confirm: true, nodi: "undo",
      actionLabel: "Undo", remember: false, group: "Undo"
    })
  }
  return out
}

var PROVIDER = { id: "undo", name: "Undo", icon: ICON }

// The same, made rows, for the empty bar (lib/Engine.js home).
function rows(entries, nowMs) {
  return raw(entries, "", nowMs).map(function(r, i) { return Rows.normalize(r, PROVIDER, 0, i) })
}
