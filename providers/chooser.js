.pragma library
.import "../lib/Run.js" as Run
.import "../lib/Score.js" as Score
.import "../lib/Match.js" as Match

// A file dialog jump (ROADMAP 66, L 18). Over a file dialog, folders lead:
// the portal's dialog (xdg-desktop-portal-gtk, which Chromium, Firefox and
// GTK 4 apps open), or a floating window titled as one ("Save As", "Open
// File"). On the empty bar the folders your recent files are in, zoxide's,
// your GTK bookmarks and XDG folders; as you type, any of those, any
// folder under your home by its name, and a path's folders (the files
// provider's rows, which over() turns). Enter types the path into the
// dialog: Home, then the folder and a slash, which in a Save dialog goes
// in front of the name it suggests and in an Open dialog opens its
// location bar (GTK 3's dialog, the portal's; a Save and an Open tried on
// Xvfb with XTest keys, 2026-10-06). The dialog's own Enter stays yours:
// a Save then saves into the folder under that name, an Open goes into
// it. It types only into that dialog, focused again first (lib/Run.js),
// and not at all if another window has the focus by then.

var ICON = "󰉋"
var PORTAL = "xdg-desktop-portal-gtk"
// The titles apps give their file dialogs, whole: "Save As", "Save File",
// "Open File", "File Upload", "Select a Folder", "Choose Files", "Export".
var TITLE = /^(save( as| file| image( as)?| video( as)?| page( as)?| link( as)?| a copy| to)?|open( a)?( file| files| folder| folders| project)?|file upload|upload( files?)?|(select|choose)( an?)? (file|files|folder|folders|directory|location)|export( as)?|import( files?)?|enter name of file to save to)\s*(\.\.\.|\u2026)?$/i
// The portal's dialogs that are no file dialog, by their titles in
// xdg-desktop-portal-gtk 1.15 (Sonnet 2026-10-06: Open With took folders).
var NOT_FILES = /^(open with|choose an application|print( preview)?|page setup|screenshot|share your personal information|create (web )?application|set (as )?(background|wallpaper))\b|^(allow|deny|grant|requesting)\b.*\baccess\b/i
var HOME_MAX = 8
var MAX = 12

// The folder typed in, if the dialog still has the focus: Home, so a
// suggested name stays after it, then the path, in one wtype (two left a
// moment between them for the focus to move; Sonnet 2026-10-06).
var TYPE = 'sleep 0.1; w=$(hyprctl activewindow -j 2>/dev/null | jq -r ".address // empty")'
  + "\n" + '[ "$w" = "$1" ] || { echo "the file dialog no longer has the focus" >&2; exit 1; }'
  + "\n" + 'exec wtype -k Home -- "$2"'

// Folders to offer, a kind and a path a line: the folders of the files
// opened or saved last (recently-used.xbel, newest first), zoxide's,
// your GTK bookmarks, your XDG folders and your home.
var FOLDERS = 'emit() { case $2 in *$\'\\n\'*) return ;; esac; [ -n "$2" ] && [ -d "$2" ] && printf "%s\\037%s\\n" "$1" "$2"; }'
  + "\n" + 'dec() { printf "%b" "${1//%/\\\\x}"; }'
  + "\n" + 'x="$HOME/.local/share/recently-used.xbel"'
  + "\n" + 'if [ -f "$x" ]; then'
  + "\n" + '  sed -n \'s/^ *<bookmark href="file:\\/\\/\\([^"]*\\)".* modified="\\([^"]*\\)".*/\\2 \\1/p\' "$x" | sort -r | sed -e "s/&lt;/</g; s/&gt;/>/g; s/&quot;/\\"/g; s/&apos;/\'/g; s/&amp;/\\\\\&/g" | awk \'{ u = $2; sub(/\\/[^\\/]*$/, "", u); if (!seen[u]++) print u }\' | head -n 40 | while IFS= read -r u; do emit recent "$(dec "$u")"; done'
  + "\n" + 'fi'
  + "\n" + 'if command -v zoxide >/dev/null; then zoxide query --list 2>/dev/null | head -n 40 | while IFS= read -r p; do emit z "$p"; done; fi'
  + "\n" + 'b="$HOME/.config/gtk-3.0/bookmarks"'
  + "\n" + 'if [ -f "$b" ]; then while read -r u _; do case $u in file://*) emit bookmark "$(dec "${u#file://}")" ;; esac; done < "$b"; fi'
  + "\n" + 'for k in DESKTOP DOCUMENTS DOWNLOAD PICTURES VIDEOS MUSIC; do d=$(xdg-user-dir "$k" 2>/dev/null); emit xdg "$d"; done'
  + "\n" + 'emit home "$HOME"'
  + "\n" + 'exit 0'

// The window the bar opened over, if it is a file dialog: { address, title }.
function dialogOf(w) {
  if (!w || !/^0x[0-9a-fA-F]+$/.test(String(w.address || ""))) return null
  var title = String(w.title || "").trim()
  var portal = String(w["class"] || "") === PORTAL && !NOT_FILES.test(title)
  if (portal || (w.floating && TITLE.test(title))) return { address: String(w.address), title: title || "File dialog" }
  return null
}

function norm(path) {
  var p = String(path || "")
  return p.length > 1 ? p.replace(/\/+$/, "") : p
}

// The script's lines as [{ kind, path }], each folder once, in its order.
function foldersOf(text) {
  var out = []
  var seen = Object.create(null)
  var lines = String(text || "").split("\n")
  for (var i = 0; i < lines.length; i++) {
    var cut = lines[i].indexOf("\u001f")
    if (cut < 1) continue
    var p = norm(lines[i].slice(cut + 1))
    if (p.charAt(0) !== "/" || seen[p] || !typable(p)) continue
    seen[p] = true
    out.push({ kind: lines[i].slice(0, cut), path: p })
  }
  return out
}

// What the empty bar offers: four folders of recent files, three of
// zoxide's, then the bookmarks and XDG folders.
function homeSet(folders) {
  var take = { recent: 4, z: 3 }
  var n = { recent: 0, z: 0 }
  var out = []
  for (var i = 0; i < folders.length; i++) {
    var k = folders[i].kind
    if (take[k] !== undefined && n[k]++ < take[k]) out.push(folders[i])
  }
  for (var j = 0; j < folders.length && out.length < HOME_MAX; j++) if (take[folders[j].kind] === undefined) out.push(folders[j])
  return out.slice(0, HOME_MAX)
}

function tilde(path, home) { return home && (path === home || path.indexOf(home + "/") === 0) ? "~" + path.slice(home.length) : path }

function typeRun(d, path) { return Run.pasting(Run.shell(TYPE, [d.address, path === "/" ? "/" : path + "/"])) }

// A path wtype can type as it is: a newline in one would be an Enter in
// the dialog (Sonnet 2026-10-06).
function typable(path) { return !/[\r\n]/.test(String(path || "")) }

function rowOf(path, d, home) {
  var name = path === home ? "Home" : path.slice(path.lastIndexOf("/") + 1) || "/"
  return { key: "file:" + path, title: name, subtitle: tilde(path, home), icon: ICON, run: typeRun(d, path), actionLabel: "Type in",
           copy: path, remember: false, group: "Folders" }
}

function folders(ctx) {
  var got = ctx.request ? ctx.request("chooser-folders", "") : { state: "pending" }
  return Array.isArray(got.value) ? got.value : []
}

// On the empty bar over a file dialog: the folders first.
function homeRows(ctx) {
  var d = dialogOf(ctx.window)
  if (!d) return []
  var home = String(ctx.home || "")
  return homeSet(folders(ctx)).map(function(f, i) {
    var r = rowOf(f.path, d, home)
    r.score = 70 - i
    return r
  })
}

// A copy of a files row for a folder (row.folder) that types it in,
// leading as a mode's row does; its own run, opening it, in Ctrl+K.
function typed(r, d, home) {
  var c = {}
  for (var k in r) c[k] = r[k]
  c.run = typeRun(d, r.folder)
  c.actionLabel = "Type in"
  c.actions = [{ label: "Open the folder", icon: ICON, run: r.run }].concat(r.actions || [])
  if (r.tier) c.kind = "mode"
  if (r.folderSelf) c.title = tilde(r.folder, home)
  c.remember = false
  return c
}

// Over a file dialog, the files provider's rows (providers/files.js): each
// folder's types it in, and in a search at root the folders offered here
// that the words name lead, each folder once.
function over(d, query, rows, ctx) {
  var home = String(ctx.home || "")
  var have = Object.create(null)
  var out = []
  for (var i = 0; i < rows.length; i++) {
    if (rows[i].folder && typable(rows[i].folder)) {
      have[rows[i].folder] = true
      out.push(typed(rows[i], d, home))
    } else out.push(rows[i])
  }
  var q = String(query || "").trim()
  if (!q || /^(~|\/)/.test(q) || /^\s*((f|file)\s|recent(\s|$)|find\s|in\s)/i.test(String(query))) return out
  var lead = []
  var list = folders(ctx)
  for (var j = 0; j < list.length && lead.length < MAX; j++) {
    var p = list[j].path
    if (have[p]) continue
    var name = p === home ? "Home" : p.slice(p.lastIndexOf("/") + 1)
    var tier = Score.tier(q, Score.prepare({ name: name, keywords: [tilde(p, home).split("/").join(" ")] }))
    if (!tier || Score.loose(tier)) continue
    var row = rowOf(p, d, home)
    row.tier = tier
    row.kind = "mode"
    have[p] = true
    lead.push(row)
  }
  return lead.concat(out)
}

var provider = {
  id: "chooser",
  name: "Folders",
  icon: ICON,
  help: [{ id: "chooser", title: "File dialogs", icon: ICON, about: "Over a Save or Open dialog, folders lead; Enter types the path in",
           examples: [{ q: "downloads", note: "Over a file dialog: the folder, typed in" }, { q: "~/Work/", note: "Its folders, each typed in" }] }],
  sources: {
    "chooser-folders": {
      argv: function() { return ["/usr/bin/bash", "-c", FOLDERS] },
      parse: function(text, ok) { if (!ok) throw "the folders could not be read"; return foldersOf(text) },
      maxAgeMs: 30 * 1000, retryMs: 30 * 1000, timeoutMs: 4000
    }
  },
  // As you type, the folders come through the files provider (over()).
  match: function() { return [] }
}
