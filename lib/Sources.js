.pragma library

// The readers' output, parsed. Nodi.qml runs the programs; everything that
// can misread their output lives here, where node tests it.

// ---------------------------------------------------------------- limits

var OVERFLOW = 213   // the exit status when a reader printed past its cap
var TIMEOUT = 124    // timeout(1)'s, when the deadline ended the program
var KILLED = 137     // timeout(1)'s when the program ignored TERM and took KILL

// The argv a reader really starts: the program under timeout(1), its output
// through head(1). The cap holds before Quickshell sees a byte, so one line
// with no newline cannot grow without bound in the line splitter (codex
// 2026-10-02), and the deadline kills the program, not only the bash that
// started it. One byte past the cap is the overflow signal; head -c reads no
// further than it is asked, so the check sees the true next byte. A program
// that overflows ends on its next write (SIGPIPE) or at the deadline, and
// `finished` waits for that; the caps are far above any reader's output.
function limited(argv, timeoutMs, maxBytes) {
  var seconds = Math.max(1, Math.ceil(timeoutMs / 1000))
  return ["/usr/bin/bash", "-c",
    'm=$1 s=$2; shift 2; set -o pipefail; timeout -k 1 "$s" "$@" | { head -c "$m"; [ "$(head -c 1 | wc -c)" = 0 ] || exit ' + OVERFLOW + '; }',
    "nodi-read", String(maxBytes), String(seconds)].concat(argv)
}

// One directory's entries, a line each. A name holding a newline is left
// out rather than misread: "a\nd\tb" would otherwise list a folder "b"
// (codex 2026-10-02).
function directoryArgv(path) {
  return ["/usr/bin/find", String(path), "-mindepth", "1", "-maxdepth", "1", "-name", "*\n*", "-prune", "-o", "-printf", "%Y\t%f\n"]
}

// `hyprctl clients -j`, a line "@@", then `hyprctl activeworkspace -j`.
// The active workspace is its id when positive, else (a named or special
// workspace has a negative id, and "-3" selects one by relative offset)
// its name as a selector, "name:code" or "special:scratch" (agy 2026-10-03).
function windows(text) {
  var parts = String(text || "").split("\n@@\n")
  var out = []
  var active = null
  try {
    var list = JSON.parse(parts[0])
    for (var i = 0; i < list.length; i++) {
      var c = list[i]
      if (!c || !c.mapped || c.hidden) continue
      out.push({
        address: String(c.address || ""),
        cls: String(c["class"] || c.initialClass || ""),
        title: String(c.title || ""),
        workspace: String((c.workspace && c.workspace.name) || ""),
        focus: typeof c.focusHistoryID === "number" ? c.focusHistoryID : 99
      })
    }
  } catch (e) {}
  try {
    var ws = JSON.parse(parts[1] || "")
    if (ws && typeof ws.id === "number" && ws.id > 0) active = ws.id
    else if (ws && typeof ws.name === "string" && ws.name) active = /^special:/.test(ws.name) ? ws.name : "name:" + ws.name
  } catch (e2) {}
  return { list: out, activeWorkspace: active }
}

// `ps -o pid=,rss=,pcpu=,comm:40=,args=`: comm is padded to 40 columns so a
// name with spaces ("Web Content") parses.
function processes(text) {
  var out = []
  var lines = String(text || "").split("\n")
  for (var i = 0; i < lines.length; i++) {
    var m = lines[i].match(/^\s*(\d+)\s+(\d+)\s+([\d.]+) (.{40}) (.*)$/)
    if (!m) continue
    var name = m[4].trim()
    if (name === "ps") continue
    out.push({ pid: parseInt(m[1], 10), rss: parseInt(m[2], 10), cpu: parseFloat(m[3]), name: name, args: m[5] })
  }
  return out
}

// "@local Europe/Berlin", then "zone +hhmm ABBR" per zone.
function zones(text) {
  var map = {}
  var local = ""
  var lines = String(text || "").split("\n")
  for (var i = 0; i < lines.length; i++) {
    var l = lines[i].match(/^@local (\S+)$/)
    if (l) { local = l[1]; continue }
    var m = lines[i].match(/^(\S+) ([+-])(\d\d)(\d\d) (\S+)$/)
    if (!m) continue
    var minutes = parseInt(m[3], 10) * 60 + parseInt(m[4], 10)
    map[m[1]] = { offset: m[2] === "-" ? -minutes : minutes, abbr: m[5] }
  }
  return { zones: map, local: local }
}

// The name `omarchy theme list` shows for a theme directory: "tokyo-night"
// reads "Tokyo Night".
function themeName(slug) {
  return String(slug).replace(/(^|-)([a-z])/g, function(all, sep, c) { return sep + c.toUpperCase() }).replace(/-/g, " ")
}

// "@current<TAB>Name", then "slug<TAB>preview path or empty" per theme
// directory, the user's first. A user theme hides a stock one of its name.
function themes(text) {
  var seen = Object.create(null)    // a theme may be named "constructor" (codex 2026-10-04)
  var list = []
  var current = ""
  var lines = String(text || "").split("\n")
  for (var i = 0; i < lines.length; i++) {
    var parts = lines[i].split("\t")
    if (parts.length < 2) continue
    if (parts[0] === "@current") { current = parts[1].trim(); continue }
    var slug = parts[0].trim()
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(slug) || seen[slug]) continue
    seen[slug] = true
    list.push({ name: themeName(slug), preview: parts[1].trim() })
  }
  list.sort(function(a, b) { return a.name.localeCompare(b.name) })
  return { list: list, current: current === "Unknown" ? "" : current }
}

// directoryArgv's output: folders first, then files, each by name without
// regard to case.
function directory(text) {
  var out = []
  var lines = String(text || "").split("\n")
  for (var i = 0; i < lines.length; i++) {
    var tab = lines[i].indexOf("\t")
    if (tab !== 1) continue
    var name = lines[i].slice(2)
    if (!name) continue
    out.push({ name: name, dir: lines[i][0] === "d" })
  }
  out.sort(function(a, b) {
    if (a.dir !== b.dir) return a.dir ? -1 : 1
    var x = a.name.toLowerCase(), y = b.name.toLowerCase()
    return x < y ? -1 : (x > y ? 1 : 0)
  })
  return out
}

function decodeXml(s) {
  return String(s).replace(/&quot;/g, "\"").replace(/&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&")
}

// GTK's recently-used.xbel: local files only, newest first by `modified`,
// each once.
function recentFiles(xml, limit) {
  var re = /<bookmark\b([^>]*)>/g
  var list = []
  var seen = {}
  var m
  while ((m = re.exec(String(xml || ""))) !== null) {
    var attrs = m[1]
    var href = attrs.match(/\bhref="([^"]*)"/)
    if (!href) continue
    var url = decodeXml(href[1])
    if (url.indexOf("file://") !== 0) continue
    var path
    try { path = decodeURIComponent(url.slice(7)) } catch (e) { continue }
    if (path[0] !== "/" || seen[path]) continue
    seen[path] = true
    var mod = attrs.match(/\bmodified="([^"]*)"/)
    var when = mod ? Date.parse(mod[1]) : 0
    list.push({ path: path, name: path.split("/").pop() || path, when: isNaN(when) ? 0 : when })
  }
  list.sort(function(a, b) { return b.when - a.when })
  return limit ? list.slice(0, limit) : list
}

// Omarchy's clipboard history file: an array, newest first. Anything else is
// an empty history.
function clipboard(text) {
  try {
    var data = JSON.parse(text)
    return Array.isArray(data) ? data : []
  } catch (e) {
    return []
  }
}

// Omarchy's launcher.hides: one desktop id per line.
function hidden(text) {
  var out = {}
  var lines = String(text || "").split("\n")
  for (var i = 0; i < lines.length; i++) {
    var id = lines[i].trim().replace(/\.desktop$/, "")
    if (id && id[0] !== "#") out[id] = true
  }
  return out
}

// `omarchy-reminder show --json`: the pending reminders, soonest first.
function reminders(text) {
  try {
    var data = JSON.parse(text)
    var list = data && Array.isArray(data.reminders) ? data.reminders : []
    return list.filter(function(r) { return r && (r.label || r.message) }).map(function(r) {
      return { unit: String(r.unit || ""), label: String(r.label || r.message), remaining: String(r.remaining || ""),
               atTime: String(r.atTime || ""), seconds: Number(r.remainingSeconds) || 0 }
    }).sort(function(a, b) { return a.seconds - b.seconds })
  } catch (e) {
    return []
  }
}

// Omarchy's keybinding records (omarchy-menu-keybindings' cache): a line
// per binding, "SUPER SHIFT + F    <arrow> File manager<TAB>exec<TAB>command",
// the arrow being U+2192.
// The dispatcher is exec, lua (a Lua expression for hyprctl dispatch),
// sendshortcut, or empty when Hyprland reports no command.
function keybindings(text) {
  var out = []
  var lines = String(text || "").split("\n")
  for (var i = 0; i < lines.length; i++) {
    var parts = lines[i].split("\t")
    var head = parts[0].split("\u2192")
    if (head.length < 2) continue
    var chord = head[0].replace(/\s+/g, " ").trim()
    var description = head.slice(1).join("\u2192").trim()
    if (!chord || !description) continue
    out.push({ chord: chord, description: description, dispatcher: String(parts[1] || "").trim(), arg: parts.slice(2).join("\t").trim() })
  }
  return out
}
