import QtQuick
import Quickshell
import "../lib/Pick.js" as Pick

// `nodi pick` (bin/nodi): one pick at a time. request() takes what bin/nodi
// asks for, reads the rows it wrote and says `ready`; end() writes the
// answer, "pick <line>", "cancel" or "replaced", into the FIFO the command waits on and
// says `ended` with what the field held before, so the bar puts it back. A
// newer request ends the open one with "replaced", which is not a no from
// him (Fable 2026-10-06). Its own component so the
// whole round, FIFO included, is tested in Quickshell (tests/qml/PickTest.qml).
Item {
  id: session
  visible: false

  // Where bin/nodi makes a pick's directory: the runtime directory, or /tmp
  // without one. Nothing elsewhere is read or written to.
  property var roots: [Quickshell.env("XDG_RUNTIME_DIR") || "", "/tmp"]

  // { id, dir, rows, placeholder, json, before }, rows null until read.
  property var current: null

  signal ready()
  signal ended(string before)

  function request(argJson, before) {
    var a = Pick.request(argJson, session.roots)
    if (!a) return "bad request"
    // A pick that replaces an open one gives the field back what it held
    // before the first, not what was typed into it (Fable 2026-10-05).
    var kept = session.current ? session.current.before : String(before || "")
    session.end("replaced")
    session.current = { id: a.id, dir: a.dir, rows: null, placeholder: a.placeholder, json: a.json, before: kept }
    reader.run(["/usr/bin/cat", "--", a.dir + "/rows"], a.id)
    return "ok"
  }

  function alive(id) { return session.current && session.current.id === String(id) ? "yes" : "no" }

  function end(answer) {
    var s = session.current
    if (!s) return
    session.current = null
    Quickshell.execDetached(Pick.answerArgv(s.dir, answer))
    session.ended(s.before)
  }

  Reader {
    id: reader
    timeoutMs: 5000
    maxBytes: 8388608
    onFinished: function(text, ok, tag) {
      var s = session.current
      if (!s || s.id !== tag) return
      // Rows that could not be read (past 8 MB, or gone) are an error to
      // the command, never a pick closed without a choice.
      if (!ok) { session.end("error"); return }
      session.current = { id: s.id, dir: s.dir, rows: Pick.parse(text, s.json), placeholder: s.placeholder, json: s.json, before: s.before }
      session.ready()
    }
  }
}
