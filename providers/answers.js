.pragma library
.import "../lib/Run.js" as Run
.import "filters.js" as Filters

// Answers that stream: a program of yours is given the question on Enter,
// not at each keystroke, and what it prints shows as Markdown in the pane
// beside the list as it arrives (components/Answer.qml runs it). Set in
// nodi.json:
//
//   "answers": [
//     { "keyword": "a", "title": "Assistant", "icon": "󰚩", "command": ["my-ask", "--markdown"] }
//   ]
//
// "a why is it slow", then Enter, runs `my-ask --markdown "why is it slow"`:
// the question, trimmed, is the last argument and NODI_QUERY, the window
// you came from NODI_WINDOW_* (providers/filters.js), with the session's
// PATH, for two minutes at most (`timeoutMs`, up to ten). Escape while it
// answers stops it, the program and what it started, and so does closing
// the bar. Once it has ended, Enter pastes the answer where you were,
// Ctrl+Enter copies it, and Ask again asks it again. The keyword and the
// command are checked as a script filter's are.

var ICON = "󰚩"
var DEFAULT_MS = 120000
var MAX_MS = 600000

// The run for what is typed, or null when it names no answer or asks
// nothing: { keyword, title, question, timeoutMs, argv, env }, the query
// and the window in the environment as a filter's are (filters.js).
function spec(query, settings, window) {
  var hit = Filters.filterFor(query, settings)
  if (!hit || !hit.query) return null
  var f = hit.filter
  return {
    keyword: f.keyword,
    title: f.title || f.keyword,
    question: hit.query,
    timeoutMs: Math.min(MAX_MS, Math.max(1000, Number(f.timeoutMs) || DEFAULT_MS)),
    argv: f.command.concat([hit.query]),
    env: Filters.merged({ NODI_QUERY: hit.query }, Filters.windowEnv(window))
  }
}

// Whether the answer `a` ({ phase, keyword, question }) is the one the
// query asks, so the pane shows it; a changed question hides it.
function shown(query, settings, a) {
  if (!a || a.phase === "idle") return false
  var hit = Filters.filterFor(query, settings)
  return !!hit && hit.filter.keyword === a.keyword && hit.query === a.question
}

var provider = {
  id: "answers",
  name: "Answers",
  icon: ICON,
  modes: function(settings) {
    return Filters.list(settings).map(function(f) {
      return { pattern: new RegExp("^\\s*" + Filters.escapeRegExp(f.keyword) + "\\s", "i"), label: f.title || f.keyword,
               icon: f.icon || ICON, exclusive: true, hint: f.keyword + " <" + (f.placeholder || "question") + ">" }
    })
  },
  commands: function(ctx) {
    return Filters.list(ctx.settings).map(function(f) {
      return { title: f.title || f.keyword, keywords: "answer ask " + f.keyword, text: "Type " + f.keyword + " and a question", complete: f.keyword + " ", icon: f.icon || ICON }
    })
  },
  help: [
    { id: "answers", title: "Answers", icon: ICON, about: "Programs of yours that answer a question on Enter, streamed into the pane, set in nodi.json",
      examples: [{ q: "?answers", note: "Each one's keyword is in nodi.json under answers" }] }
  ],
  match: function(query, ctx) {
    var hit = Filters.filterFor(query, ctx.settings)
    if (!hit) return []
    var f = hit.filter
    var title = f.title || f.keyword
    var icon = f.icon || ICON
    var q = hit.query
    var key = "answer:" + f.keyword + ":"
    if (!q) return [{ key: key + "empty", title: title, subtitle: "A question, then Enter", icon: icon, score: 40, copy: "", remember: false,
                      hint: f.keyword + " <" + (f.placeholder || "question") + ">" }]
    var a = ctx.answer || { phase: "idle" }
    if (!(a.keyword === f.keyword && a.question === q && a.phase !== "idle"))
      return [{ key: key + "ask", title: title + ": " + q, subtitle: "Enter asks", icon: icon, score: 98, copy: q, nodi: "answer", actionLabel: "Ask", remember: false }]
    if (a.phase === "waiting" || a.phase === "streaming")
      return [{ key: key + "wait", title: a.phase === "waiting" ? "Asking " + title + "..." : "Answering...", subtitle: "Esc stops it",
                icon: icon, score: 98, copy: "", remember: false }]
    if (a.phase === "error")
      return [{ key: key + "error", title: "Could not answer: " + (a.error || "it failed"), subtitle: q, icon: icon, score: 98,
                copy: a.text || "", nodi: "answer", actionLabel: "Ask again", remember: false }]
    // Done, or stopped with what it had said.
    var text = String(a.text || "")
    var said = a.phase === "stopped" ? "Stopped, " : ""
    var rows = []
    if (text) {
      rows.push({ key: key + "paste", title: "Paste the answer", subtitle: said + text.length + " characters", icon: "󰆒", score: 98, copy: text,
                  remember: false, run: Run.paste(text), actionLabel: "Paste" })
      rows.push({ key: key + "copy", title: "Copy the answer", subtitle: "Clipboard", icon: "󰆏", score: 97, copy: text, remember: false, run: Run.copy(text) })
    }
    rows.push({ key: key + "again", title: text ? "Ask again" : (a.phase === "stopped" ? "Stopped before it said anything; ask again" : "No answer; ask again"),
                subtitle: q, icon: icon, score: 95, copy: q, nodi: "answer", actionLabel: "Ask", remember: false })
    return rows
  }
}
