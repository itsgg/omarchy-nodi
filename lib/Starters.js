.pragma library

// Starter rows (ROADMAP 77). A first open showed a bare field: the home is
// built from what you ran, and there was nothing yet. Until there is, five
// rows each teach one thing by doing it (Raycast's Quickstart and
// PowerToys' Home do the like): an app by its name, a window by `w `, the
// clipboard by `cb `, an answer as you type, and Ctrl+K on a row. Enter
// fills each in.
//
// Each goes once what it teaches has been reached, by it or any other
// way: windows, clipboard entries or an answer at the top of the list
// (reachedBy, after each search while the bar is open), Ctrl+K opened, an
// app run (it is in the history). Reached, not used: a window switched to
// or a clip pasted is never kept in the history, and marking every path a
// row can be run by missed some (Cursor 2026-10-07). What was reached is
// kept in the prefs (`tried`, lib/Prefs.js), once each. All go once the
// history holds five rows the home can show, a home of your own.

var IDS = ["app", "windows", "clipboard", "answers", "actions"]
var ENOUGH = 5
var ANSWERS = ["math", "units", "currency", "time"]
// What the answers starter fills in, from the first of them turned on.
var ASK = { math: "12*8 + 15%", units: "5 km to mi", currency: "100 usd to eur", time: "time in tokyo" }
// Apps most installs have, to name one that is there.
var COMMON = ["firefox", "chromium", "brave", "alacritty", "foot", "nautilus", "code"]

// The starter a list reached by what leads it: "" for none.
function reachedBy(top) {
  if (!top) return ""
  if (top.provider === "windows" && top.run && top.run.kind === "window") return "windows"
  // An entry, not a control such as `cb clear`'s (Cursor 2026-10-07).
  if (top.provider === "clipboard" && top.run && /^clip:(text|image):/.test(String(top.key || ""))) return "clipboard"
  if (ANSWERS.indexOf(top.provider) !== -1 && top.kind === "answer") return "answers"
  return ""
}

function appName(apps) {
  var list = (apps || []).filter(function(a) { return a && a.name })
  for (var i = 0; i < COMMON.length; i++)
    for (var j = 0; j < list.length; j++) if (String(list[j].id || "").toLowerCase().indexOf(COMMON[i]) !== -1) return String(list[j].name)
  return list.length ? String(list[0].name) : ""
}

// Rows the home shows from the history: those it can run again.
function shown(history) {
  var n = 0
  for (var k in history || {}) if (history[k] && history[k].s) n++
  return n
}

function ranApp(history) {
  for (var k in history || {}) if (history[k] && history[k].s && history[k].s.provider === "apps") return true
  return false
}

function tried(prefs, id) { return !!prefs && (prefs.tried || []).indexOf(id) !== -1 }

// Set on a row before Ctrl+K was ever opened here (a prefs file older
// than the starters): Ctrl+K is known.
function setAnything(prefs) {
  if (!prefs) return false
  return (Object.keys(prefs.aliases || {}).length + Object.keys(prefs.hotkeys || {}).length + Object.keys(prefs.links || {}).length
          + (prefs.favourites || []).length + (prefs.hidden || []).length + (prefs.pins || []).length) > 0
}

// The starters still to show: [] once the history holds enough. `enabled`
// is the providers turned on, by id: a starter for one that is off would
// teach what is not there (Cursor 2026-10-07).
function rows(history, prefs, apps, enabled) {
  if (shown(history) >= ENOUGH) return []
  var on = function(id) { return !enabled || enabled.indexOf(id) !== -1 }
  var app = on("apps") ? appName(apps) : ""
  var ask = ""
  for (var a = 0; a < ANSWERS.length && !ask; a++) if (on(ANSWERS[a])) ask = ASK[ANSWERS[a]]
  var all = [
    { id: "app", done: ranApp(history), icon: "󰀻", title: "Open an app by its name",
      subtitle: app ? "Type " + app.toLowerCase() + ", or any app's name" : "Type an app's name", complete: app ? app.toLowerCase() : "" },
    { id: "windows", done: tried(prefs, "windows"), icon: "󰖯", title: "Switch to a window", subtitle: "w, then words of its title", complete: on("windows") ? "w " : "" },
    { id: "clipboard", done: tried(prefs, "clipboard"), icon: "󰅌", title: "Find what you copied", subtitle: "cb, then words in it", complete: on("clipboard") ? "cb " : "" },
    { id: "answers", done: tried(prefs, "answers"), icon: "󰃬", title: "Answers as you type", subtitle: "Sums, units, money and time", complete: ask },
    { id: "actions", done: tried(prefs, "actions") || setAnything(prefs), icon: "󰘳", title: "A row's other actions",
      subtitle: "Ctrl+K on any row: favourite, alias, hotkey", complete: "?shortcuts", badge: "Ctrl K" }
  ]
  var out = []
  for (var i = 0; i < all.length; i++) {
    var s = all[i]
    if (s.done || !s.complete) continue
    out.push({ key: "starter:" + s.id, title: s.title, subtitle: s.subtitle, icon: s.icon, badge: s.badge || "", complete: s.complete,
               select: s.id === "answers", actionLabel: "Try", copy: "", remember: false, group: "Start here", score: 40 - out.length })
  }
  return out
}
