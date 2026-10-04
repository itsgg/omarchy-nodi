import QtQuick
import Quickshell
import Quickshell.Io
import "../lib/Sources.js" as Sources

// Runs one program Nodi reads from, and hands back what it printed. Every
// reader goes through here, so each has the same three limits: a cleared
// environment with only the variables named below, a deadline, and a cap on
// what it may print, the last two enforced outside Quickshell by
// Sources.limited(). The actions a person chooses are started elsewhere, with
// the session's environment, as Omarchy's own menu starts them (lib/Run.js).
//
// A run asked for while one is going waits and starts when it ends, so a
// slow reader is never stacked. Each run carries a tag (the path listed, the
// menu order the guards index into), and `finished` hands back the tag of
// the run that produced the text, never the one waiting behind it.
Item {
  id: reader
  visible: false

  property int timeoutMs: 5000
  property int maxBytes: 1048576
  property var extraEnvironment: ({})
  // Its own flag, not proc.running: a Process reports running only once it
  // has started, so a second run() straight after the first saw it idle and
  // replaced the first one's command (found by tests/qml/RequestsTest.qml).
  property bool active: false
  readonly property bool busy: active

  signal finished(string text, bool ok, var tag)

  property string collected: ""
  property bool overflowed: false
  property bool timedOut: false
  property var queued: null
  property var tag: null

  readonly property string omarchyPath: Quickshell.env("OMARCHY_PATH") || "/usr/share/omarchy"

  // What a reader needs to reach Hyprland, PipeWire, the shell's IPC and
  // Omarchy's own commands, and nothing else from the shell's environment.
  function environment() {
    var env = { HOME: Quickshell.env("HOME"), PATH: omarchyPath + "/bin:/usr/local/bin:/usr/bin:/bin", OMARCHY_PATH: omarchyPath, LANG: "C.UTF-8" }
    var pass = ["USER", "XDG_RUNTIME_DIR", "WAYLAND_DISPLAY", "HYPRLAND_INSTANCE_SIGNATURE", "DBUS_SESSION_BUS_ADDRESS"]
    for (var i = 0; i < pass.length; i++) {
      var v = Quickshell.env(pass[i])
      if (v) env[pass[i]] = v
    }
    for (var k in reader.extraEnvironment) env[k] = reader.extraEnvironment[k]
    return env
  }

  function run(argv, tag) {
    if (reader.active) { reader.queued = { argv: argv, tag: tag }; return }
    reader.active = true
    reader.tag = tag === undefined ? null : tag
    reader.collected = ""
    reader.overflowed = false
    reader.timedOut = false
    proc.environment = reader.environment()
    proc.command = Sources.limited(argv, reader.timeoutMs, reader.maxBytes)
    proc.running = true
    deadline.restart()
  }

  Process {
    id: proc
    clearEnvironment: true
    stdout: SplitParser {
      onRead: function(data) {
        if (reader.overflowed) return
        if (reader.collected.length + data.length + 1 > reader.maxBytes) {
          reader.overflowed = true
          proc.running = false
          return
        }
        reader.collected += data + "\n"
      }
    }
    onExited: function(exitCode, exitStatus) {
      if (exitCode === Sources.OVERFLOW) reader.overflowed = true
      if (exitCode === Sources.TIMEOUT || exitCode === Sources.KILLED) reader.timedOut = true
      reader.ended(exitCode === 0 && exitStatus === 0 && !reader.overflowed && !reader.timedOut)
    }
  }

  // The run is over: say so, then start what waits. The reader stays busy
  // while `finished` is handled, so a run asked for then queues and
  // replaces what waited, the newest ask winning as at any other time; the
  // queue is read when it is drained, never captured before. Capturing it
  // first let a run that waited start after a newer one and replace it,
  // which then stayed pending for ever (codex 2026-10-04).
  function ended(ok) {
    if (!reader.active) return
    deadline.stop()
    reader.finished(reader.collected, ok, reader.tag)
    reader.active = false
    Qt.callLater(reader.drain)
  }

  function drain() {
    if (reader.active || !reader.queued) return
    var next = reader.queued
    reader.queued = null
    reader.run(next.argv, next.tag)
  }

  // A backstop: timeout(1) ends the program first. A process that never
  // started sends no `exited`, so the run is ended here too.
  Timer {
    id: deadline
    interval: reader.timeoutMs + 3000
    onTriggered: {
      reader.timedOut = true
      if (proc.running) proc.running = false
      else reader.ended(false)
    }
  }
}
