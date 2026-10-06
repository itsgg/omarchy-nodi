.pragma library
.import "../lib/Run.js" as Run
.import "../lib/Score.js" as Score

// Other plugins' panels, overlays and menus as rows (ROADMAP 58, L 7): the
// shell's own list (omarchy-shell shell listPlugins), read once an hour,
// each enabled plugin of those kinds a row that opens it, as Omarchy's menu
// opens its own (shell summon <id> {}). Omarchy's own are left out: its
// menu reaches them by name already (Network Speed Test, QR Code), and
// some want a payload that {} does not give (the OSD, the image picker).
// Nodi is left out too.

var KINDS = ["overlay", "panel", "menu"]
var ICON = "󰏗"

// listPlugins' JSON as [{ id, name, kinds }]: enabled, someone else's (a
// clone of one of Omarchy's is Omarchy's, reached as that one is), of a
// kind that opens, once each.
function parse(text) {
  var all
  try { all = JSON.parse(String(text || "")) } catch (e) { return null }
  if (!Array.isArray(all)) return null
  var out = []
  var seen = Object.create(null)
  for (var i = 0; i < all.length; i++) {
    var p = all[i]
    if (!p || typeof p.id !== "string" || !p.id || p.enabled !== true || p.firstParty === true || !Array.isArray(p.kinds)) continue
    if (p.clonedFrom || seen[p.id]) continue
    seen[p.id] = true
    var kinds = p.kinds.filter(function(k) { return KINDS.indexOf(k) !== -1 })
    if (!kinds.length || !Run.valid(Run.summon(p.id, {}))) continue
    out.push({ id: p.id, name: typeof p.name === "string" && p.name ? p.name.slice(0, 120) : p.id, kinds: kinds })
  }
  return out
}

// Each plugin's fields for the score, worked out once a read.
var prepared = { list: null, fields: [] }

function fieldsOf(list) {
  if (prepared.list === list) return prepared.fields
  prepared = { list: list, fields: list.map(function(p) {
    return Score.prepare({ name: p.name, keywords: [p.id.replace(/[._-]+/g, " "), "plugin " + p.kinds.join(" ")] })
  }) }
  return prepared.fields
}

var provider = {
  id: "plugins",
  name: "Plugins",
  icon: ICON,
  sources: {
    plugins: {
      argv: function() { return ["/usr/bin/bash", "-c", "omarchy-shell shell listPlugins"] },
      parse: function(text, ok) {
        if (!ok) throw "the shell did not list its plugins"
        var list = parse(text)
        if (!list) throw "the shell's list of plugins did not read"
        return list
      },
      maxAgeMs: 60 * 60 * 1000,
      // A list asked for before the shell answers is asked again a minute on.
      retryMs: 60 * 1000,
      timeoutMs: 5000,
      maxBytes: 1048576
    }
  },
  help: [
    { id: "plugins", title: "Plugins", icon: ICON, about: "Other plugins' panels, overlays and menus, opened by name",
      examples: [{ q: "plugin", note: "Every one that opens" }] }
  ],
  match: function(query, ctx) {
    var q = String(query || "").trim()
    if (q.length < 2 || !ctx.request) return []
    var got = ctx.request("plugins")
    var list = got && Array.isArray(got.value) ? got.value : []
    var fields = fieldsOf(list)
    var out = []
    for (var i = 0; i < list.length; i++) {
      var p = list[i]
      if (p.id === ctx.pluginId || !fields[i]) continue
      var t = Score.tier(q, fields[i])
      if (!t) continue
      out.push({ key: "plugin:" + p.id, title: p.name, subtitle: "Plugin " + p.kinds.join(", ") + ", " + p.id, icon: ICON,
                 run: Run.summon(p.id, {}), tier: t, kind: "action", copy: "" })
    }
    return out
  }
}
