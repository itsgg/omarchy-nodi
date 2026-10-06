.pragma library
.import "../lib/Run.js" as Run
.import "../lib/Match.js" as Match
.import "../lib/Prefs.js" as Prefs

// Omarchy's clipboard history, searchable. Nodi.qml reads Omarchy's history
// file (newest first) into ctx.clipboard: [{ type, text, path, mime, capturedAt }].
// Pasting, copying and clearing go through Omarchy's own commands, the ones
// its clipboard manager uses, so an entry in that history is named by its
// place and its text never travels as an argument; a pinned text the
// history no longer holds, and a paste in sequence, pass theirs, as a
// snippet does.
//
//   cb, cb word, clip word, cb clear
//   cb img, cb url, cb color, cb text [words]   one kind of entry
//   cb invoice      an image too, by the text in it (tesseract, once each,
//                   about 2 s an image, while a search asks)
//
// Ctrl+K pins an entry first under `cb`, kept with what it holds so it
// outlives Omarchy's history, and sends one to a device (LocalSend,
// through omarchy-menu-share). "Paste the clipboard in sequence" pastes
// the newest text, then each older one on a press within 30 s, and takes
// a hotkey (ROADMAP 54).

var LIMIT = 30

// One kind of entry, by the word after `cb`.
var KINDS = { img: "image", image: "image", images: "image", url: "url", urls: "url", link: "url", links: "url",
              color: "color", colour: "color", colors: "color", text: "text" }

function kindOf(item) {
  if (item.type === "image") return "image"
  var t = String(item.text || "").trim()
  if (/^https?:\/\/\S+$/i.test(t)) return "url"
  if (/^(#[0-9a-f]{3,4}|#[0-9a-f]{6}|#[0-9a-f]{8}|rgba?\([^)]*\)|hsla?\([^)]*\))$/i.test(t)) return "color"
  return "text"
}

// The newest text first, then each older one on a press within 30 s: the
// texts are kept at the first press (in the runtime directory, the user's
// alone), so a copy made meanwhile does not reorder what comes next. One
// press at a time (flock, held through the paste), and a state file that
// is not a number starts afresh (Fable 2026-10-06). A text over 64 KB is
// left out: a program takes at most 128 KB as one argument. A text keeps
// its last newline (x after it, as $(...) drops them).
var SEQUENCE = 'h="$HOME/.local/state/omarchy/clipboard-history.json"; st="${XDG_RUNTIME_DIR:?}/nodi-sequence"'
  + "\n" + 'mkdir -p -m 700 "$st" && exec 9> "$st/lock" && flock 9 || exit 1'
  + "\n" + 'now=$(date +%s); at=$(cat "$st/at" 2>/dev/null); n=$(cat "$st/n" 2>/dev/null)'
  + "\n" + 'case "$at" in "" | *[!0-9]*) at=0 ;; esac; case "$n" in "" | *[!0-9]*) at=0 ;; esac'
  + "\n" + 'if [ $((now - at)) -le 30 ]; then n=$((n + 1))'
  + "\n" + 'else jq -c \'[.[] | select(.type == "text" and (.text | utf8bytelength) <= 65536) | .text]\' "$h" > "$st/list" || exit 1; n=0; fi'
  + "\n" + 't=$(jq -j --argjson n "$n" \'.[$n] // empty\' "$st/list"; printf x); t=${t%x}; [ -n "$t" ] || exit 0'
  + "\n" + 'printf "%s" "$n" > "$st/n"; printf "%s" "$now" > "$st/at"'
  + "\n" + 'exec omarchy-menu-emoji-insert "$t"'

// The text in each image of the history, and in the pinned ones it names
// ("$@"), read once with tesseract into ~/.cache/nodi/ocr by the image's
// file name (Omarchy names each by its hash), and printed as "path<TAB>
// text" lines, then "left<TAB>N". A read spends about 3 s on images not
// yet read and leaves the rest to the next, which follows at once, so the
// first search over 65 images starts no 2-minute wait; one image gets 20
// s, and an image tesseract cannot read is kept as saying nothing.
// One read for all of them, not one each: the request cache keeps 64
// parameters, and 65 images evicted each other in turn, a read for ever
// (Fable 2026-10-06).
var OCR = 'c="$HOME/.cache/nodi/ocr"; h="$HOME/.local/state/omarchy/clipboard-history.json"; left=0; mkdir -p "$c" || exit 1'
  + "\n" + 'while IFS= read -r p; do'
  + "\n" + '  case "$p" in /*) ;; *) continue ;; esac; [ -f "$p" ] || continue; f="$c/${p##*/}.txt"'
  + "\n" + '  if [ ! -f "$f" ]; then'
  + "\n" + '    if [ "$SECONDS" -ge 3 ]; then left=$((left + 1)); continue; fi'
  + "\n" + '    timeout 20 nice -n 10 tesseract "$p" - 2>/dev/null > "$f.tmp"; mv -f -- "$f.tmp" "$f" || continue'
  + "\n" + '  fi'
  + "\n" + '  t=$(< "$f"); t=${t//[$\'\t\r\n\']/ }; printf "%s\\t%s\\n" "$p" "${t:0:4000}"'
  + "\n" + 'done < <(jq -r \'.[] | select(.type == "image") | .path // empty\' "$h" 2>/dev/null; [ "$#" -eq 0 ] || printf "%s\\n" "$@")'
  + "\n" + 'printf "left\\t%s\\n" "$left"'

// A row is keyed by what it holds, never by its place: a copy made while
// the bar is open moves every entry down one, and a key by place kept the
// selection on the place, so Enter pasted the newer entry (codex
// 2026-10-05). By content, the selection follows the entry, whose run then
// names its new place. The text stays in Nodi: a run names an entry by its
// index because an argument is readable by anyone through ps. A copy that
// lands between Enter and the paste is the one race left.
// Of its length and its first and last 4 KB: the whole of a 1 MB entry
// cost 142 ms a keystroke in Qt's engine (Fable 2026-10-05), and Omarchy's
// history holds an entry once, so its ends and its length tell entries apart.
function fingerprint(s) {
  var part = s.length > 8192 ? s.slice(0, 4096) + s.slice(-4096) : s
  var h = 0x811c9dc5
  for (var i = 0; i < part.length; i++) { h ^= part.charCodeAt(i); h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0 }
  return s.length + "." + h.toString(16)
}

function preview(text) {
  var s = String(text || "").trim().replace(/[\r\n\t]+/g, " ")
  return s.length > 80 ? s.slice(0, 77) + "..." : s
}

function textRow(item, index, score) {
  var text = String(item.text || "")
  var lines = text.split(/\r?\n/).length
  return {
    key: "clip:text:" + fingerprint(text),
    remember: false,
    title: preview(text.trim().split(/\r?\n/)[0] || text),
    subtitle: text.length + " characters" + (lines > 1 ? ", " + lines + " lines" : ""),
    // The whole entry in the pane beside the list (item 26).
    preview: { title: "Clipboard", subtitle: text.length + " characters" + (lines > 1 ? ", " + lines + " lines" : ""), text: text, mono: true },
    icon: "󰅌",
    score: score,
    copy: "",
    actionLabel: "Paste",
    pin: Prefs.textFits(text) ? { kind: "text", text: text } : null,
    run: Run.exec(["omarchy-clipboard-paste-text", "--shift-insert", "--history-index", String(index)]),
    actions: [{ label: "Copy without pasting", icon: "󰆏", run: Run.exec(["omarchy-clipboard-paste-text", "--copy-only", "--history-index", String(index)]) },
              // Copied first, then shared as Omarchy's menu shares the clipboard.
              { label: "Send to a device", icon: "󰄜",
                run: Run.shell('omarchy-clipboard-paste-text --copy-only --history-index "$1" && exec omarchy-menu-share clipboard', [String(index)]) }]
  }
}

// A pinned text Omarchy's history no longer holds: pasted and sent from
// what the pin keeps, as an argument, as a snippet's text is.
function pinnedTextRow(pin, score) {
  var text = String(pin.text)
  var lines = text.split(/\r?\n/).length
  return {
    key: pin.key, remember: false, title: preview(text.trim().split(/\r?\n/)[0] || text),
    subtitle: "Pinned, " + text.length + " characters" + (lines > 1 ? ", " + lines + " lines" : ""),
    preview: { title: "Pinned", subtitle: text.length + " characters", text: text, mono: true },
    icon: "󰐃", score: score, copy: text, actionLabel: "Paste", group: "Pinned", pin: { kind: "text", text: text },
    run: Run.exec(["omarchy-menu-emoji-insert", text]),
    actions: [{ label: "Copy without pasting", icon: "󰆏", run: Run.copy(text) },
              { label: "Send to a device", icon: "󰄜",
                run: Run.shell('f=$(mktemp --suffix=.txt) && printf "%s" "$1" > "$f" && exec omarchy-menu-share file "$f"', [text]) }]
  }
}

// The images' text as read (sources.ocr): { texts: { path: text }, left,
// reading }, `left` the images not read yet. `fetch` starts a read, which
// only a search with words does; the list only looks.
function ocrOf(ctx, extra, fetch) {
  var got = !ctx.request ? null : fetch ? ctx.request("ocr", extra.join("\n")) : ctx.request("ocr", extra.join("\n"), { fetch: false })
  var v = got && got.value
  if (!v || !v.texts || typeof v.texts !== "object") return { texts: {}, left: 0, reading: !!(fetch && got && got.state === "pending") }
  return { texts: v.texts, left: Number(v.left) || 0, reading: false }
}

function imageWords(item, said) {
  return Match.folded("image " + (item.path || "") + " " + (item.capturedAt || "") + " " + (said || ""))
}

var KIND_NAMES = { image: "images", url: "links", color: "colors", text: "texts" }

function imageRow(item, index, score, ocr) {
  var path = String(item.path || "")
  var said = String(ocr || "")
  var mime = /^image\/[a-z0-9.+-]+$/i.test(String(item.mime || "")) ? String(item.mime) : "image/png"
  return {
    key: "clip:image:" + path,
    remember: false,
    title: "Image" + (item.capturedAt ? ", " + item.capturedAt : ""),
    // What it says, once read; else where it is.
    subtitle: said ? preview(said) : path,
    image: path,
    imageFill: true,
    preview: { title: "Image", subtitle: path, image: path, labels: item.capturedAt ? [["Copied", String(item.capturedAt)], ["Type", mime]] : [["Type", mime]] },
    icon: "󰋩",
    score: score,
    copy: "",
    actionLabel: "Paste",
    pin: { kind: "image", path: path, mime: mime },
    run: Run.exec(["omarchy-clipboard-paste-file", mime, path]),
    actions: [
      { label: "Copy without pasting", icon: "󰆏", run: Run.exec(["omarchy-clipboard-paste-file", "--copy-only", mime, path]) },
      { label: "Open the image", icon: "󰋩", run: Run.open(path) },
      { label: "Send to a device", icon: "󰄜", run: Run.exec(["omarchy-menu-share", "file", path]) }
    ]
  }
}

var provider = {
  id: "clipboard",
  name: "Clipboard",
  icon: "󰅌",
  modes: [{ pattern: /^\s*(cb|clip|clipboard)(\s|$)/i, label: "Clipboard", icon: "󰅌", exclusive: true, hint: "cb [words]" }],
  commands: [
    { title: "Clipboard history", keywords: "clipboard clip cb history paste copied", text: "Paste something you copied earlier", complete: "cb " },
    { title: "Paste the clipboard in sequence", keywords: "paste next sequence sequential clipboard entries one by one",
      text: "The newest text, then each older one on a press within 30 s; give it a hotkey", run: Run.shell(SEQUENCE) }
  ],
  help: [
    { id: "clipboard", title: "Clipboard", about: "What you copied, newest first. Enter pastes it",
      examples: [{ q: "cb ", note: "Everything, newest first; pinned ones on top" }, { q: "cb github", note: "Entries with github in them" },
                 { q: "cb img", note: "Images only; also url, color, text" }, { q: "cb text img", note: "The word img itself" },
                 { q: "cb invoice", note: "Images with that word in them too" },
                 { q: "cb clear", note: "Empties the history, after a second Enter" }] }
  ],
  match: function(query, ctx) {
    var m = String(query).match(/^\s*(?:cb|clip|clipboard)(?:\s+(.*))?$/i)
    if (!m) return []
    var needle = (m[1] || "").trim().toLowerCase()
    var history = Array.isArray(ctx.clipboard) ? ctx.clipboard : []

    if (needle === "clear") {
      return [{
        key: "clip:clear",
        title: "Clear Clipboard History",
        subtitle: history.length + " entries, through Omarchy's clipboard manager",
        icon: "󰃢",
        score: 98,
        copy: "",
        confirm: true,
        actionLabel: "Clear",
        run: Run.exec(["omarchy-shell", "shell", "call", "omarchy.clipboard", "confirmClearHistory", ""])
      }]
    }
    // A kind first ("cb img invoice"), then the words.
    var first = needle.split(/\s+/)[0]
    var kind = Object.prototype.hasOwnProperty.call(KINDS, first) ? KINDS[first] : ""
    var words = kind ? needle.slice(first.length).trim() : needle
    var want = Match.fold(words)
    var pins = (ctx.prefs && Array.isArray(ctx.prefs.pins)) ? ctx.prefs.pins : []
    if (history.length === 0 && pins.length === 0) return [{ title: "The clipboard history is empty", subtitle: "Copied text and images show here", score: 50, copy: "" }]

    var max = (ctx.settings && ctx.settings.limit) || LIMIT
    var out = []
    var pinned = {}
    // Pinned first, as kept (ROADMAP 54); in the history too, it shows once,
    // here, and pastes by its place there. Only with a pin is the history
    // keyed: a pass costs about 20 ms a keystroke in Qt's engine.
    var byKey = {}
    var extra = []
    for (var h = 0; pins.length > 0 && h < history.length; h++) {
      var it = history[h]
      if (!it) continue
      var k = it.type === "image" ? (it.path ? "clip:image:" + it.path : "") : (String(it.text || "").trim() ? "clip:text:" + fingerprint(String(it.text)) : "")
      if (k && byKey[k] === undefined) byKey[k] = h
    }
    for (var e = 0; e < pins.length; e++) if (pins[e].kind === "image" && byKey[pins[e].key] === undefined) extra.push(pins[e].path)
    // By the text in an image too, once a search asks (tesseract, cached).
    var images = extra.length > 0 || history.some(function(x) { return x && x.type === "image" })
    var reads = !!want && images && (!kind || kind === "image")
    var ocr = ocrOf(ctx, extra, reads)
    for (var p = 0; p < pins.length && out.length < max; p++) {
      var pin = pins[p]
      if (kind && kind !== kindOf(pin.kind === "image" ? { type: "image" } : { type: "text", text: pin.text })) continue
      var at = byKey[pin.key]
      var row
      if (pin.kind === "image") {
        var held = at !== undefined ? history[at] : { path: pin.path, mime: pin.mime }
        if (want && imageWords(held, ocr.texts[pin.path]).indexOf(want) === -1) continue
        row = imageRow(held, at, 99 - p * 0.01, ocr.texts[pin.path])
      } else {
        if (want && Match.folded(pin.text).indexOf(want) === -1) continue
        row = at !== undefined ? textRow(history[at], at, 99 - p * 0.01) : pinnedTextRow(pin, 99 - p * 0.01)
      }
      row.icon = "󰐃"
      row.group = "Pinned"
      out.push(row)
      pinned[pin.key] = true
    }
    for (var i = 0; i < history.length && out.length < max; i++) {
      var item = history[i]
      if (!item) continue
      if (kind && kind !== kindOf(item)) continue
      var score = 95 - out.length * 0.01
      if (item.type === "image") {
        if (!item.path || pinned["clip:image:" + item.path]) continue
        if (want && imageWords(item, ocr.texts[item.path]).indexOf(want) === -1) continue
        out.push(imageRow(item, i, score, ocr.texts[item.path]))
      } else {
        if (!String(item.text || "").trim() || (pins.length > 0 && pinned["clip:text:" + fingerprint(String(item.text))])) continue
        if (want && Match.folded(item.text).indexOf(want) === -1) continue
        out.push(textRow(item, i, score))
      }
    }
    // Images still to read may hold the words: said, under what matched.
    if (reads && (ocr.reading || ocr.left > 0))
      out.push({ key: "clip:reading", title: "Reading the text in " + (ocr.left ? ocr.left + " more images" : "the images"),
                 subtitle: "Once each, about 2 s an image; they match by it after", icon: "󰋩", score: 30, copy: "", remember: false })
    if (out.length === 0) {
      var noun = kind ? KIND_NAMES[kind] : "entries"
      return [{ title: words ? "No " + noun + " in the history match \"" + words + "\"" : "No " + noun + " in the history",
                subtitle: kind ? "cb text " + first + " finds the word" : "Clipboard", score: 40, copy: "" }]
    }
    return out
  },
  sources: {
    // The images' text (OCR above); the parameter names pinned images the
    // history no longer holds, one a line, and is "" nearly always.
    ocr: {
      argv: function(param) {
        var paths = String(param || "").split("\n").filter(function(x) { return x.charAt(0) === "/" })
        return ["/usr/bin/bash", "-c", OCR, "nodi-ocr"].concat(paths)
      },
      parse: function(text, ok) {
        if (!ok) throw "the images could not be read"
        var texts = {}
        var left = 0
        var lines = String(text || "").split("\n")
        for (var i = 0; i < lines.length; i++) {
          var tab = lines[i].indexOf("\t")
          if (tab < 1) continue
          var name = lines[i].slice(0, tab)
          var said = lines[i].slice(tab + 1)
          if (name === "left") left = Number(said) || 0
          else if (name.charAt(0) === "/") texts[name] = said.replace(/\s+/g, " ").trim().slice(0, 4000)
        }
        return { texts: texts, left: left, at: Date.now() }
      },
      // Again at once while images are left; else a new image waits 30 s.
      fresh: function(value, now) { return !!value && value.left === 0 && now - value.at < 30000 },
      maxAgeMs: 30000,
      retryMs: 60000,
      timeoutMs: 40000,
      maxBytes: 4000000
    }
  }
}
