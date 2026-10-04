#!/usr/bin/bash -p
# Qt 6's qmllint over Nodi, with the shell's `qs` imports in place.
#
# `-p` stops bash reading $BASH_ENV and $ENV and drops inherited functions
# before the first line runs, and every program comes from a directory only
# root can write. This ships in the plugin with the executable bit, so it
# holds the same line as the readers.
#
# Unqualified access and the host's injected properties are the shell's to
# provide at load time and the linter cannot see them; what fails here is
# what makes a component refuse to load.
# Adapted from omarchy-headset's tools/qmllint.sh.
set -euo pipefail
PATH=/usr/bin:/bin
export PATH

root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
linter=/usr/lib/qt6/bin/qmllint
[[ -x $linter ]] || linter=$(command -v qmllint)
shell=${OMARCHY_PATH:-/usr/share/omarchy}/shell

imports=$(mktemp -d)
trap 'rm -rf -- "$imports"' EXIT
ln -s "$shell" "$imports/qs"

cd -- "$root"
output=$("$linter" -I "$imports" Nodi.qml components/*.qml 2>&1 || true)

# An unresolved type the file itself uses (`Keys` hidden by an import named
# Keys, 2026-10-02) fails; one inside a module's own type files ("Type
# "BluetoothAdapter" of property ... not found") is the linter's gap.
structural=$( { grep -E '\[(property-override|index|unused-imports|duplicate|deprecated|incompatible-type|syntax|import)\]' <<<"$output"; grep -E 'is used but it is not resolved \[unresolved-type\]' <<<"$output"; } || true)
# A member missing on QObject is the shell's Style and Color singletons, which
# the linter cannot see into. A member missing on any other type is a name
# resolving to the wrong object: an id called `palette` inside a delegate
# reads the delegate's own QQuickPalette (2026-10-02).
missing=$(grep -E 'Could not find property|Cannot assign to non-existent property|\[missing-property\]' <<<"$output" | grep -v 'on type "QObject"' || true)
structural=$(printf '%s\n%s' "$structural" "$missing" | grep -v '^$' || true)
if [[ -n $structural ]]; then
  echo "$structural"
  exit 1
fi
echo "qmllint: no structural findings"
