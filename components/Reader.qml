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
  // A read that can be cancelled (a script filter's run that a newer
  // keystroke replaced) is ended with the program and all it started.
  property bool cancelable: false
  // A read that streams (an answer, providers/answers.js): what the program
  // prints is handed on as it arrives, `chunk`, not split into lines, and
  // kept whole in `collected` too.
  property bool streaming: false
  // The end of what the program wrote to stderr in this run, and its last
  // line, for saying why it failed. Read as it arrives and only the end
  // kept, so nothing on stderr is held whole, a line with no newline
  // included.
  property string errorTail: ""
  readonly property string errorLine: {
    var lines = reader.errorTail.split("\n").filter(function(l) { return l.trim() !== "" })
    return lines.length ? lines[lines.length - 1].trim().slice(0, 300) : ""
  }
  // Its own flag, not proc.running: a Process reports running only once it
  // has started, so a second run() straight after the first saw it idle and
  // replaced the first one's command (found by tests/qml/RequestsTest.qml).
  property bool active: false
  readonly property bool busy: active

  signal finished(string text, bool ok, var tag)
  signal chunk(string data, var tag)

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
    reader.errorTail = ""
    reader.overflowed = false
    reader.timedOut = false
    proc.environment = reader.environment()
    proc.command = Sources.limited(argv, reader.timeoutMs, reader.maxBytes, reader.streaming)
    proc.running = true
    deadline.restart()
  }

  // Ends the running read, and what it started: TERM to the children of the
  // wrapper (Sources.limited), chosen by parent pid. One is timeout(1),
  // which forwards it to its own process group, the program and all it
  // started; the other is the output's reader. A TERM to the wrapper's group
  // missed both, as timeout makes a group of its own (tests/qml/RequestsTest.qml).
  // The read then ends as failed, its tag saying it was cancelled. Said
  // again every 50 ms until it has ended: a read cancelled as it starts may
  // not have started its children yet.
  function cancel() {
    if (!reader.active || !reader.cancelable) return
    if (reader.tag) reader.tag.cancelled = true
    cancelling.start()
    cancelling.triggered()
  }

  Timer {
    id: cancelling
    interval: 50
    repeat: true
    onTriggered: {
      if (!reader.active) { stop(); return }
      if (proc.processId > 0) Quickshell.execDetached(["/usr/bin/pkill", "-TERM", "-P", String(proc.processId)])
    }
  }

  Process {
    id: proc
    clearEnvironment: true
    stdout: SplitParser {
      splitMarker: reader.streaming ? "" : "\n"
      onRead: function(data) {
        if (reader.overflowed) return
        var piece = reader.streaming ? data : data + "\n"
        if (reader.collected.length + piece.length > reader.maxBytes) {
          reader.overflowed = true
          proc.running = false
          return
        }
        reader.collected += piece
        if (reader.streaming) reader.chunk(data, reader.tag)
      }
    }
    stderr: SplitParser {
      splitMarker: ""
      onRead: function(data) { reader.errorTail = (reader.errorTail + data).slice(-600) }
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
    cancelling.stop()
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
