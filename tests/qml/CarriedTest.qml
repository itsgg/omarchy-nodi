import QtQuick
import Quickshell
import Quickshell.Io
import "../../components"

// components/Carried.qml: a payload bin/nodi left in its own 0700 folder is
// read at once, inside the call; an argument that is no payload is itself;
// a path anywhere else is never read. Run by tools/qs-test.sh.
Item {
  id: test
  signal done(bool ok, string report)
  property var failures: []
  readonly property string dir: Quickshell.env("XDG_RUNTIME_DIR") + "/nodi-ipc.carriedtest" + Date.now()
  function check(cond, what) { if (!cond) test.failures.push(what) }

  Carried { id: carried }
  // XDG_RUNTIME_DIR with a trailing slash reads the same payloads.
  Carried { id: slashed; runtimeRoot: Quickshell.env("XDG_RUNTIME_DIR") + "/" }

  function start() {
    make.command = ["/usr/bin/bash", "-c", 'umask 077; mkdir -p -- "$1" && printf "%s" "$2" > "$1/payload" && printf x > "$1/other"',
                    "nodi-carried-test", test.dir, "{\"q\": \"merger notes\"} வணக்கம்\n"]
    make.running = true
  }

  Process {
    id: make
    onExited: {
      check(carried.read("@file:" + test.dir + "/payload") === "{\"q\": \"merger notes\"} வணக்கம்\n", "the payload, read at once and whole")
      check(slashed.read("@file:" + test.dir + "/payload") === "{\"q\": \"merger notes\"} வணக்கம்\n", "a runtime folder named with a trailing slash")
      check(carried.read("plain words") === "plain words", "an argument is itself")
      check(carried.read("") === "", "nothing is nothing")
      check(carried.read("@file:" + test.dir + "/other") === null, "another name in the folder: not read")
      check(carried.read("@file:/etc/passwd") === null, "a path outside: not read")
      check(carried.read("@file:" + test.dir + "/../payload") === null, "a way out of the folder: not read")
      check(carried.read("@file:" + carried.runtimeDir + "/nodi-ipc.missing/payload") === "", "gone: nothing")
      clean.running = true
    }
  }
  Process {
    id: clean
    command: ["/usr/bin/rm", "-rf", "--", test.dir]
    onExited: test.done(test.failures.length === 0, test.failures.join("; "))
  }
}
