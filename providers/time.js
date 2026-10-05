.pragma library
.import "../lib/tzcities.js" as Tz
.import "../lib/Score.js" as Score

// Time zones and date maths.
//
// Zone offsets come from ctx.zones = { "Asia/Tokyo": { offset: 540, abbr: "JST" } },
// probed with `date` by Nodi.qml, since the QML engine's Intl time zone support is too thin
// to trust for DST. Offsets are "right now", which is what these queries mean.
//
//   time, time in tokyo, tokyo time, 3pm lkt to pst, 15:30 in london
//   days until dec 25, today + 45 days, 2026-01-01 to 2026-09-23, next friday
// Ported from omarchy-commandbar (Saikomantisu, MIT).

var DAY_MS = 86400000
var WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"]
var MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"]
var WD_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
var MON_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

function pad(n) { return (n < 10 ? "0" : "") + n }

// ---------------------------------------------------------------- zones

function resolveZone(name, ctx) {
  var key = String(name || "").trim().toLowerCase()
  if (!key) return null
  if (key === "here" || key === "local" || key === "home") return homeZone(ctx)
  if (Object.prototype.hasOwnProperty.call(Tz.CITIES, key)) return Tz.CITIES[key]
  for (var z in ctx.zones) {
    if (z.toLowerCase() === key) return z
    var city = z.split("/").pop().replace(/_/g, " ").toLowerCase()
    if (city === key) return z
  }
  return null
}

// Your zone: "home" in the config, else the system's own time zone.
function homeZone(ctx) {
  return (ctx.settings && ctx.settings.home) || ctx.localZone || "UTC"
}

function zoneLabel(zone) {
  if (zone === "UTC") return "UTC"
  return zone.split("/").pop().replace(/_/g, " ")
}

// A Date whose UTC fields read as wall-clock time in `zone`.
function wall(utcMs, zone, ctx) {
  return new Date(utcMs + ctx.zones[zone].offset * 60000)
}

function clock(d, ctx) {
  var h = d.getUTCHours(), m = d.getUTCMinutes()
  if (ctx.settings && ctx.settings.clock24 === false) {
    var suffix = h < 12 ? "am" : "pm"
    h = h % 12 || 12
    return h + ":" + pad(m) + " " + suffix
  }
  return pad(h) + ":" + pad(m)
}

function wallDay(d) { return Math.floor(d.getTime() / DAY_MS) }

function dayShift(targetWall, refWall) {
  var diff = wallDay(targetWall) - wallDay(refWall)
  if (diff === 0) return ""
  if (diff === 1) return " (+1 day)"
  if (diff === -1) return " (-1 day)"
  return " (" + (diff > 0 ? "+" : "-") + Math.abs(diff) + " days)"
}

function offsetText(minutes) {
  var sign = minutes < 0 ? "-" : "+"
  var abs = Math.abs(minutes)
  return "UTC" + sign + Math.floor(abs / 60) + (abs % 60 ? ":" + pad(abs % 60) : "")
}

function zoneRow(zone, utcMs, ctx, score) {
  var w = wall(utcMs, zone, ctx)
  var home = homeZone(ctx)
  var shift = ctx.zones[home] ? dayShift(w, wall(utcMs, home, ctx)) : ""
  var info = ctx.zones[zone]
  return {
    title: clock(w, ctx) + " " + zoneLabel(zone) + shift,
    subtitle: WD_SHORT[w.getUTCDay()] + ", " + w.getUTCDate() + " " + MON_SHORT[w.getUTCMonth()]
      + ", " + (info.abbr && !/^[+-]/.test(info.abbr) ? info.abbr + ", " : "") + offsetText(info.offset),
    score: score,
    copy: clock(w, ctx)
  }
}

function pending() {
  return [{ title: "Looking up time zones...", subtitle: "Time", score: 30, copy: "" }]
}

function matchZones(q, ctx) {
  var nowMs = ctx.now().getTime()
  var ready = ctx.zones && Object.keys(ctx.zones).length > 0

  if (/^(time|now|clock|times)$/.test(q)) {
    if (!ready) return pending()
    var zones = [homeZone(ctx)].concat((ctx.settings && ctx.settings.zones) || [])
    var rows = []
    for (var i = 0; i < zones.length; i++) {
      if (ctx.zones[zones[i]] && (i === 0 || zones[i] !== zones[0])) rows.push(zoneRow(zones[i], nowMs, ctx, 85 - i))
    }
    return rows
  }

  var m = q.match(/^(?:time|clock|now)\s+(?:in|at)\s+(.+)$/) || q.match(/^what(?:'s| is)? (?:the )?time(?: is it)? in\s+(.+?)\??$/) || q.match(/^(.+?)\s+time$/)
  if (m) {
    var zone = resolveZone(m[1], ctx)
    if (!zone) return []
    if (!ready || !ctx.zones[zone]) return pending()
    return [zoneRow(zone, nowMs, ctx, 88)]
  }

  // "3pm lkt to pst", "15:30 in london", "9am to tokyo"
  m = q.match(/^(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)?(?:\s+(.+?))?\s+(?:to|in|->|=>)\s+(.+)$/)
  if (m && (m[2] || m[3] || m[4])) {
    var h = parseInt(m[1], 10), min = m[2] ? parseInt(m[2], 10) : 0
    if (m[3]) {
      if (h < 1 || h > 12) return []
      h = (h % 12) + (m[3] === "pm" ? 12 : 0)
    }
    if (h > 23 || min > 59) return []
    var from = m[4] ? resolveZone(m[4], ctx) : homeZone(ctx)
    var to = resolveZone(m[5], ctx)
    if (!from || !to) return []
    if (!ready || !ctx.zones[from] || !ctx.zones[to]) return pending()

    // Today's date as seen in the source zone, at the requested wall time.
    var srcToday = wall(nowMs, from, ctx)
    var srcWallMs = Date.UTC(srcToday.getUTCFullYear(), srcToday.getUTCMonth(), srcToday.getUTCDate(), h, min)
    var utcMs = srcWallMs - ctx.zones[from].offset * 60000
    var srcWall = new Date(srcWallMs)
    var dst = wall(utcMs, to, ctx)
    return [{
      title: clock(dst, ctx) + " " + zoneLabel(to) + dayShift(dst, srcWall),
      subtitle: clock(srcWall, ctx) + " " + zoneLabel(from) + " (" + offsetText(ctx.zones[from].offset) + ") to "
        + zoneLabel(to) + " (" + offsetText(ctx.zones[to].offset) + ")",
      score: 92,
      copy: clock(dst, ctx)
    }]
  }
  return null
}

// ---------------------------------------------------------------- dates

// A day from its parts, overflow carried (the 32nd is the next month's
// 1st), by setFullYear: the Date constructor reads a year under 100 as
// 1900 and on (codex 2026-10-05).
function ymd(y, mo, d) {
  var date = new Date(2000, 0, 1)
  date.setFullYear(y, mo, d)
  return date
}

function midnight(d) { return ymd(d.getFullYear(), d.getMonth(), d.getDate()) }

function monthIndex(word) {
  var w = String(word || "").toLowerCase()
  if (w.length < 3) return -1
  var i = MONTHS.indexOf(w.slice(0, 3))
  if (i === -1) return -1
  // "march" and "mar" are fine, "marble" is not.
  var full = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"][i]
  return (full.indexOf(w) === 0 || (i === 8 && w === "sept")) ? i : -1
}

// Returns { date, hadYear } or null; a date without its year also carries
// { month, day }, and its `date` is this year's, or null in a year it does
// not fall in (February 29). occurrence() places it where a count needs it.
function parseDate(s, today) {
  var t = String(s || "").trim().toLowerCase().replace(/\s+/g, " ")
  if (t === "today" || t === "now") return { date: today, hadYear: true }
  if (t === "tomorrow") return { date: addDays(today, 1), hadYear: true }
  if (t === "yesterday") return { date: addDays(today, -1), hadYear: true }
  if (t === "christmas" || t === "xmas") return yearless(11, 25, today)
  if (t === "new year" || t === "new years" || t === "new year's") return yearless(0, 1, today)

  var m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
  if (m) return validDate(+m[1], +m[2] - 1, +m[3], true)

  m = t.match(/^([a-z]+)\.? (\d{1,2})(?:st|nd|rd|th)?(?:,? (\d{4}))?$/)
  if (m && monthIndex(m[1]) !== -1) return m[3] ? validDate(+m[3], monthIndex(m[1]), +m[2], true) : yearless(monthIndex(m[1]), +m[2], today)

  m = t.match(/^(\d{1,2})(?:st|nd|rd|th)? ([a-z]+)\.?(?:,? (\d{4}))?$/)
  if (m && monthIndex(m[2]) !== -1) return m[3] ? validDate(+m[3], monthIndex(m[2]), +m[1], true) : yearless(monthIndex(m[2]), +m[1], today)

  m = t.match(/^(next|this|last|coming)? ?([a-z]+)$/)
  if (m) {
    var wd = WEEKDAYS.indexOf(m[2])
    if (wd === -1) wd = WEEKDAYS.map(function(d) { return d.slice(0, 3) }).indexOf(m[2])
    if (wd !== -1) {
      var diff = (wd - today.getDay() + 7) % 7
      if (m[1] === "last") diff = diff === 0 ? -7 : diff - 7
      else if (m[1] === "next" && diff === 0) diff = 7
      return { date: addDays(today, diff), hadYear: true }
    }
  }
  return null
}

function validDate(y, mo, d, hadYear) {
  var date = makeDate(y, mo, d)
  return date ? { date: date, hadYear: hadYear } : null
}

// The day itself, or null when the year has no such day. By setFullYear:
// the Date constructor reads a year under 100 as 1900 and on, so 0099-01-01
// was 1999 (codex 2026-10-05).
function makeDate(y, mo, d) {
  var date = ymd(y, mo, d)
  return date.getFullYear() === y && date.getMonth() === mo && date.getDate() === d ? date : null
}

// A month and day with no year: one that falls in some year (February 29
// does, February 30 never), its date this year's or null.
function yearless(mo, d, today) {
  if (!makeDate(2000, mo, d)) return null
  return { date: makeDate(today.getFullYear(), mo, d), hadYear: false, month: mo, day: d }
}

// Where a parsed date falls for a count from today: as given when it had a
// year; else its first day on or after today (dir 1) or its last on or
// before (dir -1), in a year it falls in, so "since dec 25" counts from the
// last one and "until feb 29" to the next leap day (codex 2026-10-05).
function occurrence(r, today, dir) {
  if (!r) return null
  if (r.hadYear) return r.date
  for (var k = 0; k <= 8; k++) {
    var d = makeDate(today.getFullYear() + dir * k, r.month, r.day)
    if (d && (dir > 0 ? d >= today : d <= today)) return d
  }
  return null
}

function addDays(d, n) { return ymd(d.getFullYear(), d.getMonth(), d.getDate() + n) }

function addUnits(d, n, unit) {
  var u = unit.toLowerCase()
  var out = null
  if (/^(d|days?)$/.test(u)) out = addDays(d, n)
  else if (/^(w|wks?|weeks?)$/.test(u)) out = addDays(d, n * 7)
  else if (/^(m|mos?|months?)$/.test(u)) out = ymd(d.getFullYear(), d.getMonth() + n, d.getDate())
  else if (/^(y|yrs?|years?)$/.test(u)) out = ymd(d.getFullYear() + n, d.getMonth(), d.getDate())
  // An offset past what a Date can hold ("in 99999999999 days") is no date.
  return out && !isNaN(out.getTime()) ? out : null
}

function daysBetween(a, b) { return Math.round((midnight(b) - midnight(a)) / DAY_MS) }

// Four digits for a year under 1000, as ISO writes 0099; any other year
// whole (Fable 2026-10-05: 11026 came out as 1026).
function year4(d) { var y = d.getFullYear(); return y >= 0 && y < 1000 ? ("000" + y).slice(-4) : String(y) }

function formatDate(d) {
  return WD_SHORT[d.getDay()] + ", " + d.getDate() + " " + MON_SHORT[d.getMonth()] + " " + year4(d)
}

function isoDate(d) { return year4(d) + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) }

function relative(days) {
  if (days === 0) return "today"
  if (days === 1) return "tomorrow"
  if (days === -1) return "yesterday"
  var n = Math.abs(days)
  var text = n + " days"
  if (n >= 14) text += " (" + Math.floor(n / 7) + "w" + (n % 7 ? " " + (n % 7) + "d" : "") + ")"
  return days > 0 ? "in " + text : text + " ago"
}

function dateRow(date, today, score, note) {
  return {
    title: formatDate(date),
    subtitle: relative(daysBetween(today, date)) + (note ? ", " + note : ""),
    score: score,
    copy: isoDate(date)
  }
}

function countRow(days, a, b, score) {
  var n = Math.abs(days)
  return {
    title: n + (n === 1 ? " day" : " days") + (n >= 14 ? " (" + Math.floor(n / 7) + "w" + (n % 7 ? " " + (n % 7) + "d" : "") + ")" : ""),
    subtitle: formatDate(a) + " to " + formatDate(b),
    score: score,
    copy: String(n)
  }
}

function matchDates(q, ctx) {
  var today = midnight(ctx.now())
  var m

  // "days until dec 25", "until christmas"
  m = q.match(/^(?:how many )?(?:days? )?(?:until|till|til|to|before) (.+?)\??$/)
  if (m) {
    var d = occurrence(parseDate(m[1], today), today, 1)
    if (d) return [countRow(daysBetween(today, d), today, d, 90)]
  }

  // "days since jan 1"
  m = q.match(/^(?:how many )?(?:days? )?since (.+?)\??$/)
  if (m) {
    var since = occurrence(parseDate(m[1], today), today, -1)
    if (since) return [countRow(daysBetween(since, today), since, today, 90)]
  }

  // "today + 45 days", "dec 25 - 2 weeks"
  m = q.match(/^(.+?) ?([+-]) ?(\d+) ?([a-z]+)$/)
  if (m) {
    var base = parseDate(m[1], today)
    var from = base && (base.date || occurrence(base, today, 1))
    var shifted = from && addUnits(from, (m[2] === "-" ? -1 : 1) * parseInt(m[3], 10), m[4])
    if (shifted) return [dateRow(shifted, today, 90)]
  }

  // "in 3 weeks", "3 weeks from now", "10 days ago"
  m = q.match(/^in (\d+) ?([a-z]+)$/) || q.match(/^(\d+) ?([a-z]+) (?:from now|from today|later)$/)
  if (m) {
    var ahead = addUnits(today, parseInt(m[1], 10), m[2])
    if (ahead) return [dateRow(ahead, today, 88)]
  }
  m = q.match(/^(\d+) ?([a-z]+) ago$/)
  if (m) {
    var back = addUnits(today, -parseInt(m[1], 10), m[2])
    if (back) return [dateRow(back, today, 88)]
  }

  // "2026-01-01 to 2026-09-23"
  m = q.match(/^(?:days? )?(?:between |from )?(.+?) (?:to|and|until|-|–) (.+)$/)
  if (m) {
    var a = parseDate(m[1], today), b = parseDate(m[2], today)
    // Without a year, the second date is the first one on or after the
    // first: "dec 25 to jan 1" is a week, "feb 29 to mar 1" a day.
    var da = a && (a.date || occurrence(a, today, 1))
    var db = b && da && (b.hadYear ? b.date : occurrence(b, da, 1))
    if (da && db) return [countRow(daysBetween(da, db), da, db, 88)]
  }

  // A bare date: "dec 25", "next friday"
  var bare = parseDate(q, today)
  var on = bare && (bare.date || occurrence(bare, today, 1))
  if (on && q !== "now") return [dateRow(on, today, 70)]
  return []
}

var provider = {
  id: "time",
  name: "Time",
  icon: "󰥔",
  commands: [
    { title: "World clock", keywords: "time zone zones timezone clock world now", text: "The time now in your saved zones", complete: "time" },
    { title: "Convert a time", keywords: "time zone timezone convert meeting", text: "3pm lkt to pst", complete: "3pm to tokyo", select: true },
    { title: "Date calculator", keywords: "date dates days until since countdown calendar weekday", text: "Days until a date, or between two", complete: "days until dec 25", select: true }
  ],
  help: [
    { id: "time", title: "Time zones", about: "The time anywhere, or a time converted between zones",
      examples: ["time", "time in tokyo", "3pm to new york"] },
    { id: "dates", title: "Dates", icon: "󰃭", about: "Days until a date, days between two, and weekdays",
      examples: ["days until dec 25", "today + 45 days", "next friday"] }
  ],
  match: function(query, ctx) {
    var q = query.trim().toLowerCase().replace(/\s+/g, " ")
    var zoneRows = matchZones(q, ctx)
    if (zoneRows !== null) return Score.answers(zoneRows)
    var dates = matchDates(q, ctx)
    // "sun" or "wed" alone is a guess at a date, never above an app of that
    // name; a date with a number or a relative word is an answer.
    var sure = /\d|today|tomorrow|yesterday|next|last|this|coming|christmas|xmas|new year|until|since|ago|from now/.test(q)
    return Score.answers(dates, sure ? "exact" : "keyword")
  }
}
