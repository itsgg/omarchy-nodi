.pragma library
.import "../lib/Run.js" as Run
.import "../lib/Placeholders.js" as Placeholders

// Keyword shortcuts defined entirely in config, the no-code extension point:
//
//   { "keyword": "g",  "title": "Search Google", "open": "https://www.google.com/search?q={q}" }
//   { "keyword": "up", "title": "Uptime",        "run":  "notify-send \"$(uptime -p)\"" }
//
// `open` takes every placeholder snippets do ({argument name=..},
// {clipboard}, {date}, {uuid}, lib/Placeholders.js), what you type and the
// clipboard URL-encoded, and goes to xdg-open. In `run`, what you type is
// the command's "$1" and is never written into it, so nothing typed can
// change the command; it uses "$1" as a script does. Nodi once wrote {q}
// into the command, quoted for where it stood, and a quoting lexer could
// not know every place bash evaluates text (arithmetic, backticks; codex
// 2026-10-02 and 2026-10-05): a `run` still holding {q} says to write "$1"
// and runs nothing. Nothing runs until Enter.
// Ported from omarchy-commandbar (Saikomantisu, MIT).

// A `run` takes what is typed when it reads its arguments: $1, ${1}, $@ or
// $*, outside single quotes, where bash reads none of them; awk's '{print
// $1}' is awk's (Fable 2026-10-05: such a command asked for words).
function takesQuery(cmd) {
  if (cmd.open) return Placeholders.takesArguments(cmd.open)
  return /\$(\{?1\}?(?![0-9])|\{?[@*]\}?)/.test(String(cmd.run || "").replace(/'[^']*'/g, ""))
}

// A `run` written for the old {q}: it says how to write it instead.
function outdated(cmd) { return !cmd.open && /\$?\{q\}/.test(String(cmd.run || "")) }
var OUTDATED = "Write \"$1\" where {q} is: what you type is the command's $1"

// Whether a keyword can take a whole query nothing else answered: one
// argument and no clipboard, as Raycast's fallback commands are.
function fallsBack(cmd) {
  if (!cmd.open) return takesQuery(cmd)
  var parts = Placeholders.parse(cmd.open)
  return Placeholders.argumentsOf(parts).length === 1 && !Placeholders.uses(parts, "clipboard")
}

function usesClipboard(cmd) { return !!cmd.open && Placeholders.clipboardNeedsNow(Placeholders.parse(cmd.open)) }

// The clipboard for a link that asks for it: undefined until first read.
function clipboardFor(cmd, ctx) {
  if (!cmd.open || !ctx || !Placeholders.clipboardNeedsNow(Placeholders.parse(cmd.open))) return null
  var got = ctx.request ? ctx.request("clipboard-text") : { state: "pending" }
  return got.state === "pending" && got.value === undefined ? undefined : String(got.value || "")
}

function usable(cmd) { return !!cmd && !!cmd.keyword && !!(cmd.open || cmd.run) && !/\s/.test(String(cmd.keyword)) }

function build(cmd, q, ctx) {
  if (cmd.open) {
    var history = ctx && Array.isArray(ctx.clipboard) ? ctx.clipboard.filter(function(c) { return c && c.type === "text" }).map(function(c) { return String(c.text) }) : []
    var filled = Placeholders.fill(cmd.open, q, { now: ctx && ctx.now ? ctx.now() : new Date(), clipboard: clipboardFor(cmd, ctx) || "",
                                                  clipboardHistory: history, encode: encodeURIComponent,
                                                  selection: ctx && ctx.selection ? ctx.selection.text : "" })
    return Run.open(filled.text)
  }
  if (cmd.run && !outdated(cmd)) return Run.shell(cmd.run, [String(q)])
  return null
}

// What a row will do, said plainly: the site it opens or the command it runs.
function describe(run, cmd) {
  if (!run) return outdated(cmd) ? OUTDATED : ""
  if (run.kind === "open") {
    var host = String(run.target).match(/^[a-z]+:\/\/(?:www\.)?([^\/?#]+)/i)
    return "Opens " + (host ? host[1] : run.target)
  }
  return "Runs " + String(cmd.run)
}

// The words a keyword takes, as the hint line shows them: "g <search>",
// "tr <to> <text>", "[when]" for one with a default.
function pattern(cmd) {
  var kw = String(cmd.keyword)
  if (!takesQuery(cmd)) return ""
  if (!cmd.open) return kw + " <text>"
  var args = Placeholders.argumentsOf(Placeholders.parse(cmd.open))
  return kw + " " + args.map(function(a) {
    var n = a.name || "search"
    return a["default"] !== undefined ? "[" + n + "]" : "<" + n + ">"
  }).join(" ")
}

function list(settings) {
  return Array.isArray(settings) ? settings.filter(usable) : []
}

function escapeRegExp(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&") }

var provider = {
  id: "keywords",
  name: "Keywords",
  icon: "󰆍",
  // A keyword that takes a query, then a space, puts the bar in that mode.
  modes: function(settings) {
    return list(settings).filter(takesQuery).map(function(cmd) {
      return {
        pattern: new RegExp("^\\s*" + escapeRegExp(cmd.keyword) + "\\s", "i"),
        label: cmd.title || cmd.keyword,
        icon: cmd.icon || (cmd.open ? "󰖟" : "󰆍"),
        exclusive: true,
        hint: pattern(cmd)
      }
    })
  },
  help: function(ctx) {
    var examples = list(ctx.settings).map(function(cmd) {
      var kw = String(cmd.keyword)
      var what = describe(build(cmd, "..."), cmd).replace(/%2E%2E%2E/g, "...")
      return { q: takesQuery(cmd) ? kw + " " : kw, note: (cmd.title || kw) + ". " + what }
    })
    if (examples.length === 0) return []
    return [{ id: "keywords", title: "Keywords", icon: "󰌌", about: "Your shortcuts, set in nodi.json", examples: examples }]
  },
  // Searchable by keyword and title: "goo" finds Search Google.
  commands: function(ctx) {
    return list(ctx.settings).map(function(cmd) {
      var kw = String(cmd.keyword)
      return {
        title: cmd.title || kw,
        keywords: kw + " " + (cmd.keywords || ""),
        text: "Keyword \"" + kw + "\"",
        icon: cmd.icon || (cmd.open ? "󰖟" : "󰆍"),
        // A link that reads the clipboard fills its keyword in, so the
        // clipboard is read only when that row is shown.
        complete: takesQuery(cmd) || usesClipboard(cmd) ? kw + " " : "",
        run: takesQuery(cmd) || usesClipboard(cmd) ? null : build(cmd, "", ctx),
        remember: !(cmd.open && Placeholders.hasPlaceholders(cmd.open))
      }
    })
  },
  match: function(query, ctx) {
    var text = String(query).replace(/^\s+/, "")
    var space = text.search(/\s/)
    var word = (space === -1 ? text : text.slice(0, space)).toLowerCase()
    var rest = space === -1 ? "" : text.slice(space).trim()
    var out = []
    var cmds = list(ctx.settings)
    for (var i = 0; i < cmds.length; i++) {
      var cmd = cmds[i]
      if (word !== String(cmd.keyword).toLowerCase()) continue
      var title = cmd.title || cmd.keyword
      var icon = cmd.icon || (cmd.open ? "󰖟" : "󰆍")
      if (outdated(cmd)) {
        out.push({ title: title, subtitle: OUTDATED, score: 95, icon: icon, copy: "", remember: false })
        continue
      }
      // A `run` taking $1, typed alone, asks for it as an `open` does, rather
      // than running with "" (Fable 2026-10-04).
      var missing = cmd.open ? Placeholders.fill(cmd.open, rest, {}).missing : (takesQuery(cmd) && !rest ? [""] : [])
      if (takesQuery(cmd) && clipboardFor(cmd, ctx) === undefined) {
        out.push({ title: title + "...", subtitle: "Reading the clipboard...", score: 95, icon: icon, copy: "", remember: false })
      } else if (takesQuery(cmd)) {
        if (missing.length > 0) {
          // Typed alone, a search takes text selected just before (Raycast's
          // selected text as its argument), and else Enter opens the site
          // itself, as Alfred's web searches do: never a row that does
          // nothing (his screenshot 2026-10-06, the same class).
          var sel = ctx.selection || {}
          if (!rest && sel.fresh && sel.text && fallsBack(cmd)) {
            var line = String(sel.text).replace(/\s+/g, " ").trim()
            out.push({ title: title + ": " + (line.length > 48 ? line.slice(0, 45) + "..." : line),
                       subtitle: sel.source === "clipboard" ? "The copied text" : "The selected text", score: 96,
                       icon: icon, copy: sel.text, run: build(cmd, sel.text, ctx), remember: false, hint: pattern(cmd) })
          }
          // Only a site its words do not change (not https://{q}.github.io/).
          var origin = function(words) { var m = cmd.open ? String(build(cmd, words, ctx).target).match(/^(https?:\/\/[^\/?#]+)/i) : null; return m ? m[1] : "" }
          var site = origin("") && origin("") === origin("nodi") ? [null, origin("")] : null
          // What it is as the label; the words it takes on the hint line.
          out.push({ title: title, subtitle: describe(build(cmd, "", ctx), cmd), score: 95, icon: icon, copy: "", hint: pattern(cmd),
                     run: site ? Run.open(site[1]) : null, actionLabel: site ? "Open the site" : "", remember: false })
        } else {
          var run = build(cmd, rest, ctx)
          // A search names a moment, not a thing: not remembered (Fable 2026-10-02).
          out.push({ title: title + ": " + rest, subtitle: describe(run, cmd), score: 98, icon: icon, copy: rest, run: run, remember: false,
                     hint: pattern(cmd) })
        }
      } else if (!rest) {
        if (clipboardFor(cmd, ctx) === undefined) {
          out.push({ title: title, subtitle: "Reading the clipboard...", score: 95, icon: icon, copy: "", remember: false })
          continue
        }
        var plain = build(cmd, "", ctx)
        out.push({ title: title, subtitle: describe(plain, cmd), score: 98, icon: icon, copy: "", run: plain,
                   remember: !(cmd.open && Placeholders.hasPlaceholders(cmd.open)) })
      }
    }
    return out
  }
}
