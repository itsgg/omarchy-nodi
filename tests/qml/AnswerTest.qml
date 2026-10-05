import QtQuick
import Quickshell
import Quickshell.Io
import "../../components"

// components/Answer.qml with real programs: what one prints shows a word at
// a time as it arrives, not when it ends, and a character cut between two
// writes arrives whole; stop() ends the program and all it started and
// keeps what it said; a failure says the last line it wrote to stderr; the
// deadline ends one that runs on; a newer question replaces an older one,
// none of whose words then reach it; and a question asked while the last
// one's program was still dying is stopped by stop() and by reset() too,
// never left to start unseen (Fable 2026-10-05). Run by tools/qs-test.sh
// inside Quickshell.
Item {
  id: test
  signal done(bool ok, string report)
  property var failures: []

  function check(cond, what) { if (!cond) test.failures.push(what) }

  readonly property string marks: (Quickshell.env("XDG_RUNTIME_DIR") || "/tmp") + "/nodi-answer-test-" + Date.now()

  function spec(script, timeoutMs, extra) {
    return { keyword: "a", title: "Test", question: "q", timeoutMs: timeoutMs || 10000,
             argv: ["/usr/bin/bash", "-c", script, "answer-test"].concat(extra || []) }
  }

  Answer { id: streams; env: ({ PATH: "/usr/bin:/bin" }) }
  Answer { id: stops; env: ({ PATH: "/usr/bin:/bin" }) }
  Answer { id: fails; env: ({ PATH: "/usr/bin:/bin" }) }
  Answer { id: late; env: ({ PATH: "/usr/bin:/bin" }) }
  Answer { id: twice; env: ({ PATH: "/usr/bin:/bin" }) }
  Answer { id: tamil; env: ({ PATH: "/usr/bin:/bin" }) }
  Answer { id: queuedStop; env: ({ PATH: "/usr/bin:/bin" }) }
  Answer { id: queuedReset; env: ({ PATH: "/usr/bin:/bin" }) }

  // A program slow to die: it ignores TERM, so its run ends only at the KILL
  // a second later, and a question asked meanwhile waits behind it.
  readonly property string stubborn: 'trap "" TERM; printf "old "; sleep 5'
  function secondRun(name) {
    return { keyword: "a", title: "Test", question: "q2", timeoutMs: 10000,
             argv: ["/usr/bin/bash", "-c", ': > "$1/' + name + '"; printf "new words"', "answer-test", test.marks] }
  }

  function start() {
    Quickshell.execDetached(["/usr/bin/mkdir", "-p", test.marks])
    streams.start(spec('printf "## Hi\\n"; sleep 0.6; printf "there"; sleep 0.6; printf " end"'))
    // A child that would leave a marker after the stop: it never must.
    stops.start(spec('printf "said so far "; (sleep 1.2; : > "$1/stopped-child") & sleep 1.2; : > "$1/stopped-parent"; printf b', 10000, [test.marks]))
    // A Tamil letter's three bytes in two writes, 0.3 s apart.
    tamil.start(spec("printf 'xx \\xe0\\xae'; sleep 0.3; printf '\\xa4 end'"))
    queuedStop.start(spec(test.stubborn))
    queuedReset.start(spec(test.stubborn))
    fails.start(spec('printf "partial"; echo "first line" >&2; echo "the reason it failed" >&2; exit 3'))
    late.start(spec('printf "x"; sleep 30', 1000))
    twice.start(spec('sleep 0.8; printf "old words"'))
    check(streams.phase === "waiting" && streams.running, "an answer starts waiting: " + streams.phase)
    early.start()
    later.start()
    last.start()
  }

  Timer {
    id: early
    interval: 350
    onTriggered: {
      // "Hi\nthere" is one word to the split at spaces: it waits for the space.
      check(streams.phase === "streaming" && streams.text === "##", "the first words show before the program ends: " + streams.phase + " " + JSON.stringify(streams.text))
      stops.stop()
      check(stops.phase === "stopped" && stops.text === "said so far" && !stops.running, "stop() keeps what was said: " + stops.phase + " " + JSON.stringify(stops.text))
      // Asked again while the stubborn program dies, then stopped or reset.
      queuedStop.start(test.secondRun("queued-stop-ran"))
      queuedStop.stop()
      queuedReset.start(test.secondRun("queued-reset-ran"))
      queuedReset.reset()
      twice.start({ keyword: "a", title: "Test", question: "q2", timeoutMs: 10000, argv: ["/usr/bin/bash", "-c", 'printf "new words"'] })
    }
  }

  Timer {
    id: later
    interval: 2600
    onTriggered: {
      check(streams.phase === "done" && streams.text === "## Hi\nthere end", "the whole answer, then done: " + streams.phase + " " + JSON.stringify(streams.text))
      check(stops.phase === "stopped" && stops.text === "said so far", "a stopped answer stays stopped, nothing more added: " + stops.phase + " " + JSON.stringify(stops.text))
      check(tamil.phase === "done" && tamil.text === "xx \u0ba4 end", "a character cut between two writes arrives whole: " + JSON.stringify(tamil.text))
      check(queuedStop.phase === "stopped" && queuedStop.text === "", "stop() also stops the question waiting behind a dying run: " + queuedStop.phase + " " + JSON.stringify(queuedStop.text))
      check(queuedReset.phase === "idle", "reset() too: " + queuedReset.phase)
      check(fails.phase === "error" && fails.error === "the reason it failed" && fails.text === "partial",
            "a failure says stderr's last line and keeps what it printed: " + fails.phase + " " + JSON.stringify(fails.error))
      check(twice.phase === "done" && twice.question === "q2" && twice.text === "new words", "the newer question's answer only: " + twice.phase + " " + JSON.stringify(twice.text))
      marksRead.running = true
    }
  }

  Process {
    id: marksRead
    command: ["/usr/bin/ls", "-1", test.marks]
    stdout: StdioCollector { id: listing }
    onExited: {
      check(listing.text.trim() === "", "the stopped program and its child never reached their ends: " + JSON.stringify(listing.text))
      Quickshell.execDetached(["/usr/bin/rm", "-rf", "--", test.marks])
    }
  }

  Timer {
    id: last
    interval: 5500
    onTriggered: {
      check(late.phase === "error" && /ran past 1 s/.test(late.error) && late.text === "x", "the deadline ends one that runs on: " + late.phase + " " + JSON.stringify(late.error))
      late.reset()
      check(late.phase === "idle" && late.text === "" && late.question === "", "reset() forgets it")
      test.done(test.failures.length === 0, test.failures.join("; "))
    }
  }
}
