.pragma library
.import "../lib/Run.js" as Run
.import "../lib/Score.js" as Score

// The lists Omarchy's menu builds when you open them (its Menu.qml
// providers), as rows: the monospace fonts and the power profiles, the
// current one marked, Enter setting it with the command the menu runs.
//
//   font, font jet         every font, or those named so
//   performance, balanced, power saver, power profile
//
// Read through ctx.request when asked for; the power list can take seconds
// (powerprofilesctl), so it shows "Reading..." until it lands.

// "@current<TAB>name", then a name per line.
function parseList(text, ok) {
  if (!ok) throw "could not read the list"
  var current = ""
  var list = []
  // The marker read before lines are trimmed: an empty one, "@current\t",
  // trimmed to "@current", was a font named so (codex 2026-10-05).
  var raw = String(text || "").split("\n")
  for (var i = 0; i < raw.length; i++) {
    if (/^@current(\t|$)/.test(raw[i])) { current = raw[i].slice(9).trim(); continue }
    var name = raw[i].trim()
    if (name && list.indexOf(name) === -1) list.push(name)
  }
  return { current: current, list: list }
}

var PROFILE_NAMES = { "power-saver": "Power saver", balanced: "Balanced", performance: "Performance" }

function profileName(id) { return PROFILE_NAMES[id] || String(id).replace(/-/g, " ").replace(/^./, function(c) { return c.toUpperCase() }) }

function fontRows(needle, ctx) {
  var got = ctx.request ? ctx.request("fonts") : { state: "pending" }
  var data = got.value
  if (!data) return [{ title: got.state === "error" ? "Could not list fonts" : "Reading fonts...", subtitle: "Fonts", score: 40, copy: "" }]
  var out = []
  var n = String(needle || "").toLowerCase()
  for (var i = 0; i < data.list.length; i++) {
    var f = data.list[i]
    if (n && f.toLowerCase().indexOf(n) === -1) continue
    var current = f === data.current
    out.push({
      key: "font:" + f,
      title: f,
      subtitle: "Font",
      badge: current ? "Current" : "",
      badgeTone: current ? "on" : "",
      icon: "",
      score: current ? 97 : 96 - out.length * 0.001,
      kind: "mode",
      copy: f,
      run: Run.exec(["omarchy-font-set", f]),
      actionLabel: "Set"
    })
  }
  // No font of that name: the rest of Nodi answers ("font manager", "font size").
  return out
}

// Whether a query names a profile, judged on the names powerprofilesctl
// uses and on any others already read (a vendor daemon's fourth), so only
// such a query starts the (slow) read.
function namesProfile(q, ids) {
  var all = Object.keys(PROFILE_NAMES).concat(ids || [])
  for (var i = 0; i < all.length; i++) if (Score.tier(q, { name: profileName(all[i]), whole: true, keywords: [all[i].replace(/-/g, " "), "power profile"] })) return true
  return false
}

function profileRows(q, ctx, asked) {
  var held = ctx.request ? ctx.request("power-profiles", "", { fetch: false }) : null
  if (!asked && !namesProfile(q, held && held.value ? held.value.list : [])) return []
  var got = ctx.request ? ctx.request("power-profiles") : { state: "pending" }
  var data = got.value
  if (!data) return [{ title: got.state === "error" ? "Could not read power profiles" : "Reading power profiles...", subtitle: "Power profile", score: 40, copy: "" }]
  var out = []
  for (var i = 0; i < data.list.length; i++) {
    var id = data.list[i]
    var name = profileName(id)
    var t = asked ? "words" : Score.tier(q, { name: name, whole: true, keywords: [id.replace(/-/g, " "), "power profile"] })
    if (!t) continue
    var current = id === data.current
    out.push({
      key: "power-profile:" + id,
      title: name,
      subtitle: "Power profile",
      badge: current ? "Current" : "",
      badgeTone: current ? "on" : "",
      icon: "󰐋",
      tier: t,
      kind: "setting",
      offset: current ? 0 : -0.001 * i,
      copy: "",
      run: Run.exec(["omarchy-powerprofiles-set", "autodetect", id]),
      actionLabel: "Set"
    })
  }
  return out
}

var provider = {
  id: "lists",
  name: "Fonts and power",
  icon: "",
  modes: [{ pattern: /^\s*fonts?\s/i, label: "Fonts", icon: "", exclusive: true }],
  sources: {
    fonts: {
      argv: function() { return ["/usr/bin/bash", "-c", 'printf "@current\\t%s\\n" "$(omarchy-font-current 2>/dev/null)"; omarchy-font-list'] },
      parse: parseList,
      maxAgeMs: 30 * 1000,
      timeoutMs: 5000
    },
    "power-profiles": {
      argv: function() { return ["/usr/bin/bash", "-c", 'printf "@current\\t%s\\n" "$(powerprofilesctl get 2>/dev/null)"; omarchy-powerprofiles-list'] },
      parse: parseList,
      maxAgeMs: 30 * 1000,
      retryMs: 60 * 1000,
      timeoutMs: 12000
    }
  },
  commands: [
    { title: "Change font", keywords: "font fonts typeface monospace", text: "Every monospace font, the current one marked", complete: "font " },
    { title: "Power profile", keywords: "power profile profiles performance balanced saver battery", text: "Performance, balanced or power saver", complete: "power profile" }
  ],
  help: [
    { id: "lists", title: "Fonts and power profiles", icon: "", about: "Set the font or the power profile, the current one marked",
      examples: [{ q: "font ", note: "Every monospace font" }, { q: "power profile" }, { q: "performance" }] }
  ],
  match: function(query, ctx) {
    var q = String(query || "").trim().toLowerCase().replace(/\s+/g, " ")
    var m = q.match(/^fonts?(?: (.*))?$/)
    if (m) return fontRows((m[1] || "").trim(), ctx)
    if (q.length < 4) return []
    var asked = /^(power ?)?profiles?$|^power profiles?$/.test(q)
    return profileRows(q, ctx, asked)
  }
}
