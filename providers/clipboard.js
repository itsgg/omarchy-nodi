.pragma library
.import "../lib/Run.js" as Run

// Omarchy's clipboard history, searchable. Nodi.qml reads Omarchy's history
// file (newest first) into ctx.clipboard: [{ type, text, path, mime, capturedAt }].
// Pasting, copying and clearing go through Omarchy's own commands, the ones
// its clipboard manager uses, so an entry is named by its place in that
// history and its text never travels as an argument.
//
//   cb, cb word, clip word, cb clear

var LIMIT = 30

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
    run: Run.exec(["omarchy-clipboard-paste-text", "--shift-insert", "--history-index", String(index)]),
    actions: [{ label: "Copy without pasting", icon: "󰆏", run: Run.exec(["omarchy-clipboard-paste-text", "--copy-only", "--history-index", String(index)]) }]
  }
}

function imageRow(item, index, score) {
  var path = String(item.path || "")
  var mime = /^image\/[a-z0-9.+-]+$/i.test(String(item.mime || "")) ? String(item.mime) : "image/png"
  return {
    key: "clip:image:" + path,
    remember: false,
    title: "Image" + (item.capturedAt ? ", " + item.capturedAt : ""),
    subtitle: path,
    image: path,
    imageFill: true,
    preview: { title: "Image", subtitle: path, image: path, labels: item.capturedAt ? [["Copied", String(item.capturedAt)], ["Type", mime]] : [["Type", mime]] },
    icon: "󰋩",
    score: score,
    copy: "",
    actionLabel: "Paste",
    run: Run.exec(["omarchy-clipboard-paste-file", mime, path]),
    actions: [
      { label: "Copy without pasting", icon: "󰆏", run: Run.exec(["omarchy-clipboard-paste-file", "--copy-only", mime, path]) },
      { label: "Open the image", icon: "󰋩", run: Run.open(path) }
    ]
  }
}

var provider = {
  id: "clipboard",
  name: "Clipboard",
  icon: "󰅌",
  modes: [{ pattern: /^\s*(cb|clip|clipboard)(\s|$)/i, label: "Clipboard", icon: "󰅌", exclusive: true, hint: "cb [words]" }],
  commands: [
    { title: "Clipboard history", keywords: "clipboard clip cb history paste copied", text: "Paste something you copied earlier", complete: "cb " }
  ],
  help: [
    { id: "clipboard", title: "Clipboard", about: "What you copied, newest first. Enter pastes it",
      examples: [{ q: "cb ", note: "Everything, newest first" }, { q: "cb github", note: "Entries with github in them" },
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
    if (history.length === 0) return [{ title: "The clipboard history is empty", subtitle: "Copied text and images show here", score: 50, copy: "" }]

    var max = (ctx.settings && ctx.settings.limit) || LIMIT
    var out = []
    for (var i = 0; i < history.length && out.length < max; i++) {
      var item = history[i]
      if (!item) continue
      var score = 95 - out.length * 0.01
      if (item.type === "image") {
        if (!item.path) continue
        if (needle && ("image " + item.path + " " + (item.capturedAt || "")).toLowerCase().indexOf(needle) === -1) continue
        out.push(imageRow(item, i, score))
      } else {
        if (!String(item.text || "").trim()) continue
        if (needle && String(item.text).toLowerCase().indexOf(needle) === -1) continue
        out.push(textRow(item, i, score))
      }
    }
    if (out.length === 0) return [{ title: "Nothing in the history matches \"" + needle + "\"", subtitle: "Clipboard", score: 40, copy: "" }]
    return out
  }
}
