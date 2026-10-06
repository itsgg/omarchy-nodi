.pragma library
.import "../lib/Run.js" as Run
.import "../lib/Score.js" as Score
.import "keywords.js" as Keywords

// The text selected in the window you came from (ROADMAP 47): Wayland's
// primary selection, which data-control hands to a bar that does not have
// the focus (`wl-paste --primary`, read once an open by Nodi.qml).
// ctx.selection is { text, fresh }: fresh for two minutes from when it was
// first seen, so a selection made long ago does not lead the bar.
//
//   (empty, fresh)        Fix spelling and grammar, Rewrite..., Translate,
//                         Change case..., a search, at the top
//   fix, translate, ...   the same rows by name, while it is fresh (two
//                         minutes from when it was first seen): a primary
//                         selection is nearly always there, from any
//                         double-click (Fable 2026-10-06)
//   rewrite <how>         Claude rewrites it as asked
//   case                  UPPER, lower, Title Case, Sentence case,
//                         snake_case, kebab-case, camelCase
//
// Claude's rows ask the held session (components/Ask.qml) with the text
// attached, and the answer shows as Ask's does: Enter pastes it over the
// selection, which the window still holds, Ctrl+Enter copies it. A case
// is changed here, at once, and pasted the same way. Translate goes to
// "translate": { "language": ... } in nodi.json (providers/translate.js).

var ICON = "󰗧"
var MAX_SHOWN = 48

// The language Translate goes to: nodi.json's, else English.
function language(config) {
  var t = config && config.translate
  var l = t && typeof t.language === "string" ? t.language.trim() : ""
  return l || "English"
}

// What Claude is asked for each action: the question as the bar shows it,
// and what the session is told.
function claudeActions(lang) {
  return [
    { id: "fix", title: "Fix spelling and grammar", keywords: "fix spelling grammar typo typos correct proofread",
      question: "Fix the spelling and grammar of the selection",
      ask: "Fix the spelling and grammar of the text below. Keep its meaning, tone, language, line breaks and formatting." },
    { id: "translate", title: "Translate to " + lang, keywords: "translate translation language",
      question: "Translate the selection to " + lang,
      ask: "Translate the text below to " + lang + "." },
    { id: "summarize", title: "Summarize", keywords: "summarize summarise summary tldr shorten",
      question: "Summarize the selection",
      ask: "Summarize the text below in a few sentences." },
    { id: "explain", title: "Explain", keywords: "explain meaning what does it mean",
      question: "Explain the selection",
      ask: "Explain the text below briefly." }
  ]
}

// The message Claude gets: the instruction, then the text, fenced so a
// selection that reads as an instruction stays text.
function message(instruction, text) {
  return instruction + " Reply with the result only: no preamble, no quotes around it.\n\n<text>\n" + String(text) + "\n</text>"
}

// The first line, shortened, as a row shows what it acts on.
function shown(text) {
  var line = String(text || "").replace(/^\s+/, "").split("\n")[0].replace(/\s+/g, " ").trim()
  return line.length > MAX_SHOWN ? line.slice(0, MAX_SHOWN - 3) + "..." : line
}

// ---------------------------------------------------------------- case

function words(text) {
  return String(text).replace(/([a-z0-9])([A-Z])/g, "$1 $2").split(/[\s_\-.,;:!?()\[\]{}"'\/\\]+/).filter(function(w) { return w !== "" })
}

function capital(w) { return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() }

var CASES = [
  { id: "upper", title: "UPPER CASE", keywords: "upper uppercase caps capitals", change: function(t) { return t.toUpperCase() } },
  { id: "lower", title: "lower case", keywords: "lower lowercase small", change: function(t) { return t.toLowerCase() } },
  { id: "title", title: "Title Case", keywords: "title case capitalize capitalise",
    // A quote opens a word, an apostrophe inside one does not ("it's").
    change: function(t) { return t.toLowerCase().replace(/((?:^|\s)'|^|[\s\-("\/])(\S)/g, function(m, a, b) { return a + b.toUpperCase() }) } },
  { id: "sentence", title: "Sentence case", keywords: "sentence case",
    change: function(t) { return t.toLowerCase().replace(/(^\s*|[.!?]\s+)(\S)/g, function(m, a, b) { return a + b.toUpperCase() }) } },
  { id: "snake", title: "snake_case", keywords: "snake case underscore",
    change: function(t) { return words(t).map(function(w) { return w.toLowerCase() }).join("_") } },
  { id: "kebab", title: "kebab-case", keywords: "kebab case dash hyphen",
    change: function(t) { return words(t).map(function(w) { return w.toLowerCase() }).join("-") } },
  { id: "camel", title: "camelCase", keywords: "camel case",
    change: function(t) { return words(t).map(function(w, i) { return i ? capital(w) : w.toLowerCase() }).join("") } }
]

function pasteRow(key, title, text, extra) {
  var row = { key: key, title: title, subtitle: shown(text), icon: ICON, copy: text, remember: false,
              run: Run.exec(["omarchy-menu-emoji-insert", text]), actionLabel: "Paste" }
  for (var k in extra) row[k] = extra[k]
  return row
}

function caseRows(text, filter) {
  var out = []
  for (var i = 0; i < CASES.length; i++) {
    var c = CASES[i]
    var t = filter ? Score.tier(filter, { name: c.title, keywords: c.keywords }) : "prefix"
    if (!t || Score.loose(t)) continue
    out.push(pasteRow("selection:case:" + c.id, c.title, c.change(text), { score: 97 - out.length * 0.01 }))
  }
  return out
}

// ---------------------------------------------------------------- rows

// The search the selection goes to: the first keyword that opens a page
// and takes one argument (Google's in the defaults; Keywords.fallsBack).
function searchFor(ctx) {
  var list = Keywords.list(ctx.config && ctx.config.keywords).filter(function(k) { return !!k.open && Keywords.fallsBack(k) })
  return list.length ? list[0] : null
}

function claudeRow(a, text, extra) {
  var row = { key: "selection:" + a.id, title: a.title, subtitle: shown(text), icon: ICON, copy: "", remember: false,
              nodi: "askWith", actionLabel: "Ask", ask: { question: a.question, message: message(a.ask, text), context: "selection" } }
  for (var k in extra) row[k] = extra[k]
  return row
}

// Every row on the selection, in the order the home view shows them.
function all(text, ctx) {
  var lang = language(ctx.config)
  var ai = claudeActions(lang)
  var out = [
    { c: ai[0], row: function(x) { return claudeRow(ai[0], text, x) } },
    { c: { title: "Rewrite...", keywords: "rewrite reword rephrase edit tone" },
      row: function(x) { return extend({ key: "selection:rewrite", title: "Rewrite...", subtitle: shown(text), icon: ICON, copy: "",
                                         complete: "rewrite ", remember: false }, x) } },
    { c: ai[1], row: function(x) { return claudeRow(ai[1], text, x) } },
    { c: { title: "Change case...", keywords: "change case upper lower title snake camel kebab" },
      row: function(x) { return extend({ key: "selection:case", title: "Change case...", subtitle: shown(text), icon: ICON, copy: "",
                                         complete: "case ", remember: false }, x) } }
  ]
  var search = searchFor(ctx)
  if (search) {
    var title = (search.title || search.keyword) + " for the selection"
    out.push({ c: { title: title, keywords: "search web look up google " + search.keyword },
               row: function(x) { return extend({ key: "selection:search", title: title, subtitle: shown(text), icon: search.icon || "󰖟",
                                                  copy: text, run: Keywords.build(search, text, ctx), remember: false }, x) } })
  }
  out.push({ c: ai[2], row: function(x) { return claudeRow(ai[2], text, x) } })
  out.push({ c: ai[3], row: function(x) { return claudeRow(ai[3], text, x) } })
  return out
}

function extend(row, extra) {
  for (var k in extra) row[k] = extra[k]
  return row
}

var HOME = 5

// What an empty bar leads with when the selection is fresh: the first five.
function homeRows(ctx) {
  var sel = ctx.selection || {}
  if (!sel.fresh || !sel.text) return []
  return all(sel.text, ctx).slice(0, HOME).map(function(a, n) {
    return a.row({ score: 300 - n, kind: "action", group: "Selected: " + shown(sel.text) })
  })
}

var REWRITE = /^\s*rewrite(?:\s+(.*))?$/i
var CASE = /^\s*case(?:\s+(.*))?$/i

var provider = {
  id: "selection",
  name: "Selection",
  icon: ICON,
  modes: [{ pattern: /^\s*rewrite\s/i, label: "Rewrite", icon: ICON, exclusive: true, hint: "rewrite <how>" },
          { pattern: /^\s*case\s/i, label: "Change case", icon: ICON, exclusive: true, hint: "case <which>" }],
  help: [
    { id: "selection", title: "Selection", icon: ICON,
      about: "Text you selected before opening the bar: fixed, rewritten, translated, its case changed, searched; pasted over it",
      examples: [{ q: "fix", note: "Fix its spelling and grammar" }, { q: "rewrite shorter", note: "Claude rewrites it as asked" },
                 { q: "case ", note: "UPPER, lower, Title Case, snake_case..." }, { q: "translate" }] }
  ],
  match: function(query, ctx) {
    var sel = ctx.selection || {}
    var text = String(sel.text || "")
    var m
    // Nothing selected: no rows, so the rest of the bar answers the words.
    if ((m = String(query).match(REWRITE)) && /\s/.test(String(query).replace(/^\s+/, ""))) {
      if (!text) return []
      var how = String(m[1] || "").trim()
      if (!how) return [{ title: "Rewrite the selection", subtitle: shown(text), score: 40, copy: "", remember: false, hint: "rewrite <how>" }]
      return [claudeRow({ id: "rewrite", title: "Rewrite: " + how, question: "Rewrite the selection: " + how,
                          ask: "Rewrite the text below as asked: " + how + "." }, text, { score: 98 })]
    }
    if ((m = String(query).match(CASE)) && /\s/.test(String(query).replace(/^\s+/, ""))) {
      if (!text) return []
      var rows = caseRows(text, String(m[1] || "").trim())
      return rows.length ? rows : [{ title: "No case matches " + m[1].trim(), subtitle: "Change case", score: 40, copy: "", remember: false }]
    }
    // By name, while the selection is fresh: each row says what it acts on.
    var q = String(query).trim()
    if (!text || !sel.fresh || q.length < 3) return []
    var out = []
    var list = all(text, ctx)
    for (var i = 0; i < list.length; i++) {
      var t = Score.tier(q, { name: list[i].c.title, keywords: list[i].c.keywords })
      if (t && !Score.loose(t)) out.push(list[i].row({ tier: t, kind: "action", group: "Selected: " + shown(text) }))
    }
    // A case by its name ("uppercase") pastes at once.
    for (var j = 0; j < CASES.length; j++) {
      var ct = Score.tier(q, { name: CASES[j].title, keywords: CASES[j].keywords })
      if (ct && !Score.loose(ct)) out.push(pasteRow("selection:case:" + CASES[j].id, CASES[j].title, CASES[j].change(text),
                                                    { tier: ct, kind: "action", group: "Selected: " + shown(text) }))
    }
    return out
  }
}
