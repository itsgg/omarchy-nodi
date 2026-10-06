.pragma library
.import "../lib/Score.js" as Score

// The tray's menus as rows (ROADMAP 58, L 7): what each app in the tray
// offers in its menu, "Dropbox: Pause syncing", found by the entry's words
// and the app's name, from the second letter. components/Tray.qml reads
// the menus while the bar is open into ctx.tray: [{ key, app, text, path,
// icon, checked }]; Enter triggers the entry there, as a click in the
// tray's own menu does. A row is a moment: the menu decides what it holds,
// so it is never learned from or kept.

var ICON = "󰍜"

// Each record's fields for the score, worked out once a menu read.
var prepared = { list: null, fields: [] }

function fieldsOf(list) {
  if (prepared.list === list) return prepared.fields
  prepared = { list: list, fields: list.map(function(r) {
    return Score.prepare({ name: r.text, keywords: [r.app, r.path === r.text ? "" : r.path.slice(0, r.path.length - r.text.length - 3), "tray"] })
  }) }
  return prepared.fields
}

var provider = {
  id: "tray",
  name: "Tray",
  icon: ICON,
  help: [
    { id: "tray", title: "Tray menus", icon: ICON, about: "What each app in the tray offers in its menu, by its words or the app's name",
      examples: [{ q: "tray", note: "Every entry of every tray menu" }] }
  ],
  match: function(query, ctx) {
    var q = String(query || "").trim()
    var list = Array.isArray(ctx.tray) ? ctx.tray : []
    if (q.length < 2 || list.length === 0) return []
    var fields = fieldsOf(list)
    var out = []
    for (var i = 0; i < list.length; i++) {
      var r = list[i]
      var t = fields[i] ? Score.tier(q, fields[i]) : ""
      if (!t) continue
      out.push({ key: r.key, title: r.app ? r.app + ": " + r.path : r.path, subtitle: "In " + (r.app || "an app") + "'s tray menu",
                 icon: ICON, image: /^(image:\/\/|\/)/.test(r.icon) ? r.icon : "", badge: r.checked ? "ON" : "", badgeTone: r.checked ? "on" : "",
                 tier: t, kind: "action", nodi: "tray", actionLabel: "Choose", remember: false, copy: "" })
    }
    return out
  }
}
