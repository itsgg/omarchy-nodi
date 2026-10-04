#!/usr/bin/bash -p
# Compiles every QML file of Nodi in Quickshell itself, the engine the shell
# loads it with. Nothing is created, so no window opens, no reader runs and
# no hotkey is bound; it connects to the session's Wayland display only
# because PanelWindow needs that backend to compile. qmllint passed a file
# this rejects ("Expected type name": a JavaScript import named Keys hid
# QtQuick's attached Keys, 2026-10-02), so `make check` runs both.
#
# Quickshell has no quit call a config can make: the check prints a last
# line and is then stopped by its own pid.
set -euo pipefail
PATH=/usr/bin:/bin
export PATH

root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
shell=${OMARCHY_PATH:-/usr/share/omarchy}/shell
command -v qs >/dev/null || { echo "compile-check: qs not found, skipped"; exit 0; }

work=$(mktemp -d -p "${XDG_RUNTIME_DIR:-/tmp}" nodi-compile.XXXXXX)
pid=""
# A qs wedged in a compile may ignore TERM: it gets two seconds, then KILL.
cleanup() {
  if [[ -n $pid ]] && kill "$pid" 2>/dev/null; then
    for _ in 1 2 3 4 5 6 7 8 9 10; do kill -0 "$pid" 2>/dev/null || break; sleep 0.2; done
    kill -9 "$pid" 2>/dev/null || true
  fi
  rm -rf -- "$work"
}
trap cleanup EXIT

# The shell's own modules under qs, as the running shell has them.
for m in Commons Ui services; do [[ -e $shell/$m ]] && ln -s "$shell/$m" "$work/$m"; done

files=()
for f in "$root"/Nodi.qml "$root"/components/*.qml; do files+=("\"file://$f\""); done
list=$(IFS=,; echo "${files[*]}")

cat > "$work/shell.qml" <<QML
import Quickshell
import QtQuick

ShellRoot {
  Component.onCompleted: {
    var files = [$list]
    for (var i = 0; i < files.length; i++) {
      var c = Qt.createComponent(files[i], Component.PreferSynchronous)
      console.warn("NODI-COMPILE " + (c.status === Component.Ready ? "ok " : "error ") + files[i] + (c.status === Component.Ready ? "" : " " + c.errorString().replace(/\n/g, " ")))
    }
    console.warn("NODI-COMPILE done")
  }
}
QML

[[ -n ${WAYLAND_DISPLAY:-} ]] || { echo "compile-check: no Wayland display, skipped"; exit 0; }
qs --no-color -p "$work/shell.qml" >"$work/out" 2>&1 &
pid=$!
for _ in $(seq 1 100); do
  grep -q "NODI-COMPILE done" "$work/out" 2>/dev/null && break
  kill -0 "$pid" 2>/dev/null || break
  sleep 0.2
done

if ! grep -q "NODI-COMPILE done" "$work/out"; then
  echo "compile-check: Quickshell did not finish"; tail -20 "$work/out"; exit 1
fi
errors=$(grep "NODI-COMPILE error" "$work/out" | sed "s#file://$root/##g; s#^.*NODI-COMPILE error ##" || true)
if [[ -n $errors ]]; then
  echo "$errors"
  exit 1
fi
echo "compile-check: $(grep -c "NODI-COMPILE ok" "$work/out") files compile in Quickshell"
