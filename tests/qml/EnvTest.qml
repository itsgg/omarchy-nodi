import QtQuick
import Quickshell
import "../../components"

// What a program Nodi reads from sees of the environment (components/Reader.qml):
// the variables it names and the PATH it is given, nothing else of the
// shell's, which runs with the whole session's (Akshi's check 2026-10-05:
// the list was tested nowhere). bash adds PWD, SHLVL and _ for the wrapper.
// Run by tools/qs-test.sh inside Quickshell.
Item {
  id: test
  signal done(bool ok, string report)
  property var failures: []

  function check(cond, what) { if (!cond) test.failures.push(what) }

  readonly property var allowed: ["HOME", "PATH", "OMARCHY_PATH", "LANG", "USER", "XDG_RUNTIME_DIR", "WAYLAND_DISPLAY",
                                  "HYPRLAND_INSTANCE_SIGNATURE", "DBUS_SESSION_BUS_ADDRESS", "PWD", "SHLVL", "_"]

  Reader {
    id: reader
    extraEnvironment: ({ PATH: "/nodi/test/bin:/usr/bin:/bin" })
    onFinished: function(text, ok) {
      check(ok, "env ran")
      var seen = {}
      text.split("\n").forEach(function(line) { var i = line.indexOf("="); if (i > 0) seen[line.slice(0, i)] = line.slice(i + 1) })
      var names = Object.keys(seen)
      var extra = names.filter(function(n) { return test.allowed.indexOf(n) === -1 })
      check(extra.length === 0, "only the named variables reach a program: " + extra.join(","))
      check(seen.PATH === "/nodi/test/bin:/usr/bin:/bin", "the PATH it was given: " + seen.PATH)
      check(seen.LANG === "C.UTF-8", "LANG is C.UTF-8: " + seen.LANG)
      check(!!seen.HOME && seen.HOME === Quickshell.env("HOME"), "HOME is the session's")
      // The shell's own environment has these, and none may pass.
      ;["SHELL", "TERM", "EDITOR", "DISPLAY", "XDG_SESSION_TYPE", "QT_QPA_PLATFORM"].forEach(function(n) {
        if (Quickshell.env(n)) check(seen[n] === undefined, n + " does not reach a program")
      })
      test.done(test.failures.length === 0, test.failures.join("; "))
    }
  }

  function start() { reader.run(["/usr/bin/env"], null) }
}
