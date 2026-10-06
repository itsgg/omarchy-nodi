.pragma library
.import "../lib/Run.js" as Run
.import "../lib/Score.js" as Score
.import "../lib/Prefs.js" as Prefs
.import "../lib/WindowClass.js" as WindowClass

// Saved desktops (ROADMAP 60, L 10). "save desktop work" keeps which app
// is on which numbered workspace now, in prefs.json (never your config):
// each by its desktop entry and the window class it had. "Open desktop
// work" then starts each of those apps that has no window open, on its
// own workspace, as Hyprland's exec rule puts it there (exec_cmd with a
// workspace rule, the app started through uwsm-app as any app is; seen
// to land so through gtk-launch, 2026-10-06). The row holds only the
// desktop's name: the apps are read from prefs.json, and what is open is
// asked, when it runs, so a hotkey on it opens the desktop as saved now,
// never a second copy, and nothing once it is forgotten (Sonnet
// 2026-10-06). "forget desktop work" lets one go. A named workspace is
// left out: Hyprland's rule by a bare name is unchecked.

var ICON = "󰕰"
var SAVE = /^\s*save\s+(?:this\s+)?desktop(?:\s+as)?\s+(.+?)\s*$/i
var FORGET = /^\s*(?:forget|remove|delete)\s+desktop\s+(.+?)\s*$/i

// The desktop named $1 as prefs.json holds it now: each app started
// unless a window of the class it had is open, or it was just started
// for another workspace; the command in Hyprland's exec_cmd is a Lua long
// bracket its text cannot close, the desktop entry quoted for the shell.
// Its fields apart by the unit separator, which no id holds: tab is blank
// to `read`, and @tsv's escapes stay escaped (Sonnet 2026-10-06).
var OPEN = 'p="$HOME/.local/state/nodi/prefs.json"'
  + "\n" + 'apps=$(jq -r --arg n "$1" \'.desktops[]? | select((.name | ascii_downcase) == ($n | ascii_downcase)) | .apps[] | [.cls, .id, .workspace] | join("\\u001f")\' "$p" 2>/dev/null)'
  + "\n" + '[ -n "$apps" ] || { echo "no desktop named $1 is saved" >&2; exit 1; }'
  + "\n" + 'c=$(hyprctl clients -j) && open=$(jq -r \'.[].class\' <<< "$c") || { echo "the open windows could not be read" >&2; exit 1; }'
  + "\n" + 'while IFS=$\'\\x1f\' read -r cls id ws; do'
  + "\n" + '  [[ $ws =~ ^[1-9][0-9]{0,2}$ ]] || continue'
  + "\n" + '  [ -n "$cls" ] && grep -Fqx -- "$cls" <<< "$open" && continue'
  + "\n" + '  cmd="uwsm-app -- gtk-launch $(printf %q "$id.desktop")"; eq=""; while [[ $cmd == *"]$eq]"* ]]; do eq+="="; done'
  + "\n" + '  r=$(hyprctl dispatch "hl.dsp.exec_cmd([$eq[$cmd]$eq], { workspace = \\"$ws silent\\" })" 2>&1)'
  + "\n" + '  [ "$r" = ok ] || { echo "${r:-hyprctl gave no answer}" >&2; exit 1; }'
  + "\n" + '  open+=$\'\\n\'"$cls"'
  + "\n" + 'done <<< "$apps"'

// The apps on the numbered workspaces now: one an app and workspace, in
// the workspaces' order.
function appsOn(windows, apps) {
  var out = []
  var seen = Object.create(null)
  for (var i = 0; i < (windows || []).length; i++) {
    var w = windows[i]
    if (!w || !/^[1-9]\d{0,2}$/.test(String(w.workspace || ""))) continue
    var app = WindowClass.forClass(w.cls, apps)
    if (!app || !Run.valid(Run.app(String(app.id)))) continue
    var k = app.id + "\u0001" + w.workspace
    if (seen[k]) continue
    seen[k] = true
    out.push({ id: String(app.id), cls: String(w.cls || ""), name: String(app.name || app.id), workspace: String(w.workspace) })
  }
  return out.sort(function(a, b) { return Number(a.workspace) - Number(b.workspace) })
}

function said(apps) {
  var parts = apps.map(function(a) { return a.name + " on " + a.workspace })
  var s = parts.slice(0, 4).join(", ")
  return parts.length > 4 ? s + " and " + (parts.length - 4) + " more" : s
}

// By its own name or the word desktop, nothing wider: "layout" and "open"
// put a desktop over World clock at "wo" (Sonnet 2026-10-06).
function openRow(d, q) {
  var t = Score.tier(q, Score.prepare({ name: d.name, keywords: ["desktop desktops"] }))
  if (!t) return null
  return { key: "desktop:" + d.name.toLowerCase(), title: "Open desktop \"" + d.name + "\"", subtitle: said(d.apps), icon: ICON,
           run: Run.shell(OPEN, [d.name]), tier: t, kind: "action", copy: "" }
}

var provider = {
  id: "desktops",
  name: "Desktops",
  icon: ICON,
  help: [
    { id: "desktops", title: "Saved desktops", icon: ICON, about: "Which app is on which workspace, saved by a name and opened again",
      examples: [{ q: "save desktop work", note: "The apps on your workspaces now" }, { q: "desktop", note: "Every one saved" },
                 { q: "forget desktop work" }] }
  ],
  match: function(query, ctx) {
    var q = String(query || "").trim()
    if (q.length < 2) return []
    var prefs = ctx.prefs || null
    var m = q.match(SAVE)
    if (m) {
      var name = Prefs.desktopName(m[1])
      var apps = appsOn(ctx.windows, ctx.apps)
      if (!name) return [{ title: "A desktop's name is up to 40 characters", subtitle: "save desktop <name>", icon: ICON, score: 40, copy: "", remember: false }]
      if (!apps.length) return [{ title: "No app to save", subtitle: "Open some apps on your numbered workspaces first", icon: ICON, score: 40, copy: "", remember: false }]
      var had = prefs && Prefs.desktopFor(prefs, name)
      return [{ key: "desktop:save:" + name.toLowerCase(), title: (had ? "Replace desktop \"" : "Save this desktop as \"") + name + "\"",
                subtitle: said(apps), icon: ICON, nodi: "saveDesktop", data: { name: name, apps: apps }, actionLabel: "Save",
                tier: "exact", kind: "action", remember: false, copy: "" }]
    }
    var f = q.match(FORGET)
    if (f) {
      var d0 = prefs && Prefs.desktopFor(prefs, f[1])
      return d0 ? [{ key: "desktop:forget:" + d0.name.toLowerCase(), title: "Forget desktop \"" + d0.name + "\"", subtitle: said(d0.apps), icon: ICON,
                     nodi: "forgetDesktop", data: { name: d0.name }, actionLabel: "Forget", tier: "exact", kind: "action", remember: false, copy: "" }] : []
    }
    var out = []
    var all = (prefs && prefs.desktops) || []
    for (var i = 0; i < all.length; i++) {
      var r = openRow(all[i], q)
      if (r) out.push(r)
    }
    return out
  }
}
