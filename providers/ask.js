.pragma library
.import "../lib/Run.js" as Run
.import "../lib/Agents.js" as Agents
.import "selection.js" as Selection
.import "filters.js" as Filters

// Ask: a quick answer from a coding agent in the bar (components/Ask.qml
// holds the session; Nodi.qml puts its state in ctx.ask = { phase,
// question, answer, error, agent, model, status, activity, proposal }).
// `ask how do I ...` then Enter asks; the answer streams
// into the card, then Enter pastes it where you were, Ctrl+Enter copies it,
// and Ctrl+K continues the question in your coding agent. Tab on a query
// nothing completes asks it; a query nothing answers offers Ask. A question
// within ten minutes of the last answer follows it (components/Ask.qml);
// "New question" starts afresh. A question can be about the text selected
// or the window the bar opened over, which goes to the agent as a picture
// (ROADMAP 43).

// The message for a question about the selection: the question, then the
// text, fenced as selection.js fences it.
function aboutText(q, text) {
  return String(q) + "\n\nThe text it is about:\n<text>\n" + String(text) + "\n</text>"
}

// "Claude", "Claude Haiku": the agent, and the model asked of it.
function agentName(a) {
  var m = String((a && a.model) || "")
  return String((a && a.agent) || "Claude") + (m && !/[\/:]/.test(m) ? " " + m.charAt(0).toUpperCase() + m.slice(1) : "")
}

// "Continue in your agent": the question on the clipboard, to paste, and
// Omarchy's agent started with no prompt. Given one, omarchy-agent keeps
// it in the agent's arguments for the session's life, where another local
// user can read it (the marketplace's review of f444138, 2026-10-10). The
// question goes as the copy's text, never an argument, copied as
// lib/Run.js's COPY copies (a test holds them the same); --pick offers the
// choice when no default agent is set, as Omarchy's own key does. A copy
// that failed stops it, said in the toast: an agent opened then had the
// clipboard's older text to paste, unsaid (Fable 2026-10-10).
// The conversation as the agent is given it to carry on: each turn's
// question and answer, the newest last, as Raycast's Quick AI hands its
// whole history on to AI Chat (his ask, 2026-10-11).
//
// It goes as NODI_TEXT, and Linux holds one environment string to 128 KB:
// past TRANSCRIPT_MAX bytes the oldest turns go, then the end of the
// newest answer, so the copy never fails for its size (2026-10-11).
var TRANSCRIPT_MAX = 120000

function utf8Bytes(s) {
  var n = 0
  for (var i = 0; i < s.length; i++) {
    var c = s.charCodeAt(i)
    if (c < 0x80) n += 1
    else if (c < 0x800) n += 2
    else if (c >= 0xd800 && c < 0xdc00) { n += 4; i++ }
    else n += 3
  }
  return n
}

function boundedTranscript(parts) {
  var head = "Our conversation so far:\n\n"
  var omitted = "(Earlier turns left out.)\n\n"
  var room = TRANSCRIPT_MAX - utf8Bytes(head) - utf8Bytes(omitted)
  var kept = []
  for (var i = parts.length - 1; i >= 0; i--) {
    var cost = utf8Bytes(parts[i]) + 2
    if (cost > room) {
      // The newest turn alone too long: what of it fits.
      if (!kept.length) {
        var cut = parts[i]
        while (utf8Bytes(cut) > room - 20 && cut.length) cut = cut.slice(0, Math.floor(cut.length * 0.9))
        kept.unshift(cut + "\n(cut here)")
      }
      break
    }
    room -= cost
    kept.unshift(parts[i])
  }
  return head + (kept.length < parts.length ? omitted : "") + kept.join("\n\n")
}

function transcript(a) {
  var turns = (a && a.turns) || []
  var all = turns.concat([{ question: (a && a.question) || "", answer: (a && a.answer) || "" }])
  return boundedTranscript(all.map(function(t) { return "Q: " + t.question + "\n\nA: " + String(t.answer || "").trim() }))
}

// What a streamed-answer fallback is asked: the exact text context of this
// turn, and earlier Ask turns when it was a follow-up. A screenshot cannot
// cross to an answer command, said rather than pretending it still can.
function fallbackMessage(a) {
  a = a || {}
  var current = a.context === "window"
    ? String(a.question || "") + "\n\nThe window picture from the failed request is not available to this fallback."
    : String(a.message || a.question || "")
  var turns = a.turns || []
  if (!turns.length) return current
  var parts = turns.map(function(t) {
    return "Q: " + (typeof t.message === "string" ? t.message : t.question) + "\n\nA: " + String(t.answer || "").trim()
  })
  parts.push("Q: " + current)
  return boundedTranscript(parts)
}

// A failure that says the agent hit a limit: its plan's, a rate, its
// credit. Claude says "usage limit reached", Codex "out of credits".
var LIMITED = /\blimit\b|quota|rate.?limit|\b429\b|credit|too many requests|overloaded/i

// The answer that "fallback" names (providers/answers.js), when one of
// yours has that keyword: { keyword, title }, else null.
function fallbackOf(ctx) {
  var ask = ctx && ctx.config && ctx.config.ask
  var kw = ask && typeof ask.fallback === "string" ? ask.fallback.trim() : ""
  if (!kw) return null
  var list = Filters.list(ctx.config.answers)
  for (var i = 0; i < list.length; i++) if (list[i].keyword === kw) return { keyword: kw, title: list[i].title || kw }
  return null
}

function agentActions(ctx) {
  var ask = (ctx && ctx.ask) || {}
  var list = Array.isArray(ask.agents) ? ask.agents : Agents.registry(ctx && ctx.config && ctx.config.ask)
  return list.filter(function(a) {
    return a.available !== false && !String(a.missing || "") && !String(a.reason || "")
  }).map(function(a) {
    var model = String(a.model || "")
    var current = a.current === true
    var missing = String(a.missing || "")
    var reason = String(a.reason || "")
    var boundary = a.policy === "strict" ? "Managed"
      : a.policy === "answer-only" ? "No Nodi actions"
      : "Unmanaged tools"
    return { label: "Use " + a.name, icon: "󰚩", nodi: "askAgent", data: { id: a.id },
             detail: [model, boundary, current ? "Current" : ""].filter(function(x) { return x }).join(" | "),
             disabled: !!missing || !!reason, reason: reason || (missing ? missing + " is not on your login PATH" : "") }
  })
}

function fallbackAgentOf(ctx) {
  var config = ctx && ctx.config && ctx.config.ask
  var id = config && typeof config.fallbackAgent === "string"
    ? Agents.canonicalId(config.fallbackAgent.trim()) : ""
  var list = ctx && ctx.ask && Array.isArray(ctx.ask.agents) ? ctx.ask.agents : []
  for (var i = 0; id && i < list.length; i++)
    if (list[i].id === id && list[i].available !== false
        && !list[i].missing && !list[i].reason && !list[i].current) return list[i]
  return null
}

// An available registered agent may be used as a one-shot command:
// `codex review this`, `pi explain this`, or a custom agent's id/name.
// Availability is the same probed state used by the agent palette; an
// unavailable agent does not claim the query.
function directAgent(query, ctx) {
  var m = String(query || "").match(/^\s*(\S+)(?:\s+(.*))?$/)
  if (!m) return null
  var token = m[1].toLowerCase()
  var list = ctx && ctx.ask && Array.isArray(ctx.ask.agents) ? ctx.ask.agents : []
  for (var i = 0; i < list.length; i++) {
    var a = list[i]
    if (!a || a.available === false || a.missing || a.reason) continue
    var name = String(a.name || "").toLowerCase()
    if (token !== String(a.id || "").toLowerCase() && token !== name) continue
    return { id: String(a.id), name: String(a.name || a.id), model: String(a.model || ""),
             question: String(m[2] || "").trim(), prefix: m[1].toLowerCase() }
  }
  return null
}

var CONTINUE = 't=${NODI_TEXT-}; unset NODI_TEXT'
  + "\n" + 'printf "%s" "$t" | wl-copy || exit 1'
  + "\n" + 'exec omarchy-agent --pick'

var provider = {
  id: "ask",
  name: "Ask",
  icon: "󰚩",
  modes: [{ pattern: /^\s*ask\s/i, label: "Ask", icon: "󰚩", exclusive: true, hint: "ask <question>" }],
  commands: [
    { title: "Ask your agent", keywords: "ask ai agent question chat llm answer", text: "A quick answer, streamed into the bar", complete: "ask " }
  ],
  help: [
    { id: "ask", title: "Ask", icon: "󰚩", about: "A quick answer from your coding agent; Enter pastes it, Ctrl+Enter copies it",
      examples: [{ q: "ask ", note: "Then a question, and Enter" },
                 { q: "list open ports", note: "Tab, where there is nothing to fill in, asks it" }] }
  ],
  match: function(query, ctx) {
    var m = String(query).match(/^\s*ask\s+(.*)$/i)
    var direct = directAgent(query, ctx)
    if (!m && !direct) return []
    var q = direct ? direct.question : m[1].trim()
    var a = ctx.ask || { phase: "idle" }
    var actions = agentActions(ctx)
    function decorate(out) {
      for (var i = 0; i < out.length; i++) out[i].actions = (out[i].actions || []).concat(actions)
      return out
    }
    var directLive = direct && String(a.agentId || "") === direct.id
    var who = String(a.agent || "Claude")
    var name = agentName(a)
    // The agent asks to run a row it found (ROADMAP 44), to use a tool, or
    // for him to sign in: Enter allows, Escape or the other row refuses,
    // and the agent is told either way; whatever the field holds, since it
    // waits on him (Fable 2026-10-06). With the field on another question,
    // Refuse leads: an Enter meant for that question says no rather than
    // running a row he may not have read.
    if (a.phase === "proposing" && a.proposal) {
      var p = a.proposal
      var other = a.question !== q
      // A tool is allowed, a row run (ROADMAP 49, 84).
      var verb = p.auth ? "you to sign in" : p.tool ? "to use it" : "to run it"
      var allowRow = { key: "ask:allow", title: p.auth ? p.title : (p.tool ? "Allow " : "Run ") + p.title,
                       subtitle: other ? who + " asks " + verb + " for: " + a.question : (p.subtitle || who + " asks " + verb),
                       icon: "󰚩", score: other ? 98 : 99, copy: "", nodi: "askAllow", actionLabel: p.auth ? "Sign in" : p.tool ? "Allow" : "Run", remember: false }
      var denyRow = { key: "ask:deny", title: p.auth ? "Not now" : "Refuse", subtitle: who + " is told no", icon: "󰜺", score: other ? 99 : 98, copy: "",
                      nodi: "askDeny", actionLabel: "Refuse", remember: false }
      return decorate(other ? [denyRow, allowRow] : [allowRow, denyRow])
    }
    if (direct && !q)
      return [{ key: "ask:direct:" + direct.id, title: "Ask " + direct.name,
                subtitle: direct.model || "Question", icon: "󰚩", score: 40,
                copy: "", complete: direct.prefix + " ", remember: false }]
    // A one-shot prefix cannot bypass the operation already owned by the
    // active session. Preserve its capture and busy rows before offering
    // another agent.
    if (a.capturing) return decorate([{ key: "ask:shot", title: "Taking a picture of the window...", subtitle: q, icon: "󰹑", score: 98, copy: "", remember: false }])
    var running = a.phase === "waiting" || a.phase === "streaming"
    if (running && (a.question !== q || (direct && !directLive)))
      return decorate([{ key: "ask:busy", title: who + " is still on: " + a.question, subtitle: "Ask when it has answered", icon: "󰚩", score: 98, copy: "", remember: false }])
    if (direct && !directLive)
      return decorate([{ key: "ask:direct:" + direct.id, title: "Ask " + direct.name + ": " + q,
                         subtitle: direct.model ? direct.name + " " + direct.model : direct.name,
                         icon: "󰚩", score: 90, copy: q, nodi: "askAs", actionLabel: "Ask",
                         remember: false, data: { id: direct.id, question: q } }])
    if (!q) return decorate([{ title: "Ask " + name, subtitle: a.missing ? a.missing + " is not on your login PATH: install it, or name another agent in nodi.json" : "Question",
                           score: 40, copy: "", remember: false, hint: "ask <question>" }])
    // Nothing would happen on Enter: say why (Fable 2026-10-06).
    if (a.question !== q || a.phase === "idle") {
      // The first question installs the agent's adapter: say so before
      // the Enter that does it (components/Ask.qml).
      var rows = [{ key: direct ? "ask:direct:" + direct.id : "ask:new", title: "Ask " + who + ": " + q,
                    subtitle: a.missing ? a.missing + " is not on your login PATH: install it, or name another agent in nodi.json"
                            : a.install ? "Enter installs " + a.install + " from npm first, once" : name, icon: "󰚩", score: 98,
                    copy: q, nodi: direct ? "askAs" : "ask", actionLabel: "Ask", remember: false,
                    data: direct ? { id: direct.id, question: q } : null }]
      if (direct) return decorate(rows)
      var sel = ctx.selection || {}
      var ab = Selection.about(sel)
      if (sel.text) rows.push({ key: "ask:selection", title: "Ask about " + ab.noun + ": " + q, subtitle: Selection.shown(sel.text), icon: "󰗧",
                                score: 97, copy: q, nodi: "askWith", actionLabel: "Ask", remember: false,
                                ask: { question: q, message: aboutText(q, sel.text), context: ab.context } })
      var w = ctx.window || {}
      if (w.stableId) rows.push({ key: "ask:window", title: "Ask about this window: " + q, subtitle: w.title || w["class"] || "The window you came from",
                                  icon: "󰹑", score: 96, copy: q, nodi: "askWindow", actionLabel: "Ask", remember: false,
                                  ask: { question: q, message: q + "\n\nThe picture is the window the question is about"
                                         + (w.title ? ", titled " + JSON.stringify(String(w.title)) : "") + ".", context: "window" } })
      return decorate(rows)
    }
    if (a.phase === "waiting" || a.phase === "streaming") {
      // What it is waiting on (components/Ask.qml status): the start, an
      // adapter installing, a tool at work; then its words.
      var doing = a.phase === "waiting" || a.activity ? (a.status || "Asking " + name) + "..." : "Answering..."
      return decorate([{ key: "ask:wait", title: doing, subtitle: q, icon: "󰚩", score: 98, copy: a.answer || "", remember: false }])
    }
    if (a.phase === "error") {
      var failed = [{ key: "ask:error", title: "Could not ask: " + a.error, subtitle: q, icon: "󰚩", score: 98,
                      copy: "", nodi: direct ? "askAs" : "ask", actionLabel: "Ask again", remember: false,
                      data: direct ? { id: direct.id, question: q } : null }]
      var agentFallback = fallbackAgentOf(ctx)
      if (agentFallback) failed.push({ key: "ask:agent-fallback", title: "Ask " + agentFallback.name + " instead: " + q,
                                      subtitle: who + " could not answer; prepare it for " + agentFallback.name,
                                      icon: "󰚩", score: 100, copy: q, nodi: "askAgentFallback", actionLabel: "Prepare",
                                      remember: false, data: { id: agentFallback.id, question: q, message: fallbackMessage(a),
                                                               context: a.context === "window" ? "" : String(a.context || ""),
                                                               direct: !!direct } })
      // Another answer of his takes the question (his ask, 2026-10-11:
      // Claude out of its limit, a free model through pi): first when the
      // agent hit a limit, asking again then being no use; after it else.
      var fb = fallbackOf(ctx)
      if (fb && agentFallback) {
        var fallbackNames = [agentFallback.id, agentFallback.name].map(function(x) { return String(x || "").toLowerCase() })
        if (fallbackNames.indexOf(String(fb.keyword || "").toLowerCase()) !== -1
            || fallbackNames.indexOf(String(fb.title || "").toLowerCase()) !== -1) fb = null
      }
      if (fb) failed.push({ key: "ask:fallback", title: "Ask " + fb.title + " instead: " + q,
                            subtitle: LIMITED.test(a.error) ? who + " hit a limit; " + fb.title + " answers" : fb.title + " answers in its place",
                            icon: "󰚩", score: LIMITED.test(a.error) ? 99 : 97, copy: q, nodi: "askFallback", actionLabel: "Ask",
                            remember: false, data: { keyword: fb.keyword, question: q, message: fallbackMessage(a), fresh: true } })
      return decorate(failed)
    }
    var answer = String(a.answer || "")
    return decorate([
      // The answer itself shows in the pane beside the list.
      // About the selection, the paste goes over it: the window still holds it (providers/selection.js).
      { key: "ask:paste", title: a.context === "selection" ? "Paste over the selection" : "Paste the answer", subtitle: answer.length + " characters",
        icon: "󰆒", score: 98, copy: answer, remember: false,
        run: Run.paste(answer), actionLabel: "Paste" },
      { key: "ask:copy", title: "Copy the answer", subtitle: "Clipboard", icon: "󰆏", score: 97, copy: answer, remember: false,
        run: Run.copy(answer) },
      { key: "ask:agent", title: "Continue in your agent", subtitle: "Opens it, the conversation copied to paste", icon: "󰆍", score: 96, copy: transcript(a),
        remember: false, run: Run.shell(CONTINUE, undefined, transcript(a)) },
      { key: "ask:again", title: "Ask again", subtitle: a.context === "window" ? q + ", with the same picture" : q, icon: "󰚩", score: 95, copy: q,
        nodi: direct ? "askAs" : "ask", data: direct ? { id: direct.id, question: q } : null, remember: false, actionLabel: "Ask" },
      // A follow-up is a question typed after `ask `; this one forgets.
      { key: "ask:fresh", title: "New question", subtitle: who + " forgets this conversation", icon: "󰚩", score: 94, copy: "",
        nodi: "askNew", data: direct ? { prefix: direct.prefix } : null, remember: false, actionLabel: "Start" }
    ])
  }
}
