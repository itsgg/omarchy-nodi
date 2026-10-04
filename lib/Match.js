.pragma library

// Matching shared by every provider, so "how well does this query name that
// thing" has one answer across the bar.

// "VSCodium" -> ["vs", "codium", "vscodium"], "org.gnome.Nautilus" -> ["org", "gnome", "nautilus"].
// Letters outside a-z are dropped, as they are in every haystack, so a query
// and its target are always split the same way.
//
// Every keystroke splits the same names again, so each text's words are
// kept (a quarter of a keystroke's time before, measured with
// tools/bench.sh), and the store starts over past WORDS_KEPT texts. The
// array is shared: a caller reads it and never changes it. A plain object,
// not a Map: Qt's engine takes 4.5 us for a Map's get, 0.1 for this.
var WORDS_KEPT = 20000
var wordsOf = Object.create(null)    // a text may be "__proto__"
var wordsCount = 0

function words(text) {
  var key = String(text || "")
  var kept = wordsOf[key]
  if (kept) return kept
  var out = key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(function(w) { return w.length > 0 })
  // A word the case split is also kept whole, after the others: "github"
  // names a "GitHub - Brave" window, which "git" and "hub" alone did not.
  // At the end, so the leading words are as they were and every old set of
  // initials still starts the new one ("ghd" of GitHub Desktop's "ghdg").
  var whole = key.toLowerCase().split(/[^a-z0-9]+/)
  for (var i = 0; i < whole.length; i++) if (whole[i] && out.indexOf(whole[i]) === -1) out.push(whole[i])
  if (wordsCount >= WORDS_KEPT) { wordsOf = Object.create(null); wordsCount = 0 }
  wordsOf[key] = out
  wordsCount++
  return out
}

// Every query word starts some word of the haystack.
function prefixesAll(queryWords, hay) {
  if (queryWords.length === 0) return false
  for (var i = 0; i < queryWords.length; i++) {
    var hit = false
    for (var j = 0; j < hay.length && !hit; j++) hit = hay[j].indexOf(queryWords[i]) === 0
    if (!hit) return false
  }
  return true
}

// "vsc" names Visual Studio Code: the query is a prefix of the initials.
function acronym(query, nameWords) {
  if (query.length < 2 || nameWords.length < 2) return false
  return nameWords.map(function(w) { return w[0] }).join("").indexOf(query) === 0
}

// Letters of `needle` in order inside `hay`, the first at a word start.
// Returns 0 for no match, else a score that rewards runs and word starts,
// so "frfx" finds Firefox and "lsd" finds LocalSend.
function subsequence(needle, hay) {
  var n = String(needle || "").toLowerCase()
  var h = String(hay || "").toLowerCase()
  if (n.length < 2 || n.length > h.length) return 0
  var at = 0
  var score = 0
  var prev = -2
  for (var i = 0; i < h.length && at < n.length; i++) {
    if (h[i] !== n[at]) continue
    var wordStart = i === 0 || /[^a-z0-9]/.test(h[i - 1])
    if (at === 0 && !wordStart) continue
    score += (wordStart ? 10 : 2) + (prev === i - 1 ? 6 : 0)
    prev = i
    at++
  }
  return at === n.length ? score : 0
}

// The query as providers see it: trimmed, lower case, single spaces.
function normalise(query) {
  return String(query || "").trim().toLowerCase().replace(/\s+/g, " ")
}
