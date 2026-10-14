import QtQuick
import Quickshell
import "../../components"

// components/Answer.qml's conversation (Raycast's Quick AI, 2026-10-11),
// with a real program that prints the NODI_CONVERSATION it was given: a
// question within the window follows the last answer, under the same id,
// the answer before it kept as a turn; Ask again replaces the last answer
// rather than keeping it twice; "fresh" and another keyword start a new
// conversation, as does a pause past the window and a window of 0; reset()
// forgets it. Run by tools/qs-test.sh inside Quickshell.
Item {
  id: test
  signal done(bool ok, string report)
  property var failures: []

  function check(cond, what) { if (!cond) test.failures.push(what) }

  function spec(keyword, question, extra) {
    var s = { keyword: keyword, title: "Test", question: question, timeoutMs: 10000, freshMs: 600000,
              argv: ["/usr/bin/bash", "-c", 'printf "%s" "$NODI_CONVERSATION"', "conversation-test"] }
    for (var k in extra || {}) s[k] = extra[k]
    return s
  }

  Answer { id: talk; env: ({ PATH: "/usr/bin:/bin" }) }

  property var steps: []
  property int at: 0
  property string firstId: ""

  // Each step asks and waits for the answer to end, then checks.
  function next() {
    if (test.at >= test.steps.length) { test.done(test.failures.length === 0, test.failures.join("; ")); return }
    var step = test.steps[test.at++]
    step.ask()
    waiter.check = step.check
    waiter.restart()
  }

  Timer {
    id: waiter
    property var check: null
    interval: 50
    repeat: true
    onTriggered: {
      if (talk.running) return
      stop()
      check()
      test.next()
    }
  }

  function start() {
    test.steps = [
      { ask: function() { talk.start(spec("a", "first")) },
        check: function() {
          test.firstId = talk.text
          test.check(/^nodi-a-\d{8}-\d{6}-\d+$/.test(talk.text), "the program is told its conversation: " + JSON.stringify(talk.text))
          test.check(talk.turns.length === 0, "a first question has no turns before it")
          test.check(talk.message === "first", "the effective request is kept for retry: " + JSON.stringify(talk.message))
        } },
      { ask: function() { talk.start(spec("a", "second")) },
        check: function() {
          test.check(talk.text === test.firstId, "a follow-up keeps the conversation: " + talk.text + " vs " + test.firstId)
          test.check(talk.turns.length === 1 && talk.turns[0].question === "first" && talk.turns[0].text === test.firstId,
                     "the answer before it is a turn: " + JSON.stringify(talk.turns))
        } },
      { ask: function() { talk.start(spec("a", "second")) },
        check: function() {
          test.check(talk.turns.length === 1, "Ask again replaces the last answer, not kept twice: " + talk.turns.length)
          test.check(talk.text === test.firstId, "and stays in the conversation")
        } },
      { ask: function() { talk.start(spec("a", "third", { fresh: true })) },
        check: function() {
          test.check(talk.text !== test.firstId && talk.turns.length === 0, "fresh starts another conversation")
          test.firstId = talk.text
        } },
      { ask: function() { talk.start(spec("b", "other keyword")) },
        check: function() {
          test.check(talk.text !== test.firstId && /^nodi-b-/.test(talk.text) && talk.turns.length === 0, "another keyword, another conversation")
          test.firstId = talk.text
        } },
      { ask: function() { talk.lastAt = Date.now() - 700000; talk.start(spec("b", "after a pause")) },
        check: function() {
          test.check(talk.text !== test.firstId && talk.turns.length === 0, "past the window, another conversation")
          test.firstId = talk.text
        } },
      { ask: function() { talk.start(spec("b", "never fresh", { freshMs: 0 })) },
        check: function() {
          test.check(talk.text !== test.firstId, "a window of 0 makes every question its own conversation")
          test.firstId = talk.text
        } },
      { ask: function() { talk.lastAt = Date.now() - 99999999; talk.start(spec("b", "always", { freshMs: -1 })) },
        check: function() {
          test.firstId = talk.text
        } },
      { ask: function() { talk.lastAt = Date.now() - 99999999; talk.start(spec("b", "still", { freshMs: -1 })) },
        check: function() {
          test.check(talk.text === test.firstId, "a window of -1 follows however long the pause")
          talk.reset()
          test.check(talk.conversation === "" && talk.turns.length === 0 && talk.phase === "idle", "reset() forgets the conversation")
        } },
      // The id can be used as a file name whatever the keyword; a failed
      // first question keeps no conversation for the next.
      { ask: function() { talk.start(spec("ai/chat x", "odd keyword")) },
        check: function() {
          test.check(/^nodi-ai_chat_x-\d{8}-\d{6}-\d+$/.test(talk.text), "a keyword's odd characters leave the id: " + talk.text)
        } },
      { ask: function() { talk.reset(); talk.start(spec("c", "fails", { argv: ["/usr/bin/bash", "-c", 'printf "%s" "$NODI_CONVERSATION"; exit 3', "conversation-test"] })) },
        check: function() {
          test.firstId = talk.text
          test.check(talk.phase === "error" && talk.conversation === "", "a failed first question keeps no conversation: " + talk.phase + " " + talk.conversation)
        } },
      { ask: function() { talk.start(spec("c", "after the failure")) },
        check: function() {
          test.check(talk.text !== test.firstId && talk.turns.length === 0, "the next question starts afresh")
        } },
      // A kept conversation reopened (2026-10-12): its last turn shown, the
      // earlier above, and a follow-up continuing it under its own id.
      { ask: function() {
          talk.resume({ id: "nodi-k-kept", keyword: "k", title: "Kept", turns: [
            { question: "one", message: "one", text: "1" },
            { question: "two", message: "two\n\n<selection>kept context</selection>", text: "2" }
          ] }, 600000)
          test.check(talk.phase === "done" && talk.question === "two" && talk.text === "2" && talk.turns.length === 1
                     && talk.conversation === "nodi-k-kept" && talk.message === "two\n\n<selection>kept context</selection>" && talk.reopened === true,
                     "resume shows the last turn, the earlier above: " + JSON.stringify([talk.phase, talk.question, talk.turns]))
          talk.start(spec("k", "three"))
        },
        check: function() {
          test.check(talk.text === "nodi-k-kept", "a follow-up continues the kept conversation: " + talk.text)
          test.check(talk.turns.length === 2 && talk.turns[1].question === "two", "and the reopened answer is a turn now")
          test.check(talk.reopened === false, "asking after a reopen makes it an ordinary live conversation")
        } }
    ]
    test.next()
  }
}
