.pragma library
.import "Match.js" as Match

// How every row in Nodi is ranked, in one place. A provider says two things
// about a row and nothing else:
//
//   tier   how well the query names it (TIER below), worked out from the
//          row's `match` fields by tier(), or given for an answer
//   kind   what the row is (KIND below)
//
// and the score is TIER + KIND + habit, so a launch beats a setting that is
// named equally well. Habit only breaks near-ties: it is worth less than the
// smallest gap in either table (HABIT_MAX), so no amount of history moves a
// row past one that is better by a tier or by a kind, the other being equal.
// Where one row is the better name and the other the better kind, a point
// apart, habit may decide. Learning that should move rows comes from what
// was picked for the same query. Before this, each provider picked its own numbers and they were tuned
// against each other by hand: `aud` restarted the audio stack instead of
// opening Audacity, and `2+2` listed Pinta (the 2026-10-02 holistic review).

var TIER = {
  exact: 60,        // the query is the name, an alias, or the name without spaces
  prefix: 54,       // the name starts with the query
  words: 50,        // every query word starts a word of the name (or of the generic name)
  acronym: 46,      // the query is the start of the name's initials ("vsc")
  keyword: 36,      // keywords, aliases, synonyms
  substring: 32,    // the name contains the query mid-word (three letters or more):
                    // weaker than a keyword, since "date" is inside "update"
  description: 26,  // the description
  context: 24,      // where the row lives (Setup > Network) and nothing closer
  fuzzy: 18         // one or two typos, or the letters in order ("screnshot", "frfx")
}

var KIND = {
  answer: 36,   // computed from the query: a sum, a conversion, a time
  mode: 36,     // a row of the mode the query's prefix opened (kill, :, cb, vol)
  window: 22,   // switch to an open window
  app: 20,      // launch an app
  action: 17,   // do something: an Omarchy action, a command, a keyword
  toggle: 17,   // flip a toggle
  item: 15,     // a thing to open: a file, a folder, a history entry
  menu: 12,     // open a submenu of Omarchy's menu (named exactly, above an app named by one word)
  command: 10,  // a command of Omarchy's CLI catalog: under its curated menu
  setting: 6,   // pick one of several (a default browser, a DNS server)
  hint: -6,     // a feature hint that fills the query in: under any app or action it names
  status: 0     // "Reading...", "No match"
}

// Under the smallest gap between two tiers or two kinds (description to
// context, window to app: 2), so habit orders equals and nothing else.
var HABIT_MAX = 1.9

// Tiers best first, for comparing two.
var ORDER = ["exact", "prefix", "words", "acronym", "keyword", "substring", "description", "context", "fuzzy"]

function better(a, b) {
  if (!a) return b
  if (!b) return a
  return ORDER.indexOf(a) <= ORDER.indexOf(b) ? a : b
}

function isDigits(w) { return /^\d+$/.test(w) }

// The words of each text in a list, in one array.
function fieldWords(list) {
  var out = []
  for (var i = 0; i < list.length; i++) {
    var w = Match.words(list[i])
    for (var j = 0; j < w.length; j++) out.push(w[j])
  }
  return out
}

// Edits between two short words, transpositions counting one (a typo).
function edits(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return max + 1
  var prev2 = null
  var prev = []
  for (var j = 0; j <= b.length; j++) prev.push(j)
  for (var i = 1; i <= a.length; i++) {
    var cur = [i]
    var best = i
    for (var k = 1; k <= b.length; k++) {
      var cost = a[i - 1] === b[k - 1] ? 0 : 1
      var v = Math.min(prev[k] + 1, cur[k - 1] + 1, prev[k - 1] + cost)
      if (prev2 && i > 1 && k > 1 && a[i - 1] === b[k - 2] && a[i - 2] === b[k - 1]) v = Math.min(v, prev2[k - 2] + 1)
      cur.push(v)
      if (v < best) best = v
    }
    if (best > max) return max + 1
    prev2 = prev
    prev = cur
  }
  return prev[b.length]
}

// One typo for a word of five to seven letters, two from eight; never for a
// shorter word, where a typo is as likely to be another word, and never in
// the first letter ("night" is not "light" or "right").
function typoMatch(q, word) {
  if (q.length < 5 || q[0] !== word[0]) return false
  var max = q.length >= 8 ? 2 : 1
  if (edits(q, word, max) <= max) return true
  // A typo inside a word the query has not finished ("screns" for screenshot).
  if (word.length > q.length) return edits(q, word.slice(0, q.length), max) <= max
  return false
}

// What tier() works out of a row's fields, so a provider that keeps it for
// its list (menu.js, omarchy.js, keys.js, apps.js) pays once, not on every
// keystroke: a quarter of a keystroke's time went here (tools/bench.sh).
// The word lists are made the first time a query needs them. Null for a
// row with no name.
function prepare(m) {
  if (!m || !m.name) return null
  var name = Match.fold(m.name)
  var aliases = []
  var given = [].concat(m.aliases || [])
  for (var i = 0; i < given.length; i++) aliases.push(Match.normalise(String(given[i]).replace(/[._-]+/g, " ")))
  return {
    prepared: true,
    name: name,
    // The name without what leads it before its first letter (Match.unled:
    // "1password", "7-zip", ".net sdk"); null when it starts with a letter.
    lead: Match.unled(name),
    nameWords: Match.words(m.name),
    aliases: aliases,
    generic: Match.words(m.generic || ""),
    keywords: [].concat(m.keywords || []),
    description: m.description || "",
    context: m.context,
    whole: !!m.whole,
    letters: !!m.letters,
    collapsed: null, initials: null, keyWords: null, described: null, contextual: null, typoWords: null
  }
}

function collapsedOf(p) {
  if (p.collapsed === null) p.collapsed = Match.collapse(p.name)
  return p.collapsed
}

function initialsOf(p) {
  if (p.initials === null) p.initials = p.nameWords.map(function(w) { return w[0] }).join("")
  return p.initials
}

// The name's words, the generic name's, the aliases' and the keywords'.
function keyWordsOf(p) {
  if (p.keyWords === null) p.keyWords = p.nameWords.concat(p.generic, fieldWords(p.aliases), fieldWords(p.keywords))
  return p.keyWords
}

function describedOf(p) {
  if (p.described === null) p.described = keyWordsOf(p).concat(Match.words(p.description))
  return p.described
}

function contextualOf(p) {
  if (p.contextual === null) p.contextual = describedOf(p).concat(fieldWords([].concat(p.context)))
  return p.contextual
}

function typoWordsOf(p) {
  if (p.typoWords === null) p.typoWords = p.nameWords.concat(fieldWords(p.aliases))
  return p.typoWords
}

// What tier() needs of the query, worked out once: one keystroke asks
// about hundreds of rows with the same query.
var asked = { query: null }

function queryParts(query) {
  if (asked.query === query) return asked
  var q = Match.normalise(query)
  var qw = Match.words(q)
  var lettered = true
  for (var i = 0; i < qw.length; i++) if (isDigits(qw[i])) lettered = false
  asked = { query: query, q: q, qw: qw, collapsed: Match.collapse(q), lettered: lettered, digits: isDigits(q) }
  return asked
}

// Every query word of one or two letters starts a word of the name, the
// generic name, an alias or a keyword.
function shortWordsNamed(qw, p) {
  for (var i = 0; i < qw.length; i++) if (qw[i].length < 3 && !Match.prefixesAll([qw[i]], keyWordsOf(p))) return false
  return true
}

// Every query word starts a word of the pool, or names a word of the name
// with a typo, and one at least does that ("screnshot region").
function typoedWords(qw, pool, nameWords) {
  var typoed = false
  for (var i = 0; i < qw.length; i++) {
    var w = qw[i]
    var hit = false
    for (var j = 0; j < pool.length && !hit; j++) hit = pool[j].indexOf(w) === 0
    if (hit) continue
    for (var k = 0; k < nameWords.length && !hit; k++) hit = typoMatch(w, nameWords[k])
    if (!hit) return false
    typoed = true
  }
  return typoed
}

// The best tier at which `query` names a row described by
//   { name, generic?, aliases?, keywords?, description?, context?, letters?, whole? }
// or by what prepare() made of one. `whole` names a catalog entry by whole
// words only: no initials and no match inside a word, which on "plugin
// validate" find "pv" and "lid". (strings or arrays of strings), or "" for
// no match. `letters: true` also accepts the query's letters in order
// inside the name ("frfx" for Firefox), which is right for app names and
// noise for a menu's labels.
//
// A query word made only of digits matches only the name: "2+2" is a sum,
// not Pinta by its "2d" keyword.
function tier(query, m) {
  var a = queryParts(query)
  var q = a.q
  if (!q) return ""
  var p = m && m.prepared ? m : prepare(m)
  if (!p) return ""
  var qw = a.qw
  if (qw.length === 0) return ""
  var name = p.name

  if (name === q || p.aliases.indexOf(q) !== -1 || (a.collapsed.length >= 3 && collapsedOf(p) === a.collapsed)) return "exact"
  // A name's leading numerals are not where people start typing it:
  // "pass" starts 1Password as "zip" starts 7-Zip.
  if (name.indexOf(q) === 0 || (p.lead !== null && p.lead.indexOf(q) === 0)) return "prefix"
  // One letter names only the start of a real name's word: "w" is not every
  // web browser by its generic name.
  if (q.length === 1) return Match.prefixesAll(qw, p.nameWords) ? "words" : ""
  // The wider fields take words, not digits: "2+2" is not "2D graphics
  // editor" (codex 2026-10-04).
  if (Match.prefixesAll(qw, p.nameWords) || (p.generic.length > 0 && a.lettered && Match.prefixesAll(qw, p.generic))) return "words"
  // "vsc" names Visual Studio Code: the query starts the name's initials.
  if (qw.length === 1 && !p.whole && p.nameWords.length >= 2 && initialsOf(p).indexOf(q) === 0) return "acronym"

  if (a.lettered && Match.prefixesAll(qw, keyWordsOf(p))) return "keyword"
  if (q.length >= 3 && !p.whole && name.indexOf(q) !== -1) return "substring"
  // A word under three letters names a row by its name or keywords, never
  // by its description or context alone: "wa" starts "wayland" in a
  // terminal's comment and "wi fi" a command's "window ... fixed" (Q L11).
  if (a.lettered && shortWordsNamed(qw, p)) {
    if (p.description && Match.prefixesAll(qw, describedOf(p))) return "description"
    if (p.context && Match.prefixesAll(qw, contextualOf(p))) return "context"
  }

  // Typos and letters in order, on single-word queries of three letters or more.
  if (qw.length === 1 && q.length >= 2 && !a.digits) {
    var all = typoWordsOf(p)
    for (var i = 0; i < all.length; i++) if (typoMatch(q, all[i])) return "fuzzy"
    if (p.letters && Match.subsequence(q, name) > 0) return "fuzzy"
  }
  // "screnshot region": every word named, the typos only in the name's
  // own words ("remove steam" is not Moonlight by its "remote" keyword).
  if (qw.length > 1 && a.lettered && typoedWords(qw, keyWordsOf(p), p.nameWords)) return "fuzzy"
  return ""
}

// What history adds: under HABIT_MAX, from how often a row was run and how
// recently. A run counts fully for a week, half after a month, a tenth
// after three months.
function habit(entry, nowMs) {
  if (!entry || !entry.n) return 0
  var days = Math.max(0, (nowMs - (entry.t || 0)) / 86400000)
  var weight = days <= 7 ? 1 : Math.max(0.1, Math.pow(0.5, (days - 7) / 23))
  return Math.min(HABIT_MAX, Math.log(1 + entry.n * weight) / Math.LN2 * 0.5)
}

// How much a row was used, for ordering the home view: its runs, each
// weighted as habit weights them.
function frecency(entry, nowMs) {
  if (!entry || !entry.n) return 0
  var days = Math.max(0, (nowMs - (entry.t || 0)) / 86400000)
  var weight = days <= 7 ? 1 : Math.max(0.1, Math.pow(0.5, (days - 7) / 23))
  return entry.n * weight + (entry.t || 0) / 1e15
}

// What picking a row for a query adds the next time that query, or one
// starting with it, is typed: up to PICK_MAX, more than a kind and a tier
// apart, never as much as an exact name gives over a typo. The same query
// counts in full; a remembered shorter query ("t" when "te" is typed), at
// seven tenths. It decays as habit does.
var PICK_MAX = 14

function own(obj, key) { return obj && Object.prototype.hasOwnProperty.call(obj, key) ? obj[key] : undefined }

function recall(picks, query, key, nowMs) {
  if (!picks || !query) return 0
  for (var len = query.length; len >= 1; len--) {
    var e = own(own(picks, query.slice(0, len)), key)
    if (!e) continue
    var days = Math.max(0, (nowMs - e.t) / 86400000)
    var weight = days <= 7 ? 1 : Math.max(0.1, Math.pow(0.5, (days - 7) / 23))
    var full = Math.min(PICK_MAX, 7 * Math.log(1 + e.n * weight) / Math.LN2)
    return len === query.length ? full : full * 0.7
  }
  return 0
}

function score(t, k, h) {
  var base = (TIER[t] || 0) + (KIND[k] === undefined ? 0 : KIND[k])
  return base + (h || 0)
}

// The history entry after one more run of a row.
function bump(entry, nowMs) {
  return { n: Math.min(1000, (entry && entry.n ? entry.n : 0) + 1), t: nowMs }
}

// An answer provider's rows as answers: what it computed from the query
// ranks with kind "answer" at `t` (exact unless the provider is guessing),
// in the provider's own order. Its status rows ("Fetching exchange
// rates...", scored under 50) stay as they are.
function answers(rows, t) {
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i]
    if (typeof r.score !== "number" || r.score < 50) continue
    r.offset = (r.score - 100) / 100
    r.tier = t || "exact"
    r.kind = "answer"
    delete r.score
  }
  return rows
}
