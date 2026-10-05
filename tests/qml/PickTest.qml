import QtQuick
import Quickshell
import Quickshell.Io
import "../../components"

// components/PickSession.qml through a real FIFO, as bin/nodi makes one: a
// request is read and said ready with its rows; end() writes the answer
// into the FIFO and gives back what the field held; a newer request ends
// the open one with "cancel"; alive() says which is open; a directory that
// is not a pick's is refused, and a row-file that cannot be read cancels.
// Run by tools/qs-test.sh inside Quickshell.
Item {
  id: test
  signal done(bool ok, string report)
  property var failures: []
  property var readyCount: 0
  property var endedWith: []

  function check(cond, what) { if (!cond) test.failures.push(what) }

  readonly property string root: Quickshell.env("XDG_RUNTIME_DIR") || "/tmp"
  readonly property string first: root + "/nodi-pick.T1" + Date.now()
  readonly property string second: root + "/nodi-pick.T2" + Date.now()
  function idOf(dir) { return dir.slice(dir.lastIndexOf(".") + 1) }
  function ask(dir) { return JSON.stringify({ dir: dir, id: test.idOf(dir), placeholder: "Which?", json: false }) }

  PickSession {
    id: picks
    roots: [test.root]
    onReady: test.readyCount++
    onEnded: function(before) { test.endedWith.push(before) }
  }

  // Makes both pick directories as bin/nodi does, then waits on each FIFO
  // as it does and writes what it hears beside it.
  Process {
    id: setup
    command: ["/usr/bin/bash", "-c",
      'for d in "$1" "$2"; do mkdir -m 700 "$d" && printf "alpha\\n\\nbeta\\ngamma" > "$d/rows" && mkfifo -m 600 "$d/answer"; done; '
      + 'for d in "$1" "$2"; do ( exec 3<>"$d/answer"; IFS= read -r -t 8 a <&3; printf "%s" "$a" > "$d/heard" ) & done; wait',
      "pick-test", test.first, test.second]
    onStarted: startPicks.start()
  }

  function start() { setup.running = true }

  Timer {
    id: startPicks
    interval: 300
    onTriggered: {
      check(picks.request(JSON.stringify({ dir: "/home/u/nodi-pick.x", id: "x" }), "") === "bad request", "a directory that is not a pick's is refused")
      check(picks.request(test.ask(test.first), "my query") === "ok", "a pick is taken")
      check(picks.alive(test.idOf(test.first)) === "yes" && picks.alive("other") === "no", "alive names the open pick")
      afterRead.start()
    }
  }

  Timer {
    id: afterRead
    interval: 600
    onTriggered: {
      check(test.readyCount === 1 && picks.current && picks.current.rows.length === 3, "ready, with its rows: " + JSON.stringify(picks.current && picks.current.rows))
      // A second pick ends the first with cancel.
      check(picks.request(test.ask(test.second), "typed into the first pick") === "ok", "the second is taken")
      check(test.endedWith.length === 1 && test.endedWith[0] === "my query", "the first ended, the field's text given back: " + JSON.stringify(test.endedWith))
      chosen.start()
    }
  }

  Timer {
    id: chosen
    interval: 600
    onTriggered: {
      picks.end("pick 3")
      check(picks.current === null && picks.alive(test.idOf(test.second)) === "no", "ended: nothing open")
      picks.end("pick 9")
      check(test.endedWith.length === 2, "an end with nothing open says nothing")
      check(test.endedWith[1] === "my query", "the second gives back what the field held before the first: " + JSON.stringify(test.endedWith))
      heard.start()
    }
  }

  Timer {
    id: heard
    interval: 900
    onTriggered: readHeard.running = true
  }

  Process {
    id: readHeard
    command: ["/usr/bin/bash", "-c", 'printf "%s|%s" "$(cat "$1/heard" 2>/dev/null)" "$(cat "$2/heard" 2>/dev/null)"; rm -rf -- "$1" "$2"', "pick-test", test.first, test.second]
    stdout: StdioCollector { id: heardOut }
    onExited: {
      check(heardOut.text === "cancel|pick 3", "each FIFO heard its answer: " + JSON.stringify(heardOut.text))
      test.done(test.failures.length === 0, test.failures.join("; "))
    }
  }
}
