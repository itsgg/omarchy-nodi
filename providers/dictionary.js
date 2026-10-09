.pragma library
.import "../lib/Run.js" as Run

// A dictionary (ROADMAP 65, L 20): `define <word>` reads Wiktionary's
// definitions (its REST API, which answered every word tried where
// dictionaryapi.dev timed out or had none, 2026-10-06), English first,
// then any other language that has the word (Tamil, for one): a row a
// sense, Enter copies it, its examples in the pane.

var ICON = "󰗚"
var MAX = 8
var LANGS = { en: "English", ta: "Tamil", hi: "Hindi", fr: "French", de: "German", es: "Spanish" }

var NAMED = { nbsp: " ", lt: "<", gt: ">", quot: "\"", apos: "'", mdash: "\u2014", ndash: "\u2013", hellip: "\u2026",
              lsquo: "\u2018", rsquo: "\u2019", ldquo: "\u201c", rdquo: "\u201d", middot: "\u00b7", amp: "&" }

// Wiktionary's definition HTML as plain text: its entities decoded once
// each, numbers and hex too (Sonnet 2026-10-06).
function plain(html) {
  return String(html || "").replace(/<[^>]*>/g, "")
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, function(m, e) {
      if (e.charAt(0) === "#") { var c = e.charAt(1).toLowerCase() === "x" ? parseInt(e.slice(2), 16) : Number(e.slice(1)); return c > 0 && c < 0x110000 ? String.fromCodePoint(c) : m }
      return Object.prototype.hasOwnProperty.call(NAMED, e.toLowerCase()) ? NAMED[e.toLowerCase()] : m
    })
    .replace(/\s+/g, " ").trim()
}

// Text in the pane's Markdown as it is: no emphasis, heading or code.
function md(s) { return String(s).replace(/([\\`*_#\[\]<>|~])/g, "\\$1") }

// Up to `max` senses: five of English at most, then the other languages
// the word has a sense of each in turn, so a common English word still
// shows them (Sonnet 2026-10-06: "run" was eight English senses).
function spread(list, max) {
  var english = list.filter(function(s) { return s.lang === "en" })
  var others = list.filter(function(s) { return s.lang !== "en" })
  var otherTake = Math.min(others.length, max - Math.min(5, english.length))
  var take = Math.min(english.length, max - otherTake)
  return english.slice(0, take).concat(others.slice(0, otherTake))
}

// { lang: [{ partOfSpeech, language, definitions: [{ definition, examples }] }] }
// as senses: [{ lang, language, part, text, examples }], English first.
function senses(data) {
  var out = []
  if (!data || typeof data !== "object") return out
  var langs = Object.keys(data).filter(function(k) { return Array.isArray(data[k]) })
  langs.sort(function(a, b) { return (a === "en" ? 0 : 1) - (b === "en" ? 0 : 1) })
  for (var i = 0; i < langs.length; i++) {
    var entries = data[langs[i]]
    for (var e = 0; e < entries.length; e++) {
      var entry = entries[e]
      var defs = entry && Array.isArray(entry.definitions) ? entry.definitions : []
      for (var d = 0; d < defs.length; d++) {
        var text = plain(defs[d] && defs[d].definition)
        if (!text) continue
        out.push({ lang: langs[i], language: String(entry.language || LANGS[langs[i]] || langs[i]), part: String(entry.partOfSpeech || ""),
                   text: text.slice(0, 500), examples: (Array.isArray(defs[d].examples) ? defs[d].examples : []).map(plain).filter(String).slice(0, 3) })
      }
    }
  }
  return out
}

var provider = {
  id: "dictionary",
  name: "Dictionary",
  icon: ICON,
  modes: [{ pattern: /^\s*define\s/i, label: "Define", icon: ICON, exclusive: true, hint: "define <word>" }],
  commands: [{ title: "Define a word", keywords: "define dictionary meaning definition wiktionary", text: "Its senses, from Wiktionary", complete: "define " }],
  help: [{ id: "dictionary", title: "Dictionary", icon: ICON, about: "A word's senses from Wiktionary, English first; Enter copies one",
           examples: [{ q: "define serendipity" }, { q: "define வணக்கம்", note: "Any language Wiktionary has" }] }],
  sources: {
    // The word reaches curl in the environment, which it encodes into the
    // URL itself (--variable %NODI_Q), so it is in no argument.
    define: {
      argv: function(word) {
        // Its body at most the read's 4 MB, over https only, no redirect
        // followed: -q first, so no ~/.curlrc turns one on (codex's review,
        // 2026-10-09), as the currency rates' (the marketplace's review
        // asked it of a rates download, 2026-09-23).
        return ["/usr/bin/curl", "-q", "-sS", "--max-time", "6", "--max-filesize", "4194304", "--proto", "=https", "-A", "Nodi (https://github.com/itsgg/omarchy-nodi)",
                "--variable", "%NODI_Q", "--expand-url", "https://en.wiktionary.org/api/rest_v1/page/definition/{{NODI_Q:url}}"]
      },
      environment: function(word) { return { NODI_Q: String(word) } },
      parse: function(text, ok) {
        if (!ok) throw "Wiktionary did not answer"
        var data
        try { data = JSON.parse(String(text || "")) } catch (e) { throw "Wiktionary's answer did not read" }
        return senses(data)
      },
      maxAgeMs: 24 * 60 * 60 * 1000, retryMs: 30 * 1000, timeoutMs: 8000, maxBytes: 4194304, supersede: true, transient: true
    }
  },
  match: function(query, ctx) {
    var m = String(query).match(/^\s*define\s+(.*)$/i)
    if (!m) return []
    var word = m[1].trim()
    if (!word) return [{ title: "Define a word", subtitle: "From Wiktionary", icon: ICON, score: 40, copy: "", remember: false, hint: "define <word>" }]
    var got = ctx.request ? ctx.request("define", word) : { state: "pending" }
    var page = "https://en.wiktionary.org/wiki/" + encodeURIComponent(word.replace(/ /g, "_"))
    if (!Array.isArray(got.value))
      return [{ title: got.state === "error" ? "Wiktionary did not answer" : "Looking up " + word + "...", subtitle: got.state === "error" ? String(got.error || "") : "Wiktionary",
                icon: ICON, score: 40, copy: "", remember: false }]
    var list = got.value
    if (!list.length) {
      var none = [{ title: "No definition of \"" + word + "\"", subtitle: "Open the page on Wiktionary", icon: ICON, score: 40, copy: "", run: Run.open(page), remember: false }]
      // Wiktionary is by case: "Hello" is no word, "hello" is.
      if (word !== word.toLowerCase()) none.unshift({ title: "Look up \"" + word.toLowerCase() + "\"", subtitle: "Wiktionary is by case", icon: ICON, score: 41,
                                                     copy: "", complete: "define " + word.toLowerCase(), remember: false })
      return none
    }
    var out = spread(list, MAX).map(function(s, i) {
      var text = "**" + md(word) + "**, " + (s.part ? md(s.part.toLowerCase()) + ", " : "") + md(s.language) + "\n\n" + md(s.text)
        + (s.examples.length ? "\n\n" + s.examples.map(function(x) { return "> " + md(x) }).join("\n\n") : "")
      return { key: "define:" + word + ":" + i, title: s.text.length > 110 ? s.text.slice(0, 107) + "..." : s.text,
               subtitle: (s.part ? s.part + ", " : "") + s.language, icon: ICON, score: 97 - i * 0.01, copy: s.text, remember: false,
               group: s.language, preview: { title: word, subtitle: (s.part ? s.part + ", " : "") + s.language, markdown: text } }
    })
    out.push({ key: "define:" + word + ":page", title: "Open \"" + word + "\" on Wiktionary", subtitle: "Every sense and its etymology", icon: "󰖟",
               score: 30, copy: "", run: Run.open(page), remember: false })
    return out
  }
}
