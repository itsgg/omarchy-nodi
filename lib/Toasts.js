.pragma library

// Nodi's own notices (components/Toast.qml): a title and a body in a popup
// of its own, never a notification. Omarchy's notification host puts each
// popup's text in bash arguments (shell/plugins/notifications/Service.qml),
// and notify-send holds it in its own, where another local user can read
// it in /proc: a failed row's title, a clipboard entry's first line, a
// reminder's words (the marketplace's review, 2026-10-10). The list is
// pure: Nodi.qml keeps it and its timer.
//
// A toast is { id, title, body, until }: shown until `until` (ms), three
// at most, the newest last.

var MAX = 3
var SHOW_MS = 6000
var TITLE_MAX = 120
var BODY_MAX = 400
var BODY_LINES = 3

// One line or a few: control characters as spaces, the ends trimmed.
function clean(text, max, lines) {
  var s = String(text === undefined || text === null ? "" : text).replace(/\r\n?/g, "\n")
  s = s.replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, " ")
  var parts = s.split("\n").map(function(l) { return l.replace(/\s+$/, "") }).filter(function(l) { return l.trim() !== "" })
  return parts.slice(0, lines || 1).join(lines > 1 ? "\n" : " ").trim().slice(0, max)
}

// `list` with a toast added; one with no title and no body adds nothing.
function add(list, title, body, nowMs, id) {
  var t = clean(title, TITLE_MAX, 1)
  var b = clean(body, BODY_MAX, BODY_LINES)
  if (!t && !b) return list || []
  return (list || []).concat([{ id: id, title: t || b, body: t ? b : "", until: nowMs + SHOW_MS }]).slice(-MAX)
}

// Those still to show at `nowMs`.
function live(list, nowMs) {
  return (list || []).filter(function(t) { return t.until > nowMs })
}

function dismiss(list, id) {
  return (list || []).filter(function(t) { return t.id !== id })
}

// How long until the first one ends, or -1 for none.
function nextIn(list, nowMs) {
  var l = list || []
  if (!l.length) return -1
  var soonest = l[0].until
  for (var i = 1; i < l.length; i++) if (l[i].until < soonest) soonest = l[i].until
  return Math.max(0, soonest - nowMs)
}

// What a detached script handed over (Run.js TOAST, through Carried.qml):
// { title, body } from its JSON, or null for anything else.
function fromCarried(text) {
  var o
  try { o = JSON.parse(String(text)) } catch (e) { return null }
  if (!o || typeof o !== "object" || typeof o.title !== "string") return null
  return { title: o.title, body: typeof o.body === "string" ? o.body : "" }
}
