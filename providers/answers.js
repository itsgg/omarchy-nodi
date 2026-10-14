.pragma library
.import "../lib/Run.js" as Run
.import "../lib/Conversations.js" as Conversations
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
// "a why is it slow", then Enter, runs `my-ask --markdown` with NODI_QUERY
// "why is it slow": the question, trimmed, in its environment, never its
// arguments (the marketplace's review, 2026-10-10), the last argument too
// only with "argument": true; the window
// you came from NODI_WINDOW_* (providers/filters.js), with the session's
// PATH, for two minutes at most (`timeoutMs`, up to ten). Escape while it
// answers stops it and what it started; closing the bar leaves it running.
// Once it has ended, Enter pastes the answer where you were,
// Ctrl+Enter copies it, and Ask again asks it again. The keyword and the
// command are checked as a script filter's are.
//
// Answers are a conversation (components/Answer.qml), as Raycast's Quick AI
// keeps one: a question within ten minutes of the last answer (`fresh`,
// "0" for never, "never" for always) follows it, the earlier turns drawn
// above it in the pane, and the program has the conversation's id in
// NODI_CONVERSATION to keep its own history under. "New conversation"
// starts another. With "chat", a command whose "{conversation}" becomes
// the id, "Continue in terminal" carries the conversation on in a terminal:
//
//   { "keyword": "a", "title": "Assistant", "command": [...], "fresh": "10m",
//     "chat": ["my-ask", "--session", "{conversation}"] }

var ICON = "󰚩"
var DEFAULT_MS = 120000
var MAX_MS = 600000
var FRESH_MS = 600000

// How long a conversation follows its last answer: "10m" and the like
// (filters.js duration, a minute to a day), "0" for never, "never" for
// always (-1).
function freshOf(f) {
  var v = String(f.fresh === undefined || f.fresh === null ? "" : f.fresh).trim()
  if (v === "never") return -1
  if (v === "0" || v === "0m" || v === "0s") return 0
  return Filters.duration(v, FRESH_MS, 60000, 24 * 3600000)
}

// The window of the answer with `keyword` as nodi.json sets it now: a
// changed "fresh" counts before the next Enter, not after it
// (2026-10-11). 0 for a keyword no answer has.
function freshFor(settings, keyword) {
  var all = Filters.list(settings)
  for (var i = 0; i < all.length; i++) if (all[i].keyword === keyword) return freshOf(all[i])
  return 0
}

// The "chat" command for a conversation, as an argv: an array of strings,
// its program a word that is no option, "{conversation}" in any argument
// replaced by the id; null without one.
function chatArgv(f, conversation) {
  var c = f && f.chat
  if (!Array.isArray(c) || c.length === 0 || !c.every(function(a) { return typeof a === "string" }) || c[0] === "" || c[0].charAt(0) === "-") return null
  // A chat that never names the conversation would open another one.
  if (!c.some(function(a) { return a.indexOf("{conversation}") !== -1 })) return null
  if (!/^[A-Za-z0-9._-]+$/.test(String(conversation || ""))) return null
  return c.map(function(a) { return a.split("{conversation}").join(String(conversation)) })
}

// In a terminal, as Omarchy opens one (providers/dev.js).
function chatRun(f, conversation) {
  var argv = chatArgv(f, conversation)
  return argv ? Run.terminal(["uwsm-app", "--", "xdg-terminal-exec", "--"].concat(argv)) : null
}

// The run for what is typed, or null when it names no answer or asks
// nothing: { keyword, title, question, timeoutMs, argv, env }, the query
// and the window in the environment as a filter's are (filters.js).
function spec(query, settings, window, message) {
  var hit = Filters.filterFor(query, settings)
  if (!hit || !hit.query) return null
  var f = hit.filter
  var effective = message === undefined ? hit.query : String(message)
  return {
    keyword: f.keyword,
    title: f.title || f.keyword,
    question: hit.query,
    message: effective,
    timeoutMs: Math.min(MAX_MS, Math.max(1000, Number(f.timeoutMs) || DEFAULT_MS)),
    freshMs: freshOf(f),
    argv: f.command.concat(f.argument === true ? [effective] : []),
    env: Filters.merged({ NODI_QUERY: effective }, Filters.windowEnv(window))
  }
}

// The effective request of the answer already on this exact displayed
// question, for Ask again. Undefined for another question or keyword.
function retryMessage(query, settings, a) {
  if (!a || typeof a.message !== "string" || !a.message) return undefined
  var hit = Filters.filterFor(query, settings)
  return hit && hit.filter.keyword === a.keyword && hit.query === a.question ? a.message : undefined
}

// Whether the answer `a` ({ phase, keyword, question, follows }) is the
// one the query asks, so the pane shows it; another question hides it,
// unless it would follow the conversation (`follows`, Answer.qml), whose
// thread then shows while the follow-up is typed.
function shown(query, settings, a) {
  if (!a || a.phase === "idle") return false
  var hit = Filters.filterFor(query, settings)
  if (!hit || hit.filter.keyword !== a.keyword) return false
  return hit.query === a.question || (!!a.follows && !a.running) || (!!a.reopened && !hit.query && !a.running)
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
    var a = ctx.answer || { phase: "idle" }
    // The conversation this keyword has going, if a question now would
    // follow it (Answer.qml follows).
    var going = a.keyword === f.keyword && !!a.follows && a.phase !== "idle"
    var chat = going ? chatRun(f, a.conversation) : null
    var carry = function(score) {
      var out = []
      // Handed on for good (Nodi.qml answerChat): its later turns are the
      // terminal's, so Nodi drops it rather than show it without them.
      if (chat) out.push({ key: key + "chat", title: "Continue in terminal", subtitle: "This conversation, in " + f.chat[0], icon: "󰆍", score: score,
                           copy: "", remember: false, nodi: "answerChat", actionLabel: "Open", data: { id: a.conversation, run: chat } })
      out.push({ key: key + "new", title: "New conversation", subtitle: title + " sets this one aside", icon: icon, score: score - 1, copy: "",
                 nodi: "answerNew", actionLabel: "Start", remember: false })
      return out
    }
    if (!q) {
      var hint = { key: key + "empty", title: title, subtitle: going ? "A follow-up, then Enter" : "A question, then Enter", icon: icon, score: 40, copy: "",
                   remember: false, hint: f.keyword + " <" + (f.placeholder || "question") + ">" }
      var empty = going && !a.running ? [hint].concat(carry(39)) : [hint]
      // Its recent conversations, newest first, to reopen (Raycast's recent
      // Quick AI chats): one carried on in a terminal reopens there.
      var kept = Conversations.recent(ctx.conversations, f.keyword, going || a.reopened ? a.conversation : "", Conversations.MAX)
      var shownKept = 0
      for (var i = 0; i < kept.length && shownKept < 8; i++) {
        var c = kept[i]
        var there = c.moved ? chatRun(f, c.id) : null
        if (c.moved && !there) continue
        empty.push({ key: key + "kept:" + c.id, title: c.turns[0].question, subtitle: Conversations.described(c, (ctx.now ? ctx.now() : new Date()).getTime()),
                     icon: c.moved ? "󰆍" : icon, score: 30 - shownKept, copy: "", remember: false,
                     nodi: c.moved ? "answerChat" : "answerResume", actionLabel: c.moved ? "Open" : "Reopen", data: { id: c.id, run: there } })
        shownKept++
      }
      return empty
    }
    if (!(a.keyword === f.keyword && a.question === q && a.phase !== "idle")) {
      if (a.running && a.keyword === f.keyword)
        return [{ key: key + "busy", title: title + " is still on: " + a.question, subtitle: "Ask when it has answered", icon: icon, score: 98, copy: "", remember: false }]
      var rows = [{ key: key + "ask", title: title + ": " + q, subtitle: going ? "Follows up on: " + a.question : "Enter asks", icon: icon, score: 98, copy: q,
                    nodi: "answer", actionLabel: "Ask", remember: false }]
      if (going) rows.push({ key: key + "fresh", title: "New conversation: " + q, subtitle: title + " starts afresh", icon: icon, score: 97, copy: q,
                             nodi: "answerFresh", actionLabel: "Ask", remember: false })
      return rows
    }
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
    return rows.concat(going ? carry(94) : [])
  }
}
