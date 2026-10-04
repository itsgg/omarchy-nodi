#!/usr/bin/bash -p
# How long a keystroke takes: lib/Engine.js over a full machine's data, on
# node and in Qt's own JavaScript engine (qml6, offscreen: nothing appears
# on the screen). Usage: tools/bench.sh [rounds]
set -euo pipefail
node=$(command -v node || true)   # mise's, not on the path below
[[ -n $node ]] || { echo "bench: node not found"; exit 1; }
PATH=/usr/bin:/bin
export PATH
command -v qml6 >/dev/null || { echo "bench: qml6 not found (qt6-declarative)"; exit 1; }
rounds=${1:-5}

root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
work=$(mktemp -d -p "${XDG_RUNTIME_DIR:-/tmp}" nodi-bench.XXXXXX)
trap 'rm -rf -- "$work"' EXIT

"$node" "$root/tools/bench/engine.mjs" "$((rounds * 4))"
"$node" --input-type=module -e "
import { keystrokes } from '$root/tools/bench/queries.mjs';
import { execFileSync } from 'node:child_process';
const data = execFileSync(process.execPath, ['$root/tools/bench/data.mjs'], { maxBuffer: 64 << 20 }).toString();
process.stdout.write('.pragma library\n\nvar data = ' + data + '\nvar keys = ' + JSON.stringify(keystrokes()) + '\n');
" > "$work/data.js"
ln -s "$root/lib" "$work/lib"
ln -s "$root/providers" "$work/providers"
cp "$root/tools/bench/Bench.qml" "$work/Bench.qml"
QT_QPA_PLATFORM=offscreen QT_FORCE_STDERR_LOGGING=1 timeout 300 qml6 "$work/Bench.qml" -- "$rounds" >"$work/log" 2>&1 || true
grep "BENCH " "$work/log" | sed 's/^.*BENCH //' || { tail -20 "$work/log"; exit 1; }
