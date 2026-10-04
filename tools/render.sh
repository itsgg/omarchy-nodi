#!/usr/bin/bash -p
# Draws Nodi's card for each scene in tools/render/scenes.mjs and writes
# PNGs, on Qt's offscreen platform: nothing appears on the screen. The card
# is the real components/Card.qml with the bar's own Look; the shell's
# Color and Style are stand-ins (tools/render/stubs) fed by the live theme
# (tools/render/theme.mjs), and Border and BorderSurface are the shell's
# own files. Usage: tools/render.sh [out-dir]   (default: shots/)
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

QT_QPA_PLATFORM=offscreen QT_FORCE_STDERR_LOGGING=1 timeout 120 qml6 -I "$work" "$work/Harness.qml" -- "$out" >"$work/log" 2>&1 || true
shots=$(grep -c "SHOT " "$work/log" || true)
problems=$(grep -E "Error|error|TypeError|ReferenceError|is not a type|Cannot|Unable|not found|undefined|Binding loop|anchor loop" "$work/log" | sed "s#file://$work/##g" | sort -u || true)
if [[ -n $problems ]]; then echo "$problems"; fi
if [[ $shots -eq 0 ]]; then tail -20 "$work/log" | sed "s#file://$work/##g"; fi
echo "render: $shots shots in $out"
[[ -z $problems && $shots -gt 0 ]]
