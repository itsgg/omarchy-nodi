.pragma library

// Extensions that come with Nodi, in contrib/ (ROADMAP 81): script filters
// and answers like any of yours, kept in this repository so they are what
// was reviewed at its commit, never fetched, and off until named in
// nodi.json:
//
//   "filters": [{ "contrib": "obsidian" }],
//   "answers": [{ "contrib": "weather" }]
//
// A name here fills in the program, its keyword, title and icon; what the
// entry sets itself wins (a keyword of yours, "root": true), and "args"
// are handed to the program after its path. contrib/README.md says what
// each does.

// None does what Nodi does itself: projects, ssh hosts, man and tldr
// pages, pull requests and the rest are its own (providers/dev.js).
var CATALOGUE = {
  obsidian: { kind: "filters", keyword: "ob", title: "Obsidian", icon: "󰠮", list: true, refresh: "2m",
              about: "The notes in your Obsidian vaults; Enter opens one in Obsidian" },
  // A search of GitHub: past the default 3 s on a slow link (Fable 2026-10-07).
  issues: { kind: "filters", keyword: "issues", title: "Issues", icon: "", list: true, refresh: "5m", timeoutMs: 10000,
            about: "Open GitHub issues assigned to you" },
  containers: { kind: "filters", keyword: "dk", title: "Containers", icon: "󰡨", list: true, refresh: "10s",
                about: "Your Docker containers: logs, start, stop" },
  wikipedia: { kind: "answers", keyword: "wp", title: "Wikipedia", icon: "󰖬", placeholder: "words",
               about: "An article's summary" },
  weather: { kind: "answers", keyword: "weather", title: "Weather", icon: "󰖐", placeholder: "place",
             about: "The weather now and the next three days" }
}

var NAME = /^[a-z][a-z0-9-]{0,30}$/

// `list` (the "filters" or "answers" setting) with each entry naming a
// contrib program made whole. An entry naming one that is not there, or
// one of the other kind, is left without a program, so it runs nothing.
function resolve(list, kind, pluginDir) {
  if (!Array.isArray(list)) return list
  return list.map(function(e) {
    if (!e || typeof e !== "object" || typeof e.contrib !== "string") return e
    var c = NAME.test(e.contrib) && Object.prototype.hasOwnProperty.call(CATALOGUE, e.contrib) ? CATALOGUE[e.contrib] : null
    var out = {}
    if (c && c.kind === kind && pluginDir) for (var k in c) if (k !== "kind" && k !== "about") out[k] = c[k]
    for (var o in e) if (o !== "command") out[o] = e[o]
    if (c && c.kind === kind && pluginDir) {
      var args = Array.isArray(e.args) ? e.args.filter(function(a) { return typeof a === "string" }) : []
      out.command = [String(pluginDir) + "/contrib/" + e.contrib].concat(args)
    }
    return out
  })
}
