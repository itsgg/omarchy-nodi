.pragma library

// Which app a window belongs to, by the class Hyprland reports (Wayland's
// app_id), and what to call it: for the window rows (providers/windows.js),
// an app's "Open new" (providers/apps.js) and where a paste lands
// (lib/Rows.js pasteTarget).

// The class a web app's window carries, as Chromium names an --app window
// (omarchy-launch-webapp opens one): the site's host and path, each "/" a
// "_", the "_" at either end trimmed, between the browser's name and the
// profile's ("chrome-discord.com__app-Default" for https://discord.com/app).
// Lower case; "" for an app that is no web app.
function webAppClass(exec) {
  var m = String(exec || "").match(/(?:omarchy-launch-webapp\s+|--app=)["']?https?:\/\/([^\s"'?#]+)/i)
  if (!m) return ""
  var slash = m[1].indexOf("/")
  var host = (slash === -1 ? m[1] : m[1].slice(0, slash)).replace(/^[^@]*@/, "").replace(/:\d+$/, "")
  return (host + "_" + (slash === -1 ? "/" : m[1].slice(slash))).replace(/\//g, "_").replace(/^_+|_+$/g, "").toLowerCase()
}

function webAppOwns(app, low) {
  var stem = webAppClass(app.exec)
  return !!stem && low.indexOf("-" + stem + "-") !== -1
}

// The app whose windows carry a class (Hyprland's class, Wayland's app_id):
// by its id or StartupWMClass, then by the id's last part
// ("com.mitchellh.ghostty" is ghostty's), then a web app by its site; null
// for none.
function forClass(cls, apps) {
  var low = String(cls || "").toLowerCase()
  var list = Array.isArray(apps) ? apps : []
  if (!low) return null
  for (var i = 0; i < list.length; i++) {
    var a = list[i]
    if (a && (String(a.id).toLowerCase() === low || (a.wmclass && String(a.wmclass).toLowerCase() === low))) return a
  }
  var tail = low.split(".").pop()
  for (var j = 0; j < list.length; j++) if (list[j] && String(list[j].id).toLowerCase().split(".").pop() === tail) return list[j]
  for (var k = 0; k < list.length; k++) if (list[k] && webAppOwns(list[k], low)) return list[k]
  return null
}

// What to call a window of a class: its app's name, else the class made
// readable. A web app with no entry is its site ("discord.com",
// "localhost", an IP; Fable 2026-10-06); a dotted
// class its last part ("com.mitchellh.ghostty" is "Ghostty"), a generic
// last part giving way to the one before it ("org.telegram.desktop" is
// "Telegram"; Fable 2026-10-06).
function nameForClass(cls, apps) {
  var s = String(cls || "")
  var app = forClass(s, apps)
  if (app) return String(app.name || s)
  var web = s.match(/^[a-z]+-((?:[a-z0-9-]+\.)+[a-z]{2,}|localhost|\d{1,3}(?:\.\d{1,3}){3})(?:__|-[^-]+$)/i)
  if (web) return web[1].toLowerCase()
  var parts = s.split(".")
  var last = parts.pop()
  while (parts.length && /^(desktop|app|application|client|bin|gtk|qt)$/i.test(last)) last = parts.pop()
  return last.charAt(0).toUpperCase() + last.slice(1)
}
