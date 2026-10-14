.pragma library

// The conversations of streamed answers (components/Answer.qml), kept so a
// keyword's recent ones can be reopened, as Raycast keeps recent Quick AI
// chats (his ask, 2026-10-12): the last MAX, newest last, in
// ~/.local/state/nodi/conversations.json, a folder his alone. Each is
// { id, keyword, title, turns: [{ question, text }], at, moved }. The
// effective request is deliberately not kept: it may contain selected text
// or a prior Ask transcript. `moved`,
// carried on in a terminal (Continue in terminal), where its later turns
// are, so Nodi reopens it there and never shows it without them.

var MAX = 50
// A turn's text past this is cut: the file is read at every start.
var TEXT_MAX = 65536

var ID = /^[A-Za-z0-9_-]{1,200}$/

function clean(c) {
  if (!c || typeof c !== "object" || typeof c.id !== "string" || !ID.test(c.id) || typeof c.keyword !== "string") return null
  var turns = (Array.isArray(c.turns) ? c.turns : [])
    .filter(function(t) { return t && typeof t.question === "string" && typeof t.text === "string" })
    .map(function(t) {
      var question = t.question.slice(0, TEXT_MAX)
      return { question: question, text: t.text.slice(0, TEXT_MAX) }
    })
  if (!turns.length) return null
  return { id: c.id, keyword: c.keyword, title: typeof c.title === "string" ? c.title : c.keyword, turns: turns,
           at: typeof c.at === "number" && isFinite(c.at) ? c.at : 0, moved: c.moved === true }
}

// The list with `c` in it, as its newest: one with its id replaced.
function record(list, c) {
  var e = clean(c)
  if (!e) return list || []
  var out = (list || []).filter(function(x) { return x.id !== e.id })
  out.push(e)
  return out.length > MAX ? out.slice(out.length - MAX) : out
}

// State read from disk followed by answers completed while that read was
// pending. The latter wins by id and is newest, as record() makes it.
function merge(stored, pending) {
  var out = stored || []
  for (var i = 0; i < (pending || []).length; i++) out = record(out, pending[i])
  return out
}

// The list with the conversation `id` marked carried on in a terminal.
function moved(list, id) {
  return (list || []).map(function(x) { return x.id === id ? Object.assign({}, x, { moved: true }) : x })
}

function find(list, id) {
  for (var i = 0; i < (list || []).length; i++) if (list[i].id === id) return list[i]
  return null
}

// A keyword's conversations, newest first, but `except` (the open one).
function recent(list, keyword, except, n) {
  var out = (list || []).filter(function(x) { return x.keyword === keyword && x.id !== except })
  out.sort(function(a, b) { return b.at - a.at })
  return out.slice(0, n === undefined ? 8 : n)
}

function parse(text) {
  var v
  try { v = JSON.parse(text) } catch (e) { return [] }
  if (!Array.isArray(v)) return []
  var out = []
  for (var i = 0; i < v.length; i++) { var e = clean(v[i]); if (e) out.push(e) }
  return out.slice(-MAX)
}

function serialize(list) { return JSON.stringify(list || []) }

// "3 questions, 2 h ago": how a recent conversation is described.
function described(c, now) {
  var n = c.turns.length
  var age = c.at > 0 ? Math.max(0, (now || Date.now()) - c.at) : -1
  var when = age < 0 ? "some time ago" : age < 60000 ? "just now" : age < 3600000 ? Math.round(age / 60000) + " min ago"
    : age < 86400000 ? Math.round(age / 3600000) + " h ago" : Math.round(age / 86400000) + " d ago"
  return (n === 1 ? "1 question" : n + " questions") + ", " + when + (c.moved ? ", in the terminal" : "")
}
