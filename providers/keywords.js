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
// clipboard URL-encoded, and goes to xdg-open. In `run`, only {q}: what you type
// is passed as the argument $1, never as shell text, so it cannot change the
// command around it (a quoted "{q}" made $(...) in a query run, codex
// 2026-10-02). Nothing runs until Enter.
// Ported from omarchy-commandbar (Saikomantisu, MIT).

function takesQuery(cmd) { return cmd.open ? Placeholders.takesArguments(cmd.open) : /\{q\}/.test(cmd.run || "") }

// Whether a keyword can take a whole query nothing else answered: one
// argument and no clipboard, as Raycast's fallback commands are.
function fallsBack(cmd) {
  if (!cmd.open) return takesQuery(cmd)
  var parts = Placeholders.parse(cmd.open)
  return Placeholders.argumentsOf(parts).length === 1 && !Placeholders.uses(parts, "clipboard")
}

function usesClipboard(cmd) { return !!cmd.open && Placeholders.uses(Placeholders.parse(cmd.open), "clipboard") }

// The clipboard for a link that asks for it: undefined until first read.
function clipboardFor(cmd, ctx) {
  if (!cmd.open || !ctx || !Placeholders.uses(Placeholders.parse(cmd.open), "clipboard")) return null
  var got = ctx.request ? ctx.request("clipboard-text") : { state: "pending" }
  return got.state === "pending" && got.value === undefined ? undefined : String(got.value || "")
}

function usable(cmd) { return !!cmd && !!cmd.keyword && !!(cmd.open || cmd.run) && !/\s/.test(String(cmd.keyword)) }

// A `run` template with each {q} turned into $1, quoted for where it stands,
// so it is one word, the query as typed, never split or globbed: "$1" bare,
// $1 inside double quotes, '"$1"' inside single quotes, '"$1"$' inside $'...'.
// `$(` and a backtick open a fresh context, as in bash, so {q} inside one is
// judged by the quotes inside it (Fable 2026-10-02). ${q} is read as {q}; a
// backslash escapes what follows; a # comment is copied as it is. Not
// tracked: heredoc bodies and a `case` inside $( ), whose pattern's `)`
// reads as the close; write $1 itself there.
function substitute(template) {
  var t = String(template)
  var out = ""
  var stack = [{ quote: "", close: "", depth: 0 }]
  var at = function() { return stack[stack.length - 1] }
  var wordStart = function(i) { return i === 0 || /[\s;&|()]/.test(t[i - 1]) }
  for (var i = 0; i < t.length; i++) {
    var f = at()
    var token = t.substr(i, 3) === "{q}" ? 3 : (t.substr(i, 4) === "${q}" && f.quote !== "'" && f.quote !== "$'" ? 4 : 0)
    if (token) {
      out += f.quote === "\"" ? "$1" : f.quote === "'" ? "'\"$1\"'" : f.quote === "$'" ? "'\"$1\"$'" : "\"$1\""
      i += token - 1
      continue
    }
    var c = t[i]
    var two = t.substr(i, 2)
    if (f.quote === "'") {
      if (c === "'") f.quote = ""
    } else if (f.quote === "$'") {
      if (c === "\\") { out += two; i++; continue }
      if (c === "'") f.quote = ""
    } else if (c === "\\") {
      out += two; i++; continue
    } else if (two === "$(") {
      stack.push({ quote: "", close: ")", depth: 0 }); out += two; i++; continue
    } else if (c === "`") {
      if (f.close === "`" && f.quote === "") stack.pop()
      else stack.push({ quote: "", close: "`", depth: 0 })
    } else if (f.quote === "\"") {
      if (c === "\"") f.quote = ""
    } else if (two === "$'") {
      f.quote = "$'"; out += two; i++; continue
    } else if (c === "'" || c === "\"") {
      f.quote = c
    } else if (c === "#" && wordStart(i)) {
      var nl = t.indexOf("\n", i)
      var stop = nl === -1 ? t.length : nl
      out += t.slice(i, stop); i = stop - 1; continue
    } else if (c === "(") {
      f.depth++
    } else if (c === ")") {
      if (f.depth > 0) f.depth--
      else if (f.close === ")" && stack.length > 1) stack.pop()
    }
    out += c
  }
  return out
}

function build(cmd, q, ctx) {
  if (cmd.open) {
    var filled = Placeholders.fill(cmd.open, q, { now: ctx && ctx.now ? ctx.now() : new Date(), clipboard: clipboardFor(cmd, ctx) || "",
                                                  encode: encodeURIComponent })
    return Run.open(filled.text)
  }
  if (cmd.run) return Run.shell(substitute(cmd.run), [String(q)])
  return null
}

// What a row will do, said plainly: the site it opens or the command it runs.
function describe(run, cmd) {
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
      var what = describe(build(cmd, "{q}"), cmd).replace(/%7Bq%7D|\{q\}/g, "...")
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
      // A `run` taking {q}, typed alone, asks for it as an `open` does, rather
      // than running with "" (Fable 2026-10-04).
      var missing = cmd.open ? Placeholders.fill(cmd.open, rest, {}).missing : (takesQuery(cmd) && !rest ? [""] : [])
      if (takesQuery(cmd) && clipboardFor(cmd, ctx) === undefined) {
        out.push({ title: title + "...", subtitle: "Reading the clipboard...", score: 95, icon: icon, copy: "", remember: false })
      } else if (takesQuery(cmd)) {
        if (missing.length > 0) {
          // What it is as the label; the words it takes on the hint line.
          out.push({ title: title, subtitle: describe(build(cmd, "", ctx), cmd), score: 95, icon: icon, copy: "", hint: pattern(cmd) })
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
