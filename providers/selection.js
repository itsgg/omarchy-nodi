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
// Text copied with Ctrl+C in the last two minutes counts too: of a fresh
// selection and a fresh copy, the newer leads, the copy on a tie
// (ctx.selection.source "clipboard", Nodi.qml); a copy's answer pastes
// where the cursor is.
//
//   (empty, fresh)        one row at the top naming the text, "Copied: git
//                         push"; Enter types `copied ` (or `selected `)
//   copied, selected      what can be done with it: Fix spelling and
//                         grammar, Rewrite..., Translate, Change case...,
//                         a search, Summarize, Explain; words after it
//                         narrow them
//   fix, translate, ...   the same rows by name, while it is fresh (two
//                         minutes from when it was first seen): a primary
//                         selection is nearly always there, from any
//                         double-click (Fable 2026-10-06)
//   rewrite <how>         the agent rewrites it as asked
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

// What the text is called and where it came from: selected, or copied
// with Ctrl+C (Nodi.qml readSelection). A copy is not selected in the
// window, so Claude's answer pastes where the cursor is (providers/ask.js).
// `word` is what the home row types to list its actions.
function about(sel) {
  var copied = !!sel && sel.source === "clipboard"
  return { noun: copied ? "the copied text" : "the selection", context: copied ? "copied" : "selection", label: copied ? "Copied: " : "Selected: ",
           word: copied ? "copied" : "selected" }
}

// What Claude is asked for each action: the question as the bar shows it,
// and what the session is told.
function claudeActions(lang, ab) {
  return [
    { id: "fix", title: "Fix spelling and grammar", keywords: "fix spelling grammar typo typos correct proofread",
      question: "Fix the spelling and grammar of " + ab.noun, context: ab.context,
      ask: "Fix the spelling and grammar of the text below. Keep its meaning, tone, language, line breaks and formatting." },
    { id: "translate", title: "Translate to " + lang, keywords: "translate translation language",
      question: "Translate " + ab.noun + " to " + lang, context: ab.context,
      ask: "Translate the text below to " + lang + "." },
    { id: "summarize", title: "Summarize", keywords: "summarize summarise summary tldr shorten",
      question: "Summarize " + ab.noun, context: ab.context,
      ask: "Summarize the text below in a few sentences." },
    { id: "explain", title: "Explain", keywords: "explain meaning what does it mean",
      question: "Explain " + ab.noun, context: ab.context,
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
              run: Run.paste(text), actionLabel: "Paste" }
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
              nodi: "askWith", actionLabel: "Ask", ask: { question: a.question, message: message(a.ask, text), context: a.context || "selection" } }
  for (var k in extra) row[k] = extra[k]
  return row
}

// Every row on the selection, in the order the home view shows them.
function all(text, ctx) {
  var lang = language(ctx.config)
  var ab = about(ctx.selection)
  var ai = claudeActions(lang, ab)
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
    var title = (search.title || search.keyword) + " for " + ab.noun
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

// What an empty bar leads with when the selection is fresh: one row naming
// the text, whose Enter lists what can be done with it. Five rows of
// actions led the bar for two minutes after any copy and pushed Recent
// down, "Fix spelling and grammar" on a copied "git push" (his pick
// 2026-10-07); Alfred shows its actions on a selection by a hotkey of
// their own and Raycast by name, neither on its root list.
function homeRows(ctx) {
  var sel = ctx.selection || {}
  if (!sel.fresh || !sel.text) return []
  var ab = about(sel)
  return [{ key: "selection:actions", title: ab.label + shown(sel.text), subtitle: "Fix, rewrite, translate, change case, search",
            icon: ICON, copy: "", complete: ab.word + " ", actionLabel: "Open", remember: false, score: 300, kind: "action" }]
}

// `copied ` or `selected `, and words after it: the actions on the text,
// all of them in the home view's order, or those the words name. Words
// that name none are the rest of the bar's: a selection is nearly always
// there, and "selected editor" found nothing else (Cursor 2026-10-07).
function actionRows(text, filter, ctx) {
  var sel = ctx.selection || {}
  var group = about(sel).label + shown(text)
  var list = all(text, ctx)
  var out = []
  for (var i = 0; i < list.length; i++) {
    if (!filter) { out.push(list[i].row({ score: 98 - i * 0.01, kind: "action", group: group })); continue }
    var t = Score.tier(filter, { name: list[i].c.title, keywords: list[i].c.keywords })
    if (t && !Score.loose(t)) out.push(list[i].row({ tier: t, kind: "action", group: group }))
  }
  if (!filter) return out
  // A case by its name ("upper") pastes at once.
  for (var j = 0; j < CASES.length; j++) {
    var ct = Score.tier(filter, { name: CASES[j].title, keywords: CASES[j].keywords })
    if (ct && !Score.loose(ct)) out.push(pasteRow("selection:case:" + CASES[j].id, CASES[j].title, CASES[j].change(text),
                                                  { tier: ct, kind: "action", group: group }))
  }
  return out
}

// Ready rewrites under `rewrite ` before he says how, the first chosen, so
// Enter always does one (his screenshot 2026-10-06: the bare mode showed
// a hint row, and Enter did nothing).
var PRESETS = [
  ["Improve the writing", "clearer and more natural, keeping its meaning"],
  ["Shorter", "shorter, keeping what matters"],
  ["More formal", "more formal"],
  ["Friendlier", "friendlier and warmer"],
  ["Simpler", "in simpler words"]
]

function rewriteRow(title, how, text, score, ab) {
  return claudeRow({ id: "rewrite", title: title, question: "Rewrite " + ab.noun + ": " + how, context: ab.context,
                     ask: "Rewrite the text below as asked: " + how + "." }, text, { score: score })
}

var REWRITE = /^\s*rewrite(?:\s+(.*))?$/i
var CASE = /^\s*case(?:\s+(.*))?$/i
var ACTIONS = /^\s*(?:copied|selected)(?:\s+(.*))?$/i

var provider = {
  id: "selection",
  name: "Selection",
  icon: ICON,
  modes: [{ pattern: /^\s*rewrite\s/i, label: "Rewrite", icon: ICON, exclusive: true, hint: "rewrite <how>" },
          { pattern: /^\s*case\s/i, label: "Change case", icon: ICON, exclusive: true, hint: "case <which>" },
          { pattern: /^\s*(?:copied|selected)\s/i, label: "Selection", icon: ICON, exclusive: true, hint: "copied|selected <action>" }],
  help: [
    { id: "selection", title: "Selection", icon: ICON,
      about: "Text you selected before opening the bar: fixed, rewritten, translated, its case changed, searched; pasted over it",
      examples: [{ q: "fix", note: "Fix its spelling and grammar" }, { q: "rewrite shorter", note: "Rewritten as you ask" },
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
      var ab = about(sel)
      if (!how) return PRESETS.map(function(p, n) { return rewriteRow(p[0], p[1], text, 98 - n * 0.01, ab) })
      // His own words first; a preset he typed the start of under it.
      var rows = [rewriteRow("Rewrite: " + how, how, text, 98, ab)]
      PRESETS.forEach(function(p, n) {
        if (p[0].toLowerCase().indexOf(how.toLowerCase()) === 0 && p[0].toLowerCase() !== how.toLowerCase())
          rows.push(rewriteRow(p[0], p[1], text, 97 - n * 0.01, ab))
      })
      return rows
    }
    if ((m = String(query).match(CASE)) && /\s/.test(String(query).replace(/^\s+/, ""))) {
      if (!text) return []
      // A word that is no case is the rest of the bar's, as above: "case
      // study" with any text selected.
      return caseRows(text, String(m[1] || "").trim())
    }
    // Like rewrite and case, any selection: the words were typed for it.
    if ((m = String(query).match(ACTIONS)) && /\s/.test(String(query).replace(/^\s+/, ""))) {
      if (!text) return []
      return actionRows(text, String(m[1] || "").trim(), ctx)
    }
    // By name, while the selection is fresh: each row says what it acts on.
    var q = String(query).trim()
    if (!text || !sel.fresh || q.length < 3) return []
    var out = []
    var list = all(text, ctx)
    for (var i = 0; i < list.length; i++) {
      var t = Score.tier(q, { name: list[i].c.title, keywords: list[i].c.keywords })
      if (t && !Score.loose(t)) out.push(list[i].row({ tier: t, kind: "action", group: about(sel).label + shown(text) }))
    }
    // A case by its name ("uppercase") pastes at once.
    for (var j = 0; j < CASES.length; j++) {
      var ct = Score.tier(q, { name: CASES[j].title, keywords: CASES[j].keywords })
      if (ct && !Score.loose(ct)) out.push(pasteRow("selection:case:" + CASES[j].id, CASES[j].title, CASES[j].change(text),
                                                    { tier: ct, kind: "action", group: about(sel).label + shown(text) }))
    }
    return out
  }
}
