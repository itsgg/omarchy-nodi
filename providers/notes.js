.pragma library
.import "../lib/Run.js" as Run
.import "../lib/Match.js" as Match

// Notes in one line (ROADMAP 68, L 17). `note <text>` adds "- 2026-10-06
// 00:42 <text>" to a Markdown file, "notes": { "file": ... } in nodi.json,
// ~/Documents/notes.md unless set, made with its folder if missing, the
// time taken as it is added. `notes <words>` finds its lines that hold
// every word, the newest first (the file's last), and `notes ` alone the
// last twenty; the line and those around it in the pane, Enter opening
// the file at it in Omarchy's default editor (a terminal one at the line).

var ICON = "󰎞"
var DEFAULT = "~/Documents/notes.md"
var LIMIT = 20

// The line, dated as it is added; the folder made if missing, and a file
// that ends without a newline given one first (Sonnet 2026-10-06).
var ADD = 't=${NODI_TEXT-}; unset NODI_TEXT; mkdir -p -- "$(dirname -- "$1")" || exit 1; [ -s "$1" ] && [ -n "$(tail -c 1 -- "$1")" ] && printf "\\n" >> "$1"'
  + "\n" + 'printf -- "- %s %s\\n" "$(date "+%Y-%m-%d %H:%M")" "$t" >> "$1"'

// The file in Omarchy's default editor: a terminal editor at the line.
var OPEN = 'e=$(cat "$HOME/.local/state/omarchy/defaults/editor" 2>/dev/null); case "${e:-nvim}" in *nvim|*vim|*nano|*micro) exec omarchy-launch-editor "+$2" "$1" ;; *) exec omarchy-launch-editor "$1" ;; esac'

// Its newest 4 MB at most, past which the read would fail for good; a
// line cut at the start is the parse's to drop.
var READ = '[ -f "$1" ] || exit 0; s=$(stat -c %s -- "$1"); if [ "$s" -gt 4000000 ]; then printf "\\001\\n"; tail -c 4000000 -- "$1"; else cat -- "$1"; fi'

function fileOf(settings, home) {
  var f = String((settings && settings.file) || DEFAULT)
  if (f === "~" || f.indexOf("~/") === 0) f = home + f.slice(1)
  return f.charAt(0) === "/" ? f : ""
}

function tilde(path, home) { return home && path.indexOf(home + "/") === 0 ? "~" + path.slice(home.length) : path }

// The file's lines as [{ n, text, date }], a dated note's date apart.
function linesOf(text) {
  var out = []
  var all = String(text || "").split("\n")
  // Only the newest of a big file: its first line is cut, and its line
  // numbers are not the file's, so none are given.
  var cut = all[0] === "\u0001"
  if (cut) all = all.slice(2)
  for (var i = 0; i < all.length; i++) {
    var raw = all[i].replace(/\r$/, "")
    if (!raw.trim()) continue
    var m = raw.match(/^\s*[-*]\s+(\d{4}-\d{2}-\d{2}(?: \d{2}:\d{2})?)\s+(.*)$/)
    out.push({ n: cut ? 0 : i + 1, text: (m ? m[2] : raw.replace(/^\s*[-*]\s+/, "")).trim(), date: m ? m[1] : "", raw: raw })
  }
  return out
}

function around(lines, at) {
  var from = Math.max(0, at - 3), to = Math.min(lines.length, at + 4)
  return lines.slice(from, to).map(function(l) { return l.raw }).join("\n")
}

var provider = {
  id: "notes",
  name: "Notes",
  icon: ICON,
  modes: [
    { pattern: /^\s*note\s/i, label: "Note", icon: ICON, exclusive: true, hint: "note <text>" },
    // With a space: the word alone may be an app's name, and still finds it.
    { pattern: /^\s*notes\s/i, label: "Notes", icon: ICON, exclusive: true, hint: "notes <words>" }
  ],
  commands: [
    { title: "Add a note", keywords: "note notes jot write add capture", text: "One dated line in your notes file", complete: "note " },
    { title: "Search notes", keywords: "notes find search jot", text: "Your notes' lines that hold the words", complete: "notes " }
  ],
  help: [{ id: "notes", title: "Notes", icon: ICON, about: "One dated line at a time, in a Markdown file; found again by its words",
           examples: [{ q: "note call the bank", note: "Adds a dated line" }, { q: "notes bank", note: "The lines that hold it, newest first" }] }],
  sources: {
    "notes-file": {
      argv: function(path) { return String(path).charAt(0) === "/" ? ["/usr/bin/bash", "-c", READ, "nodi-notes", String(path)] : null },
      parse: function(text, ok) { if (!ok) throw "the notes could not be read"; return linesOf(text) },
      maxAgeMs: 2000, retryMs: 5000, timeoutMs: 3000, maxBytes: 4194304
    }
  },
  match: function(query, ctx) {
    var home = String(ctx.home || "")
    var file = fileOf(ctx.settings, home)
    var add = String(query).match(/^\s*note\s+(.*)$/i)
    if (add) {
      var text = add[1].replace(/\s+/g, " ").trim()
      if (!file) return [{ title: "The notes file is no path", subtitle: "\"notes\": { \"file\": \"~/notes.md\" }", icon: ICON, score: 40, copy: "", remember: false }]
      if (!text) return [{ title: "Add a note", subtitle: "A dated line in " + tilde(file, home), icon: ICON, score: 40, copy: "", remember: false, hint: "note <text>" }]
      return [{ key: "note:add", title: "Note: " + text, subtitle: "Adds a dated line to " + tilde(file, home), icon: ICON, score: 98,
                run: Run.shell(ADD, [file], text), actionLabel: "Add", copy: text, remember: false }]
    }
    var find = String(query).match(/^\s*notes\s+(.*)$/i)
    if (!find) return []
    if (!file || !ctx.request) return []
    var got = ctx.request("notes-file", file)
    if (!Array.isArray(got.value)) return [{ title: got.state === "error" ? "The notes could not be read" : "Reading the notes...", subtitle: tilde(file, home), icon: ICON, score: 40, copy: "", remember: false }]
    var lines = got.value
    if (!lines.length) return [{ title: "No notes yet", subtitle: "note <text> adds one to " + tilde(file, home), icon: ICON, score: 40, copy: "", remember: false }]
    var words = Match.fold(find[1] || "").split(/\s+/).filter(function(w) { return w })
    var out = []
    for (var i = lines.length - 1; i >= 0 && out.length < (words.length ? 50 : LIMIT); i--) {
      var l = lines[i]
      var low = Match.fold(l.raw)
      if (!words.every(function(w) { return low.indexOf(w) !== -1 })) continue
      // By its line, or for a big file's newest part, by its text (Sonnet
      // 2026-10-06: every row there was "note:0").
      out.push({ key: l.n ? "note:" + l.n : "note:t:" + l.raw.slice(0, 200), title: l.text.length > 110 ? l.text.slice(0, 107) + "..." : l.text,
                 subtitle: (l.date ? l.date + (l.n ? ", " : "") : "") + (l.n ? "line " + l.n : ""), icon: ICON, score: 97 - out.length * 0.01, copy: l.text,
                 remember: false, run: Run.shell(OPEN, [file, String(l.n || 1)]), actionLabel: "Open",
                 preview: { title: tilde(file, home), subtitle: l.n ? "Line " + l.n : "", text: around(lines, i), mono: true } })
    }
    if (!out.length) return [{ title: "No note holds \"" + find[1].trim() + "\"", subtitle: tilde(file, home), icon: ICON, score: 40, copy: "", remember: false }]
    return out
  }
}
