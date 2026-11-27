.pragma library

// Which of the open's probes are due (Nodi.qml open and startReads). Each
// forks: a login shell for the agents' PATH, a shell and its programs for the
// toggles, the appearance and the themes. Those whose answer rarely changes
// are kept for a while, or until what they read changes; the toggles and
// the appearance are read again at an open unless a read is only seconds
// old, since a toggle flipped elsewhere should show at the next open.

// The login shell's PATH the agents are looked for on: kept ten minutes, or
// until the programs asked for or the session's PATH change, or an Ask fails
// as a missing program does. The programs themselves are looked for on it
// at every open, by a plain shell (Nodi.qml agentProbe).
var AGENTS_MAX_AGE_MS = 10 * 60 * 1000
// The installed themes: the current one is watched (theme.name), so only a
// theme added or removed waits, ten minutes at most.
var THEMES_MAX_AGE_MS = 10 * 60 * 1000
// A toggle or appearance read this recent is the open's own.
var FRESH_MS = 3000

// A read made at `at` (0 or less: never) is due again at `now` once
// `maxAge` has passed; a clock gone back makes it due too.
function due(at, now, maxAge) {
  if (!(at > 0)) return true
  if (now < at) return true
  return now - at >= maxAge
}

// `seen` is the last good agent probe, { at, key }; `key` what it would
// ask now (the programs and the PATH).
function agentsDue(seen, now, key) {
  if (!seen || seen.key !== key) return true
  return due(seen.at, now, AGENTS_MAX_AGE_MS)
}

// An Ask that failed as a program that is not there fails: the agents are
// looked for again at once.
function suggestsMissing(error) {
  var s = String(error || "")
  if (!s) return false
  return /could not start|command not found|not found|no such file|is not installed|exit 127\b|ENOENT/i.test(s)
}
