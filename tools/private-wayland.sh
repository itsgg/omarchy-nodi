#!/usr/bin/bash -p
set -euo pipefail
PATH=/usr/bin:/bin
export PATH

(( $# )) || { echo "private-wayland: no command" >&2; exit 2; }
command -v sway >/dev/null || { echo "private-wayland: sway not found" >&2; exit 127; }

parent=${XDG_RUNTIME_DIR:-/tmp}
export PIPEWIRE_RUNTIME_DIR=${PIPEWIRE_RUNTIME_DIR:-$parent}
work=$(mktemp -d -p "$parent" nodi-wayland.XXXXXX)
chmod 700 "$work"
pid=""
cleanup() {
  if [[ -n $pid ]]; then
    kill "$pid" 2>/dev/null || true
    wait "$pid" 2>/dev/null || true
  fi
  rm -rf -- "$work"
}
trap cleanup EXIT

cat >"$work/sway.conf" <<'EOF'
output * mode 1280x720
xwayland disable
default_border none
EOF

unset DISPLAY WAYLAND_DISPLAY HYPRLAND_INSTANCE_SIGNATURE SWAYSOCK I3SOCK
export XDG_RUNTIME_DIR="$work"
export WLR_BACKENDS=headless
export WLR_LIBINPUT_NO_DEVICES=1

sway --unsupported-gpu --config "$work/sway.conf" >"$work/sway.log" 2>&1 &
pid=$!

socket=""
for _ in {1..100}; do
  for candidate in "$work"/wayland-*; do
    if [[ -S $candidate ]]; then socket=$candidate; break 2; fi
  done
  kill -0 "$pid" 2>/dev/null || break
  sleep 0.05
done
if [[ -z $socket ]]; then
  echo "private-wayland: sway did not create a socket" >&2
  cat "$work/sway.log" >&2
  exit 1
fi

export WAYLAND_DISPLAY=${socket##*/}
for candidate in "$work"/sway-ipc.*.sock; do
  [[ -S $candidate ]] && { export SWAYSOCK=$candidate; break; }
done

"$@"
