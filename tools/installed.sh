#!/bin/bash
# Whether what runs is what the repository holds: the installed copy
# against the working tree (what `make install` copies), then the running
# shell against the copy. The shell compiles a plugin when it starts and a
# reload serves that cache, so a copy changed after the shell started is
# not running yet; `make reload` runs it (review I6, 2026-10-02: the user
# ran a build the tests did not describe).
#
# tools/installed.sh <installed dir>; exit 1 when either differs.
set -u
dest=${1:?usage: installed.sh <installed dir>}
dest=${dest%/}
repo=$(cd "$(dirname "$0")/.." && pwd)
home=${HOME:-}
# As `make install` copies: an agent's own folder (.claude, its worktrees
# whole copies of the tree) and Python's bytecode are not Nodi (2026-10-10).
excludes=(--exclude .git --exclude tests --exclude .github --exclude shots --exclude docs --exclude .claude --exclude __pycache__)

short() {
  local line=$1
  line=${line//"$dest/"/installed/}
  line=${line//"$dest:"/installed:}
  line=${line//"$repo/"/}
  line=${line//"$repo:"/.:}
  [ -n "$home" ] && line=${line//"$home"/\~}
  printf '%s\n' "$line"
}

if [ ! -d "$dest" ]; then
  echo "installed: nothing at $(short "$dest"); make install"
  exit 1
fi
if ! diff -rq "${excludes[@]}" "$repo" "$dest" >/dev/null 2>&1; then
  echo "installed: the copy differs from the repository; make install"
  diff -rq "${excludes[@]}" "$repo" "$dest" 2>&1 | head -20 | while IFS= read -r line; do short "$line"; done
  exit 1
fi

# When the copy last changed: rsync keeps each file's modification time
# from the tree, so the change time (%C) is the install's (agy 2026-10-03).
newest=$(find "$dest" -printf '%C@\n' | sort -n | tail -1)
newest=${newest%.*}

# The shell is the quickshell running Omarchy's config; when it started.
pid=""
for p in $(pgrep -x quickshell); do
  if tr '\0' ' ' < "/proc/$p/cmdline" 2>/dev/null | grep -q -- "-p /usr/share/omarchy/shell"; then pid=$p; fi
done
if [ -z "$pid" ]; then
  echo "installed: the copy matches the repository; Omarchy's shell is not running"
  exit 0
fi
elapsed=$(ps -o etimes= -p "$pid" | tr -d ' ')
if [ -z "$elapsed" ]; then
  echo "installed: the copy matches the repository; Omarchy's shell has just stopped"
  exit 0
fi
started=$(( $(date +%s) - elapsed ))

# Whole seconds both: a copy changed in the second the shell started counts
# as loaded, since `make reload` installs and restarts within one.
if [ "$newest" -gt "$started" ]; then
  echo "installed: the copy matches the repository, but the shell started before it was installed; make reload runs it"
  exit 1
fi
echo "installed: the copy matches the repository and the shell started after it was installed"
