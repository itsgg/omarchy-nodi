.pragma library
.import "Run.js" as Run

// What the pane beside the list shows (components/PreviewPane.qml), from
// what is on screen. Nodi.qml and the render harness ask the same function,
// so a picture of the bar is the bar.
//
//   s = { paletteOpen,
//         ask:    { question, model, text } while Claude's answer shows, or null
//         proposal: { title, run, risk } while a run Claude asks for waits
//                 for his Enter (ROADMAP 44), or null
//         answer: { question, title, text, seq } while a streamed answer shows
//                 (providers/answers.js), or null
//         word:   { title, word, run, risk } while a confirm word is asked
//         palette: { row, action, actions, armed } while Ctrl+K's actions are up
//         row, armed (the row waits for its second Enter), anyPreview }
//
// Ctrl+K's actions hide it, but for a row that shows its commands (below).
// An answer is one pane for all its rows and
// follows its newest words; else the selected row's preview, or, while
// another row has one, the row's own title, so arrowing through a mixed
// list does not change the card's width (his ruling 2026-10-04). A preview
// that names a read is the caller's to fill (Nodi.qml readPreview).
//
// A row that asks before it runs, from a provider that wants its command
// seen (Rows showsCommand), shows the exact command and the risk the
// provider names: in place of its own preview once it is armed or its word
// is asked, and when it has none.
function choose(s) {
  if (!s) return null
  // Ctrl+K hides the pane, but for an action that asks before it runs, of
  // a row that shows its commands: then its command and risk, as a row's
  // (Akshi's check 2026-10-05: only "Enter again" showed). While one of
  // the actions does, the others keep the pane with their own label, so
  // arrowing through them does not change the card's width, as the list
  // does not (Fable 2026-10-05).
  if (s.paletteOpen) {
    var p = s.palette
    var act = p && p.action
    if (!act || !(p.row && p.row.showsCommand)) return null
    if (act.confirm)
      return command(act.label, p.armed ? "Enter again to run it" : act.confirmWord ? "Enter, then type " + act.confirmWord + " to run it" : "Enter twice to run it",
                     act.run, act.risk)
    return (p.actions || []).some(function(a) { return !!a && !!a.confirm }) ? { title: act.label } : null
  }
  // What Claude asks to run, exactly, before he lets it.
  if (s.proposal && s.proposal.run) return command(s.proposal.title, "Claude asks to run it: Enter runs it, Esc refuses", s.proposal.run, s.proposal.risk)
  if (s.ask && s.ask.text) return { title: s.ask.question, subtitle: "Claude, " + s.ask.model, text: s.ask.text, follow: true }
  // `round`: each run its own, so asked again it starts at its top and
  // follows its words, though it was scrolled before (Fable 2026-10-05).
  if (s.answer) return { title: s.answer.question, subtitle: s.answer.title, markdown: s.answer.text || "", follow: true, round: s.answer.seq || 0 }
  if (s.word) return command(s.word.title, "Type " + s.word.word + " to run it", s.word.run, s.word.risk)
  var row = s.row
  if (row && row.showsCommand && row.confirm && (s.armed || !row.preview))
    return command(row.title, s.armed ? "Enter again to run it" : row.confirmWord ? "Enter, then type " + row.confirmWord + " to run it" : "Enter twice to run it",
                   row.run, row.risk)
  if (row && row.preview) return row.preview
  if (s.anyPreview && row) return { title: row.title, subtitle: row.subtitle }
  return null
}

// Whether a row has a pane of its own, so a list holding one keeps the
// card wide.
function hasPane(row) { return !!row && (!!row.preview || (!!row.showsCommand && !!row.confirm)) }

function command(title, subtitle, run, risk) {
  return { title: title, subtitle: subtitle, labels: risk ? [["Risk", risk]] : [], text: Run.describe(run), mono: true }
}
