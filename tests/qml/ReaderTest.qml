import QtQuick
import Quickshell
import "../../components"

// A long read costs the GUI thread its length, not its length squared
// (components/Reader.qml). Omarchy's commands print 183 KB in about 15,000
// lines at every shell start, and a reader that added each line to a
// string property copied all it had read at every line: 11.7 s of the
// shell's GUI thread (qmlprofiler, 2026-10-07). 30,000 lines here took
// that reader 4.5 s, and take about 0.2 s now; the bound is 2 s. And a
// read cut at its cap hands back its whole lines only, as it did before.
// Run by tools/qs-test.sh inside Quickshell.
Item {
  id: test
  signal done(bool ok, string report)
  property var failures: []
  property double startedAt: 0
  property int pending: 2

  function check(cond, what) { if (!cond) test.failures.push(what) }
  function finish() { if (--test.pending === 0) test.done(test.failures.length === 0, test.failures.join("; ")) }

  readonly property int lines: 30000

  Reader {
    id: reader
    onFinished: function(text, ok) {
      var took = Date.now() - test.startedAt
      check(ok, "seq ran")
      var want = []
      for (var i = 1; i <= test.lines; i++) want.push(String(i))
      check(text === want.join("\n") + "\n", "every line, in order, each ending in a newline")
      check(took < 2000, "30,000 lines read in " + took + " ms, under 2000")
      test.finish()
    }
  }

  // Eight bytes of "aaa\nbbbbbbbbbb": the cap falls inside the second line.
  Reader {
    id: capped
    maxBytes: 8
    onFinished: function(text, ok) {
      check(!ok, "a read past its cap fails")
      check(text === "aaa\n", "the line it was cut in is left out: " + JSON.stringify(text))
      test.finish()
    }
  }

  function start() {
    test.startedAt = Date.now()
    reader.run(["/usr/bin/seq", "1", String(test.lines)], null)
    capped.run(["/usr/bin/printf", "aaa\\nbbbbbbbbbb"], null)
  }
}
