.pragma library
.import "Run.js" as Run
.import "Markdown.js" as Markdown

// What the pane beside the list shows (components/PreviewPane.qml), from
// what is on screen. Nodi.qml and the render harness ask the same function,
// so a picture of the bar is the bar.
//
//   s = { paletteOpen,
//         ask:    { question, agent, model, text, busy, status, error, turns }
//                 from the Enter that asks until another question: while
//                 busy the pane says what it waits on (status) until the
//                 words come; a failure says why; or null
//         proposal: { title, run, risk } while a run the agent asks for
//                 waits for his Enter (ROADMAP 44), { title, input, tool }
//                 a tool, { title, subtitle, auth } a sign-in, or null
//         agent:  the name of the agent Ask holds
//         answer: { question, title, text, seq, busy, turns } while a streamed
//                 answer shows (providers/answers.js): busy, the program
//                 still running, turns the spinner and, until its first
//                 words, says it is asking; turns, the conversation's
//                 earlier { question, text }, drawn above it; or null
//         word:   { title, word, run, risk } while a confirm word is asked
//         palette: { row, action, actions, armed } while Ctrl+K's actions are up
//         row, armed (the row waits for its second Enter), anyPreview }
//
// Ctrl+K's actions hide it, but for a row that shows its commands (below).
// An answer is one pane for all its rows and
// follows its newest words; else the selected row's preview, or, while
// another row has one, the row's own title, so arrowing through a mixed
// list does not change the card's width (his ruling 2026-10-04). A preview
// that names a read is the caller's to fill (components/PaneRead.qml; the
// renders' tools/render/FakeNodi.qml).
//
// A row that asks before it runs, from a provider that wants its command
// seen (Rows showsCommand), shows the exact command and the risk the
// provider names: in place of its own preview once it is armed or its word
// is asked, and when it has none.
function choose(s) {
  if (!s) return null
  // Ctrl+K hides the pane, but for an action that asks before it runs, of
  // a row that shows its commands: then its command and risk, as a row's
  // (a check 2026-10-05: only "Enter again" showed). While one of
  // the actions does, the others keep the pane with their own label, so
  // arrowing through them does not change the card's width, as the list
  // does not (Fable 2026-10-05).
  if (s.paletteOpen) {
    var p = s.palette
    var act = p && p.action
    if (!p || !(p.row && p.row.showsCommand)) return null
    var holds = (p.actions || []).some(function(a) { return !!a && !!a.confirm })
    // Typed for and none matching: the pane holds, as it does from action
    // to action (Sonnet 2026-10-06).
    if (!act) return holds ? { title: "No action matches" } : null
    if (act.confirm)
      return command(act.label, p.armed ? "Enter again to run it" : act.confirmWord ? "Enter, then type " + act.confirmWord + " to run it" : "Enter twice to run it",
                     act.run, act.risk)
    return holds ? { title: act.label } : null
  }
  // What the agent asks to run, exactly, before he lets it.
  var agent = s.agent || "The agent"
  if (s.proposal && s.proposal.run) return command(s.proposal.title, agent + " asks to run it: Enter runs it, Esc refuses", s.proposal.run, s.proposal.risk)
  // Any other tool (ROADMAP 49, 84): what it is given, whole.
  if (s.proposal && s.proposal.tool)
    return { title: s.proposal.title, subtitle: agent + " asks to use it: Enter allows it, Esc refuses", markdown: "```json\n" + JSON.stringify(s.proposal.input || {}, null, 2) + "\n```" }
  if (s.proposal && s.proposal.auth) return { title: s.proposal.title, subtitle: s.proposal.subtitle || "", text: "Enter signs in, Esc does not." }
  // An answer's pane opens at the Enter that asks, so the card takes its
  // width then and not at the first word (his report 2026-10-07: a delay
  // after Enter with nothing to show for it).
  if (s.ask && (s.ask.text || s.ask.busy || s.ask.error)) {
    var text = String(s.ask.text || "")
    if (s.ask.error && !s.ask.busy) text += (text ? "\n\n" : "") + "Could not ask: " + s.ask.error
    // A conversation: the earlier turns above, each its question marked,
    // as a streamed answer's are; Ask's answers are plain text.
    var asks = s.ask.turns || []
    if (asks.length)
      text = thread(asks.map(function(t) { return "\u203a " + oneLine(t.question) + "\n\n" + String(t.answer || "") }), "\n\n" + RULE + "\n\n",
                    "\u203a " + oneLine(s.ask.question) + "\n\n" + text, "(Earlier turns are not shown.)")
    var many = asks.length ? ", " + (asks.length + 1) + " questions" : ""
    return { title: s.ask.question, subtitle: (s.ask.agent || "Ask") + (s.ask.model ? ", " + s.ask.model : "") + many, text: text, follow: true,
             busy: !!s.ask.busy, status: s.ask.busy && !s.ask.text && !asks.length ? String(s.ask.status || "Asking") + "..." : "" }
  }
  // `round`: each run its own, so asked again it starts at its top and
  // follows its words, though it was scrolled before (Fable 2026-10-05).
  // Busy, as Ask's: a program can take seconds before its first word, and
  // the pane said nothing while it did (his report 2026-10-11).
  if (s.answer) {
    var turns = s.answer.turns || []
    var md = s.answer.text || ""
    // A conversation (components/Answer.qml): each turn its question, set
    // apart, then its answer, the newest last, as Raycast's Quick AI shows
    // one. The earlier turns never change, so the pane lays them out once.
    if (turns.length)
      md = thread(turns.map(function(t) { return asked(t.question) + "\n\n" + String(t.text || "") }), "\n\n---\n\n",
                  asked(s.answer.question) + "\n\n" + md, "*Earlier turns are not shown.*")
    var count = turns.length ? ", " + (turns.length + 1) + " questions" : ""
    return { title: s.answer.question, subtitle: (s.answer.title || "") + count, markdown: md, follow: true, round: s.answer.seq || 0,
             busy: !!s.answer.busy, status: s.answer.busy && !s.answer.text && !turns.length ? "Asking " + (s.answer.title || "it") + "..." : "" }
  }
  if (s.word) return command(s.word.title, "Type " + s.word.word + " to run it", s.word.run, s.word.risk)
  var row = s.row
  if (row && row.showsCommand && row.confirm && (s.armed || !row.preview))
    return command(row.title, s.armed ? "Enter again to run it" : row.confirmWord ? "Enter, then type " + row.confirmWord + " to run it" : "Enter twice to run it",
                   row.run, row.risk)
  if (row && row.preview) return row.preview
  if (s.anyPreview && row) return { title: row.fullTitle || row.title, subtitle: row.fullSubtitle || row.subtitle }
  return null
}

// Whether a row has a pane of its own, so a list holding one keeps the
// card wide.
function hasPane(row) { return !!row && (!!row.preview || (!!row.showsCommand && !!row.confirm)) }

// The most a thread holds: the pane draws 64 KB at most (lib/Markdown.js
// MAX), and the oldest turns go first, so the newest question and its
// answer are always there (2026-10-11).
var THREAD_MAX = 60000

// Earlier turns, the newest last, then the current one: as many of the
// earlier as fit beside the current, a word in place of those left out.
function thread(earlier, between, current, dropped) {
  var room = THREAD_MAX - current.length
  var kept = []
  for (var i = earlier.length - 1; i >= 0; i--) {
    var cost = earlier[i].length + between.length
    if (cost > room) break
    room -= cost
    kept.unshift(earlier[i])
  }
  var head = kept.length < earlier.length ? [dropped] : []
  return head.concat(kept, [current]).join(between)
}

// Between the turns of a plain-text conversation.
var RULE = "\u2500\u2500\u2500\u2500\u2500\u2500"

function oneLine(q) { return String(q || "").replace(/\s+/g, " ").trim() }

// A question as the thread shows it: quoted and bold, its own Markdown
// taken as text, so a question is never drawn as a heading or a link.
function asked(q) { return "> **" + Markdown.escaped(String(q || "").replace(/\s+/g, " ").trim()) + "**" }

function command(title, subtitle, run, risk) {
  return { title: title, subtitle: subtitle, labels: risk ? [["Risk", risk]] : [], text: Run.describe(run), mono: true }
}
