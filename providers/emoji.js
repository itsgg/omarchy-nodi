.pragma library
.import "../lib/Run.js" as Run
.import "../lib/Match.js" as Match

// Emoji search over Omarchy's own emojis.json ({ e, k } entries), loaded by
// Nodi.qml and passed in as ctx.emojis.
//
//   :fire, :heart eyes, emoji thumbs up

var LIMIT = 40

// Each emoji's keywords as rank() reads them, made once per list: lower
// case and split again on every keystroke was most of a search's time
// (tools/bench.sh).
var preparedCache = { list: null, entries: null }

function prepared(list) {
  if (preparedCache.list === list) return preparedCache.entries
  var entries = []
  for (var i = 0; i < list.length; i++) {
    var item = list[i]
    if (!item || !item.e) continue
    var keywords = Match.fold(item.k)
    entries.push({ item: item, i: i, tokens: keywords.split(" "), padded: " " + keywords.replace(/_/g, " ") + " " })
  }
  preparedCache = { list: list, entries: entries }
  return entries
}

// Omarchy's keywords mix names and phrases ("red heart heart love"), so the
// best signal for a one-word search is how often it appears as a whole
// keyword, relative to how many keywords the emoji has. Then whole-word
// phrases, word prefixes, substrings.
function rank(entry, needle) {
  if (needle.indexOf(" ") === -1) {
    var tokens = entry.tokens
    var n = 0
    for (var i = 0; i < tokens.length; i++) if (tokens[i] === needle) n++
    if (n > 0) return 10 + n + n / tokens.length
  }
  var k = entry.padded
  var at = k.indexOf(" " + needle + " ")
  if (at !== -1) return at === 0 ? 9 : 8
  at = k.indexOf(" " + needle)
  if (at !== -1) return at === 0 ? 4 : 3
  return k.indexOf(needle) !== -1 ? 1 : 0
}

function words(k) {
  var seen = Object.create(null)
  // "family: man, boy" is the words family, man, boy.
  return String(k).replace(/[_:,]/g, " ").split(/\s+/).filter(function(w) {
    if (!w || seen[w]) return false
    seen[w] = true
    return true
  })
}

var provider = {
  id: "emoji",
  name: "Emoji",
  icon: "󰞅",
  modes: [{ pattern: /^\s*(?::|emoji(\s|$))/i, label: "Emoji", icon: "󰞅", exclusive: true, hint: ":<word>" }],
  commands: [
    { title: "Search emoji", keywords: "emoji emojis emoticon smiley symbols", text: ":fire, :party", complete: ":" }
  ],
  help: [
    { id: "emoji", title: "Emoji", about: "A colon and a word. Enter types the emoji into your app",
      examples: [{ q: ":", note: "Start an emoji search" }, ":fire", "emoji party"] }
  ],
  match: function(query, ctx) {
    var m = String(query).match(/^\s*(?::|emoji\s+|emoji$)\s*(.*)$/i)
    if (!m) return []
    var needle = m[1].trim().toLowerCase()
    var want = Match.fold(needle)
    var list = ctx.emojis || []
    if (list.length === 0) return [{ title: "Loading emoji...", subtitle: "Emoji", score: 40, copy: "" }]
    if (!needle) return [{ title: "Emoji", subtitle: ":fire, :thumbs up, :party", score: 40, copy: "", hint: ":<word>" }]

    var paste = !(ctx.settings && ctx.settings.onEnter === "copy")
    var hits = []
    var entries = prepared(list)
    for (var i = 0; i < entries.length; i++) {
      var r = rank(entries[i], want)
      if (r > 0) hits.push({ item: entries[i].item, r: r, i: entries[i].i })
    }
    // A colon query is always about emoji: say there is none rather than hand
    // ":screenshot" to the rest of Nodi, where Enter would take a screenshot.
    if (hits.length === 0) return [{ title: "No emoji matches \"" + needle + "\"", subtitle: "Emoji", score: 40, copy: "" }]
    // Best match kind first, then Omarchy's own (popularity) order.
    hits.sort(function(a, b) { return b.r - a.r || a.i - b.i })

    var out = []
    for (var j = 0; j < hits.length && j < LIMIT; j++) {
      var e = hits[j].item
      out.push({
        key: "emoji:" + e.e,
        icon: e.e,
        // The keywords as words, each once: "fire_engine fire engine" is
        // "fire engine" (Fable's look review); the data has no name field.
        title: words(e.k).slice(0, 5).join(" "),
        subtitle: words(e.k).slice(5).join(" "),
        score: 96 - j * 0.01,
        copy: e.e,
        actionLabel: paste ? "Insert" : "Copy",
        run: paste ? Run.exec(["omarchy-menu-emoji-insert", e.e]) : null,
        actions: paste ? [{ label: "Copy " + e.e, icon: "󰆏", run: Run.copy(e.e) }] : []
      })
    }
    return out
  }
}
