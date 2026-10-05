import QtQuick
import Quickshell
import Quickshell.Io
import "../../components"

// components/Answer.qml with real programs: what one prints shows as it
// arrives, not when it ends; stop() ends the program and all it started and
// keeps what it said; a failure says the last line it wrote to stderr; the
// deadline ends one that runs on; a newer question replaces an older one,
// none of whose words then reach it. Run by tools/qs-test.sh inside
// Quickshell.
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

  function start() {
    Quickshell.execDetached(["/usr/bin/mkdir", "-p", test.marks])
    streams.start(spec('printf "## Hi\\n"; sleep 0.6; printf "there"; sleep 0.6; printf " end"'))
    // A child that would leave a marker after the stop: it never must.
    stops.start(spec('printf "a"; (sleep 1.2; : > "$1/stopped-child") & sleep 1.2; : > "$1/stopped-parent"; printf b', 10000, [test.marks]))
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
      check(streams.phase === "streaming" && streams.text === "## Hi\n", "the first words show before the program ends: " + streams.phase + " " + JSON.stringify(streams.text))
      stops.stop()
      check(stops.phase === "stopped" && stops.text === "a" && !stops.running, "stop() keeps what was said: " + stops.phase + " " + JSON.stringify(stops.text))
      twice.start({ keyword: "a", title: "Test", question: "q2", timeoutMs: 10000, argv: ["/usr/bin/bash", "-c", 'printf "new words"'] })
    }
  }

  Timer {
    id: later
    interval: 2600
    onTriggered: {
      check(streams.phase === "done" && streams.text === "## Hi\nthere end", "the whole answer, then done: " + streams.phase + " " + JSON.stringify(streams.text))
      check(stops.phase === "stopped" && stops.text === "a", "a stopped answer stays stopped, nothing more added: " + stops.phase + " " + JSON.stringify(stops.text))
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
