import QtQuick
import Quickshell
import Quickshell.Io
import "../../components"
import "../../lib/HomeSources.js" as Parser

// A watched JSONL source keeps its last valid snapshot through a partial
// write and then accepts an atomic replacement. Run only by tools/qs-test.sh
// on its private headless X server.
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
  function activeRows() {
    return Parser.merge(watched.snapshots, Date.now()).rows.length
  }
  function command(script, value) {
    writer.command = ["/usr/bin/bash", "-c", script, "nodi-home-sources-test", test.file, value || ""]
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
        test.command('printf "%s\\n" \'{"id":"next","title":"Replacement","action":{"exec":["example-tool","arg"]}}\' > "$1"; chmod 666 -- "$1"')
      } else if (test.phase === 5 && /trust changed/.test(test.diagnostic())) {
        test.check(test.title() === "Replacement", "trust loss discarded display data")
        test.check(test.runKind() === "", "filesystem trust loss retained executable capability")
        test.phase = 6
        test.command('rm -f -- "$1"')
      } else if (test.phase === 6 && /could not be read/.test(test.diagnostic())) {
        test.check(test.title() === "Replacement", "a read failure discarded stale display data")
        test.check(test.runKind() === "", "a read failure restored executable capability")
        test.phase = 7
        test.command('umask 077; /usr/bin/head -c 262145 /dev/zero | /usr/bin/tr "\\0" x > "$1"')
      } else if (test.phase === 7 && /exceeds/.test(test.diagnostic())) {
        test.check(test.title() === "Replacement", "an oversized read discarded stale display data")
        test.check(test.runKind() === "", "an oversized read restored executable capability")
        test.phase = 8
        var expiry = new Date(Date.now() + 3000).toISOString()
        test.command('rm -f -- "$1"; umask 077; printf "%s\\n" "$2" > "$1"',
                     JSON.stringify({ id: "expires", title: "Expiring", expires: expiry }))
      } else if (test.phase === 8 && test.title() === "Expiring" && test.activeRows() === 1) {
        test.phase = 9
      } else if (test.phase === 9 && test.activeRows() === 0) {
        test.phase = 10
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
    interval: 20000
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
