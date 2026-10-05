.pragma library
.import "../lib/Run.js" as Run

// Script filters: a program of yours turns what is typed after a keyword
// into rows, as Alfred's script filters and Walker's menus do. Set in
// nodi.json:
//
//   "filters": [
//     { "keyword": "n", "title": "Notes", "icon": "󰎞", "command": ["my-notes", "--nodi"] }
//   ]
//
// Typing "n meet" runs `my-notes --nodi meet`: the words after the keyword,
// trimmed, are the last argument, and NODI_QUERY too; the window you came
// from is NODI_WINDOW_ADDRESS, _CLASS, _TITLE, _PID and _WORKSPACE. It runs again as you
// type, a new keystroke ending the run before it (components/Reader.qml
// sends TERM to the program and what it started every 50 ms until it ends),
// with the session's PATH, a 3 s deadline (`timeoutMs` up to 10 s) and 1 MB
// of output. It prints one JSON object a line, each a row:
//
//   { "title": "Meeting notes",            the one field it must have
//     "subtitle": "Monday", "icon": "󰎞", "image": "/an/absolute/path.png",
//     "badge": "3", "id": "notes/meeting",  an id lets Nodi remember the row
//     "action": { "exec": ["argv", ...] }   or { "open": "https://..." },
//               { "copy": "text" }, { "paste": "text" }, { "query": "n meeting " }
//     "confirm": true,                      Enter twice
//     "preview": "## Markdown"              or { "title", "subtitle", "markdown" }
//     "actions": [{ "title": "Copy link", "action": { "copy": "..." } }] }   Ctrl+K
//
// A line that is not a JSON object with a title is skipped. While a run is
// on its way, the rows of the one before stay on show.

var LIMIT = 50
var MAX = { title: 200, subtitle: 300, badge: 24, markdown: 65536, id: 200 }

function text(v, max) { return typeof v === "string" ? v.slice(0, max) : "" }

// The filters set in nodi.json that can run: a keyword without a space,
// and a command of strings.
function list(settings) {
  if (!Array.isArray(settings)) return []
  return settings.filter(function(f) {
    // The program is the first word as it is: env(1) would read one with
    // "=" as a variable and one starting with "-" as an option of its own.
    return f && typeof f.keyword === "string" && /^\S+$/.test(f.keyword) && Array.isArray(f.command) && f.command.length > 0
      && f.command.every(function(a) { return typeof a === "string" }) && f.command[0] !== ""
      && f.command[0].indexOf("=") === -1 && f.command[0].charAt(0) !== "-"
  })
}

// The window you came from (ctx.window, lib/Sources.js windowContext) as
// the program's environment, each "" where it is not known.
function windowEnv(w) {
  w = w || {}
  return ["NODI_WINDOW_ADDRESS=" + String(w.address || ""), "NODI_WINDOW_CLASS=" + String(w["class"] || ""),
          "NODI_WINDOW_TITLE=" + String(w.title || ""), "NODI_WINDOW_PID=" + String(w.pid || ""),
          "NODI_WINDOW_WORKSPACE=" + String(w.workspace || "")]
}

function escapeRegExp(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&") }

function filterFor(query, settings) {
  var m = String(query).match(/^\s*(\S+)(?:\s+([\s\S]*))?$/)
  if (!m) return null
  var all = list(settings)
  for (var i = 0; i < all.length; i++) {
    if (all[i].keyword.toLowerCase() === m[1].toLowerCase() && m[2] !== undefined) return { filter: all[i], query: String(m[2]).trim() }
  }
  return null
}

// What Enter does, from the line's "action", through lib/Run.js like every
// other row's; anything else is no action.
function actionOf(a) {
  if (!a || typeof a !== "object") return {}
  if (Array.isArray(a.exec)) return { run: Run.exec(a.exec) }
  if (typeof a.open === "string") return { run: Run.open(a.open) }
  if (typeof a.copy === "string" && a.copy) return { run: Run.copy(a.copy), copy: a.copy }
  if (typeof a.paste === "string" && a.paste) return { run: Run.exec(["omarchy-menu-emoji-insert", a.paste]), copy: a.paste }
  if (typeof a.query === "string") return { complete: a.query }
  return {}
}

function previewOf(p) {
  if (typeof p === "string") return p ? { markdown: p.slice(0, MAX.markdown) } : null
  if (!p || typeof p !== "object") return null
  var out = { title: text(p.title, MAX.title), subtitle: text(p.subtitle, MAX.subtitle) }
  if (typeof p.markdown === "string") out.markdown = p.markdown.slice(0, MAX.markdown)
  return out.title || out.subtitle || out.markdown ? out : null
}

// The program's output as rows for the filter `f`; null when nothing in it
// could be read, which is an error, not an empty answer.
function parse(textOut, f) {
  var lines = String(textOut || "").split("\n")
  var rows = []
  var read = 0
  for (var i = 0; i < lines.length && rows.length < LIMIT; i++) {
    var line = lines[i].trim()
    if (!line) continue
    var o
    try { o = JSON.parse(line) } catch (e) { continue }
    if (!o || typeof o !== "object" || Array.isArray(o) || typeof o.title !== "string" || !o.title) continue
    read++
    var act = actionOf(o.action)
    var id = text(o.id, MAX.id)
    var row = {
      // An id names the row; without one, its place keeps two rows of the
      // same title apart (the ranking and a second Enter go by key).
      key: "filter:" + f.keyword + ":" + (id ? "id:" + id : "#" + rows.length + ":" + o.title),
      title: text(o.title, MAX.title),
      subtitle: text(o.subtitle, MAX.subtitle),
      icon: text(o.icon, 8) || f.icon || "",
      image: typeof o.image === "string" && o.image.charAt(0) === "/" ? o.image : "",
      badge: text(o.badge, MAX.badge),
      score: 97 - rows.length * 0.01,
      copy: act.copy || "",
      run: act.run || null,
      complete: act.complete || "",
      confirm: o.confirm === true,
      remember: !!id,
      preview: previewOf(o.preview),
      group: f.title || f.keyword,
      actions: Array.isArray(o.actions) ? o.actions.slice(0, 12).map(function(a) {
        var x = actionOf(a && a.action)
        return x.run ? { label: text(a.title, MAX.title), icon: "", run: x.run, confirm: a.confirm === true } : null
      }).filter(function(a) { return a && a.label }) : []
    }
    rows.push(row)
  }
  return rows
}

// The rows each filter last showed, kept while a newer run is on its way so
// the list does not blink empty at every keystroke.
var shown = Object.create(null)

var provider = {
  id: "filters",
  name: "Filters",
  icon: "󰈲",
  sources: {
    filter: {
      // The param carries the command, the query and the deadline, so one
      // source serves every filter and a run is keyed by what it ran.
      // Its own deadline inside the reader's, so each filter keeps its own.
      argv: function(param) {
        var p = JSON.parse(param)
        // Its KILL after half a second: the reader's own timeout kills this
        // one at a second, and one that ignored TERM then lived on (Fable
        // 2026-10-04).
        return ["/usr/bin/timeout", "-k", "0.5", String(p.timeoutMs / 1000), "/usr/bin/env", "NODI_QUERY=" + p.query]
          .concat(windowEnv(p.window), p.command, [p.query])
      },
      parse: function(textOut, ok, param) {
        var p = JSON.parse(param)
        if (!ok) throw "it exited with an error or ran past " + p.timeoutMs / 1000 + " s"
        return parse(textOut, { keyword: p.keyword, title: p.title, icon: p.icon })
      },
      // The same query's rows stand for 3 s: its arrival recomputes the bar,
      // which asks again, and a shorter life read it again for ever.
      maxAgeMs: 3000,
      retryMs: 5000,
      timeoutMs: 10000,
      maxBytes: 1048576,
      supersede: true,
      sessionPath: true
    }
  },
  modes: function(settings) {
    return list(settings).map(function(f) {
      return { pattern: new RegExp("^\\s*" + escapeRegExp(f.keyword) + "\\s", "i"), label: f.title || f.keyword,
               icon: f.icon || "󰈲", exclusive: true, hint: f.keyword + " <" + (f.placeholder || "words") + ">" }
    })
  },
  commands: function(ctx) {
    return list(ctx.settings).map(function(f) {
      return { title: f.title || f.keyword, keywords: "filter " + f.keyword, text: "Type " + f.keyword + " and a space", complete: f.keyword + " ", icon: f.icon || "" }
    })
  },
  help: [
    { id: "filters", title: "Script filters", icon: "󰈲", about: "Programs of yours that turn what you type after a keyword into rows, set in nodi.json",
      examples: [{ q: "?filters", note: "Each one's keyword is in nodi.json under filters" }] }
  ],
  match: function(query, ctx) {
    var hit = filterFor(query, ctx.settings)
    if (!hit) return []
    var f = hit.filter
    var title = f.title || f.keyword
    var timeoutMs = Math.min(10000, Math.max(500, Number(f.timeoutMs) || 3000))
    // The window is in the key too: what a program says of one window is not
    // its answer for another.
    var param = JSON.stringify({ keyword: f.keyword, title: title, icon: f.icon || "", command: f.command, query: hit.query, timeoutMs: timeoutMs,
                                 window: ctx.window || null })
    var got = ctx.request ? ctx.request("filter", param) : { state: "pending" }
    if (got.state === "ready") {
      shown[f.keyword] = got.value
      return got.value.length ? got.value : [{ title: "Nothing from " + title, subtitle: hit.query ? "for " + hit.query : title, score: 40, copy: "", remember: false }]
    }
    if (got.state === "error") return [{ title: title + " could not answer", subtitle: String(got.error || ""), score: 40, copy: "", remember: false }]
    return shown[f.keyword] || [{ title: "Asking " + title + "...", subtitle: hit.query || title, score: 40, copy: "", remember: false }]
  }
}
