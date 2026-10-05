.pragma library
.import "../lib/Run.js" as Run
.import "../lib/Match.js" as Match
.import "../lib/Sources.js" as Sources

// Files: the ones you opened recently, and any directory by its path.
//
//   f report, recent       recently used files (GTK's recently-used.xbel),
//                          newest first, from ctx.files: [{ path, name }]
//   notes.org              at root, a recent file of that whole name
//   ~/Downl, /etc/         a directory's entries, from the "directory" source
//                          below through ctx.request, read again after 2 s
//   find report            every file under home named so (fd, which skips
//                          hidden folders and what .gitignore leaves out)
//
// Enter opens; Tab on a folder goes into it.

var LIMIT = 30

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

function foundRows(q, ctx, home) {
  if (!q) return [{ title: "Find files", subtitle: "Under home", score: 40, copy: "", hint: "find <name>" }]
  var got = ctx.request ? ctx.request("find", q) : { state: "pending" }
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
  return row
}

function recentRows(typed, ctx, home) {
  var needle = Match.fold(typed)
  var files = Array.isArray(ctx.files) ? ctx.files : []
  var max = (ctx.settings && ctx.settings.limit) || LIMIT
  var out = []
  for (var i = 0; i < files.length && out.length < max; i++) {
    var f = files[i]
    if (!f || !f.path) continue
    var name = f.name || f.path.split("/").pop()
    var low = Match.folded(name)
    if (needle && low.indexOf(needle) === -1 && Match.folded(f.path).indexOf(needle) === -1) continue
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
  if (!prefix) out.push(fileRow(dir, "Open " + tilde(dir, home), true, 98, home))
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
      argv: function(q, env) {
        return String(q) ? ["/usr/bin/fd", "--fixed-strings", "--max-results", "60", "--color", "never", "--absolute-path",
                            "--exclude", "*\n*", "--", String(q), env.home] : null
      },
      parse: parseFound,
      maxAgeMs: 10 * 1000,
      timeoutMs: 4000
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
    { pattern: /^\s*find\s/i, label: "Find", icon: "󰍉", exclusive: true, hint: "find <name>" },
    { pattern: /^\s*(~\/|~$|\/)/, label: "Path", icon: "󰉋", exclusive: true, hint: "~/<path>" }
  ],
  commands: [
    { title: "Search recent files", keywords: "files file recent documents open", text: "Files you opened lately", complete: "f " },
    // Not "Find files": its initials, "ff", would come before Firefox's.
    { title: "Search files under home", keywords: "find files search locate fd", text: "Every file by name", complete: "find " }
  ],
  help: [
    { id: "files", title: "Files", about: "Recent files by name, any file under home, and any folder by its path",
      examples: [{ q: "f ", note: "Recent files, newest first" }, { q: "f report", note: "Recent files with report in the name" },
                 { q: "find report", note: "Every file under home with report in its name" },
                 { q: "~/", note: "Your home folder; Tab goes into a folder" }] }
  ],
  match: function(query, ctx) {
    var home = String(ctx.home || "")
    var raw = String(query).trim()
    var found = String(query).match(/^\s*find\s+(.*)$/i)
    if (found && home) return foundRows(found[1].trim(), ctx, home)
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
    return []
  }
}
