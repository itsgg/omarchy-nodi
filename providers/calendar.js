.pragma library
.import "../lib/Run.js" as Run
.import "../lib/Score.js" as Score
.import "../lib/Match.js" as Match

// Calendar (ROADMAP 67, L 9), from the iCal addresses in nodi.json and off
// until one is set (his call):
//
//   "calendar": { "ics": "https://calendar.google.com/calendar/ical/.../basic.ics" }
//
// or a list of them, each a string or { "url", "name" }, and "me": your
// address, so an invitation you declined is left out (a Google feed's own
// address is taken as yours). A meeting under way or starting within the
// hour leads the empty bar and is found by its title, Enter joining it
// (its Meet, Zoom or Teams link) or, with none, opening it in Google
// Calendar; `cal` lists the next eight days in order, the words after it
// finding events by title, place or calendar. lib/ics.py reads the feeds,
// fetched again every ten minutes, and works out what repeats.

var ICON = "󰃭"
var SOON_MS = 60 * 60 * 1000
// A meeting under way leads while it is on, one over three hours (a day
// of workshops, a focus block) only in its first ten minutes.
var LONG_MS = 3 * 60 * 60 * 1000
var LATE_MS = 10 * 60 * 1000
var LIST_LIMIT = 80
var DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
var HOSTS = [[/(^|\.)meet\.google\.com$/, "Google Meet"], [/(^|\.)zoom(gov)?\.(us|com)$/, "Zoom"], [/^teams\.(microsoft|live)\.com$/, "Teams"],
             [/\.webex\.com$/, "Webex"], [/^meet\.jit\.si$/, "Jitsi"], [/(^|\.)whereby\.com$/, "Whereby"], [/^app\.slack\.com$/, "Slack"],
             [/(^|\.)chime\.aws$/, "Chime"], [/^meet\.around\.co$/, "Around"], [/(^|\.)gather\.town$/, "Gather"], [/^discord\.gg$/, "Discord"]]

// The feeds as nodi.json names them: [{ url, name }].
function feedsOf(settings) {
  var s = settings || {}
  var list = Array.isArray(s.ics) ? s.ics : (s.ics ? [s.ics] : [])
  var out = []
  for (var i = 0; i < list.length; i++) {
    var c = list[i]
    var url = typeof c === "string" ? c : (c && typeof c.url === "string" ? c.url : "")
    if (!url.trim()) continue
    out.push({ url: url.trim(), name: c && typeof c === "object" && c.name ? String(c.name) : "" })
  }
  return out
}

// What lib/ics.py is handed, in its environment (NODI_ICS): "" when no
// feed is set, and the calendar is off.
function param(settings) {
  var feeds = feedsOf(settings)
  return feeds.length ? JSON.stringify({ calendars: feeds, me: String((settings && settings.me) || "") }) : ""
}

function pad(n) { return (n < 10 ? "0" : "") + n }

function clock(ms, h24) {
  var d = new Date(ms)
  if (h24) return pad(d.getHours()) + ":" + pad(d.getMinutes())
  return (d.getHours() % 12 || 12) + ":" + pad(d.getMinutes()) + (d.getHours() < 12 ? " AM" : " PM")
}

function isoOf(d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) }

// "Today", "Tomorrow", or "Thursday 8 Oct", for a day as lib/ics.py gives it.
function dayName(iso, nowMs) {
  var now = new Date(nowMs)
  if (iso === isoOf(now)) return "Today"
  if (iso === isoOf(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1))) return "Tomorrow"
  var p = String(iso).split("-")
  var d = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]))
  return DAY_NAMES[d.getDay()] + " " + d.getDate() + " " + MONTHS[d.getMonth()]
}

function inWords(ms) {
  var m = Math.max(1, Math.round(ms / 60000))
  if (m < 60) return m + " min"
  var h = Math.floor(m / 60)
  return h + " h" + (m % 60 && h < 3 ? " " + (m % 60) + " min" : "")
}

function clock24(ctx) {
  var t = ctx && ctx.config && ctx.config.time
  return !(t && t.clock24 === false)
}

// When it is, by the clock: "Now, until 10:30", "In 12 min, 10:00 to
// 10:30", "Tomorrow, 10:00 to 10:30", "All day": each row says its day,
// as a day's header over its one row would not show (a header only over
// a group of more than one, item 24).
function when(ev, nowMs, h24) {
  var day = ev.day && ev.day !== isoOf(new Date(nowMs)) ? dayName(ev.day, nowMs) : ""
  if (ev.allDay) {
    var last = isoOf(new Date(ev.end - 1))
    var span = "all day" + (last !== ev.day ? ", until " + dayName(last, nowMs).replace(/^To(day|morrow)$/, "to$1") : "")
    var text = ev.start <= nowMs || !day ? span : day + ", " + span
    return text.charAt(0).toUpperCase() + text.slice(1)
  }
  var range = clock(ev.start, h24) + " to " + clock(ev.end, h24)
  if (ev.start <= nowMs && nowMs < ev.end) return "Now, until " + clock(ev.end, h24)
  if (ev.start - nowMs < 12 * 60 * 60 * 1000 && !day) return "In " + inWords(ev.start - nowMs) + ", " + range
  return (day || "Today") + ", " + range
}

function hostOf(link) {
  var m = String(link || "").match(/^https?:\/\/([^\/?#:]+)/i)
  var host = m ? m[1].toLowerCase() : ""
  for (var i = 0; i < HOSTS.length; i++) if (HOSTS[i][0].test(host)) return HOSTS[i][1]
  return host
}

function short(text, n) {
  var t = String(text || "").replace(/\s+/g, " ").trim()
  return t.length > n ? t.slice(0, n - 3) + "..." : t
}

// Its day and hours, "Today, 10:00 to 10:30".
function span(ev, nowMs, h24) {
  return (ev.day ? dayName(ev.day, nowMs) + ", " : "") + (ev.allDay ? "all day" : clock(ev.start, h24) + " to " + clock(ev.end, h24))
}

// The event as text, for Copy.
function told(ev, nowMs, h24) {
  var lines = [ev.title, span(ev, nowMs, h24)]
  if (ev.location) lines.push(ev.location)
  if (ev.link && ev.link !== ev.location) lines.push(ev.link)
  return lines.join("\n")
}

// A row for an occurrence; `many` when more than one calendar is set, so
// each row names its own.
function rowOf(ev, data, nowMs, h24, many) {
  var d = (data.details || {})[ev.d] || {}
  var where = ev.link ? hostOf(ev.link) : short(ev.location, 40)
  var subtitle = when(ev, nowMs, h24) + (where ? ", " + where : "") + (many && ev.calendar ? ", " + ev.calendar : "")
  var details = told(ev, nowMs, h24)
  var run = ev.link ? Run.open(ev.link) : d.page ? Run.open(d.page) : Run.copy(details)
  var actions = []
  if (ev.link) actions.push({ label: "Copy the meeting link", icon: "󰆏", run: Run.copy(ev.link) })
  if (ev.link && d.page) actions.push({ label: "Open in Google Calendar", icon: ICON, run: Run.open(d.page) })
  if (run.kind !== "copy") actions.push({ label: "Copy the details", icon: "󰆏", run: Run.copy(details) })
  var labels = [["When", span(ev, nowMs, h24)]]
  if (ev.calendar) labels.push(["Calendar", ev.calendar])
  if (ev.location) labels.push(["Where", short(ev.location, 120)])
  if (ev.link) labels.push(["Join", hostOf(ev.link)])
  if (d.organizer) labels.push(["Organizer", d.organizer])
  if (d.guests) labels.push(["Guests", String(d.guests)])
  return { key: "cal:" + ev.key, title: short(ev.title, 120) + (ev.tentative ? " (tentative)" : ""), subtitle: subtitle, icon: ICON,
           run: run, actionLabel: ev.link ? "Join" : d.page ? "Open" : "Copy", actions: actions, copy: ev.link || details, remember: false,
           preview: { title: ev.title, subtitle: when(ev, nowMs, h24), labels: labels, text: d.description || "" } }
}

// The meetings that lead: under way (a long one only as it starts) or
// starting within the hour; never one that is all day.
function soon(events, nowMs) {
  return (events || []).filter(function(e) {
    if (e.allDay || e.end <= nowMs) return false
    if (e.start <= nowMs) return e.end - e.start <= LONG_MS || nowMs - e.start <= LATE_MS
    return e.start - nowMs <= SOON_MS
  })
}

function data(ctx, fetch) {
  var p = param(ctx.settings)
  if (!p || !ctx.request) return null
  return ctx.request("calendar", p, fetch ? undefined : { fetch: false })
}

// On the empty bar: the next meetings, two at most.
function homeRows(ctx) {
  var got = data(ctx, false)
  if (!got || !got.value) return []
  var nowMs = ctx.now().getTime()
  var h24 = clock24(ctx)
  var many = feedsOf(ctx.settings).length > 1
  return soon(got.value.events, nowMs).slice(0, 2).map(function(ev, i) {
    var r = rowOf(ev, got.value, nowMs, h24, many)
    r.score = 60 - i
    r.group = "Calendar"
    return r
  })
}

function listRows(ctx, words) {
  var got = data(ctx, true)
  if (!got.value) return [{ title: got.state === "error" ? "The calendar could not be read" : "Reading the calendar...", subtitle: got.error || "", icon: ICON, score: 40, copy: "", remember: false }]
  var nowMs = ctx.now().getTime()
  var h24 = clock24(ctx)
  var many = feedsOf(ctx.settings).length > 1
  var out = []
  var cals = got.value.calendars || []
  for (var c = 0; c < cals.length; c++) {
    var k = cals[c]
    if (!k.ok) out.push({ key: "cal:error:" + c, title: k.name + " could not be read", subtitle: k.error || "", icon: "󰀦", score: 99, copy: "", remember: false })
    else if (k.stale) out.push({ key: "cal:stale:" + c, title: k.name + " as last read" + (k.fetchedAt ? ", " + dayName(isoOf(new Date(k.fetchedAt)), nowMs).toLowerCase() + " at " + clock(k.fetchedAt, h24) : ""),
                                 subtitle: k.error ? "The new copy failed: " + k.error : "", icon: "󰀦", score: 99, copy: "", remember: false })
  }
  var terms = Match.fold(words).split(/\s+/).filter(function(w) { return w })
  var events = (got.value.events || []).filter(function(e) {
    if (e.end <= nowMs) return false
    var hay = Match.fold(e.title + " " + (e.location || "") + " " + (e.calendar || ""))
    return terms.every(function(w) { return hay.indexOf(w) !== -1 })
  })
  for (var i = 0; i < events.length && i < LIST_LIMIT; i++) {
    var r = rowOf(events[i], got.value, nowMs, h24, many)
    r.score = 97 - i * 0.001
    out.push(r)
  }
  if (!events.length) out.push({ title: terms.length ? "No event holds \"" + String(words).trim() + "\"" : "Nothing in the next eight days",
                                 subtitle: cals.map(function(x) { return x.name }).join(", "), icon: ICON, score: 40, copy: "", remember: false })
  return out
}

var provider = {
  id: "calendar",
  name: "Calendar",
  icon: ICON,
  // A mode only once a feed is set: until then "cal ..." is anyone's
  // (Sonnet 2026-10-06).
  modes: function(settings) { return param(settings) ? [{ pattern: /^\s*cal\s/i, label: "Calendar", icon: ICON, exclusive: true, hint: "cal <words>" }] : [] },
  // Only once a feed is set: "calendar" finds Omarchy's own Calendar rows
  // until then.
  commands: function(ctx) {
    return param(ctx.settings) ? [{ title: "My schedule", keywords: "calendar agenda meetings events today schedule cal", text: "The next eight days of your calendar", complete: "cal " }] : []
  },
  help: [{ id: "calendar", title: "Calendar", icon: ICON, about: "Your next meeting first, Enter joining it; from an iCal address set in nodi.json",
           examples: [{ q: "cal", note: "The next eight days" }, { q: "cal standup", note: "Events that hold the word" }] }],
  sources: {
    calendar: {
      argv: function(p, env) { return env && env.pluginDir ? ["/usr/bin/python3", "-I", env.pluginDir + "/lib/ics.py", env.cacheDir + "/calendar"] : null },
      // The addresses in the environment, never the arguments: a secret
      // iCal address is a password, and arguments are anyone's in /proc.
      environment: function(p) { return { NODI_ICS: String(p) } },
      parse: function(text, ok) {
        if (!ok) throw "the calendar could not be read"
        var o = JSON.parse(text)
        if (!o || !Array.isArray(o.events)) throw "the calendar could not be read"
        // Its time of reading changes at every read; what it read may not.
        return { calendars: o.calendars || [], events: o.events, details: o.details || {} }
      },
      maxAgeMs: 5 * 60 * 1000, retryMs: 60 * 1000, timeoutMs: 40000, maxBytes: 4194304
    }
  },
  match: function(query, ctx) {
    var q = String(query || "")
    var m = q.match(/^\s*cal\s+(.*)$/i)
    if (m && param(ctx.settings)) return listRows(ctx, m[1])
    var t = q.trim()
    if (t.length < 2) return []
    var got = data(ctx, false)
    if (!got || !got.value) return []
    var nowMs = ctx.now().getTime()
    var out = []
    var near = soon(got.value.events, nowMs)
    for (var i = 0; i < near.length; i++) {
      var tier = Score.tier(t, Score.prepare({ name: near[i].title, keywords: ["join meeting next"] }))
      if (!tier) continue
      var r = rowOf(near[i], got.value, nowMs, clock24(ctx), feedsOf(ctx.settings).length > 1)
      r.tier = tier
      r.kind = "action"
      out.push(r)
    }
    return out
  }
}
