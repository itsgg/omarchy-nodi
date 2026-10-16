#!/usr/bin/bash -p
# Runs tests/qml/*Test.qml inside Quickshell, for the components that need
# its types (a Reader is a Quickshell Process). Each test is an Item with
# `signal done(bool ok, string report)` and `function start()`, called once
# `done` is connected, so a test that finishes at once is still heard
# (codex 2026-10-04); nothing it makes is a window, so
# nothing appears on the screen and no hotkey is bound. A private X server
# keeps Qt off the user's compositor.
set -euo pipefail
PATH=/usr/bin:/bin
# A variable of the shell's that no agent Ask starts may see unless named
# (tests/qml/AskActsTest.qml closed).
NODI_TEST_INHERITED=leak
export PATH NODI_TEST_INHERITED

root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
shell=${OMARCHY_PATH:-/usr/share/omarchy}/shell
command -v qs >/dev/null || { echo "qs-test: qs not found, skipped"; exit 0; }
command -v Xvfb >/dev/null || { echo "qs-test: Xvfb not found, skipped"; exit 0; }

work=$(mktemp -d -p "${XDG_RUNTIME_DIR:-/tmp}" nodi-qstest.XXXXXX)
pid=""
display_pid=""
cleanup() {
  if [[ -n $pid ]] && kill "$pid" 2>/dev/null; then
    for _ in 1 2 3 4 5 6 7 8 9 10; do kill -0 "$pid" 2>/dev/null || break; sleep 0.2; done
    kill -9 "$pid" 2>/dev/null || true
  fi
  [[ -z $display_pid ]] || kill "$display_pid" 2>/dev/null || true
  rm -rf -- "$work"
}
trap cleanup EXIT
mkdir -m 700 "$work/runtime"

for m in Commons Ui services; do [[ -e $shell/$m ]] && ln -s "$shell/$m" "$work/$m"; done
files=()
skipped=()
shopt -s nullglob
for f in "$root"/tests/qml/*Test.qml; do
  case ${f##*/} in
    NodiAgentsTest.qml|NodiAskStatusTest.qml|NodiHomeExecutionTest.qml)
      # These instantiate Nodi's layer-shell window, which Qt's private X
      # platform cannot create. Their logic remains covered by JS and the
      # focused components; run them in a disposable VM for Wayland coverage.
      skipped+=("${f#"$root/"}")
      ;;
    *) files+=("\"file://$f\"") ;;
  esac
done
shopt -u nullglob
if [[ -n ${NODI_QML_TEST:-} ]]; then
  files=("\"file://$root/tests/qml/$NODI_QML_TEST\"")
  skipped=()
fi
(( ${#files[@]} )) || { echo "qs-test: no tests"; exit 0; }
list=$(IFS=,; echo "${files[*]}")

cat > "$work/shell.qml" <<QML
import Quickshell
import QtQuick

ShellRoot {
  property var files: [$list]
  property int nextFile: 0

  function startNext() {
    if (nextFile >= files.length) {
      console.warn("NODI-TEST done")
      return
    }
    var name = files[nextFile++]
    var c = Qt.createComponent(name, Component.PreferSynchronous)
    if (c.status !== Component.Ready) {
      console.warn("NODI-TEST fail " + name + " " + c.errorString().replace(/\n/g, " "))
      Qt.callLater(startNext)
      return
    }
    var t = c.createObject(null)
    if (!t) {
      console.warn("NODI-TEST fail " + name + " could not be created")
      Qt.callLater(startNext)
      return
    }
    t.done.connect(function(ok, report) {
      console.warn("NODI-TEST " + (ok ? "pass " : "fail ") + name + (ok ? "" : " " + report))
      t.destroy()
      Qt.callLater(startNext)
    })
    if (typeof t.start === "function") t.start()
    else {
      console.warn("NODI-TEST fail " + name + " has no start()")
      t.destroy()
      Qt.callLater(startNext)
    }
  }
  Component.onCompleted: startNext()
}
QML

exec 4>"$work/display"
Xvfb -displayfd 4 -nolisten tcp -screen 0 1280x720x24 >"$work/xvfb.log" 2>&1 &
display_pid=$!
for _ in {1..100}; do
  [[ -s $work/display ]] && break
  kill -0 "$display_pid" 2>/dev/null || break
  sleep 0.05
done
[[ -s $work/display ]] || { echo "qs-test: Xvfb did not start"; cat "$work/xvfb.log"; exit 1; }
display=":$(<"$work/display")"
pipewire=${PIPEWIRE_RUNTIME_DIR:-${XDG_RUNTIME_DIR:-}}

env -u WAYLAND_DISPLAY -u HYPRLAND_INSTANCE_SIGNATURE -u SWAYSOCK -u I3SOCK \
  DISPLAY="$display" QT_QPA_PLATFORM=xcb XDG_RUNTIME_DIR="$work/runtime" \
  PIPEWIRE_RUNTIME_DIR="$pipewire" \
  qs --no-color -p "$work/shell.qml" >"$work/out" 2>&1 &
pid=$!
# Three minutes, or ten when real agents are asked (tests/qml/AgentsLiveTest.qml).
limit=1800
[[ -z ${NODI_TEST_AGENTS:-} ]] || limit=6000
for _ in $(seq 1 "$limit"); do
  grep -q "NODI-TEST done" "$work/out" 2>/dev/null && break
  kill -0 "$pid" 2>/dev/null || break
  sleep 0.1
done
grep -q "NODI-TEST done" "$work/out" || { echo "qs-test: Quickshell did not finish"; tail -20 "$work/out"; exit 1; }
sed -n "s#^.*NODI-TEST \(pass\|fail\) file://$root/#\1 #p" "$work/out"
for f in "${skipped[@]}"; do echo "skip $f (requires a disposable Wayland VM)"; done
# NODI_TEST_LOG=1 shows what the tests printed besides their verdicts.
[[ -z ${NODI_TEST_LOG:-} ]] || grep -v "NODI-TEST" "$work/out" | grep "NODI-" | sed 's/^.*\(NODI-\)/\1/'
[[ -z ${NODI_TEST_ALL:-} ]] || cat "$work/out"
# A binding loop fails the run too: Qt only warns, and goes on with the
# property's last value (components/PaneRead.qml, 2026-10-07).
if grep -q "Binding loop detected" "$work/out"; then
  echo "qs-test: a binding loop:"; grep "Binding loop detected" "$work/out" | sed "s#^.*\(QML\)#\1#" | sort -u
  exit 1
fi
! grep -q "NODI-TEST fail" "$work/out"
