.pragma library
.import "Rows.js" as Rows
.import "Score.js" as Score
.import "../providers/filters.js" as Filters

// `nodi pick` (bin/nodi): rows a program hands the bar on stdin, one a
// line, and the one chosen goes back as its line number, which bin/nodi
// prints as the line it read. As dmenu's lines, or as a script filter's
// rows with --json:
//
//   plain   every line that is not blank is a row, titled by the line
//   json    every line an object with a "title", as a script filter prints
//           one: subtitle, icon, image, badge and preview are shown; an
//           action, confirm or actions are not read, as Enter only chooses
//
// The rows are ranked as any of Nodi's are by what is typed (lib/Score.js
// tiers on the title, then the subtitle), and keep the order given where
// they tie; an empty field shows them all, in order.

var LIMIT = 5000
var MAX = { title: 300, subtitle: 300, badge: 24 }

function text(v, max) { return typeof v === "string" ? v.slice(0, max) : "" }

function parse(input, json) {
  var lines = String(input || "").split("\n")
  var out = []
  for (var i = 0; i < lines.length && out.length < LIMIT; i++) {
    var line = lines[i].replace(/\r$/, "")
    if (!line.trim()) continue
    if (!json) { out.push({ line: i, title: line.slice(0, MAX.title), subtitle: "", icon: "", image: "", badge: "", preview: null }); continue }
    var o
    try { o = JSON.parse(line) } catch (e) { continue }
    if (!o || typeof o !== "object" || Array.isArray(o) || typeof o.title !== "string" || !o.title) continue
    out.push({
      line: i,
      title: text(o.title, MAX.title),
      subtitle: text(o.subtitle, MAX.subtitle),
      icon: text(o.icon, 8),
      image: typeof o.image === "string" && o.image.charAt(0) === "/" ? o.image : "",
      badge: text(o.badge, MAX.badge),
      preview: Filters.previewOf(o.preview)
    })
  }
  return out
}

var PROVIDER = { id: "pick", name: "Pick", icon: "󰄾" }

// The rows for what is typed, best first. A row's key carries its line, so
// Enter can say which was chosen ("pick:<line>").
function rows(query, list) {
  var q = String(query || "").trim()
  var found = []
  for (var i = 0; i < list.length; i++) {
    var r = list[i]
    var t = q ? Score.tier(q, { name: r.title, description: r.subtitle }) : ""
    if (q && !t) continue
    found.push({ r: r, score: t ? Score.TIER[t] : 0, n: i })
  }
  found.sort(function(a, b) { return b.score !== a.score ? b.score - a.score : a.n - b.n })
  var out = []
  for (var j = 0; j < found.length; j++) {
    var p = found[j].r
    var row = Rows.normalize({
      key: "pick:" + p.line, title: p.title, subtitle: p.subtitle, icon: p.icon, image: p.image, badge: p.badge,
      preview: p.preview, score: 0, copy: "", remember: false, nodi: "pick", actionLabel: "Choose", group: ""
    }, PROVIDER, 0, j)
    row.section = ""
    row.hero = false
    out.push(row)
  }
  return out
}

// What bin/nodi asks for, { dir, id, placeholder, json }, or null when it
// is not that: the directory is one it made directly under one of `roots`
// (the runtime directory, or /tmp), named for the id, and holding no "..";
// its FIFO is the only place Nodi then writes to (answerArgv).
function request(argJson, roots) {
  var a = null
  try { a = JSON.parse(String(argJson || "")) } catch (e) {}
  if (!a || typeof a !== "object" || typeof a.id !== "string" || !/^[A-Za-z0-9]{1,32}$/.test(a.id)) return null
  if (typeof a.dir !== "string" || !/^\/[^\x00-\x1f\x7f]*\/nodi-pick\.[A-Za-z0-9]{1,32}$/.test(a.dir)) return null
  if (a.dir.slice(-a.id.length - 1) !== "." + a.id || /(^|\/)\.\.(\/|$)/.test(a.dir)) return null
  var parent = a.dir.slice(0, a.dir.lastIndexOf("/")).replace(/\/+$/, "")
  if (!(roots || []).some(function(r) { return !!r && parent === String(r).replace(/\/+$/, "") })) return null
  return { dir: a.dir, id: a.id, placeholder: typeof a.placeholder === "string" ? a.placeholder.slice(0, 200) : "", json: a.json === true }
}

// The answer, "pick <line>" or "cancel", into the FIFO bin/nodi waits on.
// Only into a FIFO: a path that is anything else (gone, or a file put
// there) is not written, and a reader that has gone does not hold the
// writer past two seconds.
function answerArgv(dir, answer) {
  return ["/usr/bin/timeout", "2", "/usr/bin/bash", "-c", '[ -p "$1" ] && printf "%s\\n" "$2" > "$1"', "nodi-pick", dir + "/answer", String(answer)]
}

// The line a chosen row stands for, or -1.
function lineOf(key) {
  var m = String(key || "").match(/^pick:(\d+)$/)
  return m ? Number(m[1]) : -1
}
