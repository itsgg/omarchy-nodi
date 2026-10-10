.pragma library
.import "../lib/Run.js" as Run

// Packages (ROADMAP 65, L 20): `pkg <name>` lists what pacman's repositories
// and the AUR have of that name or description, the installed ones marked;
// Enter installs one in Omarchy's terminal as its own installers do
// (omarchy-pkg-add, omarchy-pkg-aur-add), where sudo asks; an installed
// one opens its page, and Ctrl+K removes it (omarchy-pkg-drop), after a
// second Enter. The words typed reach no program's arguments, which
// another local user can read in /proc (the marketplace's review,
// 2026-10-10: they went to pacman -Ss and yay -Ssa): every package
// pacman knows is read once in five minutes and searched here, and the
// AUR is asked through its own search, the word encoded by curl from the
// environment.

var ICON = "󰏗"
var LIMIT = 30
var NAME = /^[a-z0-9@._+-]+$/

// pacman -Ss's lines: "repo/name version [installed]", then the description.
function parse(text) {
  var out = []
  var lines = String(text || "").split("\n")
  for (var i = 0; i < lines.length; i++) {
    var m = lines[i].match(/^([a-z0-9_-]+)\/(\S+)\s+(\S+)(.*)$/i)
    if (!m || !NAME.test(m[2])) continue
    var desc = i + 1 < lines.length && /^\s/.test(lines[i + 1]) ? lines[i + 1].trim() : ""
    out.push({ repo: m[1], name: m[2], version: m[3], installed: /\[installed|\(installed/i.test(m[4]), description: desc.slice(0, 300) })
  }
  return out
}

// Each word a term of its own, as pacman and yay take several: "noto
// font" is every package with both (Sonnet 2026-10-06: one string matched
// nothing).
function terms(q) { return String(q).split(/\s+/).filter(function(w) { return w }) }

// Those whose name or description holds every word, as pacman -Ss and the
// AUR's search find them: fixed text, any case.
function holding(list, q) {
  var ws = terms(q).map(function(w) { return w.toLowerCase() })
  return list.filter(function(p) {
    var hay = (p.name + " " + p.description).toLowerCase()
    return ws.every(function(w) { return hay.indexOf(w) !== -1 })
  })
}

// The word the AUR is asked by: the longest, as its search takes one.
function aurWord(q) { return terms(q).sort(function(a, b) { return b.length - a.length })[0] || "" }

// The AUR's search answer: { results: [{ Name, Version, Description }] },
// or { type: "error", error } when it refuses (too many, too short).
function parseAur(text) {
  var data
  try { data = JSON.parse(String(text || "")) } catch (e) { throw "the AUR's answer did not read" }
  if (!data || data.type === "error") throw "the AUR: " + String((data && data.error) || "it refused")
  return (Array.isArray(data.results) ? data.results : []).filter(function(r) { return r && NAME.test(String(r.Name || "")) }).map(function(r) {
    return { repo: "aur", name: String(r.Name), version: String(r.Version || ""), installed: false, description: String(r.Description || "").slice(0, 300) }
  })
}

// Both lists as one: the name first, its start next, then a name holding
// it, then the rest, the repositories' before the AUR's at each, so a
// common word's 30 still holds the AUR's own by name (Sonnet 2026-10-06:
// "zed" showed 30 repository rows and no zed-bin).
function merged(repo, aur, q) {
  var low = terms(q)[0] ? String(q).toLowerCase().replace(/\s+/g, "-") : ""
  var first = terms(q)[0] ? terms(q)[0].toLowerCase() : ""
  var rank = function(p) { return p.name === low || p.name === first ? 0 : p.name.indexOf(first) === 0 ? 1 : p.name.indexOf(first) !== -1 ? 2 : 3 }
  var seen = Object.create(null)
  var all = []
  repo.forEach(function(p, i) { seen[p.name] = true; all.push({ p: p, r: rank(p), s: 0, i: i }) })
  aur.forEach(function(p, i) { if (!seen[p.name]) all.push({ p: p, r: rank(p), s: 1, i: i }) })
  return all.sort(function(a, b) { return a.r - b.r || a.s - b.s || a.i - b.i }).map(function(x) { return x.p })
}

var OFFICIAL = { core: true, extra: true, multilib: true, "core-testing": true, "extra-testing": true }

// Its page: the AUR's, or Arch's for an official repository; none for a
// third party's (omarchy/...).
function pageOf(p) {
  if (p.repo === "aur") return "https://aur.archlinux.org/packages/" + p.name
  return OFFICIAL[p.repo] ? "https://archlinux.org/packages/?q=" + encodeURIComponent(p.name) : ""
}

// In Omarchy's terminal, as the menu's installers run, with its "Done".
// "Done" whatever the outcome, so a failure's words stay on screen to be
// read (Sonnet 2026-10-06), as omarchy-pkg-install ends.
var INSTALL = 'omarchy-pkg-add "$1"; omarchy-show-done'
var INSTALL_AUR = 'omarchy-pkg-aur-add "$1"; omarchy-show-done'
var REMOVE = 'omarchy-pkg-drop "$1"; omarchy-show-done'

var TERMINAL = ["xdg-terminal-exec", "--app-id=org.omarchy.terminal"]

function rowOf(p, score) {
  var aur = p.repo === "aur"
  var row = { key: "pkg:" + p.repo + "/" + p.name, title: p.name, subtitle: p.repo + ", " + p.version + (p.description ? ": " + p.description : ""),
              icon: ICON, score: score, copy: p.name, remember: false, badge: p.installed ? "Installed" : "", badgeTone: p.installed ? "on" : "" }
  var page = pageOf(p)
  if (p.installed) {
    row.run = page ? Run.open(page) : null
    row.actionLabel = page ? "Open its page" : ""
    row.actions = [{ label: "Remove " + p.name, icon: "󰆴", run: Run.exec(TERMINAL.concat(["bash", "-c", REMOVE, "nodi-pkg", p.name])), confirm: true }]
  } else {
    row.run = aur ? Run.exec(TERMINAL.concat(["bash", "-c", INSTALL_AUR, "nodi-pkg", p.name])) : Run.exec(TERMINAL.concat(["bash", "-c", INSTALL, "nodi-pkg", p.name]))
    row.actionLabel = "Install"
    row.actions = page ? [{ label: "Open its page", icon: "󰖟", run: Run.open(page) }] : []
  }
  return row
}

var provider = {
  id: "packages",
  name: "Packages",
  icon: ICON,
  modes: [{ pattern: /^\s*pkg\s/i, label: "Packages", icon: ICON, exclusive: true, hint: "pkg <name>" }],
  commands: [{ title: "Search packages", keywords: "pkg package packages install pacman aur yay", text: "Arch's repositories and the AUR", complete: "pkg " }],
  help: [{ id: "packages", title: "Packages", icon: ICON, about: "Arch's repositories and the AUR by name; Enter installs in a terminal",
           examples: [{ q: "pkg zed", note: "The repositories first, then the AUR" }] }],
  sources: {
    // Every package of the repositories, one read for every search.
    "pkg-repo": {
      argv: function() { return ["/usr/bin/pacman", "-Ss"] },
      parse: function(text, ok) { if (!ok) throw "pacman could not list its packages"; return parse(text) },
      maxAgeMs: 5 * 60 * 1000, retryMs: 30 * 1000, timeoutMs: 8000, maxBytes: 8388608
    },
    // What is installed, so a row says so (the repositories' list is
    // read less often).
    "pkg-installed": {
      argv: function() { return ["/usr/bin/pacman", "-Qq"] },
      parse: function(text, ok) { if (!ok) throw "pacman could not list what is installed"; return String(text || "").split("\n").filter(function(l) { return NAME.test(l) }) },
      maxAgeMs: 30 * 1000, retryMs: 30 * 1000, timeoutMs: 5000, maxBytes: 1048576
    },
    // Its body at most the read's 4 MB, over https only, no redirect
    // followed, -q first so no ~/.curlrc turns one on, as the dictionary's.
    "pkg-aur": {
      argv: function() {
        return ["/usr/bin/curl", "-q", "-sS", "--max-time", "8", "--max-filesize", "4194304", "--proto", "=https", "-A", "Nodi (https://github.com/itsgg/omarchy-nodi)",
                "--variable", "%NODI_Q", "--expand-url", "https://aur.archlinux.org/rpc/v5/search/{{NODI_Q:url}}?by=name-desc"]
      },
      environment: function(word) { return { NODI_Q: String(word) } },
      parse: function(text, ok) { if (!ok) throw "the AUR did not answer"; return parseAur(text) },
      maxAgeMs: 10 * 60 * 1000, retryMs: 60 * 1000, timeoutMs: 10000, maxBytes: 4194304, supersede: true, transient: true
    }
  },
  match: function(query, ctx) {
    var m = String(query).match(/^\s*pkg\s+(.*)$/i)
    if (!m) return []
    var q = m[1].trim()
    if (q.length < 2) return [{ title: "Search packages", subtitle: "Two letters or more", icon: ICON, score: 40, copy: "", remember: false, hint: "pkg <name>" }]
    var repo = ctx.request ? ctx.request("pkg-repo", "") : { state: "pending" }
    // A word of one letter is none the AUR takes: its list is empty then.
    var word = aurWord(q)
    var aur = word.length < 2 ? { state: "ready", value: [] } : ctx.request ? ctx.request("pkg-aur", word.toLowerCase()) : { state: "pending" }
    var have = ctx.request ? ctx.request("pkg-installed", "") : { state: "pending" }
    var mine = Object.create(null)
    ;(Array.isArray(have.value) ? have.value : []).forEach(function(n) { mine[n] = true })
    // Marked by what is installed now (read every 30 s), once that is read:
    // the repositories' list is five minutes old, and a package installed
    // or removed since said otherwise (Fable 2026-10-10).
    var known = Array.isArray(have.value)
    var mark = function(p) { var i = known ? !!mine[p.name] : !!p.installed; return i === p.installed ? p : Object.assign({}, p, { installed: i }) }
    var aurFound = Array.isArray(aur.value) ? holding(aur.value, q).map(mark) : []
    var all = merged(Array.isArray(repo.value) ? holding(repo.value, q).map(mark) : [], aurFound, q)
    // One group: the bar gathers rows by group, which put every AUR row
    // under every repository row; the subtitle says "aur".
    var out = all.slice(0, LIMIT).map(function(p, i) { return rowOf(p, 97 - i * 0.01) })
    var aurDown = aur.state === "error" && !Array.isArray(aur.value)
    if (!Array.isArray(aur.value) && !aurDown)
      out.push({ title: "Asking the AUR...", subtitle: "aur.archlinux.org", icon: ICON, score: 30, copy: "", remember: false })
    if (aurDown) out.push({ title: "The AUR did not answer", subtitle: String(aur.error || "aur.archlinux.org"), icon: ICON, score: 30, copy: "", remember: false })
    if (all.length === 0 && Array.isArray(repo.value) && Array.isArray(aur.value))
      return [{ title: "No package named or about \"" + q + "\"", subtitle: "pacman and the AUR", icon: ICON, score: 40, copy: "", remember: false }]
    return out
  }
}
