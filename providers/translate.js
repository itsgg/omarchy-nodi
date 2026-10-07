.pragma library
.import "../lib/Score.js" as Score
.import "selection.js" as Selection

// Translation by the agent Ask holds (ROADMAP 48), streamed into the pane by the held
// Ask session as any question is; Enter on the answer pastes it,
// Ctrl+Enter copies it.
//
//   tr ta good morning      to Tamil, by its code or its name
//   tr good morning         to "translate": { "language": ... } (English)
//   tr tamil                the selected text, to Tamil
//   good morning in tamil   at root, by the language's name only: "zoom
//                           in" and "5 km in mi" name none
//
// Your own keyword "tr" in nodi.json comes first, as it did before.

var ICON = "󰗊"

// Codes and names, ISO 639-1; a name lower-cased, and a few names people
// type for the same language.
var LANGUAGES = [
  ["en", "English"], ["ta", "Tamil"], ["hi", "Hindi"], ["te", "Telugu"], ["ml", "Malayalam"], ["kn", "Kannada"],
  ["mr", "Marathi"], ["gu", "Gujarati"], ["pa", "Punjabi"], ["bn", "Bengali", "bangla"], ["ur", "Urdu"], ["or", "Odia", "oriya"],
  ["si", "Sinhala", "sinhalese"], ["ne", "Nepali"], ["sa", "Sanskrit"], ["fr", "French"], ["de", "German"], ["es", "Spanish"],
  ["it", "Italian"], ["pt", "Portuguese"], ["nl", "Dutch"], ["sv", "Swedish"], ["no", "Norwegian"], ["da", "Danish"],
  ["fi", "Finnish"], ["pl", "Polish"], ["cs", "Czech"], ["sk", "Slovak"], ["hu", "Hungarian"], ["ro", "Romanian"],
  ["bg", "Bulgarian"], ["el", "Greek"], ["ru", "Russian"], ["uk", "Ukrainian"], ["tr", "Turkish"], ["ar", "Arabic"],
  ["he", "Hebrew"], ["fa", "Persian", "farsi"], ["zh", "Chinese", "mandarin"], ["ja", "Japanese"], ["ko", "Korean"],
  ["th", "Thai"], ["vi", "Vietnamese"], ["id", "Indonesian"], ["ms", "Malay"], ["tl", "Filipino", "tagalog"],
  ["sw", "Swahili"], ["am", "Amharic"], ["la", "Latin"], ["ga", "Irish"], ["cy", "Welsh"], ["ca", "Catalan"],
  ["hr", "Croatian"], ["sr", "Serbian"], ["sl", "Slovenian"], ["lt", "Lithuanian"], ["lv", "Latvian"], ["et", "Estonian"],
  ["is", "Icelandic"], ["af", "Afrikaans"], ["zu", "Zulu"], ["my", "Burmese"], ["km", "Khmer"], ["lo", "Lao"]
]

// Codes that are English words: "tr hi there" and "tr no thanks" are
// text, and Hindi or Norwegian go by name.
var WORDS = { no: true, is: true, it: true, or: true, my: true, am: true, he: true, hi: true, id: true, la: true, lo: true }

// A language by its code or name ("ta", "Tamil", "farsi"), or "" for none.
// `namesOnly`: a code is no language, for text typed at root.
function language(word, namesOnly) {
  var w = String(word || "").toLowerCase()
  if (!w) return ""
  for (var i = 0; i < LANGUAGES.length; i++) {
    var l = LANGUAGES[i]
    var code = !namesOnly && l[0] === w && !Object.prototype.hasOwnProperty.call(WORDS, w)
    if (code || l[1].toLowerCase() === w || l.slice(2).indexOf(w) !== -1) return l[1]
  }
  return ""
}

// The question the field shows: the text, or what it is about ("the
// selection", "the copied text").
function askRow(lang, text, context, extra) {
  var row = { key: "translate:" + lang, title: "Translate to " + lang, subtitle: Selection.shown(text), icon: ICON, copy: "",
              remember: false, nodi: "askWith", actionLabel: "Translate",
              ask: { question: "Translate to " + lang + ": " + (context === "selection" ? "the selection" : context === "copied" ? "the copied text" : Selection.shown(text)),
                     message: Selection.message("Translate the text below to " + lang + ".", text), context: context } }
  for (var k in extra) row[k] = extra[k]
  return row
}

var TR = /^\s*tr\s+(.*)$/i
var IN = /^(.+?)\s+in\s+([A-Za-z]+)\s*$/

var provider = {
  id: "translate",
  name: "Translate",
  icon: ICON,
  modes: [{ pattern: /^\s*tr\s/i, label: "Translate", icon: ICON, exclusive: true, hint: "tr <language> <text>" }],
  commands: [{ title: "Translate", keywords: "translate translation language tr", text: "Text to another language, by your agent", complete: "tr " }],
  help: [
    { id: "translate", title: "Translate", icon: ICON, about: "Text to another language, by your agent; Enter pastes it",
      examples: [{ q: "tr ta good morning", note: "To Tamil, by its code or its name" }, { q: "good morning in french" },
                 { q: "tr tamil", note: "The text you selected" }] }
  ],
  match: function(query, ctx) {
    var to = Selection.language(ctx.config)
    var sel = ctx.selection || {}
    var m = String(query).match(TR)
    if (m) {
      var rest = m[1].trim()
      var space = rest.search(/\s/)
      var first = space === -1 ? rest : rest.slice(0, space)
      var named = language(first)
      var lang = named || to
      var text = named ? (space === -1 ? "" : rest.slice(space).trim()) : rest
      if (text) return [askRow(lang, text, "", { score: 98 })]
      if (sel.text) return [askRow(lang, sel.text, Selection.about(sel).context, { score: 98 })]
      // Nothing selected: the clipboard's text, which the row shows.
      if (sel.clipboard) return [askRow(lang, sel.clipboard, "copied", { score: 98 })]
      return [{ title: "Translate to " + lang, subtitle: "Then the text, or select some first", score: 40, copy: "", remember: false,
                hint: "tr <language> <text>" }]
    }
    // "good morning in tamil": a name, never a code, and words before it.
    var at = String(query).match(IN)
    if (!at) return []
    var name = language(at[2], true)
    if (!name || !/\S/.test(at[1])) return []
    // A guess: "weather in thai" may mean something else, so the
    // fallbacks stay under it (lib/Rows.js guess; Fable 2026-10-06).
    return [askRow(name, at[1].trim(), "", { tier: "keyword", kind: "action", guess: true })]
  }
}
