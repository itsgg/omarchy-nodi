.pragma library

// Matching shared by every provider, so "how well does this query name that
// thing" has one answer across the bar.

// What separates words: ASCII other than letters and digits; Latin-1's
// punctuation and symbols; the general punctuation, letterlike, arrows,
// maths, technical, box, shapes, symbols and dingbats blocks; CJK and
// fullwidth punctuation; variation selectors; and emoji (as surrogate
// pairs, which Qt's engine matches only as two code units).
var SEP_CLASS = "\\x00-\\x2f\\x3a-\\x40\\x5b-\\x60\\x7b-\\xbf\\xd7\\xf7\\u2000-\\u2bff\\u3000-\\u303f\\ufe00-\\ufe0f\\ufe30-\\ufe4f\\uff00-\\uff0f\\uff1a-\\uff20\\uff3b-\\uff40\\uff5b-\\uff65"
var SEP_SPLIT = new RegExp("(?:[" + SEP_CLASS + "]|[\\ud83c-\\ud83e][\\udc00-\\udfff])+")
var SEP_ALL = new RegExp("(?:[" + SEP_CLASS + "]|[\\ud83c-\\ud83e][\\udc00-\\udfff])+", "g")
var SEP_ONE = new RegExp("^(?:[" + SEP_CLASS + "]|[\\ud83c-\\ud83e][\\udc00-\\udfff])")
var EMOJI_PAIR = /^[\ud83c-\ud83e][\udc00-\udfff]$/

// Letters NFD does not take apart, as search engines fold them.
var LETTERS = { "ß": "ss", "æ": "ae", "œ": "oe", "ø": "o", "ł": "l", "đ": "d", "ð": "d", "þ": "th", "ı": "i" }
var LETTERS_RE = /[ßæœøłđðþı]/g

// Accents off, case kept: what the case split in words() reads, so
// "CaféBar" splits as "CafeBar" does.
function strip(s) { return /[^\x00-\x7f]/.test(s) ? s.normalize("NFD").replace(/[\u0300-\u036f]/g, "") : s }

// Lower case, and the letters NFD keeps whole.
function lower(s) {
  var t = s.toLowerCase()
  return /[^\x00-\x7f]/.test(t) ? t.replace(LETTERS_RE, function(c) { return LETTERS[c] }) : t
}

// Lower case, accents off: "Résumé" -> "resume", "Straße" -> "strasse".
// Other scripts keep their letters. NFD takes some apart, the same on both
// sides: Tamil's two-part vowel signs into their parts, a Hangul syllable
// into its jamo (so a syllable being typed already matches).
function fold(text) { return lower(strip(String(text || ""))) }

// fold(), kept per text, for what a provider searches on every keystroke
// (clipboard entries, browser history): each is folded once, and the
// store starts over past FOLDS_KEPT texts, as words() does.
var FOLDS_KEPT = 5000
var foldsOf = Object.create(null)
var foldsCount = 0

function folded(text) {
  var key = String(text || "")
  var kept = foldsOf[key]
  if (kept !== undefined) return kept
  if (foldsCount >= FOLDS_KEPT) { foldsOf = Object.create(null); foldsCount = 0 }
  foldsCount++
  return (foldsOf[key] = fold(key))
}

// The text without its separators, for a name typed without spaces.
function collapse(text) { return String(text || "").replace(SEP_ALL, "") }

// Where a folded text's words start: true at each index that begins one,
// after a separator or an emoji glued to it.
// Worked out once per text by the callers that keep it (Score.prepare).
function starts(text) {
  var out = []
  for (var i = 0; i < text.length; i++)
    out.push(i === 0 || SEP_ONE.test(text[i - 1]) || (i >= 2 && EMOJI_PAIR.test(text.slice(i - 2, i))))
  return out
}

// The letters of a folded needle in order in a folded text, the first at
// a word start ("frfx" Firefox, "lsd" LocalSend), over starts kept, with
// no regex per letter: ROADMAP 37 runs it on every row.
// The letters close together, too: within three times as many characters
// as the needle has, and 8 at least, where fzf's gap penalty cancels its
// bonus (Q S1): "new" is Network, "fx" Firefox, and "abc" no long label's
// a, b and c.
function inOrder(needle, text, startAt) {
  if (needle.length < 2 || needle.length > text.length) return false
  var span = Math.max(8, needle.length * 3)
  var at = 0, first = -1
  for (var i = 0; i < text.length && at < needle.length; i++) {
    if (text.charCodeAt(i) !== needle.charCodeAt(at)) continue
    if (at === 0) {
      if (!startAt[i]) continue
      first = i
    } else if (i - first >= span) {
      // Too far from this start: try the next one ("fx" in "Foot Firefox";
      // Fable 2026-10-05).
      i = first
      at = 0
      continue
    }
    at++
  }
  return at === needle.length
}

// A folded name without what comes before its first letter: "1password"
// -> "password", "7-zip" -> "zip", ".net sdk" -> "net sdk", "(beta) app"
// -> "beta) app"; null when it starts with a letter, in any script.
var LEAD = new RegExp("^(?:[0-9]|[" + SEP_CLASS + "]|[\\ud83c-\\ud83e][\\udc00-\\udfff])+")
function unled(text) {
  var m = LEAD.exec(text)
  return m ? text.slice(m[0].length) : null
}

// Text is folded before it is split (fold above), so "Beyoncé" and
// "beyonce" are one word, and split only on ASCII punctuation, spaces and
// the symbol and punctuation blocks (SEP): any other character is a letter,
// so Tamil, Cyrillic or Han text has words. Qt's engine has no \p{L}, and
// a class written with it fails there without a word (Q 2, X 1).
//
// "VSCodium" -> ["vs", "codium", "vscodium"], "org.gnome.Nautilus" -> ["org", "gnome", "nautilus"].
// A query and its target are always split the same way.
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
  var base = strip(key)
  var out = lower(base
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2"))
    .split(SEP_SPLIT)
    .filter(function(w) { return w.length > 0 })
  // A word the case split is also kept whole, after the others: "github"
  // names a "GitHub - Brave" window, which "git" and "hub" alone did not.
  // At the end, so the leading words are as they were and every old set of
  // initials still starts the new one ("ghd" of GitHub Desktop's "ghdg").
  var whole = lower(base).split(SEP_SPLIT)
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


// The query as providers see it: trimmed, folded, single spaces.
function normalise(query) {
  return fold(String(query || "").trim()).replace(/\s+/g, " ")
}
