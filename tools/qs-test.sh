#!/usr/bin/bash -p
# Runs tests/qml/*Test.qml inside Quickshell, for the components that need
# its types (a Reader is a Quickshell Process). Each test is an Item with
# `signal done(bool ok, string report)` and `function start()`, called once
# `done` is connected, so a test that finishes at once is still heard
# (codex 2026-10-04); nothing it makes is a window, so
# nothing appears on the screen and no hotkey is bound. Like
# compile-check.sh, it uses the session's Wayland display and stops qs by
# its own pid.
set -euo pipefail
PATH=/usr/bin:/bin
export PATH

root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
shell=${OMARCHY_PATH:-/usr/share/omarchy}/shell
command -v qs >/dev/null || { echo "qs-test: qs not found, skipped"; exit 0; }
[[ -n ${WAYLAND_DISPLAY:-} ]] || { echo "qs-test: no Wayland display, skipped"; exit 0; }

work=$(mktemp -d -p "${XDG_RUNTIME_DIR:-/tmp}" nodi-qstest.XXXXXX)
pid=""
cleanup() {
  if [[ -n $pid ]] && kill "$pid" 2>/dev/null; then
    for _ in 1 2 3 4 5 6 7 8 9 10; do kill -0 "$pid" 2>/dev/null || break; sleep 0.2; done
    kill -9 "$pid" 2>/dev/null || true
  fi
  rm -rf -- "$work"
}
trap cleanup EXIT

for m in Commons Ui services; do [[ -e $shell/$m ]] && ln -s "$shell/$m" "$work/$m"; done
files=()
shopt -s nullglob
for f in "$root"/tests/qml/*Test.qml; do files+=("\"file://$f\""); done
shopt -u nullglob
(( ${#files[@]} )) || { echo "qs-test: no tests"; exit 0; }
list=$(IFS=,; echo "${files[*]}")

cat > "$work/shell.qml" <<QML
import Quickshell
import QtQuick

ShellRoot {
  property var files: [$list]
  property int left: files.length
  Component.onCompleted: {
    for (var i = 0; i < files.length; i++) {
      var c = Qt.createComponent(files[i], Component.PreferSynchronous)
      if (c.status !== Component.Ready) { console.warn("NODI-TEST fail " + files[i] + " " + c.errorString().replace(/\n/g, " ")); left--; continue }
      var t = c.createObject(null)
      ;(function(name, t) { t.done.connect(function(ok, report) {
        console.warn("NODI-TEST " + (ok ? "pass " : "fail ") + name + (ok ? "" : " " + report))
        if (--left === 0) console.warn("NODI-TEST done")
      }) })(files[i], t)
      if (typeof t.start === "function") t.start()
      else { console.warn("NODI-TEST fail " + files[i] + " has no start()"); left-- }
    }
    if (left === 0) console.warn("NODI-TEST done")
  }
}
QML

qs --no-color -p "$work/shell.qml" >"$work/out" 2>&1 &
pid=$!
# A minute, or five when real agents are asked (tests/qml/AgentsLiveTest.qml).
limit=600
[[ -z ${NODI_TEST_AGENTS:-} ]] || limit=3000
for _ in $(seq 1 "$limit"); do
  grep -q "NODI-TEST done" "$work/out" 2>/dev/null && break
  kill -0 "$pid" 2>/dev/null || break
  sleep 0.1
done
grep -q "NODI-TEST done" "$work/out" || { echo "qs-test: Quickshell did not finish"; tail -20 "$work/out"; exit 1; }
sed -n "s#^.*NODI-TEST \(pass\|fail\) file://$root/#\1 #p" "$work/out"
# NODI_TEST_LOG=1 shows what the tests printed besides their verdicts.
[[ -z ${NODI_TEST_LOG:-} ]] || grep -v "NODI-TEST" "$work/out" | grep "NODI-" | sed 's/^.*\(NODI-\)/\1/'
[[ -z ${NODI_TEST_ALL:-} ]] || cat "$work/out"
! grep -q "NODI-TEST fail" "$work/out"
