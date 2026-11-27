.pragma library

// Small helpers more than one library had its own copy of, the copies
// disagreeing (home itself read "~" in two of five tildes).

// "/home/u/x" -> "~/x", and home itself -> "~". Any other path as given.
function tilde(path, home) {
  var s = String(path === undefined || path === null ? "" : path)
  return home && (s === home || s.indexOf(home + "/") === 0) ? "~" + s.slice(home.length) : s
}

// Zeros in front to `width` digits, two when not given: 7 -> "07".
function pad(n, width) {
  var s = String(n)
  while (s.length < (width || 2)) s = "0" + s
  return s
}

// Own keys only: a key read from data can be `constructor` or `__proto__`.
function has(obj, key) { return !!obj && Object.prototype.hasOwnProperty.call(obj, key) }
function own(obj, key) { return has(obj, key) ? obj[key] : undefined }

// How long ago, from the milliseconds since: "just now", "5 min ago",
// "3 h ago", "2 d ago".
function ago(ms) {
  var s = Math.max(0, Math.floor(ms / 1000))
  if (s < 60) return "just now"
  if (s < 3600) return Math.floor(s / 60) + " min ago"
  if (s < 86400) return Math.floor(s / 3600) + " h ago"
  return Math.floor(s / 86400) + " d ago"
}
