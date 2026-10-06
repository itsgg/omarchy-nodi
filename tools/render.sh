#!/usr/bin/bash -p
# Draws Nodi's card for each scene in tools/render/scenes.mjs and writes
# PNGs, on Qt's offscreen platform: nothing appears on the screen. The card
# is the real components/Card.qml with the bar's own Look; the shell's
# Color and Style are stand-ins (tools/render/stubs) fed by the live theme
# (tools/render/theme.mjs), and Border and BorderSurface are the shell's
# own files. Usage: tools/render.sh [out-dir]   (default: shots/)
# NODI_SCREEN=1536x960 and NODI_BASE_SIZE=20 draw for that screen at that
# text size; any card that would run off the screen fails the run.
# NODI_CONTRAST=high draws as under the desktop's higher contrast.
set -euo pipefail
node=$(command -v node || true)   # mise's, not on the path below
[[ -n $node ]] || { echo "render: node not found"; exit 1; }
PATH=/usr/bin:/bin
export PATH
command -v qml6 >/dev/null || { echo "render: qml6 not found (qt6-declarative)"; exit 1; }

root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
shell=${OMARCHY_PATH:-/usr/share/omarchy}/shell
out=$(realpath -m -- "${1:-$root/shots}")
mkdir -p -- "$out"

work=$(mktemp -d -p "${XDG_RUNTIME_DIR:-/tmp}" nodi-render.XXXXXX)
trap 'rm -rf -- "$work"' EXIT

# qs.Commons and qs.Ui as the card imports them.
mkdir -p "$work/qs/Commons" "$work/qs/Ui"
cp "$root/tools/render/stubs/Color.qml" "$root/tools/render/stubs/Style.qml" "$root/tools/render/stubs/Util.qml" "$work/qs/Commons/"
ln -s "$shell/Commons/Border.qml" "$work/qs/Commons/Border.qml"
ln -s "$shell/Commons/BorderGeometry.js" "$work/qs/Commons/BorderGeometry.js"
printf 'module qs.Commons\nsingleton Color 1.0 Color.qml\nsingleton Style 1.0 Style.qml\nsingleton Util 1.0 Util.qml\nsingleton Border 1.0 Border.qml\n' > "$work/qs/Commons/qmldir"
ln -s "$shell/Ui/BorderSurface.qml" "$work/qs/Ui/BorderSurface.qml"
ln -s "$shell/Ui/BorderOverlay.qml" "$work/qs/Ui/BorderOverlay.qml"
printf 'module qs.Ui\nBorderSurface 1.0 BorderSurface.qml\nBorderOverlay 1.0 BorderOverlay.qml\n' > "$work/qs/Ui/qmldir"

"$node" "$root/tools/render/theme.mjs" > "$work/qs/Commons/Theme.js"
"$node" "$root/tools/render/scenes.mjs" > "$work/scenes.js"
ln -s "$root/components" "$work/components"
ln -s "$root/lib" "$work/lib"
cp "$root/tools/render/Harness.qml" "$work/Harness.qml"
cp "$root/tools/render/FakeNodi.qml" "$work/FakeNodi.qml"

# The card under QtTest's mouse instead (NODI_UI=1, ROADMAP 74): each
# tests/ui/tst_*.qml beside the harness, so it imports the components and
# FakeNodi as the harness does, run by qmltestrunner offscreen.
if [[ -n ${NODI_UI:-} ]]; then
  mkdir -p "$work/ui"
  cp "$root"/tests/ui/tst_*.qml "$work/ui/"
  status=0
  QT_QPA_PLATFORM=offscreen QT_FORCE_STDERR_LOGGING=1 timeout 120 /usr/lib/qt6/bin/qmltestrunner -import "$work" -input "$work/ui" >"$work/uilog" 2>&1 || status=$?
  sed "s#file://$work/##g" "$work/uilog" | grep -E "^(PASS|FAIL|XFAIL|XPASS|SKIP|Totals)|Actual|Expected|Loc:|Error|TypeError" || true
  # A warning a test let pass is a failure all the same.
  if grep -qE "TypeError|ReferenceError|Binding loop|is not a type" "$work/uilog"; then status=1; fi
  exit $status
fi

# Every scene drawn this run, or a failure: the pictures of an earlier run
# go first, so `make docs` cannot copy one a crash left behind (Fable
# 2026-10-04).
# An input method instead (ROADMAP 76): fcitx5 composing into the real
# card (tests/ime/Ime.qml) on a private X server and D-Bus, its config,
# data and runtime directories its own, while tools/xkeys.py types
# Ctrl+Shift+U, a code point and Space; what the card saw goes to
# <out-dir>/ime.txt.
if [[ -n ${NODI_IME:-} ]]; then
  run="$work/run"
  mkdir -m 700 "$run" "$work/config" "$work/data" "$work/cache"
  mkdir -p "$work/ime" && cp "$root/tests/ime/Ime.qml" "$work/ime/Ime.qml"
  exec 4>"$work/display"
  Xvfb -displayfd 4 -nolisten tcp -screen 0 1200x500x24 >"$work/xvfb.log" 2>&1 &
  xvfb=$!
  trap 'kill "$xvfb" 2>/dev/null || true; rm -rf -- "$work"' EXIT
  for _ in $(seq 1 50); do [[ -s $work/display ]] && break; sleep 0.1; done
  env -i HOME="$HOME" PATH="$PATH" LANG=C.UTF-8 XDG_RUNTIME_DIR="$run" XDG_CONFIG_HOME="$work/config" XDG_DATA_HOME="$work/data" \
    XDG_CACHE_HOME="$work/cache" DISPLAY=":$(head -n1 "$work/display")" QT_QPA_PLATFORM=xcb QT_IM_MODULE=fcitx XMODIFIERS=@im=fcitx \
    QT_FORCE_STDERR_LOGGING=1 dbus-run-session -- /usr/bin/bash -c '
      fcitx5 --disable=wayland,waylandim,notificationitem,kimpanel,clipboard >"$1/fcitx.log" 2>&1 &
      sleep 2
      timeout 30 qml6 -I "$1" "$1/ime/Ime.qml" >"$1/log" 2>&1 &
      q=$!
      sleep 2
      timeout 20 /usr/bin/python3 -I "$2" "$DISPLAY" nodi-ime ctrl+shift+u text:0b85 space sleep:0.3 text:x sleep:0.5 >"$1/keys.log" 2>&1
      sleep 0.5
      kill "$q" 2>/dev/null; wait "$q" 2>/dev/null; true' nodi-ime "$work" "$root/tools/xkeys.py" >/dev/null 2>&1 || true
  sed -n 's/.*STATE //p' "$work/log" >"$out/ime.txt"
  cp "$work/log" "$out/ime-harness.log"
  # Qt looking for an accessibility registry this session has none of is
  # the session's, not the card's.
  problems=$(grep -E "Error|TypeError|ReferenceError|is not a type|Binding loop|xkeys:" "$work/log" "$work/keys.log" | grep -v "qt.accessibility.atspi" | sed "s#file://$work/##g" | sort -u || true)
  if [[ -n $problems ]]; then echo "$problems"; fi
  echo "ime: $(wc -l < "$out/ime.txt") changes seen, in $out/ime.txt"
  [[ -z $problems ]]
  exit
fi

# A screen reader's view instead (item 71): the scenes NODI_A11Y names,
# on a private X server, D-Bus and accessibility bus, under a runtime
# directory of their own (the at-spi launcher names its sockets by it: one
# shared with the session took over the session's own bus, 2026-10-05).
# What tools/a11y-walk.py heard goes to <out-dir>/a11y.txt.
if [[ -n ${NODI_A11Y:-} ]]; then
  run="$work/run"
  mkdir -m 700 "$run"
  exec 4>"$work/display"
  Xvfb -displayfd 4 -nolisten tcp -screen 0 1600x1000x24 >"$work/xvfb.log" 2>&1 &
  xvfb=$!
  trap 'kill "$xvfb" 2>/dev/null || true; rm -rf -- "$work"' EXIT
  for _ in $(seq 1 50); do [[ -s $work/display ]] && break; sleep 0.1; done
  display=":$(head -n1 "$work/display")"
  env -i HOME="$HOME" PATH="$PATH" LANG=C.UTF-8 XDG_RUNTIME_DIR="$run" DISPLAY="$display" \
    QT_QPA_PLATFORM=xcb QT_LINUX_ACCESSIBILITY_ALWAYS_ON=1 QT_FORCE_STDERR_LOGGING=1 \
    dbus-run-session -- /usr/bin/bash -c '
      /usr/lib/at-spi-bus-launcher --launch-immediately >/dev/null 2>&1 &
      sleep 0.5
      # Its bus would start the registry through systemd, which this
      # session has none of.
      /usr/lib/at-spi2-registryd >/dev/null 2>&1 &
      sleep 0.3
      timeout 60 qml6 -I "$1" "$1/Harness.qml" -- "$2" "a11y=$3" /dev/null >"$1/log" 2>&1 &
      h=$!
      timeout 70 /usr/bin/python3 -I "$4" "$1/log" "$h" >"$5/a11y.txt"
      wait "$h" || true' nodi-a11y "$work" "${NODI_SCREEN:-1920x1200}" "$NODI_A11Y" "$root/tools/a11y-walk.py" "$out" || true
  kill "$xvfb" 2>/dev/null || true
  cp "$work/log" "$out/a11y-harness.log"
  problems=$(grep -E "Error|TypeError|ReferenceError|is not a type|Binding loop" "$work/log" | sed "s#file://$work/##g" | sort -u || true)
  if [[ -n $problems ]]; then echo "$problems"; fi
  echo "a11y: $(grep -c '^SCENE ' "$out/a11y.txt" || true) scenes heard, in $out/a11y.txt"
  [[ -z $problems ]]
  exit
fi

want=$("$node" -e 'const t = require("fs").readFileSync(process.argv[1], "utf8"); console.log(JSON.parse(t.slice(t.indexOf("=") + 1)).length)' "$work/scenes.js")
rm -f -- "$out"/*.png
QT_QPA_PLATFORM=offscreen QT_FORCE_STDERR_LOGGING=1 timeout 120 qml6 -I "$work" "$work/Harness.qml" -- "contrast=${NODI_CONTRAST:-}" "${NODI_SCREEN:-1920x1200}" "$out" >"$work/log" 2>&1 || true
shots=$(grep -c "SHOT " "$work/log" || true)
# A card that would run off the screen it is drawn for (item 70).
off=$(sed -n 's/.*SHOT \([^ ]*\) \([1-9][0-9]*\)$/\1 runs \2 px off the screen/p' "$work/log")
if [[ -n $off ]]; then echo "$off" | sed "s/^/render (${NODI_SCREEN:-1920x1200}, text ${NODI_BASE_SIZE:-as set}): /"; fi
problems=$(grep -E "Error|error|TypeError|ReferenceError|is not a type|Cannot|Unable|not found|undefined|Binding loop|anchor loop" "$work/log" | sed "s#file://$work/##g" | sort -u || true)
if [[ -n $problems ]]; then echo "$problems"; fi
if [[ $shots -ne $want ]]; then tail -20 "$work/log" | sed "s#file://$work/##g"; fi
echo "render: $shots of $want shots in $out"
[[ -z $problems && -z $off && $shots -eq $want ]]
