import QtQuick
import Quickshell
import Quickshell.Io
import "../../components"

// A watched JSONL source keeps its last valid snapshot through a partial
// write and then accepts an atomic replacement. Run only by tools/qs-test.sh
// in its private headless Sway session.
Item {
  id: test
  signal done(bool ok, string report)
  property var failures: []
  property int phase: 0
  readonly property string dir: Quickshell.env("XDG_RUNTIME_DIR") + "/nodi-home-sources-" + Date.now()
  readonly property string file: dir + "/home.jsonl"

  function check(cond, what) { if (!cond) test.failures.push(what) }
  function title() {
    var all = watched.snapshots
    return all.length && all[0].snapshot && all[0].snapshot.rows.length ? all[0].snapshot.rows[0].title : ""
  }
  function diagnostic() {
    return watched.diagnostics.length ? watched.diagnostics[0].error : ""
  }
  function runKind() {
    var all = watched.snapshots
    var row = all.length && all[0].snapshot && all[0].snapshot.rows[0]
    return row && row.run ? row.run.kind : ""
  }
  function command(script) {
    writer.command = ["/usr/bin/bash", "-c", script, "nodi-home-sources-test", test.file]
    writer.running = true
  }
  function finish() {
    timeout.stop()
    cleanup.running = true
  }

  HomeSources {
    id: watched
    debounceMs: 60
    sources: []
    onUpdated: {
      if (test.phase === 1 && test.title() === "First") {
        test.phase = 2
        test.command('printf "%s" \'{"id":"half","title":\' > "$1"')
      } else if (test.phase === 2 && test.diagnostic()) {
        test.check(test.title() === "First", "a partial write replaced the last valid snapshot")
        test.check(/valid JSON/.test(test.diagnostic()), "the partial write has a parse diagnostic: " + test.diagnostic())
        test.phase = 3
        test.command('printf "%s\\n" \'{"id":"next","title":"Replacement","action":{"exec":["example-tool","arg"]}}\' > "$1.new"; chmod 600 "$1.new"; mv -f -- "$1.new" "$1"')
      } else if (test.phase === 3 && test.title() === "Replacement") {
        test.check(test.diagnostic() === "", "a valid replacement clears its diagnostic")
        test.check(test.runKind() === "", "an untrusted source strips executable actions")
        test.phase = 4
        watched.sources = [{
          id: "test", file: test.file, title: "Test", max: 4,
          priority: 0, trustedActions: true
        }]
      } else if (test.phase === 4 && test.runKind() === "exec") {
        var row = watched.snapshots[0].snapshot.rows[0]
        test.check(row.confirm && row.showsCommand && !row.remember,
                   "a metadata-gated executable requires confirmation and is not replayable")
        test.phase = 5
        watched.sources = [{
          id: "test", file: test.file, title: "Test", max: 4,
          priority: 0, trustedActions: false
        }]
      } else if (test.phase === 5 && test.runKind() === "") {
        test.check(watched.snapshots.length === 0,
                   "a trust downgrade drops the executable snapshot before rereading")
        test.phase = 6
        test.finish()
      }
    }
  }

  Process {
    id: writer
    onExited: function(code) {
      test.check(code === 0, "fixture write failed in phase " + test.phase)
      if (test.phase === 0) {
        test.phase = 1
        watched.sources = [{
          id: "test", file: test.file, title: "Test", max: 4,
          priority: 0, trustedActions: false
        }]
      }
    }
  }

  Process {
    id: cleanup
    command: ["/usr/bin/rm", "-rf", "--", test.dir]
    onExited: test.done(test.failures.length === 0, test.failures.join("; "))
  }

  Timer {
    id: timeout
    interval: 6000
    onTriggered: {
      test.failures.push("timed out in phase " + test.phase + " with "
                         + test.title() + " / " + test.runKind() + " / " + test.diagnostic())
      test.finish()
    }
  }

  function start() {
    timeout.start()
    command('umask 077; mkdir -p -- "$(dirname -- "$1")"; printf "%s\\n" \'{"id":"first","title":"First"}\' > "$1"')
  }
}
