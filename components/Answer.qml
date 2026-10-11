import QtQuick

// An answer that streams (providers/answers.js): one program run at a time,
// what it prints kept as it arrives for the pane to draw. A new question
// ends the run before it; stop() ends the running one and keeps what it
// said; reset() forgets it. The run is a Reader's, so it has a reader's
// limits: a cleared environment with the session's PATH, a deadline, a cap
// on what it prints, and a cancel that ends the program with all it started
// (components/Reader.qml).
Item {
  id: answer
  visible: false

  property var env: ({})

  // What the bar shows.
  property string keyword: ""
  property string title: ""
  property string question: ""
  property string text: ""
  property string phase: "idle"      // idle | waiting | streaming | done | stopped | error
  property string error: ""

  readonly property bool running: phase === "waiting" || phase === "streaming"

  // Which run is the current one: a chunk or an end from an older run is
  // not this answer's.
  property int seq: 0

  // Words as they arrive, added to `text` together every 80 ms: the reader
  // hands on a word at a time, and each change of `text` rebuilt the pane's
  // preview, 2,685 times for an 18 KB answer (measured 2026-10-11). The
  // pane draws no faster (components/PreviewPane.qml), so nothing is seen
  // later for it.
  property var pending: []
  function flush() {
    batch.stop()
    if (!answer.pending.length) return
    var words = answer.pending.join("")
    answer.pending = []
    answer.text += words
  }
  function drop() {
    batch.stop()
    answer.pending = []
  }
  Timer { id: batch; interval: 80; onTriggered: answer.flush() }

  // spec: { keyword, title, question, timeoutMs, argv, env } (answers.js spec).
  function start(spec) {
    answer.seq++
    if (reader.busy) reader.cancel()
    answer.drop()
    answer.keyword = spec.keyword
    answer.title = spec.title
    answer.question = spec.question
    answer.text = ""
    answer.error = ""
    answer.phase = "waiting"
    reader.timeoutMs = spec.timeoutMs
    reader.run(spec.argv, { seq: answer.seq, env: spec.env })
  }

  function stop() {
    if (!answer.running) return
    reader.cancel()
    answer.flush()
    answer.phase = "stopped"
  }

  function reset() {
    answer.seq++
    if (reader.busy) reader.cancel()
    answer.drop()
    answer.keyword = ""
    answer.title = ""
    answer.question = ""
    answer.text = ""
    answer.error = ""
    answer.phase = "idle"
  }

  Reader {
    id: reader
    streaming: true
    cancelable: true
    // Under the kernel's 128 KB cap on one argument: Paste and Copy hand
    // the answer on as one, and failed silently past it (Fable 2026-10-05).
    maxBytes: 122880
    extraEnvironment: answer.env
    onChunk: function(data, tag) {
      if (!tag || tag.seq !== answer.seq || !answer.running) return
      answer.pending.push(data)
      if (!batch.running) batch.start()
      if (answer.phase === "waiting") answer.phase = "streaming"
    }
    onFinished: function(text, ok, tag) {
      if (!tag || tag.seq !== answer.seq || tag.cancelled) return
      answer.flush()
      if (ok) { answer.phase = "done"; return }
      answer.error = reader.timedOut ? "it ran past " + Math.round(reader.timeoutMs / 1000) + " s"
        : reader.overflowed ? "it printed more than " + Math.round(reader.maxBytes / 1024) + " KB"
        : (reader.errorLine || "it exited with an error")
      answer.phase = "error"
    }
  }
}
