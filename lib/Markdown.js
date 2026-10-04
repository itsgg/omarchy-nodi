.pragma library

// Markdown a provider hands the preview pane, made safe for Qt's
// Text.MarkdownText to draw: no picture and no HTML, so nothing a provider
// prints can make Nodi load a file or a page (an <img>, a ![](https://...),
// a ![logo] with its address on a later line, a table's background).
// Outside fenced code, a picture keeps its alt text where it is a simple
// one, and every other "![" and "<" is escaped, so no picture, tag or HTML
// block can form however it is spelt or split over lines (Fable 2026-10-04:
// patterns that removed them missed four shapes Qt then fetched). An
// autolink, <https://...>, stays a link. Fenced code is left as written.

var MAX = 65536

var IMAGE = /!\[([^\[\]]*)\]\([^()\s]*(?:\s+"[^"]*")?\)/g     // ![alt](url "title"), plain alt only
// An autolink as md4c takes one: a scheme of 2 to 31 characters (32 was
// prose in Qt, measured) and no space, control character or angle bracket.
// What it holds is skipped as a link, so one md4c reads as prose would hide
// a picture inside it ("<x:![a[b]](url)>" fetched; Fable 2026-10-04), and
// one holding "![" is escaped whatever md4c makes of it.
var AUTOLINK = /^<[A-Za-z][A-Za-z0-9+.-]{1,30}:[^\s<>\x00-\x1f\x7f]*>/
// A fence as md4c (Qt's parser) opens one: three or more of the same mark,
// and after backticks no backtick in the rest of the line.
var FENCE = /^\s{0,3}(`{3,}(?=[^`]*$)|~{3,})/

// Whether the character at i is escaped already: an odd run of backslashes
// before it. Escaping it again would make the backslash the literal one and
// free the character (Fable 2026-10-04: "\\![" became "\\\\![", a picture).
function escapedAt(s, i) {
  var n = 0
  while (i - 1 - n >= 0 && s.charAt(i - 1 - n) === "\\") n++
  return n % 2 === 1
}

// Text outside code: pictures to their alt text or escaped, "<" escaped
// unless it opens an autolink; a character already escaped left alone.
function escapeProse(s) {
  s = s.replace(IMAGE, function(all, alt, at, whole) { return escapedAt(whole, at) ? all : alt })
  var out = ""
  for (var i = 0; i < s.length; i++) {
    var c = s.charAt(i)
    if (c === "!" && s.charAt(i + 1) === "[" && !escapedAt(s, i)) { out += "\\!"; continue }
    if (c !== "<" || escapedAt(s, i)) { out += c; continue }
    var link = s.slice(i).match(AUTOLINK)
    if (link && link[0].indexOf("![") === -1) { out += link[0]; i += link[0].length - 1; continue }
    out += "\\<"
  }
  return out
}

// A line cut at its inline code as md4c finds it: a run of backticks that
// is not itself escaped, closed by the next run exactly as long. Each piece
// of text goes through text(), each span through code(span, body).
// escapeLines() and codeAsText() cut alike, so whatever one leaves as code the other
// escapes; a span opened by an escaped backtick was code to the first and
// prose to md4c, and "\\`<img src=x>`" loaded (2026-10-04).
function pieces(line, text, code) {
  var out = ""
  var from = 0
  var i = 0
  while (i < line.length) {
    if (line.charAt(i) !== "`") { i++; continue }
    if (escapedAt(line, i)) { i++; continue }
    var n = run(line, i)
    var close = i + n
    while (close < line.length && (line.charAt(close) !== "`" || run(line, close) !== n))
      close += line.charAt(close) === "`" ? run(line, close) : 1
    if (close >= line.length) { i += n; continue }
    out += text(line.slice(from, i)) + code(line.slice(i, close + n), line.slice(i + n, close))
    from = i = close + n
  }
  return out + text(line.slice(from))
}

function run(line, i) {
  var n = 0
  while (line.charAt(i + n) === "`") n++
  return n
}

// A line of prose, its inline code left as written: a code span draws its
// text as it is, so nothing in it can load, and an escape there would show.
function prose(line) {
  return pieces(line, escapeProse, function(span) { return span })
}

// A character Markdown would read as markup, taken as itself.
function escaped(text) {
  return String(text).replace(/[\\`*_{}\[\]()#+\-.!|<>~]/g, "\\$&")
}

// Code drawn in the pane's own font: Qt sets code in the system's fixed
// font at its own size, larger than the text around it, and Nodi's font is
// fixed-width already. Each line of a fenced block stays a line (a hard
// break), its indent kept; inline code keeps its characters as they are.
function codeAsText(text) {
  var lines = String(text).split("\n")
  var out = []
  var fence = ""
  for (var i = 0; i < lines.length; i++) {
    var m = lines[i].match(FENCE)
    if (fence) {
      if (m && m[1].charAt(0) === fence.charAt(0) && m[1].length >= fence.length) { fence = ""; out.push(""); continue }
      var indent = lines[i].match(/^[ \t]*/)[0].replace(/\t/g, "    ").replace(/ /g, "\u00a0")
      out.push(indent + escaped(lines[i].replace(/^[ \t]*/, "")) + "  ")
      continue
    }
    if (m) { fence = m[1]; out.push(""); continue }
    out.push(pieces(lines[i], function(t) { return t }, function(span, body) { return escaped(body.replace(/^ (.*) $/, "$1")) }))
  }
  return out.join("\n")
}

// What the preview pane draws, and the one safe entry: escapeLines() and
// then code drawn as text. escapeLines() alone follows code as md4c does in
// the common shapes but not in all (a fence inside a list item or a table,
// a code span across lines), and those fetched through it alone (Fable
// 2026-10-04); codeAsText escapes whatever either takes for code, so the
// two together leave nothing to load.
function forPane(text) { return codeAsText(escapeLines(text)) }

// Every line outside fenced code escaped, code left as written. Not safe
// by itself: draw with forPane().
function escapeLines(text) {
  var s = String(text === undefined || text === null ? "" : text).slice(0, MAX)
  var lines = s.split("\n")
  var fence = ""
  for (var i = 0; i < lines.length; i++) {
    var m = lines[i].match(FENCE)
    if (fence) {
      if (m && m[1].charAt(0) === fence.charAt(0) && m[1].length >= fence.length) fence = ""
      continue
    }
    if (m) { fence = m[1]; continue }
    lines[i] = prose(lines[i])
  }
  return lines.join("\n")
}
