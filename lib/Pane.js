.pragma library
.import "Run.js" as Run

// What the pane beside the list shows (components/PreviewPane.qml), from
// what is on screen. Nodi.qml and the render harness ask the same function,
// so a picture of the bar is the bar.
//
//   s = { paletteOpen,
//         ask:    { question, model, text } while Claude's answer shows, or null
//         answer: { question, title, text } while a streamed answer shows
//                 (providers/answers.js), or null
//         word:   { title, word, run, risk } while a confirm word is asked
//         row, armed (the row waits for its second Enter), anyPreview }
//
// Ctrl+K's actions hide it. An answer is one pane for all its rows and
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
  if (!s || s.paletteOpen) return null
  if (s.ask && s.ask.text) return { title: s.ask.question, subtitle: "Claude, " + s.ask.model, text: s.ask.text, follow: true }
  if (s.answer) return { title: s.answer.question, subtitle: s.answer.title, markdown: s.answer.text || "", follow: true }
  if (s.word) return command(s.word.title, "Type " + s.word.word + " to run it", s.word.run, s.word.risk)
  var row = s.row
  if (row && row.showsCommand && (s.armed || !row.preview))
    return command(row.title, s.armed ? "Enter again to run it" : row.confirmWord ? "Enter, then type " + row.confirmWord + " to run it" : "Enter twice to run it",
                   row.run, row.risk)
  if (row && row.preview) return row.preview
  if (s.anyPreview && row) return { title: row.title, subtitle: row.subtitle }
  return null
}

// Whether a row has a pane of its own, so a list holding one keeps the
// card wide.
function hasPane(row) { return !!row && (!!row.preview || !!row.showsCommand) }

function command(title, subtitle, run, risk) {
  return { title: title, subtitle: subtitle, labels: risk ? [["Risk", risk]] : [], text: Run.describe(run), mono: true }
}
