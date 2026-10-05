.pragma library
.import "../lib/Run.js" as Run
.import "../lib/Score.js" as Score

// Omarchy's notification history (the shell keeps the newest ten, one JSON
// file each under ~/.local/state/omarchy/notifications/history/), as rows:
// found by what they said, newest first under "notifications". Enter does
// what clicking the toast did, the argv the sender attached; one with none
// copies its text. Silencing, dismissing and the shell's own history panel
// are Omarchy's keybindings and menu toggle, rows already.

function ago(ms, now) {
  var s = Math.max(0, Math.round((now - ms) / 1000))
  if (s < 60) return "just now"
  if (s < 3600) return Math.floor(s / 60) + " min ago"
  if (s < 86400) return Math.floor(s / 3600) + " h ago"
  return Math.floor(s / 86400) + " d ago"
}

// One JSON object per line, as the source prints them; the newest first.
function parse(text, ok) {
  if (!ok) throw "could not read the notification history"
  var out = []
  var lines = String(text || "").split("\n")
  for (var i = 0; i < lines.length; i++) {
    var l = lines[i].trim()
    if (!l) continue
    try {
      var n = JSON.parse(l)
      if (!n || typeof n !== "object" || !n.summary) continue
      var argv = null
      try { argv = n.execArgv ? JSON.parse(n.execArgv) : null } catch (e) { argv = null }
      // The shell's own rule for a click (parseExecArgv): strings, and a
      // program that is not empty and not an option.
      if (!Array.isArray(argv) || argv.length === 0 || argv.some(function(a) { return typeof a !== "string" }) || !argv[0] || argv[0].charAt(0) === "-") argv = null
      out.push({ app: String(n.app || ""), summary: String(n.summary), body: String(n.body || ""), glyph: String(n.glyph || ""),
                 argv: argv, at: Number(n.timestamp) || 0 })
    } catch (e2) {}
  }
  out.sort(function(a, b) { return b.at - a.at })
  return out
}

function rowFor(n, tier, nowMs, i) {
  var text = n.body ? n.summary + ": " + n.body : n.summary
  return {
    key: "notification:" + n.at,
    title: n.summary,
    subtitle: [n.app, n.body, ago(n.at, nowMs)].filter(function(x) { return x }).join(", "),
    icon: n.glyph || "󰂚",
    tier: tier,
    kind: "item",
    offset: -0.001 * i,
    remember: false,
    copy: text,
    run: n.argv ? Run.exec(n.argv) : Run.copy(text),
    actionLabel: n.argv ? "Open" : "Copy",
    group: "Notifications"
  }
}

var provider = {
  id: "notifications",
  // Its own order, by recency or place, stands over a closer title (lib/Rows.js).
  keepsOrder: true,
  name: "Notifications",
  icon: "󰂚",
  sources: {
    notifications: {
      argv: function(param, env) {
        return ["/usr/bin/bash", "-c", 'for f in "$1"/*.json; do [ -f "$f" ] && { tr -d "\\n" < "$f"; echo; }; done; true',
                "nodi-notifications", env.home + "/.local/state/omarchy/notifications/history"]
      },
      parse: parse,
      maxAgeMs: 3000,
      timeoutMs: 3000
    }
  },
  commands: [
    { title: "Notifications", keywords: "notifications notification history toasts recent messages", text: "The recent ones, newest first", complete: "notifications" }
  ],
  help: [
    { id: "notifications", title: "Notifications", icon: "󰂚", about: "The recent ones by what they said; Enter does what clicking it did",
      examples: [{ q: "notifications" }] }
  ],
  match: function(query, ctx) {
    var q = String(query || "").trim().toLowerCase().replace(/\s+/g, " ")
    var all = /^(notifications?|notification history)$/.test(q)
    if (!all && q.length < 3) return []
    var got = ctx.request ? ctx.request("notifications") : { state: "pending" }
    var list = Array.isArray(got.value) ? got.value : []
    var nowMs = ctx.now ? ctx.now().getTime() : Date.now()
    var out = []
    for (var i = 0; i < list.length; i++) {
      var n = list[i]
      var t = all ? "words" : Score.tier(q, { name: n.summary, whole: true, keywords: [n.app], description: n.body })
      if (t) out.push(rowFor(n, t, nowMs, i))
    }
    return out
  }
}
