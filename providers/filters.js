.pragma library
.import "../lib/Run.js" as Run
.import "../lib/Score.js" as Score
.import "../lib/Match.js" as Match

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
//     "confirm": true,                      Enter twice, or "send": type the
//                                           word, then Enter (lib/Rows.js)
//     "risk": "Sends 3 messages",           shown with the command it runs
//     "undoable": true,                     its last line may name its undo
//                                           (an exec action; lib/Undo.js)
//     "preview": "## Markdown"              or { "title", "subtitle", "markdown" }
//     "actions": [{ "title": "Copy link", "action": { "copy": "..." } }] }   Ctrl+K
//
// A line that is not a JSON object with a title is skipped. While a run is
// on its way, the rows of the one before stay on show. A row may also say
// "complete": what Tab fills in ("n meeting "), apart from its action, as
// Alfred's autocomplete; and "match": more words it is found by, in a list.
//
// A list (ROADMAP 57, Alfred's "Alfred filters results", Elephant's cache):
//
//   { "keyword": "p", "title": "Projects", "command": ["my-projects"],
//     "list": true, "refresh": "10m", "root": true }
//
// runs the program once, with NODI_QUERY empty and no argument, keeps its
// rows for `refresh` (10 minutes unless set; the last ones stay on show
// while it runs again), and finds them as you type, ranked and learned
// from as every row is: under its keyword, and with "root": true in any
// search too, three at most, from the second letter, by a clean match.
// "rerun": "2s" runs a filter that is no list again at that pace while its
// rows show (half a second to a minute), for rows that change as you watch.
//
// Steps (ROADMAP 57, the rofi loop in Nodi's terms): a row whose action is
// { "next": "value" } takes the filter one step on. Enter runs the program
// again, once, with NODI_PICK the value, NODI_INFO the row's "info" (kept
// from view), NODI_DATA what the run before printed as a line { "data":
// "..." }, NODI_STEP how many steps in, and no query or argument; its rows
// are found by what is typed after the keyword, as a list's are, and
// Escape steps back. A step that prints no row has done its work, and the
// bar closes. A step never runs twice by itself: it may do what it says.
//
// "format": "rofi" runs a rofi script as rofi does (rofi-script(5)): first
// with no argument and ROFI_RETV=0, then on Enter with the entry as its
// argument, ROFI_RETV=1 (2 for what was typed, offered as a row unless the
// script says no-custom), ROFI_INFO and ROFI_DATA, each run once. A line
// is an entry, its options after a NUL as key\x1fvalue pairs (icon, meta,
// info, nonselectable, display); a line starting with a NUL sets data,
// message (shown under the field) or no-custom.

var LIMIT = 50
// A list is read once and searched here, so it may hold more.
var LIST_LIMIT = 1000
var MAX = { title: 200, subtitle: 300, badge: 24, markdown: 65536, id: 200, risk: 500 }

function text(v, max) { return typeof v === "string" ? v.slice(0, max) : "" }

// "10m", "30s", "2h", "500ms" in milliseconds, held between `min` and
// `max`; `fallback` for anything else.
function duration(v, fallback, min, max) {
  var m = String(v === undefined || v === null ? "" : v).trim().match(/^(\d+(?:\.\d+)?)\s*(ms|s|m|h)$/)
  if (!m) return fallback
  var ms = Number(m[1]) * { ms: 1, s: 1000, m: 60000, h: 3600000 }[m[2]]
  return Math.min(max, Math.max(min, ms))
}

var REFRESH = 10 * 60000
function refreshOf(f) { return duration(f.refresh, REFRESH, 10000, 24 * 3600000) }
function rerunOf(f) { return duration(f.rerun, 0, 500, 60000) }
function timeoutOf(f) { return Math.min(10000, Math.max(500, Number(f.timeoutMs) || 3000)) }

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
  if (typeof a.next === "string") return { next: a.next.slice(0, 4096) }
  return {}
}

// A theme's icon by name, or an absolute path; anything else is none.
function iconOf(v) {
  var s = typeof v === "string" ? v : ""
  return s.charAt(0) === "/" || /^[A-Za-z0-9][A-Za-z0-9._+-]*$/.test(s) ? s.slice(0, 200) : ""
}

// A step on: what Enter hands the program's next run.
function nextOf(f, pick, info, retv) {
  return { keyword: f.keyword, pick: String(pick), info: text(info, 4096), data: "", retv: retv || 1 }
}

// How a line asks before it runs: { confirm, confirmWord }. true is a
// second Enter; a word is that word, typed (lib/Rows.js checks its shape).
function confirmOf(c) {
  if (c === true) return { confirm: true, confirmWord: "" }
  if (typeof c === "string" && c) return { confirm: true, confirmWord: c }
  return { confirm: false, confirmWord: "" }
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
function parse(textOut, f) { return parseLines(textOut, f).rows }

// Nodi's lines as { rows, data }: data from a line { "data": "..." }, for
// the next step's NODI_DATA.
function parseLines(textOut, f) {
  var lines = String(textOut || "").split("\n")
  var rows = []
  var data = ""
  var read = 0
  var limit = f.list ? LIST_LIMIT : LIMIT
  for (var i = 0; i < lines.length && rows.length < limit; i++) {
    var line = lines[i].trim()
    if (!line) continue
    var o
    try { o = JSON.parse(line) } catch (e) { continue }
    if (o && typeof o === "object" && !Array.isArray(o) && typeof o.data === "string" && o.title === undefined) { data = o.data.slice(0, 4096); continue }
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
      complete: typeof o.complete === "string" && o.complete ? o.complete.slice(0, MAX.title) : (act.complete || ""),
      match: text(o.match, MAX.subtitle),
      // Read again at the filter's pace while it shows ("rerun").
      liveMs: f.rerunMs || 0,
      confirm: confirmOf(o.confirm).confirm,
      confirmWord: confirmOf(o.confirm).confirmWord,
      risk: text(o.risk, MAX.risk),
      // What a program's row runs is shown before it runs, once it asks.
      showsCommand: true,
      undoable: o.undoable === true,
      remember: !!id,
      preview: previewOf(o.preview),
      group: f.title || f.keyword,
      next: act.next !== undefined ? nextOf(f, act.next, o.info, 1) : null,
      actions: Array.isArray(o.actions) ? o.actions.slice(0, 12).map(function(a) {
        var x = actionOf(a && a.action)
        var c = confirmOf(a && a.confirm)
        return x.run ? { label: text(a.title, MAX.title), icon: "", run: x.run, confirm: c.confirm, confirmWord: c.confirmWord, risk: text(a && a.risk, MAX.risk),
                         undoable: !!a && a.undoable === true } : null
      }).filter(function(a) { return a && a.label }) : []
    }
    rows.push(row)
  }
  for (var r = 0; r < rows.length; r++) if (rows[r].next) rows[r].next.data = data
  return { rows: rows, data: data }
}

// A rofi script's output as { rows, data, message, noCustom }.
function parseRofi(textOut, f) {
  var out = { rows: [], data: "", message: "", noCustom: false }
  var lines = String(textOut || "").split("\n")
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i]
    if (!line) continue
    if (line.charAt(0) === "\u0000") {
      var opt = line.slice(1).split("\u001f")
      var value = opt.slice(1).join("\u001f")
      if (opt[0] === "data") out.data = value.slice(0, 4096)
      else if (opt[0] === "message") out.message = value.slice(0, MAX.subtitle)
      else if (opt[0] === "no-custom") out.noCustom = value === "true"
      continue
    }
    if (out.rows.length >= LIST_LIMIT) continue
    var nul = line.indexOf("\u0000")
    var entry = nul === -1 ? line : line.slice(0, nul)
    var opts = Object.create(null)
    if (nul !== -1) {
      var parts = line.slice(nul + 1).split("\u001f")
      for (var p = 0; p + 1 < parts.length; p += 2) opts[parts[p]] = parts[p + 1]
    }
    var title = text(opts.display || entry, MAX.title)
    if (!title.trim()) continue
    out.rows.push({
      key: "filter:" + f.keyword + ":rofi:" + out.rows.length + ":" + entry.slice(0, MAX.id),
      title: title, subtitle: "", icon: f.icon || "", image: iconOf(opts.icon), badge: "",
      score: 97 - out.rows.length * 0.01, copy: "", run: null, match: text(opts.meta, MAX.subtitle),
      remember: false, group: f.title || f.keyword, actions: [],
      next: opts.nonselectable === "true" ? null : nextOf(f, entry, opts.info, 1)
    })
  }
  for (var r = 0; r < out.rows.length; r++) if (out.rows[r].next) out.rows[r].next.data = out.data
  return out
}

// The rows each filter last showed, kept while a newer run is on its way so
// the list does not blink empty at every keystroke.
var shown = Object.create(null)

// A run's argv and its output's rows, for either source. Its KILL after
// half a second: the reader's own timeout kills this one at a second, and
// one that ignored TERM then lived on (Fable 2026-10-04). A list is read
// once for every query: no query, and no window.
function argvOf(param) {
  var p = JSON.parse(param)
  return ["/usr/bin/timeout", "-k", "0.5", String(p.timeoutMs / 1000), "/usr/bin/env", "NODI_QUERY=" + (p.list ? "" : p.query)]
    .concat(windowEnv(p.list ? null : p.window), p.command, p.list ? [] : [p.query])
}

function parseOf(textOut, ok, param) {
  var p = JSON.parse(param)
  if (!ok) throw "it exited with an error or ran past " + p.timeoutMs / 1000 + " s"
  return parse(textOut, { keyword: p.keyword, title: p.title, icon: p.icon, rerunMs: p.rerunMs || 0, list: !!p.list })
}

function sourceOf(f) { return f.list === true ? "filter-list" : "filter" }

// What a run of `f` is keyed by and runs with. The window is in the key
// too: what a program says of one window is not its answer for another. A
// list's run has neither query nor window: one list serves every query.
function paramOf(f, query, ctx) {
  // A list follows its refresh; rerun is for a run on each query.
  var p = { keyword: f.keyword, title: f.title || f.keyword, icon: f.icon || "", command: f.command, timeoutMs: timeoutOf(f) }
  if (f.list === true) { p.list = true; p.refreshMs = refreshOf(f) }
  else { p.query = query; p.window = ctx.window || null; p.rerunMs = rerunOf(f) }
  return JSON.stringify(p)
}

// A list's rows as the score sees them, worked out once for each list read.
var prepared = Object.create(null)

function preparedOf(keyword, rows) {
  var kept = prepared[keyword]
  if (kept && kept.rows === rows) return kept
  kept = { rows: rows,
           fields: rows.map(function(r) { return Score.prepare({ name: r.title, keywords: r.match ? [r.match] : [], description: r.subtitle }) }),
           // With the title's initials, so "wr" still finds Weekly report
           // (Sonnet 2026-10-06).
           hay: rows.map(function(r) {
             var initials = Match.words(r.title).map(function(w) { return w.charAt(0) }).join("")
             return Match.fold(r.title + " " + (r.match || "") + " " + (r.subtitle || "")) + " " + initials
           }) }
  prepared[keyword] = kept
  return kept
}

// The rows of a list that `q` names, the best named first and the
// program's order among equals: [{ row, tier }]. All of them for no words.
// `root`: clean matches only, of rows that hold the query's first two
// letters, so a thousand rows cost a root keystroke about what the menu
// does; a typo, or the letters in order, are for under the keyword
// (measured in Qt: 6 to 13 ms a keystroke for 1,000 rows before).
function named(f, rows, q, root) {
  if (!String(q || "").trim()) return rows.map(function(r) { return { row: r, tier: "" } })
  var kept = preparedOf(f.keyword, rows)
  var lead = root ? Match.fold(q).trim().slice(0, 2) : ""
  var out = []
  for (var i = 0; i < rows.length; i++) {
    if (lead && kept.hay[i].indexOf(lead) === -1) continue
    var t = kept.fields[i] ? Score.tier(q, kept.fields[i]) : ""
    if (t && !(root && Score.loose(t))) out.push({ row: rows[i], tier: t, i: i })
  }
  out.sort(function(a, b) { return Score.ORDER.indexOf(a.tier) - Score.ORDER.indexOf(b.tier) || a.i - b.i })
  return out
}

function withScore(row, score) {
  var c = {}
  for (var k in row) c[k] = row[k]
  c.score = score
  return c
}

function copyOf(row) {
  var c = {}
  for (var k in row) c[k] = row[k]
  return c
}

// A row that steps on: Enter is Nodi's own (Nodi.qml stepInto), with what
// the next run is handed and the row's title to name the step by.
function stepping(row) {
  if (!row.next) return row
  var c = copyOf(row)
  c.next = { keyword: row.next.keyword, pick: row.next.pick, info: row.next.info, data: row.next.data, retv: row.next.retv, label: String(row.title) }
  c.nodi = "filterNext"
  c.actionLabel = "Open"
  c.remember = false
  c.run = null
  return c
}

// The step `f` is at (ctx.filterStep, Nodi.qml), or null for none; a rofi
// script is always at one, its first run (ROFI_RETV=0) once each open:
// keyed by when the bar last closed, which holds while it is open.
function stepOf(f, ctx) {
  var st = ctx.filterStep
  var trail = st && st.keyword === f.keyword && Array.isArray(st.trail) ? st.trail : []
  var last = trail.length ? trail[trail.length - 1] : null
  // The window as it was when the step was taken, so the key never moves
  // under a step while the bar refreshes its windows (Sonnet 2026-10-06).
  if (last) return { pick: last.pick, info: last.info, data: last.data, retv: last.retv, depth: trail.length, at: last.at, window: last.window || null }
  return f.format === "rofi" ? { pick: "", info: "", data: "", retv: 0, depth: 0, at: ctx.session || 0, window: null } : null
}

function stepRows(f, q, step, ctx) {
  var title = f.title || f.keyword
  var param = JSON.stringify({ keyword: f.keyword, title: title, icon: f.icon || "", command: f.command, format: f.format === "rofi" ? "rofi" : "",
                               timeoutMs: timeoutOf(f), step: step })
  var got = ctx.request ? ctx.request("filter-step", param) : { state: "pending" }
  var v = got.value
  if (got.state === "error" && !v) return [{ title: title + " could not answer", subtitle: String(got.error || ""), score: 40, copy: "", remember: false }]
  if (!v) return [{ title: "Asking " + title + "...", subtitle: step.depth ? step.pick : title, score: 40, copy: "", remember: false }]
  // Nothing printed after a pick: the program has done its work.
  if (!v.rows.length && step.depth > 0) return [{ key: "filter:done", title: title + ": done", subtitle: step.pick, score: 40, copy: "", remember: false, nodi: "filterDone" }]
  var rows = named(f, v.rows, q).map(function(n, i) {
    var c = stepping(withScore(n.row, 97 - i * 0.01))
    if (v.message) c.hint = v.message
    return c
  })
  // What was typed, as rofi takes it (ROFI_RETV=2), unless the script says no-custom.
  if (f.format === "rofi" && q && !v.noCustom)
    rows.push(stepping({ key: "filter:" + f.keyword + ":custom", title: "Use \"" + q + "\"", subtitle: title, icon: f.icon || "", score: 40, copy: "",
                         remember: false, next: { keyword: f.keyword, pick: q, info: "", data: v.data, retv: 2 } }))
  return rows.length ? rows : [{ title: "Nothing from " + title, subtitle: q ? "for " + q : title, score: 40, copy: "", remember: false }]
}

// A list with "root": true in any search, from the second letter: three
// rows at most, ranked with every other row by how well the query names
// them (lib/Score.js), as things to open.
var ROOT_MAX = 3

function rootRows(query, ctx) {
  var q = String(query || "").trim()
  if (q.length < 2 || !ctx.request) return []
  var out = []
  var seen = Object.create(null)
  var all = list(ctx.settings)
  for (var i = 0; i < all.length; i++) {
    var f = all[i]
    // A rofi script answers only its own keyword, as rofi runs it.
    if (f.list !== true || f.root !== true || f.format === "rofi") { seen[f.keyword] = true; continue }
    // A keyword is one filter's, the first's, as filterFor finds it.
    if (seen[f.keyword]) continue
    seen[f.keyword] = true
    var got = ctx.request("filter-list", paramOf(f, "", ctx))
    if (!Array.isArray(got.value)) continue
    var hits = named(f, got.value, q, true).slice(0, ROOT_MAX)
    for (var h = 0; h < hits.length; h++) {
      var c = withScore(hits[h].row, undefined)
      delete c.score
      c.tier = hits[h].tier
      c.kind = "item"
      out.push(stepping(c))
    }
  }
  return out
}

var provider = {
  id: "filters",
  name: "Filters",
  icon: "󰈲",
  sources: {
    filter: {
      // The param carries the command, the query and the deadline, so one
      // source serves every filter and a run is keyed by what it ran.
      // Its own deadline inside the reader's, so each filter keeps its own.
      argv: argvOf,
      parse: parseOf,
      // The same query's rows stand for 3 s: its arrival recomputes the bar,
      // which asks again, and a shorter life read it again for ever. Rows
      // that rerun, a little under their pace, so each of the bar's ticks
      // finds them due (Nodi.qml liveTimer).
      maxAgeMs: function(param) {
        var p = JSON.parse(param)
        return p.rerunMs ? Math.round(p.rerunMs * 0.8) : 3000
      },
      retryMs: 5000,
      timeoutMs: 10000,
      maxBytes: 1048576,
      supersede: true,
      sessionPath: true
    },
    // A list's read, on a reader of its own and never ended by another
    // read: on the one filter reader, two root lists ended each other's
    // run at every keystroke, and a slow one never landed (Sonnet
    // 2026-10-06). A list stands for its refresh.
    "filter-list": {
      argv: argvOf,
      parse: parseOf,
      maxAgeMs: function(param) { return JSON.parse(param).refreshMs },
      // Kept in the cache for its refresh, however many reads come after
      // (lib/Requests.js prune).
      keep: true,
      retryMs: 60000,
      timeoutMs: 10000,
      maxBytes: 4194304,
      concurrent: true,
      sessionPath: true
    },
    // A step's run (Steps above): once. It is never read again, not even
    // after a failure, while the bar is open, and is forgotten when it
    // closes (Nodi.qml close); taken again, a step is another (its `at`).
    // Each on its own reader and never ended by another, for a step may
    // be doing what it says.
    "filter-step": {
      argv: function(param) {
        var p = JSON.parse(param)
        var s = p.step
        var env = ["NODI_QUERY=", "NODI_PICK=" + s.pick, "NODI_INFO=" + s.info, "NODI_DATA=" + s.data, "NODI_STEP=" + s.depth]
        if (p.format === "rofi") env = env.concat(["ROFI_RETV=" + s.retv, "ROFI_INFO=" + s.info, "ROFI_DATA=" + s.data])
        return ["/usr/bin/timeout", "-k", "0.5", String(p.timeoutMs / 1000), "/usr/bin/env"].concat(env, windowEnv(s.window), p.command,
          p.format === "rofi" && s.depth > 0 ? [s.pick] : [])
      },
      parse: function(textOut, ok, param) {
        var p = JSON.parse(param)
        if (!ok) throw "it exited with an error or ran past " + p.timeoutMs / 1000 + " s"
        var f = { keyword: p.keyword, title: p.title, icon: p.icon, list: true }
        return p.format === "rofi" ? parseRofi(textOut, f) : parseLines(textOut, f)
      },
      maxAgeMs: Number.MAX_VALUE,
      retryMs: Number.MAX_VALUE,
      keep: true,
      timeoutMs: 10000,
      maxBytes: 4194304,
      concurrent: true,
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
    if (!hit) return rootRows(query, ctx)
    var f = hit.filter
    var step = stepOf(f, ctx)
    if (step) return stepRows(f, hit.query, step, ctx)
    var title = f.title || f.keyword
    var got = ctx.request ? ctx.request(sourceOf(f), paramOf(f, hit.query, ctx)) : { state: "pending" }
    // A read that failed keeps the rows it had, which stay on show
    // (lib/Requests.js settled; Sonnet 2026-10-06).
    if (got.state === "ready" || (got.state === "error" && Array.isArray(got.value))) {
      var rows = f.list === true ? named(f, got.value, hit.query).map(function(n, i) { return stepping(withScore(n.row, 97 - i * 0.01)) })
        : got.value.map(stepping)
      if (f.list !== true) shown[f.keyword] = got.value
      return rows.length ? rows : [{ title: "Nothing from " + title, subtitle: hit.query ? "for " + hit.query : title, score: 40, copy: "", remember: false }]
    }
    if (got.state === "error") return [{ title: title + " could not answer", subtitle: String(got.error || ""), score: 40, copy: "", remember: false }]
    return (f.list !== true && shown[f.keyword]) || [{ title: "Asking " + title + "...", subtitle: hit.query || title, score: 40, copy: "", remember: false }]
  }
}
