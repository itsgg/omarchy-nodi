.pragma library

// A file's first lines with their syntax in colour, as the pane draws them
// (ROADMAP 82). bat, which Omarchy installs, colours them with its `ansi`
// theme: the terminal's sixteen colours by number and nothing else, so here
// each number becomes the colour the Omarchy theme gives it, and the code
// follows the theme as a terminal does. bat used red to cyan (31 to 36)
// over QML, JS, Markdown, JSON, shell, Python, Lua and a Makefile
// (measured 2026-10-07); the rest are read too.

var NAMES = ["black", "red", "green", "yellow", "blue", "magenta", "cyan", "white"]

// The theme's sixteen colours by name ("red", "bright_red"), from its
// colors.toml: Omarchy's own themes name them, others number them
// (color0 to color15); a name the theme gives wins over a number.
function paletteFrom(toml) {
  var named = {}, numbered = {}
  var lines = String(toml || "").split("\n")
  for (var i = 0; i < lines.length; i++) {
    var m = lines[i].match(/^\s*([A-Za-z0-9_-]+)\s*=\s*["']?(#[0-9A-Fa-f]{6})/)
    if (!m) continue
    var n = m[1].match(/^color(\d{1,2})$/)
    if (n && Number(n[1]) < 16) numbered[Number(n[1])] = m[2]
    else named[m[1]] = m[2]
  }
  var out = {}
  for (var c = 0; c < 16; c++) {
    var name = (c < 8 ? "" : "bright_") + NAMES[c % 8]
    var v = named[name] || numbered[c] || (c >= 8 ? named[NAMES[c - 8]] || numbered[c - 8] : "")
    if (v) out[name] = v
  }
  return out
}

// The text with its escapes taken out: what the colours were laid on.
function plain(text) {
  return String(text || "").replace(/\x1b\[[0-9;?]*[ -\/]*[@-~]/g, "").replace(/\x1b[^\[]?/g, "")
    .replace(/[\x00-\x08\x0b-\x1f\x7f]/g, "")
}

function escape(s) { return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;") }

// One SGR's colour: a name of the palette's, "#rrggbb" for 24-bit, or ""
// for the text's own; undefined when it sets no colour.
function colourOf(params, i) {
  var p = params[i]
  if (p === 0 || p === 39) return ""
  if (p >= 30 && p <= 37) return NAMES[p - 30]
  if (p >= 90 && p <= 97) return "bright_" + NAMES[p - 90]
  return undefined
}

// The text as rich text: each run in its colour, the rest in the text's
// own, kept as written (spaces, tabs, line breaks), wrapped where it must.
// `palette` is paletteFrom's; a colour the theme lacks is the text's own.
function html(text, palette) {
  var s = String(text || "")
  var pal = palette || {}
  var out = ""
  var colour = ""
  var at = 0
  var re = /\x1b\[([0-9;]*)m/g
  var m
  function run(chunk) {
    if (!chunk) return
    var body = escape(plain(chunk))
    if (!body) return
    var hex = colour.charAt(0) === "#" ? colour : pal[colour] || ""
    out += hex ? '<span style="color:' + hex + '">' + body + "</span>" : body
  }
  while ((m = re.exec(s)) !== null) {
    run(s.slice(at, m.index))
    at = re.lastIndex
    var params = m[1] === "" ? [0] : m[1].split(";").map(Number)
    for (var i = 0; i < params.length; i++) {
      var p = params[i]
      if ((p === 38) && params[i + 1] === 5 && i + 2 < params.length) {
        var n = params[i + 2]
        colour = n < 8 ? NAMES[n] : n < 16 ? "bright_" + NAMES[n - 8] : ""
        i += 2
      } else if (p === 38 && params[i + 1] === 2 && i + 4 < params.length) {
        var hex = "#" + [params[i + 2], params[i + 3], params[i + 4]].map(function(v) { return ("0" + Math.max(0, Math.min(255, v | 0)).toString(16)).slice(-2) }).join("")
        colour = hex
        i += 4
      } else {
        var c = colourOf(params, i)
        if (c !== undefined) colour = c
      }
    }
  }
  run(s.slice(at))
  // Qt drops a line break that opens the block, as HTML does after <pre>:
  // a first line left empty was lost (Fable 2026-10-07).
  if (plain(s).charAt(0) === "\n") out = "\n" + out
  return '<div style="white-space: pre-wrap">' + out + "</div>"
}
