.pragma library
.import "Run.js" as Run

// Action and display-field normalization shared by every external JSON row.
// Providers may narrow the accepted action kinds; Run remains the authority
// for whether the resulting action is safe to execute.

var MAX = { title: 200, subtitle: 300, badge: 24, markdown: 65536, id: 200, risk: 500, group: 100 }

function text(v, max) { return typeof v === "string" ? v.slice(0, max) : "" }

function actionOf(a, options) {
  if (!a || typeof a !== "object" || Array.isArray(a)) return {}
  var o = options || {}
  var run = null
  var copy = ""
  if (Array.isArray(a.exec) && o.exec !== false) run = Run.exec(a.exec)
  else if (typeof a.open === "string") {
    if (!o.safeOpen || /^(?:https?|mailto):/i.test(a.open) || a.open.charAt(0) === "/") run = Run.open(a.open)
  } else if (typeof a.copy === "string" && a.copy) {
    run = Run.copy(a.copy)
    copy = a.copy
  } else if (typeof a.paste === "string" && a.paste && o.paste !== false) {
    run = Run.paste(a.paste)
    copy = a.paste
  } else if (typeof a.query === "string") {
    return { complete: typeof o.completeMax === "number" ? a.query.slice(0, o.completeMax) : a.query }
  }
  else if (typeof a.next === "string" && o.next !== false) return { next: a.next.slice(0, 4096) }
  if (!run || !Run.valid(run)) return {}
  return { run: run, copy: copy }
}

function iconOf(v) {
  var s = typeof v === "string" ? v : ""
  return s.charAt(0) === "/" || /^[A-Za-z0-9][A-Za-z0-9._+-]*$/.test(s) ? s.slice(0, 200) : ""
}

function confirmOf(c) {
  if (c === true) return { confirm: true, confirmWord: "" }
  if (typeof c === "string" && c) return { confirm: true, confirmWord: /^\S{1,40}$/.test(c) ? c : "" }
  return { confirm: false, confirmWord: "" }
}

function previewOf(p) {
  if (typeof p === "string") return p ? { markdown: p.slice(0, MAX.markdown) } : null
  if (!p || typeof p !== "object" || Array.isArray(p)) return null
  var out = { title: text(p.title, MAX.title), subtitle: text(p.subtitle, MAX.subtitle) }
  if (typeof p.markdown === "string") out.markdown = p.markdown.slice(0, MAX.markdown)
  return out.title || out.subtitle || out.markdown ? out : null
}

function rowOf(o, f, index, options) {
  if (!o || typeof o !== "object" || Array.isArray(o) || typeof o.title !== "string" || !o.title) return null
  var opts = options || {}
  var act = actionOf(o.action, opts.actions)
  var id = text(o.id, MAX.id)
  var confirmed = confirmOf(o.confirm)
  var row = {
    key: "filter:" + f.keyword + ":" + (id ? "id:" + id : "#" + index + ":" + o.title),
    title: text(o.title, MAX.title),
    subtitle: text(o.subtitle, MAX.subtitle),
    icon: text(o.icon, 8) || f.icon || "",
    image: typeof o.image === "string" && o.image.charAt(0) === "/" ? o.image.slice(0, 4096) : "",
    badge: text(o.badge, MAX.badge),
    score: 97 - index * 0.01,
    copy: act.copy || "",
    run: act.run || null,
    complete: typeof o.complete === "string" && o.complete ? o.complete.slice(0, MAX.title) : (act.complete || ""),
    match: text(o.match, MAX.subtitle),
    liveMs: f.rerunMs || 0,
    confirm: confirmed.confirm,
    confirmWord: confirmed.confirmWord,
    risk: text(o.risk, MAX.risk),
    showsCommand: true,
    undoable: o.undoable === true,
    remember: !!id,
    preview: previewOf(o.preview),
    group: f.title || f.keyword,
    next: act.next !== undefined && opts.nextOf ? opts.nextOf(f, act.next, o.info, 1) : null,
    actions: Array.isArray(o.actions) ? o.actions.slice(0, 12).map(function(a) {
      var x = actionOf(a && a.action, opts.actions)
      var c = confirmOf(a && a.confirm)
      return x.run ? { label: text(a.title, MAX.title), icon: "", run: x.run, confirm: c.confirm, confirmWord: c.confirmWord,
                       risk: text(a && a.risk, MAX.risk), undoable: !!a && a.undoable === true } : null
    }).filter(function(a) { return a && a.label }) : []
  }
  return row
}

function objects(rows, f, options) {
  var opts = options || {}
  var limit = Math.max(1, Math.min(1000, Number(opts.limit) || 50))
  var out = []
  for (var i = 0; i < (rows || []).length && out.length < limit; i++) {
    var row = rowOf(rows[i], f, out.length, opts)
    if (row) out.push(row)
  }
  return out
}

// JSONL from an external command. Parsing and row normalization live here
// so command and local-socket transports apply the same data boundaries.
function parseLines(textOut, f, options) {
  var opts = options || {}
  var lines = String(textOut || "").split("\n")
  var raw = []
  var data = ""
  var limit = Math.max(1, Math.min(1000, Number(opts.limit) || 50))
  for (var i = 0; i < lines.length && raw.length < limit; i++) {
    if (lines[i].length > 131072) continue
    var line = lines[i].trim()
    if (!line) continue
    var o
    try { o = JSON.parse(line) } catch (e) { continue }
    if (o && typeof o === "object" && !Array.isArray(o) && typeof o.data === "string" && o.title === undefined) {
      data = o.data.slice(0, 4096)
      continue
    }
    if (o && typeof o === "object" && !Array.isArray(o) && typeof o.title === "string" && o.title) raw.push(o)
  }
  var rows = objects(raw, f, { limit: limit, actions: opts.actions, nextOf: opts.nextOf })
  for (var r = 0; r < rows.length; r++) if (rows[r].next) rows[r].next.data = data
  return { rows: rows, data: data }
}
