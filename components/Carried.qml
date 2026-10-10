import QtQuick
import Quickshell
import Quickshell.Io

// What bin/nodi hands the bar through a file rather than an IPC argument,
// which another local user can read in /proc while the call runs: an
// agent's messages and searches, a row's key (the marketplace's review of
// f444138, 2026-10-10). bin/nodi writes the text in a folder of its own,
// mktemp -d under $XDG_RUNTIME_DIR, so 0700, and passes "@file:<path>";
// read() gives the text, the argument itself for anything else, and null
// for a path in no such folder, which is never read.
Item {
  id: carried
  visible: false

  property string runtimeRoot: Quickshell.env("XDG_RUNTIME_DIR") || "/tmp"
  // With no trailing slash, as bin/nodi writes it (Fable 2026-10-10).
  readonly property string runtimeDir: String(runtimeRoot).replace(/\/+$/, "") || "/"

  FileView { id: file; blockLoading: true; blockAllReads: true; printErrors: false }

  function read(arg) {
    var s = String(arg === undefined || arg === null ? "" : arg)
    if (s.indexOf("@file:") !== 0) return s
    var p = s.slice(6)
    var dir = p.slice(0, p.lastIndexOf("/"))
    if (dir.slice(0, carried.runtimeDir.length + 1) !== carried.runtimeDir + "/" || !/^nodi-ipc\.[A-Za-z0-9]+$/.test(dir.slice(carried.runtimeDir.length + 1))
        || p.slice(dir.length + 1) !== "payload") return null
    file.path = p
    var text = String(file.text() || "")
    file.path = ""
    return text
  }
}
