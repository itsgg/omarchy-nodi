.pragma library
.import "../lib/Run.js" as Run
.import "../lib/Match.js" as Match
.import "../lib/Score.js" as Score
.import "../lib/Placeholders.js" as Placeholders

// Snippets: text you paste often, set in nodi.json, placeholders and all.
//
//   "snippets": [
//     { "keyword": "sig", "name": "Signature", "text": "Regards,\nGanesh" },
//     { "keyword": "tdy", "name": "Today", "text": "{date format=\"d MMMM yyyy\"}" },
//     { "keyword": "mt", "name": "Meeting", "text": "Meet {argument name=\"who\"} at {argument name=\"when\" default=\"3pm\"}" }
//   ]
//
// Type the keyword, or the name, or `snip ` for all of them; arguments go
// after the keyword ("mt Ravi 4pm"). Enter pastes into the window you were
// in, the way Omarchy pastes an emoji; Ctrl+Enter copies; Ctrl+K types it
// out for an app that ignores Shift+Insert. Placeholders: lib/Placeholders.js.

var LIMIT = 30
var LISTING = /^\s*(?:snip|snippets?)(?:\s+(.*))?$/i

function usable(s) {
  return !!s && typeof s.text === "string" && s.text !== "" && !!(s.keyword || s.name)
         && !/\s/.test(String(s.keyword || ""))
}

function list(settings) { return Array.isArray(settings) ? settings.filter(usable) : [] }

function extend(row, extra) {
  for (var k in extra) row[k] = extra[k]
  return row
}

function escapeRegExp(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&") }

function firstLine(text) {
  var line = String(text).split("\n")[0]
  var more = String(text).indexOf("\n") !== -1
  return line.length > 80 ? line.slice(0, 77) + "..." : line + (more ? " ..." : "")
}

// The clipboard as wl-paste reads it now, when a snippet asks for it:
// undefined while the first read is on its way.
function clipboardNow(ctx) {
  var got = ctx.request ? ctx.request("clipboard-text") : { state: "pending" }
  return got.state === "pending" && got.value === undefined ? undefined : String(got.value || "")
}

// A snippet as a row, filled with what was typed after its keyword.
// "mt <who> [when]": a snippet's arguments as the hint line shows them.
function pattern(s) {
  if (!s.keyword) return ""
  var args = Placeholders.argumentsOf(Placeholders.parse(s.text))
  if (args.length === 0) return ""
  return s.keyword + " " + args.map(function(a) {
    var n = a.name || "text"
    return a["default"] !== undefined ? "[" + n + "]" : "<" + n + ">"
  }).join(" ")
}

// What {clipboard offset="N"} and {snippet name="..."} read: the
// clipboard's history as texts, newest first, and every snippet's text by
// its keyword and its name.
function env(ctx, clip) {
  var history = (Array.isArray(ctx.clipboard) ? ctx.clipboard : []).filter(function(c) { return c && c.type === "text" }).map(function(c) { return String(c.text) })
  var snippets = Object.create(null)
  var all = list(ctx.settings)
  for (var i = 0; i < all.length; i++) {
    if (all[i].keyword) snippets[all[i].keyword] = all[i].text
    if (all[i].name) snippets[all[i].name] = all[i].text
  }
  return { now: ctx.now ? ctx.now() : new Date(), clipboard: clip, clipboardHistory: history, snippets: snippets,
           selection: ctx.selection ? ctx.selection.text : "" }
}

// Pasted, then the cursor moved back to where {cursor} was: one Left key
// a character, as a field moves; at most 500.
function pasteRun(text, back) {
  if (!(back > 0)) return Run.exec(["omarchy-menu-emoji-insert", text])
  return Run.pasting(Run.shell('omarchy-menu-emoji-insert "$1" || exit; sleep 0.1; n=$2; a=(); while [ "$n" -gt 0 ]; do a+=(-k Left); n=$((n-1)); done; exec wtype "${a[@]}"',
                   [text, String(Math.min(500, back))]))
}

function row(s, typed, ctx, extra) {
  var name = s.name || s.keyword
  var parts = Placeholders.parse(s.text)
  var clip = null
  if (Placeholders.clipboardNeedsNow(parts, env(ctx, null).snippets)) {
    clip = clipboardNow(ctx)
    if (clip === undefined) return extend({ key: "snippet:" + (s.keyword || name), title: name, subtitle: "Reading the clipboard...",
                                            icon: s.icon || "󰅪", copy: "", remember: false, group: "Snippets" }, extra)
  }
  var filled = Placeholders.fill(s.text, typed, env(ctx, clip))
  var out = { key: "snippet:" + (s.keyword || name), title: name, badge: s.keyword || "", icon: s.icon || "󰅪", group: "Snippets",
              hint: pattern(s) }
  // The text in the pane: filled in, or the template while arguments are missing.
  out.preview = { title: name, subtitle: s.keyword ? "Keyword " + s.keyword : "", text: filled.missing.length > 0 ? s.text : filled.text, mono: true }
  if (filled.missing.length > 0) {
    // The arguments as labels, defaults beside them; the pattern on the hint line.
    out.subtitle = s.keyword ? filled.args.map(function(a) { return (a.name || "text") + (a["default"] !== undefined ? " (" + a["default"] + ")" : "") }).join(", ")
                             : "No keyword in nodi.json"
    out.copy = ""
    out.complete = s.keyword ? s.keyword + " " : ""
    out.remember = false
    return extend(out, extra)
  }
  out.subtitle = firstLine(filled.text) || "(empty)"
  out.copy = filled.text
  out.run = pasteRun(filled.text, filled.cursorBack)
  out.actionLabel = "Paste"
  out.actions = [
    { label: "Copy", icon: "󰆏", run: Run.copy(filled.text) },
    { label: "Type it out", icon: "󰌌", run: Run.pasting(Run.shell('sleep 0.15; exec wtype -- "$1"', [filled.text])) }
  ]
  // Only a snippet with no placeholder is remembered: history replays the
  // text it stored, and a date or the clipboard would come back stale.
  out.remember = !Placeholders.hasPlaceholders(s.text)
  return extend(out, extra)
}

var provider = {
  id: "snippets",
  name: "Snippets",
  icon: "󰅪",
  sources: {
    // What is on the clipboard now: Omarchy's history leaves out what was
    // copied as sensitive, so its newest entry is not always the clipboard.
    "clipboard-text": {
      argv: function() { return ["/usr/bin/wl-paste", "--no-newline", "--type", "text"] },
      parse: function(text, ok) { return ok ? String(text) : "" },
      maxAgeMs: 1000,
      timeoutMs: 1500,
      maxBytes: 1048576
    }
  },
  // `snip ` lists them; a keyword that takes arguments, then a space, is
  // that snippet's own mode, as a keyword's search is.
  modes: function(settings) {
    var out = [{ pattern: /^\s*(?:snip|snippets?)(\s|$)/i, label: "Snippets", icon: "󰅪", exclusive: true }]
    var all = list(settings)
    for (var i = 0; i < all.length; i++) {
      if (!all[i].keyword || !Placeholders.takesArguments(all[i].text)) continue
      out.push({ pattern: new RegExp("^\\s*" + escapeRegExp(all[i].keyword) + "\\s", "i"), label: all[i].name || all[i].keyword,
                 icon: all[i].icon || "󰅪", exclusive: true, hint: pattern(all[i]) })
    }
    return out
  },
  commands: [
    { title: "Snippets", keywords: "snippets snippet text expand paste template", text: "Paste text you set in nodi.json", complete: "snip " }
  ],
  help: function(ctx) {
    var examples = [{ q: "snip ", note: "Every snippet" }]
    var all = list(ctx.settings)
    for (var i = 0; i < all.length && examples.length < 6; i++) {
      var s = all[i]
      var takes = Placeholders.takesArguments(s.text)
      examples.push({ q: (s.keyword || s.name) + (takes ? " " : ""), note: (s.name || s.keyword) + (takes ? ", then " + Placeholders.hint(s.text) : "") })
    }
    return [{ id: "snippets", title: "Snippets", icon: "󰅪", about: "Text you paste often, with placeholders, set in nodi.json", examples: examples }]
  },
  match: function(query, ctx) {
    var all = list(ctx.settings)
    var listing = String(query).match(LISTING)
    if (listing) {
      if (all.length === 0) return [{ title: "No snippets yet", subtitle: "Set in nodi.json", score: 50, copy: "", remember: false,
                                      run: ctx.home ? Run.exec(["omarchy-launch-editor", ctx.home + "/.config/omarchy/extensions/nodi.json"]) : null,
                                      actionLabel: "Edit" }]
      var words = Match.normalise(listing[1]).split(" ").filter(Boolean)
      var out = []
      for (var i = 0; i < all.length && out.length < LIMIT; i++) {
        var hay = Match.folded([all[i].keyword, all[i].name, all[i].text].join(" "))
        if (words.some(function(w) { return hay.indexOf(w) === -1 })) continue
        out.push(row(all[i], "", ctx, { score: 97 - out.length * 0.01 }))
      }
      return out.length ? out : [{ title: "No snippet matches " + listing[1].trim(), subtitle: "Snippets", score: 40, copy: "", remember: false }]
    }

    var text = String(query).replace(/^\s+/, "")
    var space = text.search(/\s/)
    var word = (space === -1 ? text : text.slice(0, space)).toLowerCase()
    var rest = space === -1 ? "" : text.slice(space).trim()
    var q = text.trim()
    var rows = []
    for (var j = 0; j < all.length; j++) {
      var s = all[j]
      if (s.keyword && word === String(s.keyword).toLowerCase() && (rest === "" || Placeholders.takesArguments(s.text))) {
        rows.push(row(s, rest, ctx, { tier: "exact", kind: "answer" }))
        continue
      }
      if (!q) continue
      var t = Score.tier(q, { name: s.name || s.keyword, whole: true, aliases: s.keyword ? [s.keyword] : [], keywords: ["snippet"] })
      if (t) rows.push(row(s, "", ctx, { tier: t, kind: "item" }))
    }
    return rows
  },
  // A saved row as nodi.json has it now: "snippet:<keyword or name>". One
  // that waits for arguments has no run, and its saved copy stands; so does
  // one that reads the clipboard, which the home would read and show.
  resolve: function(key, ctx) {
    var all = list(ctx.settings)
    for (var i = 0; i < all.length; i++) {
      if ("snippet:" + (all[i].keyword || all[i].name) !== key) continue
      if (Placeholders.uses(Placeholders.parse(all[i].text), "clipboard")) return null
      return row(all[i], "", ctx, { tier: "exact", kind: "item" })
    }
    return null
  }
}
