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
  } else if (typeof a.query === "string") return { complete: a.query.slice(0, o.completeMax || MAX.title) }
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
