import QtQuick

// An answer that streams (providers/answers.js): one program run at a time,
// what it prints kept as it arrives for the pane to draw. A new question
// ends the run before it; stop() ends the running one and keeps what it
// said; reset() forgets it.
//
// Answers belong to a conversation, as Raycast's Quick AI keeps one (its
// manual, 2026-10-11): a question asked within `freshMs` of the last answer
// with the same keyword follows it, its earlier turns kept for the pane;
// after a pause, or on "New conversation", another begins. The program is
// told which in NODI_CONVERSATION, an id it can keep its own history under
// (my-ask --session "$NODI_CONVERSATION"). Closing the bar keeps both the
// conversation and an answer still on its way, as Ask's does. The run is a Reader's, so it has a reader's
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
  property string message: ""
  property string text: ""
  property string phase: "idle"      // idle | waiting | streaming | done | stopped | error
  property string error: ""

  readonly property bool running: phase === "waiting" || phase === "streaming"

  // The conversation: its id, the turns answered before the current one
  // ({ question, message, text }), and when its last answer ended. `message`
  // is the effective request when context came from Ask. freshMs: how long
  // after that a question still follows it; 0, never; -1, always.
  property string conversation: ""
  property var turns: []
  property real lastAt: 0
  property int freshMs: 600000
  property bool reopened: false

  // Whether a question with `keyword` follows the conversation, rather
  // than starting one; `freshMs`, the window nodi.json sets now (answers.js
  // freshFor), else the one it was asked with.
  function follows(keyword, freshMs) {
    var window = freshMs === undefined ? answer.freshMs : freshMs
    if (answer.conversation === "" || answer.keyword !== keyword || window === 0) return false
    if (window < 0 || answer.lastAt <= 0) return true
    return Date.now() - answer.lastAt <= window
  }

  // The id is letters, digits, dashes and underscores whatever the keyword
  // ("ai/chat"), so a program can name a file by it and a chat command
  // takes it (answers.js chatArgv; 2026-10-11).
  function newConversation(keyword) {
    answer.conversation = "nodi-" + String(keyword).replace(/[^A-Za-z0-9_-]/g, "_") + "-" + Qt.formatDateTime(new Date(), "yyyyMMdd-hhmmss")
      + "-" + Math.floor(Math.random() * 1e6)
    answer.turns = []
    answer.lastAt = 0
  }

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

  // spec: { keyword, title, question, timeoutMs, freshMs, argv, env, fresh }
  // (answers.js spec); fresh: in a new conversation whatever the last one.
  function start(spec) {
    answer.seq++
    if (reader.busy) reader.cancel()
    answer.drop()
    answer.reopened = false
    if (spec.freshMs !== undefined) answer.freshMs = spec.freshMs
    if (spec.fresh || !answer.follows(spec.keyword, answer.freshMs)) answer.newConversation(spec.keyword)
    // The answer before this one is a turn of the conversation now, but
    // not one asked again (Ask again replaces it), nor one that failed.
    else if (answer.question !== "" && answer.question !== spec.question && answer.text !== ""
             && (answer.phase === "done" || answer.phase === "stopped"))
      answer.turns = answer.turns.concat([{ question: answer.question, message: answer.message, text: answer.text }])
    answer.keyword = spec.keyword
    answer.title = spec.title
    answer.question = spec.question
    answer.message = spec.message === undefined ? spec.question : spec.message
    answer.text = ""
    answer.error = ""
    answer.phase = "waiting"
    reader.timeoutMs = spec.timeoutMs
    var env = ({})
    for (var k in spec.env || {}) env[k] = spec.env[k]
    env.NODI_CONVERSATION = answer.conversation
    reader.run(spec.argv, { seq: answer.seq, env: env })
  }

  function stop() {
    if (!answer.running) return
    reader.cancel()
    answer.flush()
    answer.lastAt = Date.now()
    answer.phase = "stopped"
  }

  // A kept conversation reopened (lib/Conversations.js): its last turn the
  // answer shown, the turns before it above, and fresh from now, so a
  // follow-up continues it under its own id, the program's history with it.
  function resume(c, freshMs) {
    if (!c || !c.turns || !c.turns.length) return
    answer.seq++
    if (reader.busy) reader.cancel()
    answer.drop()
    var last = c.turns[c.turns.length - 1]
    answer.conversation = c.id
    answer.turns = c.turns.slice(0, -1)
    answer.keyword = c.keyword
    answer.title = c.title
    answer.question = last.question
    answer.message = typeof last.message === "string" ? last.message : last.question
    answer.text = last.text
    answer.error = ""
    if (freshMs !== undefined) answer.freshMs = freshMs
    answer.lastAt = Date.now()
    answer.reopened = true
    answer.phase = "done"
  }

  // Forgets the answer and its conversation: "New conversation".
  function reset() {
    answer.seq++
    if (reader.busy) reader.cancel()
    answer.drop()
    answer.conversation = ""
    answer.turns = []
    answer.lastAt = 0
    answer.reopened = false
    answer.keyword = ""
    answer.title = ""
    answer.question = ""
    answer.message = ""
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
      if (ok) { answer.lastAt = Date.now(); answer.phase = "done"; return }
      // A failure keeps no conversation alive: one it began, with nothing
      // answered in it, is dropped, so the next question starts afresh,
      // as the program's own history may hold the failed turn
      // (2026-10-11); one going on keeps its window from its last answer.
      if (!answer.turns.length) answer.conversation = ""
      answer.error = reader.timedOut ? "it ran past " + Math.round(reader.timeoutMs / 1000) + " s"
        : reader.overflowed ? "it printed more than " + Math.round(reader.maxBytes / 1024) + " KB"
        : (reader.errorLine || "it exited with an error")
      answer.phase = "error"
    }
  }
}
