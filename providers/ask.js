.pragma library
.import "../lib/Run.js" as Run

// Ask: a quick answer from Claude in the bar (components/Ask.qml holds the
// session; Nodi.qml puts its state in ctx.ask = { phase, question, answer,
// error, model }). `ask how do I ...` then Enter asks; the answer streams
// into the card, then Enter pastes it where you were, Ctrl+Enter copies it,
// and Ctrl+K continues the question in your coding agent. Tab on a query
// nothing completes asks it; a query nothing answers offers Ask.

function modelName(model) {
  var m = String(model || "haiku")
  return m.charAt(0).toUpperCase() + m.slice(1)
}

var provider = {
  id: "ask",
  name: "Ask",
  icon: "󰚩",
  modes: [{ pattern: /^\s*ask\s/i, label: "Ask", icon: "󰚩", exclusive: true, hint: "ask <question>" }],
  commands: [
    { title: "Ask Claude", keywords: "ask ai claude question chat llm answer", text: "A quick answer, streamed into the bar", complete: "ask " }
  ],
  help: [
    { id: "ask", title: "Ask", icon: "󰚩", about: "A quick answer from Claude; Enter pastes it, Ctrl+Enter copies it",
      examples: [{ q: "ask ", note: "Then a question, and Enter" },
                 { q: "list open ports", note: "Tab, where there is nothing to fill in, asks it" }] }
  ],
  match: function(query, ctx) {
    var m = String(query).match(/^\s*ask\s+(.*)$/i)
    if (!m) return []
    var q = m[1].trim()
    var a = ctx.ask || { phase: "idle" }
    var name = modelName(a.model)
    if (!q) return [{ title: "Ask " + name, subtitle: "Question", score: 40, copy: "", remember: false, hint: "ask <question>" }]
    if (a.question !== q || a.phase === "idle") {
      return [{ key: "ask:new", title: "Ask " + name + ": " + q, subtitle: name, icon: "󰚩", score: 98,
                copy: q, nodi: "ask", actionLabel: "Ask", remember: false }]
    }
    // Claude asks to run a row it found (ROADMAP 44): Enter runs it, Escape
    // or the second row refuses, and Claude is told either way.
    if (a.phase === "proposing" && a.proposal) {
      var p = a.proposal
      return [
        { key: "ask:allow", title: "Run " + p.title, subtitle: p.subtitle || "Claude asks to run it", icon: "󰚩", score: 99, copy: "",
          nodi: "askAllow", actionLabel: "Run", remember: false },
        { key: "ask:deny", title: "Refuse", subtitle: "Claude is told no", icon: "󰜺", score: 98, copy: "",
          nodi: "askDeny", actionLabel: "Refuse", remember: false }
      ]
    }
    if (a.phase === "waiting" || a.phase === "streaming") {
      return [{ key: "ask:wait", title: a.phase === "waiting" ? "Asking " + name + "..." : "Answering...", subtitle: q, icon: "󰚩",
                score: 98, copy: a.answer || "", remember: false }]
    }
    if (a.phase === "error") {
      return [{ key: "ask:error", title: "Could not ask: " + a.error, subtitle: q, icon: "󰚩", score: 98,
                copy: "", nodi: "ask", actionLabel: "Ask again", remember: false }]
    }
    var answer = String(a.answer || "")
    return [
      // The answer itself shows in the pane beside the list.
      { key: "ask:paste", title: "Paste the answer", subtitle: answer.length + " characters", icon: "󰆒", score: 98, copy: answer, remember: false,
        run: Run.exec(["omarchy-menu-emoji-insert", answer]), actionLabel: "Paste" },
      { key: "ask:copy", title: "Copy the answer", subtitle: "Clipboard", icon: "󰆏", score: 97, copy: answer, remember: false,
        run: Run.copy(answer) },
      { key: "ask:agent", title: "Continue in your agent", subtitle: q, icon: "󰆍", score: 96, copy: q, remember: false,
        run: Run.exec(["omarchy-agent-prompt", q]) },
      { key: "ask:again", title: "Ask again", subtitle: q, icon: "󰚩", score: 95, copy: q, nodi: "ask", remember: false, actionLabel: "Ask" }
    ]
  }
}
