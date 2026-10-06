.pragma library
.import "Graphemes.js" as Graphemes

// Placeholders in snippets and in keyword links, Raycast's syntax:
//
//   {q}, {argument}                      what you type after the keyword
//   {argument name="to" default="me"}    a named argument; one word each,
//                                        "quoted words" for spaces, the
//                                        last one takes the rest
//   {clipboard}                          the clipboard's text, now
//   {date}, {time}, {datetime}, {day}    2026-10-03, 14:05, both, Saturday
//   {date format="d MMM" offset="+1d"}   any format, moved by +/-N m h d w M y
//   {uuid}                               a random v4 UUID
//   {clipboard offset="1"}               an older entry of the clipboard's
//                                        history, 1 the one before the last
//   {snippet name="sig"}                 another snippet's text, as written
//   {random from="a,b,c"}                one of them; or min="1" max="6"
//   {cursor}                             where the cursor is left after a
//                                        paste: Left keys back from the end
//                                        (ROADMAP 61)
//
// A brace that names none of these is text, so JSON and code in a snippet
// stay as written.

var NAMES = ["q", "argument", "clipboard", "date", "time", "datetime", "day", "uuid", "snippet", "random", "cursor"]
var TOKEN = /\{(q|argument|clipboard|date|time|datetime|day|uuid|snippet|random|cursor)((?:\s+[a-z]+="[^"]*")*)\s*\}/g
var FORMATS = { date: "yyyy-MM-dd", time: "HH:mm", datetime: "yyyy-MM-dd HH:mm", day: "EEEE" }

// [{ text } | { name, attrs }]: the template cut at its placeholders.
function parse(template) {
  var t = String(template || "")
  var out = []
  var last = 0
  var m
  TOKEN.lastIndex = 0
  while ((m = TOKEN.exec(t)) !== null) {
    if (m.index > last) out.push({ text: t.slice(last, m.index) })
    var attrs = {}
    var a, re = /([a-z]+)="([^"]*)"/g
    while ((a = re.exec(m[2])) !== null) attrs[a[1]] = a[2]
    out.push({ name: m[1], attrs: attrs })
    last = TOKEN.lastIndex
  }
  if (last < t.length) out.push({ text: t.slice(last) })
  return out
}

// The arguments a template asks for, in order, once each:
// [{ name, default }]. {q} and an unnamed {argument} are one, named "".
function argumentsOf(parts) {
  var out = []
  var seen = Object.create(null)
  for (var i = 0; i < parts.length; i++) {
    var p = parts[i]
    if (p.name !== "q" && p.name !== "argument") continue
    var name = p.name === "q" ? "" : String(p.attrs.name || "")
    if (name in seen) {
      if (p.attrs["default"] !== undefined && out[seen[name]]["default"] === undefined) out[seen[name]]["default"] = p.attrs["default"]
      continue
    }
    seen[name] = out.length
    out.push({ name: name, "default": p.attrs["default"] })
  }
  return out
}

// Whether a template has any placeholder: a row made from one names a
// moment (today's date, what was copied), so it is never remembered and
// replayed (Fable 2026-10-03).
function hasPlaceholders(template) {
  var parts = parse(template)
  for (var i = 0; i < parts.length; i++) if (parts[i].name) return true
  return false
}

function uses(parts, name) {
  for (var i = 0; i < parts.length; i++) if (parts[i].name === name) return true
  return false
}

// What was typed, cut into `count` values: a word each ("double quotes"
// hold spaces), the last taking the rest as typed. One argument takes all.
function split(typed, count) {
  var t = String(typed || "").trim()
  if (count <= 1) return t ? [t] : []
  var out = []
  var re = /\s*(?:"([^"]*)"|(\S+))/g
  var at = 0
  var m
  while (out.length < count - 1 && (m = re.exec(t)) !== null) {
    out.push(m[1] !== undefined ? m[1] : m[2])
    at = re.lastIndex
  }
  var rest = t.slice(at).trim()
  if (rest) out.push(/^"[^"]*"$/.test(rest) ? rest.slice(1, -1) : rest)
  return out
}

function pad(n, width) {
  var s = String(n)
  while (s.length < width) s = "0" + s
  return s
}

var MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]
var DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]

// Unicode date patterns, the part people use: yyyy yy MMMM MMM MM M dd d
// EEEE EEE HH H hh h mm ss a; 'quoted' text is copied as it is, '' being
// one apostrophe in it or outside it ("HH 'o''clock'": 23 o'clock). A date
// out of range formats as nothing.
function formatDate(d, pattern) {
  if (isNaN(d.getTime())) return ""
  var p = String(pattern)
  var out = ""
  var i = 0
  while (i < p.length) {
    var c = p[i]
    if (c === "'") {
      if (p[i + 1] === "'") { out += "'"; i += 2; continue }
      i++
      while (i < p.length) {
        if (p[i] === "'" && p[i + 1] === "'") { out += "'"; i += 2; continue }
        if (p[i] === "'") { i++; break }
        out += p[i++]
      }
      continue
    }
    var run = 1
    while (i + run < p.length && p[i + run] === c) run++
    var h12 = d.getHours() % 12 === 0 ? 12 : d.getHours() % 12
    var piece
    switch (c) {
    case "y": piece = run === 2 ? pad(d.getFullYear() % 100, 2) : String(d.getFullYear()); break
    case "M": piece = run >= 4 ? MONTHS[d.getMonth()] : run === 3 ? MONTHS[d.getMonth()].slice(0, 3) : pad(d.getMonth() + 1, run); break
    case "d": piece = pad(d.getDate(), run); break
    case "E": piece = run >= 4 ? DAYS[d.getDay()] : DAYS[d.getDay()].slice(0, 3); break
    case "H": piece = pad(d.getHours(), run); break
    case "h": piece = pad(h12, run); break
    case "m": piece = pad(d.getMinutes(), run); break
    case "s": piece = pad(d.getSeconds(), run); break
    case "a": piece = d.getHours() < 12 ? "AM" : "PM"; break
    default: piece = p.substr(i, run)
    }
    out += piece
    i += run
  }
  return out
}

// A month or year later or earlier, on the same day or the month's last:
// Jan 31 and a month is Feb 28, as Raycast and date-fns have it.
function addMonths(d, n) {
  var day = d.getDate()
  d.setDate(1)
  d.setMonth(d.getMonth() + n)
  var last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
  d.setDate(Math.min(day, last))
}

// "+1d", "-2h", "+1w+3h": the date moved; minutes, hours, days, weeks,
// months (M) and years. Anything else leaves it where it is. A move past
// what a date can hold makes it no date, which formats as nothing
// (formatDate): "+999999999d" once threw (codex 2026-10-04), and a cap on
// each unit then refused "+100001m", ten weeks (codex 2026-10-05).
function shift(d, offset) {
  var out = new Date(d.getTime())
  var re = /([+-]\d+)\s*([mhdwMy])/g
  var m
  while ((m = re.exec(String(offset || ""))) !== null) {
    var n = Number(m[1])
    if (!isFinite(n)) { out = new Date(NaN); break }
    if (isNaN(out.getTime())) break
    if (m[2] === "m") out.setMinutes(out.getMinutes() + n)
    else if (m[2] === "h") out.setHours(out.getHours() + n)
    else if (m[2] === "d") out.setDate(out.getDate() + n)
    else if (m[2] === "w") out.setDate(out.getDate() + 7 * n)
    else if (m[2] === "M") addMonths(out, n)
    else addMonths(out, 12 * n)
  }
  return out
}

function uuid(random) {
  var r = random || Math.random
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function(c) {
    var v = Math.floor(r() * 16)
    return (c === "x" ? v : (v & 3) | 8).toString(16)
  })
}

// The template with its values in: { text, missing: [argument names],
// clipboard: whether it asked for the clipboard }. env: { now: Date,
// clipboard: string or null while unread, random, encode: applied to what
// was typed and to the clipboard, as a link's encodeURIComponent; a date is
// in the format its author wrote, slashes and all }.
function fill(template, typed, env) {
  var parts = parse(template)
  var args = argumentsOf(parts)
  var given = split(typed, args.length)
  var values = Object.create(null)
  var missing = []
  for (var i = 0; i < args.length; i++) {
    var v = i < given.length ? given[i] : args[i]["default"]
    if (v === undefined || v === "") missing.push(args[i].name)
    values[args[i].name] = v === undefined ? "" : v
  }
  var e = env || {}
  var now = e.now || new Date()
  var encode = e.encode || function(s) { return s }
  var text = ""
  var cursorAt = -1
  for (var j = 0; j < parts.length; j++) {
    var p = parts[j]
    if (p.text !== undefined) { text += p.text; continue }
    if (p.name === "q") text += encode(String(values[""]))
    else if (p.name === "argument") text += encode(String(values[String(p.attrs.name || "")]))
    else if (p.name === "clipboard") text += encode(clipboardAt(e, p.attrs.offset))
    else if (p.name === "uuid") text += uuid(e.random)
    else if (p.name === "snippet") text += encode(snippetText(e, p.attrs.name))
    else if (p.name === "random") text += encode(randomOf(p.attrs, e.random))
    else if (p.name === "cursor") { if (cursorAt === -1) cursorAt = text.length }
    else text += formatDate(shift(now, p.attrs.offset), p.attrs.format || FORMATS[p.name])
  }
  // Places from the cursor's to the end, for the Left keys: grapheme
  // clusters, as a field moves over them (Fable 2026-10-06: by code point,
  // a Tamil vowel sign or an accent left the cursor a place short).
  var back = cursorAt === -1 ? 0 : Graphemes.count(text.slice(cursorAt))
  return { text: text, missing: missing, clipboard: uses(parts, "clipboard") && clipboardNeedsNow(parts), args: args, cursorBack: back }
}

// {clipboard} is what is copied now (env.clipboard); {clipboard offset="N"}
// the Nth entry before it in the history (env.clipboardHistory, newest
// first, texts), "" past its end.
function clipboardAt(e, offset) {
  var n = Number(offset || 0)
  if (!(n > 0)) return e.clipboard === null || e.clipboard === undefined ? "" : String(e.clipboard)
  var h = Array.isArray(e.clipboardHistory) ? e.clipboardHistory : []
  return h[Math.floor(n)] === undefined ? "" : String(h[Math.floor(n)])
}

// Whether the clipboard now is read: an offset reads the history only.
function clipboardNeedsNow(parts) {
  for (var i = 0; i < parts.length; i++) if (parts[i].name === "clipboard" && !(Number(parts[i].attrs.offset || 0) > 0)) return true
  return false
}

// Another snippet's text as written, its own placeholders left as text:
// one level, so two snippets that name each other cannot loop.
function snippetText(e, name) {
  var all = e.snippets || {}
  var key = String(name || "")
  return Object.prototype.hasOwnProperty.call(all, key) ? String(all[key]) : ""
}

function randomOf(attrs, random) {
  var r = random || Math.random
  if (attrs.from !== undefined) {
    var choices = String(attrs.from).split(",").map(function(c) { return c.trim() }).filter(function(c) { return c !== "" })
    return choices.length ? choices[Math.floor(r() * choices.length) % choices.length] : ""
  }
  var lo = Math.ceil(Number(attrs.min === undefined ? 1 : attrs.min)), hi = Math.floor(Number(attrs.max === undefined ? 100 : attrs.max))
  if (!isFinite(lo) || !isFinite(hi) || hi < lo) return ""
  return String(lo + Math.floor(r() * (hi - lo + 1)))
}

// Whether a template takes what is typed after its keyword.
function takesArguments(template) { return argumentsOf(parse(template)).length > 0 }

// The arguments as a hint: "to, subject", or "text" for the unnamed one.
function hint(template) {
  return argumentsOf(parse(template)).map(function(a) { return a.name || "text" }).join(", ")
}
