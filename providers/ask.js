.pragma library
.import "../lib/Run.js" as Run
.import "selection.js" as Selection

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

var provider = {
  id: "ask",
  name: "Ask",
  icon: "󰚩",
  modes: [{ pattern: /^\s*ask\s/i, label: "Ask", icon: "󰚩", exclusive: true, hint: "ask <question>" }],
  commands: [
    { title: "Ask your agent", keywords: "ask ai claude gemini codex cursor opencode agent question chat llm answer", text: "A quick answer, streamed into the bar", complete: "ask " }
  ],
  help: [
    { id: "ask", title: "Ask", icon: "󰚩", about: "A quick answer from your coding agent; Enter pastes it, Ctrl+Enter copies it",
      examples: [{ q: "ask ", note: "Then a question, and Enter" },
                 { q: "list open ports", note: "Tab, where there is nothing to fill in, asks it" }] }
  ],
  match: function(query, ctx) {
    var m = String(query).match(/^\s*ask\s+(.*)$/i)
    if (!m) return []
    var q = m[1].trim()
    var a = ctx.ask || { phase: "idle" }
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
      return other ? [denyRow, allowRow] : [allowRow, denyRow]
    }
    if (!q) return [{ title: "Ask " + name, subtitle: a.missing ? a.missing + " is not on your login PATH: install it, or name another agent in nodi.json" : "Question",
                      score: 40, copy: "", remember: false, hint: "ask <question>" }]
    // Nothing would happen on Enter: say why (Fable 2026-10-06).
    if (a.capturing) return [{ key: "ask:shot", title: "Taking a picture of the window...", subtitle: q, icon: "󰹑", score: 98, copy: "", remember: false }]
    var running = a.phase === "waiting" || a.phase === "streaming"
    if (running && a.question !== q)
      return [{ key: "ask:busy", title: who + " is still on: " + a.question, subtitle: "Ask when it has answered", icon: "󰚩", score: 98, copy: "", remember: false }]
    if (a.question !== q || a.phase === "idle") {
      // The first question installs the agent's adapter: say so before
      // the Enter that does it (components/Ask.qml).
      var rows = [{ key: "ask:new", title: "Ask " + who + ": " + q,
                    subtitle: a.missing ? a.missing + " is not on your login PATH: install it, or name another agent in nodi.json"
                            : a.install ? "Enter installs " + a.install + " from npm first, once" : name, icon: "󰚩", score: 98,
                    copy: q, nodi: "ask", actionLabel: "Ask", remember: false }]
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
      return rows
    }
    if (a.phase === "waiting" || a.phase === "streaming") {
      // What it is waiting on (components/Ask.qml status): the start, an
      // adapter installing, a tool at work; then its words.
      var doing = a.phase === "waiting" || a.activity ? (a.status || "Asking " + name) + "..." : "Answering..."
      return [{ key: "ask:wait", title: doing, subtitle: q, icon: "󰚩", score: 98, copy: a.answer || "", remember: false }]
    }
    if (a.phase === "error") {
      return [{ key: "ask:error", title: "Could not ask: " + a.error, subtitle: q, icon: "󰚩", score: 98,
                copy: "", nodi: "ask", actionLabel: "Ask again", remember: false }]
    }
    var answer = String(a.answer || "")
    return [
      // The answer itself shows in the pane beside the list.
      // About the selection, the paste goes over it: the window still holds it (providers/selection.js).
      { key: "ask:paste", title: a.context === "selection" ? "Paste over the selection" : "Paste the answer", subtitle: answer.length + " characters",
        icon: "󰆒", score: 98, copy: answer, remember: false,
        run: Run.paste(answer), actionLabel: "Paste" },
      { key: "ask:copy", title: "Copy the answer", subtitle: "Clipboard", icon: "󰆏", score: 97, copy: answer, remember: false,
        run: Run.copy(answer) },
      { key: "ask:agent", title: "Continue in your agent", subtitle: q, icon: "󰆍", score: 96, copy: q, remember: false,
        run: Run.exec(["omarchy-agent-prompt", q]) },
      { key: "ask:again", title: "Ask again", subtitle: a.context === "window" ? q + ", with the same picture" : q, icon: "󰚩", score: 95, copy: q,
        nodi: "ask", remember: false, actionLabel: "Ask" },
      // A follow-up is a question typed after `ask `; this one forgets.
      { key: "ask:fresh", title: "New question", subtitle: who + " forgets this conversation", icon: "󰚩", score: 94, copy: "",
        nodi: "askNew", remember: false, actionLabel: "Start" }
    ]
  }
}
