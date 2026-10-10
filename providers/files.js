.pragma library
.import "../lib/Run.js" as Run
.import "chooser.js" as Chooser
.import "../lib/Match.js" as Match
.import "../lib/Sources.js" as Sources
.import "../lib/Score.js" as Score
.import "../lib/Ansi.js" as Ansi

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

// ripgrep's search for `in`, the folders as arguments and the words in
// the environment (NODI_Q), handed to ripgrep as a pattern file from
// printf, bash's own, so the words are in no process's arguments (the
// marketplace's review, 2026-10-08: a phrase searched for is private): no
// match (1) is an answer, a timeout (124) or an error (2) is not.
// A folder that is not there is left out: ripgrep fails the whole search
// for one (Sonnet 2026-10-06: no ~/Documents made every miss a failure).
var CONTENTS = 'q=${NODI_Q-}; unset NODI_Q; d=(); for x in "$@"; do [ -d "$x" ] && d+=("$x"); done; [ "${#d[@]}" -gt 0 ] || { echo \'{"type":"nodi-no-folder"}\'; exit 0; }; [ -n "$q" ] || exit 0'
  + "\n" + 'timeout 2 rg --ignore-case --fixed-strings --json --max-count 1 --max-columns 200 --max-columns-preview --no-messages -f <(printf "%s\\n" "$q") -- "${d[@]}" | head -n 120'
  + "\n" + 's=${PIPESTATUS[0]}; [ "$s" -le 1 ] || [ "$s" -eq 141 ] && exit 0; exit "$s"'

// What a name search under home leaves out (find below): dependencies'
// copies, never the user's own.
var EXCLUDED = ["go/pkg/mod", "node_modules", "site-packages", "__pycache__"]

// A name under home: fd lists the names, ripgrep keeps those whose last
// part holds the words as fixed text, 60 at most, any case unless the
// words have a capital (fd's smart case). The words reach ripgrep as a
// pattern on a descriptor, from the environment, never an argument, which
// another local user can read in /proc: fd took them as its pattern at
// each keystroke (the marketplace's review, 2026-10-10). A name holding a
// newline is left out, as in a folder listing: it would read as two lines,
// the first a path to something else (Fable 2026-10-02). fd stops when
// ripgrep has its 60, by SIGPIPE, which is a search done; ripgrep's 1 is
// none found; fd failing is a search that failed (Fable 2026-10-10: the
// pipe said "nothing" for it).
var FIND = 're=${NODI_FIND-}; unset NODI_FIND; home=$1; shift'
  + "\n" + "/usr/bin/fd --color never --absolute-path --exclude $'*\\n*' \"$@\" -- . \"$home\" 2>/dev/null | /usr/bin/rg --no-config -m 60 -f <(printf '%s\\n' \"$re\")"
  + "\n" + 's=("${PIPESTATUS[@]}"); { [ "${s[0]}" -eq 0 ] || [ "${s[0]}" -eq 141 ]; } && [ "${s[1]}" -le 1 ]'

// The words as ripgrep's pattern for FIND: fixed text in the last part of
// a path (a folder's ends in "/"), smart case, on one line: in a pattern
// file a newline makes two patterns (Fable 2026-10-10: "a\nreport" found
// every name with an "a").
function findPattern(q) {
  var w = String(q).replace(/[\r\n]+/g, " ")
  return (w === w.toLowerCase() ? "(?i)" : "") + "[^/]*" + w.replace(/[\\.+*?()|\[\]{}^$#&\-~]/g, "\\$&") + "[^/]*/?$"
}

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

// What the preview pane shows of a file (items 26 and 82): its size and
// time, its type, then what it holds, by a line naming the kind:
//   ansi    its first 4 KB coloured by bat (Omarchy installs it), with the
//           terminal's sixteen colours, which lib/Ansi.js makes the
//           theme's; about 40 ms a file (28 to 55, measured 2026-10-07)
//   text    the same uncoloured, where bat is missing
//   image   a picture made of it, its path after a tab: a PDF's first page
//           (pdftoppm, from poppler, which Evince needs) or a frame of a
//           video (ffmpegthumbnailer, in Omarchy's base), as JPEG (a page
//           took 130 ms against 620 as PNG); kept in ~/.cache/nodi/thumbs
//           by path, size and time, so it is made once (19 ms after)
//   list    a folder's entries, folders first, a line each (`ls -q`
//           writes a newline or another control character in a name as
//           ?; -b wrote a space as "\ ", Fable 2026-10-07), 200 at most
//   none    nothing to show but the labels
// The path is an argument; a link is read as what it points to. A picture
// is written beside its name and moved in whole, so a read never finds
// half of one; its maker has 4 s (5 if it will not stop), inside the
// read's 6, so a slow one
// costs the picture, never the labels; one a month unused goes (a use
// touches it).
// The path in the environment and the file on descriptor 3, so no
// program it starts has the path in its arguments, which another local
// user can read in /proc (the marketplace's review, 2026-10-10); bat is
// told only its extension, for the colours, or a name every project has
// (Makefile, .bashrc), never one of his own (Fable 2026-10-10: a name
// with no dot went whole).
var FILE_HEAD = 'f=${NODI_TEXT-}; unset NODI_TEXT'
  + "\n" + 'if [ -d "$f" ]; then'
  + "\n" + '  [ -r "$f" ] && [ -x "$f" ] && exec 3< "$f" || exit 1'
  + "\n" + '  stat -L -c "%s\t%Y" /dev/fd/3 || exit 1'
  + "\n" + '  printf "inode/directory\nlist\n"'
  + "\n" + '  cd -- "$f" && ls -A -p -q --group-directories-first 2>/dev/null | head -n 200'
  + "\n" + '  exit 0'
  + "\n" + 'fi'
  + "\n" + '[ -f "$f" ] && exec 3< "$f" || exit 1'
  + "\n" + 'st=$(stat -L -c "%s\t%Y" /dev/fd/3) || exit 1'
  + "\n" + 'printf "%s\n" "$st"'
  + "\n" + 'm=$(file -L -b --mime-type /dev/fd/3)'
  + "\n" + 'printf "%s\n" "$m"'
  + "\n" + 'case "$m" in'
  + "\n" + '  text/*|application/json|application/xml|application/javascript|application/x-shellscript|application/toml|application/x-yaml|application/sql|inode/x-empty)'
  + "\n" + '    if command -v bat >/dev/null; then'
  + "\n" + '      printf "ansi\n"'
  + "\n" + '      e=${f##*/}; case $e in Makefile|makefile|GNUmakefile|Dockerfile|Containerfile|PKGBUILD|Gemfile|Rakefile|Vagrantfile|Justfile|justfile|.bashrc|.bash_profile|.zshrc|.zprofile|.profile|.gitignore|.gitconfig|.gitattributes|.editorconfig) ;; ?*.?*) e=x.${e##*.} ;; *) e=x ;; esac'
  + "\n" + '      head -c 4096 <&3 | bat --color=always --theme=ansi --style=plain --paging=never --file-name "$e" 2>/dev/null'
  + "\n" + '    else'
  + "\n" + '      printf "text\n"'
  + "\n" + '      head -c 4096 <&3'
  + "\n" + '    fi;;'
  + "\n" + '  application/pdf|video/*)'
  + "\n" + '    d="$HOME/.cache/nodi/thumbs"'
  + "\n" + '    mkdir -p -- "$d" || { printf "none\n"; exit 0; }'
  + "\n" + '    k=$(printf "%s\t%s" "$f" "$st" | sha1sum | cut -c1-40)'
  + "\n" + '    out="$d/$k.jpg"'
  + "\n" + '    if [ -s "$out" ]; then touch -c -- "$out"; else'
  + "\n" + '      w=$(mktemp -d -- "$d/.work.XXXXXX") || { printf "none\n"; exit 0; }; tmp="$w/t"'
  + "\n" + '      case "$m" in'
  + "\n" + '        application/pdf) command -v pdftoppm >/dev/null && timeout -k 1 4 pdftoppm -jpeg -jpegopt quality=85 -f 1 -l 1 -singlefile -scale-to 1000 /dev/fd/3 "$tmp" >/dev/null 2>&1 && mv -fT -- "$tmp.jpg" "$out";;'
  + "\n" + '        *) command -v ffmpegthumbnailer >/dev/null && timeout -k 1 4 ffmpegthumbnailer -i /dev/fd/3 -o "$tmp.jpg" -s 1000 -c jpeg -q 8 >/dev/null 2>&1 && mv -fT -- "$tmp.jpg" "$out";;'
  + "\n" + '      esac'
  + "\n" + '      rm -rf -- "$w"'
  + "\n" + '      find "$d" -maxdepth 1 -name "*.jpg" -mtime +30 -delete 2>/dev/null'
  + "\n" + '    fi'
  + "\n" + '    if [ -s "$out" ]; then printf "image\t%s\n" "$out"; else printf "none\n"; fi;;'
  + "\n" + '  *) printf "none\n";;'
  + "\n" + 'esac'
  + "\n" + 'true'

// "12147\t1791079693", the type, the kind, then what it holds:
// { size, modified, type, kind, text, ansi, image, entries }.
function parseHead(text, ok) {
  if (!ok) throw "cannot read the file"
  var lines = String(text || "").split("\n")
  var st = (lines[0] || "").split("\t")
  var type = lines[1] || ""
  var said = (lines[2] || "").split("\t")
  var kind = said[0]
  var rest = lines.slice(3).join("\n").replace(/\n$/, "")
  var out = { size: Number(st[0]) || 0, modified: Number(st[1]) || 0, type: type, kind: kind }
  if (kind === "ansi") { out.ansi = rest; out.text = Ansi.plain(rest) }
  else if (kind === "text") out.text = rest
  else if (kind === "image" && /^\/[^\n]+\.jpg$/.test(said[1] || "")) out.image = said[1]
  else if (kind === "list") out.entries = rest === "" ? [] : rest.split("\n")
  return out
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
    // A folder its entries (ROADMAP 82).
    preview: isImage(path) && !isDir ? { title: name, subtitle: tilde(path, home), image: path }
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

// `named`: "f" or "recent", which name no app; "file manager" with no such
// recent file is the File manager the rest of Nodi answers.
// `asTyped`: the same in the case typed, for what the row says and fills in
// (fd's smart case: "Report" finds only Report; Cursor's review, 2026-10-10).
function recentRows(typed, ctx, home, named, asTyped) {
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
  // "f report" says so and offers the search under home: an app the word
  // named stood alone in its place (2026-10-10, driven live).
  var said = asTyped === undefined ? typed : asTyped
  if (out.length === 0 && needle && named) return [{ key: "files:none", title: "No recent file named \"" + kindOf(said).rest + "\"", subtitle: "Enter finds the files under home named so",
                                                    score: 40, copy: "", complete: "find " + said, remember: false }]
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
  var dirs = ((ctx.settings && Array.isArray(ctx.settings.contents)) ? ctx.settings.contents : ["~/Documents"])
    .map(function(d) { return expand(String(d), home) }).filter(function(d) { return d.charAt(0) === "/" })
  // None to search: ripgrep would read its input until the deadline.
  if (!dirs.length) return [{ title: "No folder to search", subtitle: "Name some under \"files\": { \"contents\": [...] }", score: 40, copy: "", remember: false }]
  var got = ctx.request ? ctx.request("contents", JSON.stringify({ q: q, dirs: dirs })) : { state: "pending" }
  if (!Array.isArray(got.value)) return [{ title: got.state === "error" ? "The search failed" : "Searching for " + q + "...", subtitle: dirs.map(function(d) { return tilde(d, home) }).join(", "), score: 40, copy: "" }]
  if (got.value.length === 1 && got.value[0].noFolder)
    return [{ title: "No folder to search", subtitle: dirs.map(function(d) { return tilde(d, home) }).join(", ") + (dirs.length > 1 ? " are" : " is") + " not there: name others under \"files\": { \"contents\": [...] }",
              score: 40, copy: "", remember: false }]
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
  if (m) return recentRows((m[1] || m[2] || "").trim().toLowerCase(), ctx, home, !/^\s*file\s/i.test(query), (m[1] || m[2] || "").trim())
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
      argv: function(path) { return String(path).charAt(0) === "/" ? ["/usr/bin/bash", "-c", FILE_HEAD, "nodi"] : null },
      environment: function(path) { return { NODI_TEXT: String(path) } },
      parse: parseHead,
      maxAgeMs: 30 * 1000,
      // A picture made the first time, once: a video's frame took 0.7 s.
      timeoutMs: 6000,
      // 4 KB coloured is about 6 KB (Rows.js, 18 KB of JavaScript);
      // a read cut at its cap is no read at all.
      maxBytes: 65536
    },
    // A name under home (FIND).
    find: {
      argv: function(param, env) {
        var p = String(param)
        var cut = p.indexOf("\u0001")
        var kind = cut === -1 ? "" : p.slice(0, cut)
        var q = cut === -1 ? p : p.slice(cut + 1)
        if (!q) return null
        var only = kind === "dir" ? ["--type", "d"] : kind && KINDS[kind] ? KINDS[kind].reduce(function(a, e) { return a.concat(["-e", e]) }, []) : []
        // Never a dependency's copy: Go's module cache and packages
        // installed per project hold thousands of names (`dns`, `uuid`,
        // `terminal`) a search under home meant none of (2026-10-10, driven
        // live). Hidden folders and what a .gitignore names fd leaves out.
        return ["/usr/bin/bash", "-c", FIND, "nodi-find", env.home].concat(EXCLUDED.reduce(function(a, x) { return a.concat(["--exclude", x]) }, []), only)
      },
      environment: function(param) { var p = String(param); var cut = p.indexOf("\u0001"); return { NODI_FIND: findPattern(cut === -1 ? p : p.slice(cut + 1)) } },
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
        return ["/usr/bin/bash", "-c", CONTENTS, "nodi-in"].concat(p.dirs)
      },
      // One line: in a pattern file a newline would make two patterns, and
      // one search would find either (codex's review, 2026-10-09).
      environment: function(param) { return { NODI_Q: String(JSON.parse(param).q).replace(/[\r\n]+/g, " ").trim() } },
      parse: function(text, ok) {
        var out = []
        var lines = String(text || "").split("\n")
        for (var i = 0; i < lines.length && out.length < LIMIT; i++) {
          var o
          try { o = JSON.parse(lines[i]) } catch (e) { continue }
          // None of the folders is there (CONTENTS): said, not read as no match.
          if (o && o.type === "nodi-no-folder") return [{ noFolder: true }]
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
                 { q: "in budget", note: "Files in ~/Documents, or the folders you set, that hold the word" },
                 { q: "~/", note: "Your home folder; Tab goes into a folder" }] }
  ],
  match: function(query, ctx) {
    var rows = filesFor(query, ctx)
    // Over a file dialog, a folder types itself in (ROADMAP 66).
    var d = Chooser.dialogOf(ctx.window)
    return d ? Chooser.over(d, query, rows, ctx) : rows
  }
}
