.pragma library
.import "../lib/Run.js" as Run
.import "../lib/Score.js" as Score
.import "../lib/WindowClass.js" as WindowClass

// The window the bar was opened over, and what a capture finds, brought
// back to the bar (ROADMAP 59, X 5). For that window (ctx.window):
//
//   its text        read from its own buffer (grim -T, as "Ask about this
//                   window" takes it) by tesseract, copied, and the bar
//                   opened again, where a fresh copy leads with what can
//                   be done with it (fix, translate, search)
//   a screenshot    of it alone, where and as Omarchy saves one, copied
//   its folder      in Files, when a shell runs in it (a terminal)
//   move 3          to workspace 3
//   move 100 200    a floating window's place; size 1280 720 its size
//
// And two captures that end in the bar, not only the clipboard: text from
// a region (Omarchy's own capture), and a colour picked, which opens the
// bar on its hex. Floating, full screen and the rest are your keybindings'
// rows already ("full screen").

var ICON = "󰖯"

// Its text: read, copied, and the bar again. Each step's failure says
// its own why, which the watched run notifies (lib/Run.js watched): a
// capture that failed is no window without text (Sonnet 2026-10-06).
var TEXT = 'f=$(mktemp --suffix=.png) || exit 1'
  + "\n" + 'grim -T "$1" "$f" || { rm -f "$f"; echo "the window could not be captured" >&2; exit 1; }'
  + "\n" + 't=$(tesseract "$f" stdout --oem 1 --psm 6 -l "${OMARCHY_OCR_LANGS:-eng}" --dpi 300 -c preserve_interword_spaces=1 2>/dev/null) || { rm -f "$f"; echo "tesseract could not read it" >&2; exit 1; }'
  + "\n" + 'rm -f "$f"; [ -n "$t" ] || { echo "no text was found in the window" >&2; exit 1; }'
  + "\n" + 'printf "%s" "$t" | wl-copy && exec omarchy-shell shell summon "$2" "{}"'

// A screenshot of it alone, as omarchy-capture-screenshot names and keeps
// one, your user-dirs read as it reads them.
var SHOT = '[ -f "$HOME/.config/user-dirs.dirs" ] && . "$HOME/.config/user-dirs.dirs"'
  + "\n" + 'd="${OMARCHY_SCREENSHOT_DIR:-${XDG_PICTURES_DIR:-$HOME/Pictures}}"; mkdir -p "$d" || exit 1'
  + "\n" + 'f="$d/screenshot-$(date +%Y-%m-%d_%H-%M-%S).png"'
  + "\n" + 'grim -T "$1" "$f" || { echo "the window could not be captured" >&2; exit 1; }'
  + "\n" + 'wl-copy --type image/png < "$f"; notify-send -a Nodi "Screenshot of $2" "Saved to the clipboard and $f"'

// Omarchy's own region capture, then the bar, if it copied anything (a
// cancelled region copies nothing, and the bar stays closed).
var REGION = 'b=$(wl-paste -n 2>/dev/null | sha1sum); omarchy-capture-text || exit 1'
  + "\n" + '[ "$(wl-paste -n 2>/dev/null | sha1sum)" != "$b" ] && exec omarchy-shell shell summon "$1" "{}"; exit 0'

// A colour picked (and copied, as hyprpicker does), and the bar on its hex.
var COLOUR = 'c=$(hyprpicker -a -f hex 2>/dev/null) && [ -n "$c" ] || exit 0'
  + "\n" + 'exec omarchy-shell shell summon "$1" "$(jq -cn --arg q "$c" \'{query: $q}\')"'

// The folder a shell in the window is in, as omarchy-cmd-terminal-cwd finds
// it for the active window: the window's newest child, if a shell.
var CWD = 'c=$(pgrep -P "$1" | tail -n1); [ -n "$c" ] || exit 0'
  + "\n" + 'd=$(readlink -f "/proc/$c/cwd"); s=$(readlink -f "/proc/$c/exe")'
  + "\n" + 'grep -Fqsx "$s" /etc/shells && [ -d "$d" ] && printf "%s" "$d"; exit 0'

var MOVE = /^\s*move(?:\s+(?:it|this))?(?:\s+to)?(?:\s+workspace)?\s+([1-9]\d?)\s*$/i
// "move 100 200", "move to 100,200": a floating window's place; "size 1280
// 720", "resize 1280x720": its size, kept about its centre, as Hyprland
// resizes a floating window (ROADMAP 60, L 10).
var PLACE = /^\s*move(?:\s+(?:it|this))?(?:\s+to)?\s+(-?\d{1,5})\s*(?:,\s*|\s+|x)(-?\d{1,5})\s*$/i
var SIZE = /^\s*(?:re)?size(?:\s+(?:it|this))?(?:\s+to)?\s+(\d{2,5})\s*(?:,\s*|\s+|x)(\d{2,5})\s*$/i

// The next window of the active window's app, in the order the windows
// sit (workspace, then top to bottom, left to right), round to the first:
// asked when it runs, so it works from a hotkey too.
var NEXT = 'a=$(hyprctl activewindow -j) || exit 1'
  + "\n" + 'c=$(jq -r \'.class // empty\' <<< "$a"); me=$(jq -r \'.address // empty\' <<< "$a"); [ -n "$c" ] || exit 0'
  + "\n" + 'n=$(hyprctl clients -j | jq -r --arg c "$c" --arg me "$me" \'[.[] | select(.class == $c and .mapped and (.hidden | not))] | sort_by(.workspace.id, .at[1], .at[0]) | map(.address) | if length < 2 then empty else .[((index($me) // -1) + 1) % length] end\')'
  + "\n" + '[ -n "$n" ] || exit 0'
  + "\n" + 'r=$(hyprctl dispatch "hl.dsp.focus({ window = \\"address:$n\\" })" 2>&1); [ "$r" = ok ] || { echo "${r:-hyprctl gave no answer}" >&2; exit 1; }'

// A dispatch that says why it failed: hyprctl answers "ok", else the
// error, and exits 0 either way.
var DISPATCH = 'r=$(hyprctl dispatch "$1" 2>&1); [ "$r" = ok ] || { echo "${r:-hyprctl gave no answer}" >&2; exit 1; }'

function appOf(w, apps) { return WindowClass.nameForClass(String(w["class"] || ""), apps) || "this window" }

function homeless(dir, home) { return home && (dir === home || dir.indexOf(home + "/") === 0) ? "~" + dir.slice(home.length) : dir }

// A row named by its words and keywords, at the tier the query names it.
function named(q, row, keywords) {
  var t = Score.tier(q, Score.prepare({ name: row.title, keywords: [keywords] }))
  if (!t) return null
  row.tier = t
  row.kind = "action"
  row.copy = ""
  return row
}

var provider = {
  id: "here",
  name: "This window",
  icon: ICON,
  sources: {
    "window-cwd": {
      argv: function(pid) { return ["/usr/bin/bash", "-c", CWD, "nodi-cwd", String(pid)] },
      parse: function(text, ok) { if (!ok) throw "the folder could not be read"; return String(text || "").trim() },
      maxAgeMs: 5000,
      retryMs: 5000,
      timeoutMs: 3000,
      maxBytes: 8192
    }
  },
  commands: function(ctx) {
    var id = String(ctx.pluginId || "io.github.itsgg.nodi")
    return [
      { title: "Text from a region", keywords: "ocr read text extract region capture screen", text: "Read with OCR, then shown here to act on",
        run: Run.shell(REGION, [id]), icon: "󰴑" },
      { title: "Pick a colour", keywords: "colour color picker pick eyedropper hex screen", text: "Its hex, copied and shown here",
        run: Run.shell(COLOUR, [id]), icon: "󰈊" },
      { title: "Next window of this app", keywords: "next window cycle app switch same other", text: "The app's next window, round to the first; give it a hotkey",
        run: Run.shell(NEXT), icon: "󰖲" }
    ]
  },
  help: [
    { id: "here", title: "This window", icon: ICON, about: "The window the bar opened over: its text, a screenshot, its folder, another workspace",
      examples: [{ q: "window text", note: "Its text, read and shown here" }, { q: "screenshot window" }, { q: "move 3", note: "To workspace 3" },
                 { q: "move 100 200", note: "A floating window's place; size 1280 720 its size" }, { q: "next window", note: "The app's next one; give it a hotkey" }] }
  ],
  match: function(query, ctx) {
    var w = ctx.window || {}
    var q = String(query || "").trim()
    if (!w.address || q.length < 2) return []
    var app = appOf(w, ctx.apps)
    var out = []
    var place = q.match(PLACE)
    var size = place ? null : q.match(SIZE)
    if ((place || size) && /^0x[0-9a-fA-F]+$/.test(w.address)) {
      if (!w.floating)
        return [{ key: "here:tiled", title: app + " is tiled", subtitle: "Float it first (Super + T): a place and a size are for a floating window",
                  icon: ICON, tier: "exact", kind: "action", copy: "", remember: false }]
      var x = Number((place || size)[1]), y = Number((place || size)[2])
      var lua = (place ? "hl.dsp.window.move" : "hl.dsp.window.resize") + '({ window = "address:' + w.address + '", x = ' + x + ", y = " + y + ", relative = false })"
      return [{ key: "here:" + (place ? "place" : "size"), title: place ? "Move " + app + " to " + x + ", " + y : "Resize " + app + " to " + x + " x " + y,
                subtitle: String(w.title || ""), icon: ICON, run: Run.shell(DISPATCH, [lua]), tier: "exact", kind: "action", copy: "", remember: false }]
    }
    var m = q.match(MOVE)
    if (m && /^0x[0-9a-fA-F]+$/.test(w.address)) {
      out.push({ key: "here:move:" + m[1], title: "Move " + app + " to workspace " + m[1], subtitle: String(w.title || ""), icon: ICON,
                 run: Run.shell(DISPATCH, ['hl.dsp.window.move({ window = "address:' + w.address + '", workspace = "' + m[1] + '", follow = false })']),
                 tier: "exact", kind: "action", copy: "", remember: false })
      return out
    }
    if (w.stableId) {
      var id = String(ctx.pluginId || "io.github.itsgg.nodi")
      var text = named(q, { key: "here:text", title: "Copy the text in " + app, subtitle: "Read from the window, then shown here to act on", icon: "󰴑",
                            run: Run.shell(TEXT, [w.stableId, id]), remember: false }, "ocr read text extract window this")
      if (text) out.push(text)
      var shot = named(q, { key: "here:shot", title: "Screenshot " + app, subtitle: "The window alone, saved and copied", icon: "󰄀",
                            run: Run.shell(SHOT, [w.stableId, app]), remember: false }, "screenshot capture picture window this")
      if (shot) out.push(shot)
    }
    // The folder is read only for a query that could name its row.
    if (/^\d+$/.test(String(w.pid || "")) && ctx.request && named(q, { title: "Open its folder in Files" }, "files folder directory here cwd this window")) {
      var got = ctx.request("window-cwd", String(w.pid))
      var dir = got && typeof got.value === "string" ? got.value : ""
      if (dir.charAt(0) === "/") {
        var files = named(q, { key: "here:files", title: "Open " + homeless(dir, ctx.home) + " in Files", subtitle: "The folder " + app + " is in",
                               icon: "󰉋", run: Run.open(dir), remember: false }, "files folder directory here cwd this window")
        if (files) out.push(files)
      }
    }
    return out
  }
}
