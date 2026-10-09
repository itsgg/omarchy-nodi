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
  // Under every clean match: Algolia's first criterion is the typo count,
  // "words with perfect matches (no typos) rank higher than words with one
  // typo", and Meilisearch's likewise (Q T1). Among themselves, a typo in
  // the name before one in what the row is, by more than a kind (an app's
  // generic "Screenshot Annotation" is no Screenshot), before letters in order.
  typoName: 22,     // one or two typos in a word of the name or an alias ("spotfy")
  typoWord: 18,     // ... in a word of the generic name or a keyword ("termnal", "browsr")
  fuzzy: 16         // the letters in order ("frfx"), or typos across several words ("screnshot region")
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
  file: 4,      // a file by its name in any search (providers/files.js): under any app named as well, by its words or better, and under Omarchy's settings named as well (2026-10-10: a folder `dns` in ~/go/pkg/mod beat Setup > Network > DNS, both exact, by a tie)
  hint: -6,     // a feature hint that fills the query in: under any app or action it names
  status: 0     // "Reading...", "No match"
}

// Under the smallest gap between two tiers or two kinds (description to
// context, window to app: 2), so habit orders equals and nothing else.
var HABIT_MAX = 1.9

// Tiers best first, for comparing two.
var ORDER = ["exact", "prefix", "words", "acronym", "keyword", "substring", "description", "context", "typoName", "typoWord", "fuzzy"]

// A tier reached through a typo or letters in order, not a clean match.
function loose(t) { return t === "typoName" || t === "typoWord" || t === "fuzzy" }

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
    collapsed: null, initials: null, keyWords: null, described: null, contextual: null, typoWords: null, otherWords: null, starts: null
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

// The generic name's words and the keywords', where a typo also names a
// row ("termnal" is Foot, a Terminal; KRunner matches them too, Q S4).
function otherWordsOf(p) {
  if (p.otherWords === null) p.otherWords = p.generic.concat(fieldWords(p.keywords))
  return p.otherWords
}

// What tier() needs of the query, worked out once: one keystroke asks
// about hundreds of rows with the same query.
var asked = { query: null }

function queryParts(query) {
  if (asked.query === query) return asked
  var q = Match.normalise(query)
  var qw = Match.words(q)
  asked = parts(q)
  asked.query = query
  // A plural word of four letters or more also tries its singular: "notes"
  // names a "Note-taking application" (Q L9, ROADMAP 36).
  var single = qw.map(function(w) { return w.length >= 4 && /[^s]s$/.test(w) ? w.slice(0, -1) : w })
  if (single.join(" ") !== qw.join(" ")) asked.singular = parts(single.join(" "))
  return asked
}

function parts(q) {
  var qw = Match.words(q)
  var lettered = true
  for (var i = 0; i < qw.length; i++) if (isDigits(qw[i])) lettered = false
  return { q: q, qw: qw, collapsed: Match.collapse(q), lettered: lettered, digits: isDigits(q), singular: null }
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
  if (!a.q) return ""
  var p = m && m.prepared ? m : prepare(m)
  if (!p) return ""
  var t = tierOf(a, p)
  // The singular where it names the row more cleanly than the plural did
  // ("notes" is one typo from "note", and "note" is a word of it), as a
  // keyword at best: a word still being typed ("touchs" of Touchscreen)
  // is no plural, and must not tie "touch" with it. Only by word starts:
  // the stem inside a word or a description found "file" in "profile"
  // (Fable 2026-10-05), and asking only that keeps it cheap.
  if ((!t || loose(t)) && a.singular && singularWhole(a, p)) {
    var s = tierOf(a.singular, p, true)
    if (s && ORDER.indexOf(s) < ORDER.indexOf("keyword")) s = "keyword"
    t = better(t, s)
  }
  return t
}

// Every word the singular changed is a whole word of the row's own, the
// generic name's, an alias's or a keyword's: "apps" is no "application"
// or "appearance" by "app" (Fable 2026-10-05).
function singularWhole(a, p) {
  var pool = keyWordsOf(p)
  for (var i = 0; i < a.singular.qw.length; i++)
    if (a.singular.qw[i] !== a.qw[i] && pool.indexOf(a.singular.qw[i]) === -1) return false
  return true
}

// `starts`: the word-start tiers only, keyword and above.
function tierOf(a, p, starts) {
  var q = a.q
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
  // "vsc" names Visual Studio Code: the query starts the name's initials;
  // and "lo c" LibreOffice Calc, its words run together ("loc" of
  // "libre office calc"; Q L13, ROADMAP 37).
  if (!p.whole && p.nameWords.length >= 2 && a.lettered && (qw.length === 1 ? initialsOf(p).indexOf(q) === 0
      : a.collapsed.length >= 2 && initialsOf(p).indexOf(a.collapsed) === 0)) return "acronym"

  if (a.lettered && Match.prefixesAll(qw, keyWordsOf(p))) return "keyword"
  if (starts) return ""
  if (q.length >= 3 && !p.whole && name.indexOf(q) !== -1) return "substring"
  // A word under three letters names a row by its name or keywords, never
  // by its description or context alone: "wa" starts "wayland" in a
  // terminal's comment and "wi fi" a command's "window ... fixed" (Q L11).
  if (a.lettered && shortWordsNamed(qw, p)) {
    if (p.description && Match.prefixesAll(qw, describedOf(p))) return "description"
    if (p.context && Match.prefixesAll(qw, contextualOf(p))) return "context"
  }

  // Typos and letters in order, on single-word queries (typoMatch wants
  // five letters, letters in order two).
  if (qw.length === 1 && q.length >= 2 && !a.digits) {
    var all = typoWordsOf(p)
    for (var i = 0; i < all.length; i++) if (typoMatch(q, all[i])) return "typoName"
    if (!p.whole) {
      var other = otherWordsOf(p)
      for (var o = 0; o < other.length; o++) if (typoMatch(q, other[o])) return "typoWord"
    }
    // Letters in order name an app from two letters, any other row from
    // three ("wfi" Wi-Fi, "blth" Bluetooth; Q L15), never a catalogue row
    // matched by whole words.
    if ((p.letters || (q.length >= 3 && !p.whole)) && Match.inOrder(q, name, p.starts || (p.starts = Match.starts(name)))) return "fuzzy"
  }
  // "screnshot region": every word named, the typos only in the name's
  // own words ("remove steam" is not Moonlight by its "remote" keyword).
  if (qw.length > 1 && a.lettered && typoedWords(qw, keyWordsOf(p), p.nameWords)) return "fuzzy"
  return ""
}

// How much a row is used, as one number that decays: each run adds 1, and
// what was there halves every HALF_LIFE days, Firefox's frecency ("a
// double exponential decay" with a 30-day half-life, Q F1). An entry keeps
// it as `f`, its value at `t`, the last run; one from before has its count
// `n` at `t`. Before, a count never aged, and habit stopped growing at
// about 13 runs (Q L3, L4, ROADMAP 38).
var HALF_LIFE = 30
// The use at which habit reaches HABIT_MAX: 13 runs and 900 now differ.
var USE_FULL = 200

function use(entry, nowMs) {
  if (!entry) return 0
  var at = typeof entry.f === "number" ? entry.f : (entry.n || 0)
  if (!(at > 0)) return 0
  var days = Math.max(0, (nowMs - (entry.t || 0)) / 86400000)
  return at * Math.pow(0.5, days / HALF_LIFE)
}

// What history adds: under HABIT_MAX, growing with the log of the use.
function habit(entry, nowMs) {
  var u = use(entry, nowMs)
  return u > 0 ? Math.min(HABIT_MAX, HABIT_MAX * Math.log(1 + u) / Math.log(1 + USE_FULL)) : 0
}

// How much a row was used, for ordering the home view.
function frecency(entry, nowMs) {
  var u = use(entry, nowMs)
  return u > 0 ? u + (entry.t || 0) / 1e15 : 0
}

// What picking a row for a query adds the next time a query like it is
// typed: up to PICK_MAX, more than a kind and a tier apart, never as much
// as an exact name gives over a typo. The same query counts in full; a
// remembered shorter query ("t" when "te" is typed), at seven tenths, the
// longest one a row has. And a remembered longer query that starts with
// the typed one ("spotify" when "sp" is typed): half, and less the less of
// it is typed, down to a quarter. Firefox's adaptive history matches "all
// the search strings that start with the input string", the exact one
// counting double (Q F2); without it a row that is not first at "s" gets
// typed out, and what it learns never reaches "s" (Q L5, ROADMAP 34). It
// decays as habit does.
var PICK_MAX = 14

function own(obj, key) { return obj && Object.prototype.hasOwnProperty.call(obj, key) ? obj[key] : undefined }

function worth(e, nowMs) {
  var days = Math.max(0, (nowMs - e.t) / 86400000)
  var weight = days <= 7 ? 1 : Math.max(0.1, Math.pow(0.5, (days - 7) / 23))
  return Math.min(PICK_MAX, 7 * Math.log(1 + e.n * weight) / Math.LN2)
}

// Every row's lift for one query, worked out once a keystroke: the rows
// ask one by one, and the picks hold up to 300 queries (lib/History.js).
var lifted = { picks: null, query: null, now: 0, lift: null }

function liftsFor(picks, query, nowMs) {
  if (lifted.picks === picks && lifted.query === query && lifted.now === nowMs) return lifted.lift
  var lift = Object.create(null)
  for (var len = query.length; len >= 1; len--) {
    var stored = own(picks, query.slice(0, len))
    if (!stored) continue
    for (var key in stored) {
      if (key in lift || !own(stored, key)) continue
      lift[key] = len === query.length ? worth(stored[key], nowMs) : worth(stored[key], nowMs) * 0.7
    }
  }
  for (var q in picks) {
    if (q.length <= query.length || q.indexOf(query) !== 0 || !own(picks, q)) continue
    var share = query.length / q.length
    for (var k in picks[q]) {
      if (!own(picks[q], k)) continue
      var v = worth(picks[q][k], nowMs) * 0.5 * (0.5 + 0.5 * share)
      if (!(k in lift) || v > lift[k]) lift[k] = v
    }
  }
  lifted = { picks: picks, query: query, now: nowMs, lift: lift }
  return lift
}

function recall(picks, query, key, nowMs) {
  if (!picks || !query) return 0
  var v = liftsFor(picks, query, nowMs)[key]
  return v === undefined ? 0 : v
}

// How much of a title the query covers, from 0 to 1, when its words start
// the title's own (a match in the generic name or keywords covers none of
// the title), and more when they are whole words of it: "obs" is OBS
// Studio before Obsidian. A row's score adds FIT_MAX of it: more than the hundredths a
// provider orders its rows by, less than a provider's own demotion of a
// row (0.05), and under any habit, so it orders rows nothing else tells
// apart: "susp" is Suspend before "Suspend in System Menu" (Q L13), as fzf
// breaks ties by length (Q S1). Under three letters, coverage says
// nothing, and ties stay as they were.
var FIT_MAX = 0.045

// The query's parts and each title's collapsed form, kept: every matched
// row asks, on every keystroke.
var fitQuery = { query: null, qc: "", qw: [] }
var fitTitles = Object.create(null)
var fitTitlesCount = 0

function fit(query, title) {
  if (fitQuery.query !== query) {
    var nq = Match.normalise(query)
    fitQuery = { query: query, qc: Match.collapse(nq), qw: Match.words(nq) }
  }
  var qc = fitQuery.qc, qw = fitQuery.qw
  if (qc.length < 3) return 0
  var key = String(title || "")
  var t = fitTitles[key]
  if (t === undefined) {
    if (fitTitlesCount >= 5000) { fitTitles = Object.create(null); fitTitlesCount = 0 }
    fitTitlesCount++
    t = fitTitles[key] = Match.collapse(Match.folded(key))
  }
  var tw = Match.words(key)
  if (!t || !Match.prefixesAll(qw, tw)) return 0
  var whole = 0
  for (var i = 0; i < qw.length; i++) if (tw.indexOf(qw[i]) !== -1) whole++
  return Math.min(1, qc.length / t.length + 0.5 * whole / qw.length)
}

function score(t, k, h) {
  var base = (TIER[t] || 0) + (KIND[k] === undefined ? 0 : KIND[k])
  return base + (h || 0)
}

// The history entry after one more run of a row: one more run counted,
// and the use decayed to now plus this run.
function bump(entry, nowMs) {
  return { n: Math.min(1000, (entry && entry.n ? entry.n : 0) + 1), t: nowMs, f: use(entry, nowMs) + 1 }
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
