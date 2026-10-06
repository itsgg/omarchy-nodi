.pragma library
.import "../lib/Run.js" as Run
.import "chooser.js" as Chooser
.import "../lib/Match.js" as Match
.import "../lib/Sources.js" as Sources
.import "../lib/Score.js" as Score

// Files: the ones you opened recently, and any directory by its path.
//
//   f report, recent       recently used files (GTK's recently-used.xbel),
//                          newest first, from ctx.files: [{ path, name }]
//   notes.org              at root, a recent file of that whole name
//   ~/Downl, /etc/         a directory's entries, from the "directory" source
//                          below through ctx.request, read again after 2 s
//   find report            every file under home named so (fd, which skips
//                          hidden folders and what .gitignore leaves out)
//   find img cat           one kind: img, doc, video, audio, dir (fd -e, -t d);
//                          f img the recent ones of that kind
//   q4 report              at root, three such files by name, from the third
//                          letter, under any app named as well (ROADMAP 64)
//   in budget              files that hold the words, in the folders under
//                          "files": { "contents": [...] } (~/Work and
//                          ~/Documents unless set), by ripgrep: the first
//                          line that holds them, 30 files, in 2 s
//
// Enter opens; Tab on a folder goes into it.

var LIMIT = 30
var ROOT_MAX = 3

// The kinds `find` and `f` take: extensions, or a folder.
var KINDS = {
  img: ["png", "jpg", "jpeg", "webp", "gif", "svg", "bmp", "avif", "heic"],
  doc: ["pdf", "doc", "docx", "odt", "rtf", "txt", "md", "org", "epub", "xlsx", "ods", "pptx", "odp"],
  video: ["mp4", "mkv", "webm", "mov", "avi"],
  audio: ["mp3", "wav", "flac", "ogg", "m4a", "aac", "opus"],
  dir: null
}
var KIND_WORDS = { img: "img", image: "img", images: "img", doc: "doc", docs: "doc", video: "video", videos: "video", audio: "audio",
                   dir: "dir", folder: "dir", folders: "dir" }

// "img cat": { kind: "img", rest: "cat" }; no kind word: { kind: "", rest }.
// `named`: a kind word with no name after it is a name ("find doc" finds
// files named doc; Sonnet 2026-10-06), as `find` wants; `f img` alone is
// every recent image, and recent files are never folders.
function kindOf(text, named) {
  var m = String(text || "").match(/^(\S+)(?:\s+(.*))?$/)
  var k = m && Object.prototype.hasOwnProperty.call(KIND_WORDS, m[1].toLowerCase()) ? KIND_WORDS[m[1].toLowerCase()] : ""
  var rest = m ? (m[2] || "").trim() : ""
  if (!k || (named && !rest) || (!named && k === "dir")) return { kind: "", rest: String(text || "").trim() }
  return { kind: k, rest: rest }
}

function ofKind(path, isDir, kind) {
  if (!kind) return true
  if (kind === "dir") return !!isDir
  var ext = String(path).toLowerCase().split(".").pop()
  return !isDir && KINDS[kind].indexOf(ext) !== -1
}

// ripgrep's search for `in`, the words then the folders as arguments: no
// match (1) is an answer, a timeout (124) or an error (2) is not.
// A folder that is not there is left out: ripgrep fails the whole search
// for one (Sonnet 2026-10-06: no ~/Documents made every miss a failure).
var CONTENTS = 'q=$1; shift; d=(); for x in "$@"; do [ -d "$x" ] && d+=("$x"); done; [ "${#d[@]}" -gt 0 ] || exit 0'
  + "\n" + 'timeout 2 rg --ignore-case --fixed-strings --json --max-count 1 --max-columns 200 --max-columns-preview --no-messages -- "$q" "${d[@]}" | head -n 120'
  + "\n" + 's=${PIPESTATUS[0]}; [ "$s" -le 1 ] || [ "$s" -eq 141 ] && exit 0; exit "$s"'

// The find source's parameter: the kind, then the words, apart by a
// character no name holds.
function findParam(kind, q) { return kind ? kind + "\u0001" + q : q }

// fd's lines: absolute paths, a folder ending in "/". Ranked by how the
// name is matched (whole, start, inside), then the shorter path.
function parseFound(text, ok, q) {
  // fd exits 0 with nothing found; anything else is a search that failed.
  if (!ok) throw "could not search"
  var needle = Match.fold(q)
  var out = []
  var lines = String(text || "").split("\n")
  for (var i = 0; i < lines.length; i++) {
    // fd prints the path as it is: a name may end in a space (agy 2026-10-03).
    var line = lines[i]
    if (line.charAt(0) !== "/") continue
    var dir = /\/$/.test(line)
    var path = line.replace(/\/+$/, "") || "/"
    var name = path.split("/").pop()
    var low = Match.fold(name)
    var rank = low === needle ? 0 : low.indexOf(needle) === 0 ? 1 : 2
    out.push({ path: path, name: name, dir: dir, rank: rank })
  }
  out.sort(function(a, b) { return a.rank - b.rank || a.path.length - b.path.length })
  return out
}

function foundRows(typed, ctx, home) {
  var k = kindOf(typed, true)
  var q = k.rest
  if (!q) return [{ title: "Find files", subtitle: "Under home", score: 40, copy: "",
                    hint: "find [img|doc|video|audio|dir] <name>" }]
  var got = ctx.request ? ctx.request("find", findParam(k.kind, q)) : { state: "pending" }
  var list = got.value
  if (!list) return [{ title: got.state === "error" ? "Could not search" : "Searching for " + q + "...", subtitle: "Files", score: 40, copy: "" }]
  if (list.length === 0) return [{ title: "No file named \"" + q + "\"", subtitle: "Files", score: 40, copy: "" }]
  var out = []
  for (var i = 0; i < list.length && i < LIMIT; i++) out.push(fileRow(list[i].path, list[i].name, list[i].dir, 97 - i * 0.01, home))
  return out
}

function icon(path, isDir) {
  if (isDir) return "󰉋"
  var p = String(path || "").toLowerCase()
  if (/\.(png|jpe?g|webp|gif|svg|bmp|ico|avif)$/.test(p)) return "󰋩"
  if (/\.(mp4|mkv|webm|mov|avi)$/.test(p)) return "󰈫"
  if (/\.(mp3|wav|flac|ogg|m4a|aac|opus)$/.test(p)) return "󰎆"
  if (/\.pdf$/.test(p)) return "󰈦"
  if (/\.(zip|tar|gz|xz|7z|rar|bz2|zst)$/.test(p)) return "󰛫"
  if (/\.(js|mjs|ts|qml|py|rs|go|c|cpp|h|lua|sh|json|yaml|yml|toml|html|css|md|dart|rb)$/.test(p)) return "󰅩"
  return "󰈙"
}

function isImage(path) { return /\.(png|jpe?g|webp|gif|svg|bmp)$/i.test(String(path || "")) }

function tilde(path, home) {
  var s = String(path || "")
  return home && (s === home || s.indexOf(home + "/") === 0) ? "~" + s.slice(home.length) : s
}

function expand(path, home) {
  var s = String(path || "")
  return s === "~" || s.indexOf("~/") === 0 ? home + s.slice(1) : s
}

function parentOf(path) {
  var p = String(path).replace(/\/+$/, "")
  var i = p.lastIndexOf("/")
  return i <= 0 ? "/" : p.slice(0, i)
}

// What the preview pane shows of a file (item 26): its size and time,
// its type, and for a text type its first 4 KB. The path is an argument.
var FILE_HEAD = 'f=$1; [ -f "$f" ] || exit 1; stat -c "%s\t%Y" -- "$f"; m=$(file -b --mime-type -- "$f"); printf "%s\n" "$m"; '
  + 'case "$m" in text/*|application/json|application/xml|application/javascript|application/x-shellscript|application/toml|inode/x-empty) head -c 4096 -- "$f";; esac; true'

// "12147\t1791079693", the type, then the text: { size, modified, type, text }.
function parseHead(text, ok) {
  if (!ok) throw "cannot read the file"
  var lines = String(text || "").split("\n")
  var st = (lines[0] || "").split("\t")
  var type = lines[1] || ""
  return { size: Number(st[0]) || 0, modified: Number(st[1]) || 0, type: type, text: lines.slice(2).join("\n").replace(/\n$/, "") }
}

function fileRow(path, name, isDir, score, home) {
  var row = {
    key: "file:" + path,
    title: name,
    subtitle: tilde(isDir ? path : parentOf(path), home),
    icon: icon(path, isDir),
    image: !isDir && isImage(path) ? path : "",
    imageFill: true,
    // An image shows itself; another file its details and first lines,
    // read only while it is the selected row; a folder what it is.
    preview: isDir ? { title: name, subtitle: tilde(path, home), labels: [["Kind", "Folder"]] }
           : isImage(path) ? { title: name, subtitle: tilde(path, home), image: path }
           : { title: name, subtitle: tilde(path, home), read: { source: "file-head", param: path } },
    score: score,
    copy: path,
    actionLabel: "Open",
    run: Run.open(path),
    actions: [{ label: "Copy the path", icon: "󰆏", run: Run.copy(path) }]
  }
  if (!isDir) row.actions.unshift({ label: "Open the folder", icon: "󰉋", run: Run.open(parentOf(path)) })
  if (isDir) row.complete = tilde(path, home).replace(/\/?$/, "/")
  // A folder's, which over a file dialog types it in (providers/chooser.js).
  if (isDir) row.folder = path.length > 1 ? path.replace(/\/+$/, "") : path
  return row
}

function recentRows(typed, ctx, home) {
  var k = kindOf(typed)
  var needle = Match.fold(k.rest)
  var files = Array.isArray(ctx.files) ? ctx.files : []
  var max = (ctx.settings && ctx.settings.limit) || LIMIT
  var out = []
  for (var i = 0; i < files.length && out.length < max; i++) {
    var f = files[i]
    if (!f || !f.path) continue
    var name = f.name || f.path.split("/").pop()
    var low = Match.folded(name)
    if (needle && low.indexOf(needle) === -1 && Match.folded(f.path).indexOf(needle) === -1) continue
    if (!ofKind(f.path, false, k.kind)) continue
    var score = 94 - out.length * 0.01
    if (needle && low === needle) score = 98
    else if (needle && low.indexOf(needle) === 0) score = 96 - out.length * 0.01
    out.push(fileRow(f.path, name, false, score, home))
  }
  // "file manager" with no such recent file: the rest of Nodi answers it.
  if (out.length === 0) return needle ? [] : [{ title: "No recent files", subtitle: "Recently used", score: 40, copy: "" }]
  return out
}

// "~/Downl": list ~/ and keep what starts with "Downl"; "~/Downloads/": list it.
function pathRows(typed, ctx, home) {
  var full = expand(typed, home)
  var dir = /\/$/.test(full) ? full.replace(/\/+$/, "") || "/" : parentOf(full)
  var prefix = /\/$/.test(full) ? "" : full.split("/").pop().toLowerCase()
  var got = ctx.request ? ctx.request("directory", dir) : { state: "pending" }
  var listing = got.value
  // A read that failed with nothing of this folder to show says so, rather
  // than "Reading..." for ever (codex 2026-10-05).
  if (got.state === "error" && (!listing || listing.path !== dir))
    return [{ title: "Cannot read " + tilde(dir, home), subtitle: String(got.error || "the listing failed"), score: 40, copy: "" }]
  if (!listing || listing.path !== dir) return [{ title: "Reading " + tilde(dir, home) + "...", subtitle: "Files", score: 40, copy: "" }]
  if (listing.error) return [{ title: "Cannot read " + tilde(dir, home), subtitle: listing.error, score: 40, copy: "" }]

  var out = []
  var base = dir === "/" ? "" : dir
  if (!prefix) {
    var self = fileRow(dir, "Open " + tilde(dir, home), true, 98, home)
    self.folderSelf = true
    out.push(self)
  }
  var entries = listing.entries || []
  for (var i = 0; i < entries.length && out.length < LIMIT; i++) {
    var e = entries[i]
    if (!e || !e.name) continue
    if (e.name[0] === "." && prefix[0] !== ".") continue
    if (prefix && Match.fold(e.name).indexOf(Match.fold(prefix)) !== 0) continue
    out.push(fileRow(base + "/" + e.name, e.name, !!e.dir, 96 - out.length * 0.01, home))
  }
  if (out.length === 0) return [{ title: "Nothing in " + tilde(dir, home) + " starts with \"" + prefix + "\"", subtitle: "Files", score: 40, copy: "" }]
  return out
}

// Files by name in any search (ROADMAP 64, Q 12): from the third letter,
// fd under home by the query's longest word, each name holding every
// word, three at most, under any app named as well (Score.KIND file).
// Each is a guess, so the web's searches and Ask stay under them and the
// selection holds as they land (Sonnet 2026-10-06: a file took both);
// while the next are read, the last that still hold every word stand.
// Off with "files": { "root": false }.
var lastRoot = { list: [] }

function rootRows(raw, ctx, home) {
  var q = String(raw || "").trim()
  if (!home || q.length < 3 || !ctx.request || (ctx.settings && ctx.settings.root === false)) return []
  if (/^[\d\s.,+\-*\/%()^=]+$/.test(q)) return []
  var words = Match.fold(q).split(/\s+/).filter(function(w) { return w })
  var longest = words.slice().sort(function(a, b) { return b.length - a.length })[0] || ""
  if (longest.length < 3) return []
  var got = ctx.request("find", longest)
  if (Array.isArray(got.value)) lastRoot = { list: got.value }
  var list = Array.isArray(got.value) ? got.value : lastRoot.list
  var out = []
  for (var i = 0; i < list.length && out.length < ROOT_MAX; i++) {
    var name = Match.fold(list[i].name)
    if (!words.every(function(w) { return name.indexOf(w) !== -1 })) continue
    var t = Score.tier(q, Score.prepare({ name: list[i].name }))
    if (!t || Score.loose(t)) continue
    var row = fileRow(list[i].path, list[i].name, list[i].dir, undefined, home)
    row.tier = t
    row.kind = "file"
    row.guess = true
    out.push(row)
  }
  return out
}

// "in budget": files that hold the words, the first line that does.
function contentRows(q, ctx, home) {
  if (q.length < 3) return [{ title: "Search inside files", subtitle: "Three letters or more", score: 40, copy: "", hint: "in <words>" }]
  var dirs = ((ctx.settings && Array.isArray(ctx.settings.contents)) ? ctx.settings.contents : ["~/Work", "~/Documents"])
    .map(function(d) { return expand(String(d), home) }).filter(function(d) { return d.charAt(0) === "/" })
  // None to search: ripgrep would read its input until the deadline.
  if (!dirs.length) return [{ title: "No folder to search", subtitle: "Name some under \"files\": { \"contents\": [...] }", score: 40, copy: "", remember: false }]
  var got = ctx.request ? ctx.request("contents", JSON.stringify({ q: q, dirs: dirs })) : { state: "pending" }
  if (!Array.isArray(got.value)) return [{ title: got.state === "error" ? "The search failed" : "Searching for " + q + "...", subtitle: dirs.map(function(d) { return tilde(d, home) }).join(", "), score: 40, copy: "" }]
  if (!got.value.length) return [{ title: "No file holds \"" + q + "\"", subtitle: dirs.map(function(d) { return tilde(d, home) }).join(", "), score: 40, copy: "" }]
  return got.value.map(function(h, i) {
    var row = fileRow(h.path, h.path.split("/").pop(), false, 97 - i * 0.01, home)
    row.key = "file:in:" + h.path
    row.subtitle = tilde(parentOf(h.path), home) + ", line " + h.line + ": " + h.text
    row.remember = false
    return row
  })
}

// What the files provider answers, before a file dialog turns its folders.
function filesFor(query, ctx) {
  var home = String(ctx.home || "")
  var raw = String(query).trim()
  var found = String(query).match(/^\s*find\s+(.*)$/i)
  if (found && home) return foundRows(found[1].trim(), ctx, home)
  var inside = String(query).match(/^\s*in\s+(?=\S)(?![\d+\-]|\.\d)(.*)$/i)
  if (inside && home) return contentRows(inside[1].trim(), ctx, home)
  var m = String(query).match(/^\s*(?:(?:f|file)\s+(.*)|recent(?:\s+(.*))?)$/i)
  if (m) return recentRows((m[1] || m[2] || "").trim().toLowerCase(), ctx, home)
  if (/^(~\/|~$|\/)/.test(raw) && home) return pathRows(raw === "~" ? "~/" : String(query).replace(/^\s+/, ""), ctx, home)
  // A recent file's whole name at root ("notes.org", "main.cc"): the most
  // recent such file, as a thing named exactly, so a name that is also a
  // site's opens the file (Fable 2026-10-06).
  if (/^[^\/]+\.[^\s\/.]+$/.test(raw)) {
    var files = Array.isArray(ctx.files) ? ctx.files : []
    var want = Match.folded(raw)
    for (var i = 0; i < files.length; i++) {
      var f = files[i]
      var name = f && f.path ? (f.name || f.path.split("/").pop()) : ""
      if (name && Match.folded(name) === want) {
        var row = fileRow(f.path, name, false, undefined, home)
        row.tier = "exact"
        row.kind = "item"
        return [row]
      }
    }
  }
  return rootRows(raw, ctx, home)
}

var provider = {
  id: "files",
  sources: {
    "file-head": {
      argv: function(path) { return String(path).charAt(0) === "/" ? ["/usr/bin/bash", "-c", FILE_HEAD, "nodi", String(path)] : null },
      parse: parseHead,
      maxAgeMs: 30 * 1000,
      timeoutMs: 2000,
      maxBytes: 8192
    },
    // A name under home: fixed text, never a pattern; 60 at most. A name
    // holding a newline is left out, as in a folder listing: it would read
    // as two lines, the first a path to something else (Fable 2026-10-02).
    find: {
      argv: function(param, env) {
        var p = String(param)
        var cut = p.indexOf("\u0001")
        var kind = cut === -1 ? "" : p.slice(0, cut)
        var q = cut === -1 ? p : p.slice(cut + 1)
        if (!q) return null
        var only = kind === "dir" ? ["--type", "d"] : kind && KINDS[kind] ? KINDS[kind].reduce(function(a, e) { return a.concat(["-e", e]) }, []) : []
        return ["/usr/bin/fd", "--fixed-strings", "--max-results", "60", "--color", "never", "--absolute-path",
                "--exclude", "*\n*"].concat(only, ["--", q, env.home])
      },
      parse: function(text, ok, param) { var p = String(param); var cut = p.indexOf("\u0001"); return parseFound(text, ok, cut === -1 ? p : p.slice(cut + 1)) },
      maxAgeMs: 10 * 1000,
      timeoutMs: 4000,
      // A keystroke at root ends the search for the one before; one entry a
      // query, which goes first when the cache is full.
      supersede: true,
      transient: true
    },
    // Files that hold the words: ripgrep, fixed text, any case, the first
    // line that holds them, its JSON lines (a path with a newline is one
    // string there; Sonnet 2026-10-06), the first 120, in 2 s. No match is
    // an answer; a search past 2 s, or one that failed, is not.
    contents: {
      argv: function(param) {
        var p = JSON.parse(param)
        return ["/usr/bin/bash", "-c", CONTENTS, "nodi-in", p.q].concat(p.dirs)
      },
      parse: function(text, ok) {
        var out = []
        var lines = String(text || "").split("\n")
        for (var i = 0; i < lines.length && out.length < LIMIT; i++) {
          var o
          try { o = JSON.parse(lines[i]) } catch (e) { continue }
          if (!o || o.type !== "match" || !o.data || !o.data.path || typeof o.data.path.text !== "string") continue
          var path = o.data.path.text
          if (path.charAt(0) !== "/" || /[\u0000-\u001f]/.test(path)) continue
          var said = o.data.lines && typeof o.data.lines.text === "string" ? o.data.lines.text : ""
          out.push({ path: path, line: Number(o.data.line_number) || 0, text: said.replace(/\s+/g, " ").trim().slice(0, 200) })
        }
        if (!ok && out.length === 0) throw "the search failed or took over 2 s"
        return out
      },
      maxAgeMs: 10 * 1000,
      timeoutMs: 4000,
      maxBytes: 1048576,
      supersede: true,
      transient: true
    },
    // One directory's entries. A listing that printed nothing and failed is
    // a folder that cannot be read; one that printed entries keeps them.
    directory: {
      argv: function(path) { return String(path).charAt(0) === "/" ? Sources.directoryArgv(path) : null },
      parse: function(text, ok, path) {
        var entries = Sources.directory(text)
        return { path: path, entries: entries, error: !ok && entries.length === 0 ? "Not a folder you can read" : "" }
      },
      maxAgeMs: 2000,
      timeoutMs: 3000,
      maxBytes: 2097152
    }
  },
  name: "Files",
  icon: "󰈙",
  modes: [
    { pattern: /^\s*((f|file)\s|recent(\s|$))/i, label: "Files", icon: "󰈙", exclusive: true, hint: "f <name>" },
    { pattern: /^\s*find\s/i, label: "Find", icon: "󰍉", exclusive: true, hint: "find [img|doc|video|audio|dir] <name>" },
    // Not "in 2 weeks", a date's answer, with any spaces before it: words,
    // not a number, after it; ".env" is a word.
    { pattern: /^\s*in\s+(?=\S)(?![\d+\-]|\.\d)/i, label: "In files", icon: "󰈞", exclusive: true, hint: "in <words>" },
    { pattern: /^\s*(~\/|~$|\/)/, label: "Path", icon: "󰉋", exclusive: true, hint: "~/<path>" }
  ],
  commands: [
    { title: "Search recent files", keywords: "files file recent documents open", text: "Files you opened lately", complete: "f " },
    // Not "Find files": its initials, "ff", would come before Firefox's.
    { title: "Search files under home", keywords: "find files search locate fd", text: "Every file by name", complete: "find " },
    { title: "Search inside files", keywords: "in contents grep search text inside files rg", text: "Files that hold the words", complete: "in " }
  ],
  help: [
    { id: "files", title: "Files", about: "Recent files by name, any file under home, and any folder by its path",
      examples: [{ q: "f ", note: "Recent files, newest first" }, { q: "f report", note: "Recent files with report in the name" },
                 { q: "find report", note: "Every file under home with report in its name" },
                 { q: "find img cat", note: "Images only; also doc, video, audio, dir" },
                 { q: "in budget", note: "Files in ~/Work and ~/Documents that hold the word" },
                 { q: "~/", note: "Your home folder; Tab goes into a folder" }] }
  ],
  match: function(query, ctx) {
    var rows = filesFor(query, ctx)
    // Over a file dialog, a folder types itself in (ROADMAP 66).
    var d = Chooser.dialogOf(ctx.window)
    return d ? Chooser.over(d, query, rows, ctx) : rows
  }
}
