.pragma library

// What the pane beside the list shows (components/PreviewPane.qml), from
// what is on screen. Nodi.qml and the render harness ask the same function,
// so a picture of the bar is the bar.
//
//   s = { paletteOpen,
//         ask:    { question, model, text } while Claude's answer shows, or null
//         answer: { question, title, text } while a streamed answer shows
//                 (providers/answers.js), or null
//         row, anyPreview }
//
// Ctrl+K's actions hide it. An answer is one pane for all its rows and
// follows its newest words; else the selected row's preview, or, while
// another row has one, the row's own title, so arrowing through a mixed
// list does not change the card's width (his ruling 2026-10-04). A preview
// that names a read is the caller's to fill (Nodi.qml readPreview).
function choose(s) {
  if (!s || s.paletteOpen) return null
  if (s.ask && s.ask.text) return { title: s.ask.question, subtitle: "Claude, " + s.ask.model, text: s.ask.text, follow: true }
  if (s.answer) return { title: s.answer.question, subtitle: s.answer.title, markdown: s.answer.text || "", follow: true }
  var row = s.row
  if (row && row.preview) return row.preview
  if (s.anyPreview && row) return { title: row.title, subtitle: row.subtitle }
  return null
}
