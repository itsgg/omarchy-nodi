#!/usr/bin/bash -p
# Runs tests/qml/*Test.qml inside Quickshell, for the components that need
# its types (a Reader is a Quickshell Process). Each test is an Item with
# `signal done(bool ok, string report)` and `function start()`, called once
# `done` is connected, so a test that finishes at once is still heard
# (codex 2026-10-04); nothing it makes is a window, so
# nothing appears on the screen and no hotkey is bound. A private X server
# keeps Qt off the user's compositor. The tests that make Nodi's own window
# need layer-shell, which Qt's X platform lacks: they run in a second
# Quickshell on a private headless sway (WLR_BACKENDS=headless, its own
# runtime directory, no Xwayland), never the user's compositor, and are
# skipped when sway is not installed.
set -euo pipefail
PATH=/usr/bin:/bin
# A variable of the shell's that no agent Ask starts may see unless named
# (tests/qml/AskActsTest.qml closed).
NODI_TEST_INHERITED=leak
export PATH NODI_TEST_INHERITED

root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
shell=${OMARCHY_PATH:-/usr/share/omarchy}/shell
command -v qs >/dev/null || { echo "qs-test: qs not found"; exit 1; }
command -v Xvfb >/dev/null || { echo "qs-test: Xvfb not found"; exit 1; }

work=$(mktemp -d -p "${XDG_RUNTIME_DIR:-/tmp}" nodi-qstest.XXXXXX)
pid=""
display_pid=""
sway_pid=""
stop_qs() {
  if [[ -n $pid ]] && kill "$pid" 2>/dev/null; then
    for _ in 1 2 3 4 5 6 7 8 9 10; do kill -0 "$pid" 2>/dev/null || break; sleep 0.2; done
    kill -9 "$pid" 2>/dev/null || true
  fi
  pid=""
}
cleanup() {
  stop_qs
  [[ -z $display_pid ]] || kill "$display_pid" 2>/dev/null || true
  if [[ -n $sway_pid ]] && kill "$sway_pid" 2>/dev/null; then
    for _ in 1 2 3 4 5 6 7 8 9 10; do kill -0 "$sway_pid" 2>/dev/null || break; sleep 0.2; done
    kill -9 "$sway_pid" 2>/dev/null || true
  fi
  rm -rf -- "$work"
}
trap cleanup EXIT
mkdir -m 700 "$work/runtime"

for m in Commons Ui services; do [[ -e $shell/$m ]] && ln -s "$shell/$m" "$work/$m"; done
files=()
wayland=()
skipped=()
have_sway=""
[[ -x /usr/bin/sway ]] && have_sway=1
# These instantiate Nodi's layer-shell window, which Qt's private X platform
# cannot create: they run on the private sway.
wants_wayland() {
  case $1 in Nodi*Test.qml) return 0 ;; esac
  return 1
}
add_test() {
  if ! wants_wayland "${1##*/}"; then files+=("\"file://$1\"")
  elif [[ -n $have_sway ]]; then wayland+=("\"file://$1\"")
  else skipped+=("${1#"$root/"}")
  fi
}
shopt -s nullglob
if [[ -n ${NODI_QML_TEST:-} ]]; then
  add_test "$root/tests/qml/$NODI_QML_TEST"
else
  for f in "$root"/tests/qml/*Test.qml; do add_test "$f"; done
fi
shopt -u nullglob
(( ${#files[@]} + ${#wayland[@]} )) || { echo "qs-test: no tests"; for f in "${skipped[@]}"; do echo "skip $f (sway not installed)"; done; exit 0; }

# The runner for one Quickshell: it loads `files` one after another.
write_shell() {
  local list
  list=$(IFS=,; echo "${*}")
  cat <<QML
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
}

# Waits for the Quickshell started as $pid to say it is done, then stops it;
# its output is $1. Three minutes, or ten when real agents are asked
# (tests/qml/AgentsLiveTest.qml).
wait_qs() {
  local limit=1800
  [[ -z ${NODI_TEST_AGENTS:-} ]] || limit=6000
  for _ in $(seq 1 "$limit"); do
    grep -q "NODI-TEST done" "$1" 2>/dev/null && break
    kill -0 "$pid" 2>/dev/null || break
    sleep 0.1
  done
  stop_qs
  grep -q "NODI-TEST done" "$1" || { echo "qs-test: Quickshell did not finish"; tail -20 "$1"; exit 1; }
}

pipewire=${PIPEWIRE_RUNTIME_DIR:-${XDG_RUNTIME_DIR:-}}
: >"$work/out"
if (( ${#files[@]} )); then
  write_shell "${files[@]}" >"$work/shell.qml"
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
  env -u WAYLAND_DISPLAY -u HYPRLAND_INSTANCE_SIGNATURE -u SWAYSOCK -u I3SOCK \
    DISPLAY="$display" QT_QPA_PLATFORM=xcb XDG_RUNTIME_DIR="$work/runtime" \
    PIPEWIRE_RUNTIME_DIR="$pipewire" \
    qs --no-color -p "$work/shell.qml" >"$work/out.x" 2>&1 &
  pid=$!
  wait_qs "$work/out.x"
  cat "$work/out.x" >>"$work/out"
fi
if (( ${#wayland[@]} )); then
  # A copy, as the file capability a packaged sway carries cannot be raised
  # in a container (.github/workflows/test.yml). Headless, with no input
  # devices and no Xwayland, in a runtime directory of its own: it opens
  # no display, and nothing of the user's session can reach it.
  install -m 700 /usr/bin/sway "$work/sway"
  printf 'xwayland disable\noutput * mode 1280x720\n' >"$work/sway.conf"
  mkdir -m 700 "$work/wl"
  env -u WAYLAND_DISPLAY -u DISPLAY -u HYPRLAND_INSTANCE_SIGNATURE -u SWAYSOCK -u I3SOCK \
    XDG_RUNTIME_DIR="$work/wl" WLR_BACKENDS=headless WLR_RENDERER=pixman WLR_LIBINPUT_NO_DEVICES=1 \
    "$work/sway" -c "$work/sway.conf" >"$work/sway.log" 2>&1 &
  sway_pid=$!
  socket=""
  for _ in {1..100}; do
    for c in "$work/wl"/wayland-*; do [[ -S $c ]] && { socket=${c##*/}; break 2; }; done
    kill -0 "$sway_pid" 2>/dev/null || break
    sleep 0.05
  done
  [[ -n $socket ]] || { echo "qs-test: sway did not start"; cat "$work/sway.log"; exit 1; }
  # Each in a Quickshell of its own: each makes a whole bar, and a second
  # bar in one shell held up the timers of the test beside it (measured:
  # NodiAgentsTest and NodiAskStatusTest pass alone, time out after another).
  for t in "${wayland[@]}"; do
    write_shell "$t" >"$work/shell-wayland.qml"
    env -u DISPLAY -u HYPRLAND_INSTANCE_SIGNATURE -u SWAYSOCK -u I3SOCK \
      WAYLAND_DISPLAY="$socket" QT_QPA_PLATFORM=wayland XDG_RUNTIME_DIR="$work/wl" \
      PIPEWIRE_RUNTIME_DIR="$pipewire" \
      qs --no-color -p "$work/shell-wayland.qml" >"$work/out.wl" 2>&1 &
    pid=$!
    wait_qs "$work/out.wl"
    cat "$work/out.wl" >>"$work/out"
  done
fi
sed -n "s#^.*NODI-TEST \(pass\|fail\) file://$root/#\1 #p" "$work/out"
for f in "${skipped[@]}"; do echo "skip $f (sway not installed)"; done
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
