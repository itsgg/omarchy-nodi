import QtQuick
import "../lib/Sources.js" as Sources

// The text selected in the window you came from, read once an open
// (providers/selection.js, ROADMAP 47): Wayland's primary selection,
// which data-control gives a client without the focus. Fresh for two
// minutes from when it was first seen, as a kept query is: reopened over
// the same text its rows are still there, and a selection made long ago
// leads nothing (Fable 2026-10-06: fresh for one open only hid them on
// the next). Text selected with the mouse in the bar's own field becomes
// the primary selection too (Qt writes it on a mouse release), so the
// field's own text is never taken for one.
// Text copied with Ctrl+C counts too, by the same two minutes: on
// Wayland a copy sets the clipboard, not the selection (his report
// 2026-10-06). Of a fresh selection and a fresh copy, the newer leads,
// the copy on a tie. The read is Sources.SELECTION_READ.
// And the bar's own paste keys, read here under a deadline and a byte cap.
Item {
  id: reads
  visible: false

  // The bar's field and Ctrl+K's, which a paste goes into, and the bar's state.
  property var input: null
  property var paletteInput: null
  property bool opened: false
  property bool paletteOpen: false
  // How long a selection or a copy stays fresh (Nodi.qml keepQueryMs).
  property int keepMs: 120000

  // This open's selection read ended; `had` is whether a selection was
  // held as it began. Nodi.qml redraws its rows from it.
  signal landed(bool ok, bool had)
  // What Nodi says in its toast.
  signal warn(string title, string body)

  property string selection: ""
  property bool selectionFresh: false
  property string selectionSource: "selection"   // or "clipboard"
  property string lastSelection: ""
  property real selectionSeenAt: 0
  property string lastCopied: ""
  property real copiedSeenAt: 0

  // This open's read, tagged with it: a read still running from the last
  // open lands as the last open's, and this one's waits behind it (Cursor
  // 2026-10-07).
  property int openGen: 0
  property bool selectionPending: false

  // An open's read. The selection is that open's: at its start there is
  // none until it is read, so the last open's rows never lead this one
  // (Fable 2026-10-06).
  function readSelection(starting) {
    reads.openGen++
    if (starting) {
      reads.selection = ""
      reads.selectionFresh = false
    }
    reads.selectionPending = true
    selectionReader.run(Sources.selectionArgv(), { gen: reads.openGen })
  }

  // A copy the bar makes itself is no copy of his to act on: seen, and
  // stale (Fable 2026-10-06: "Copied: 96" led the next open).
  function markOwnCopy(text) {
    reads.lastCopied = Sources.clean(text)
    reads.copiedSeenAt = 0
  }

  Reader {
    id: selectionReader
    timeoutMs: 1000
    maxBytes: 140000
    onFinished: function(text, ok, tag) {
      // The last open's read: this open's own waits behind it.
      if (!tag || tag.gen !== reads.openGen) return
      reads.selectionPending = false
      // A read that failed or was cut off knows nothing: this open has no
      // text, and what was seen before stays seen (Fable 2026-10-06: it
      // made an old copy look new at the next read).
      var had = reads.selection !== ""
      if (!ok) {
        reads.selection = ""
        reads.selectionFresh = false
        reads.landed(false, had)
        return
      }
      // Which leads, the selection or the copy (lib/Sources.js selectionRead).
      var r = Sources.selectionRead(Sources.selections(text), {
        field: reads.input.text, lastSelection: reads.lastSelection, lastCopied: reads.lastCopied,
        selectionSeenAt: reads.selectionSeenAt, copiedSeenAt: reads.copiedSeenAt,
        now: Date.now(), keepMs: reads.keepMs
      })
      reads.selectionSeenAt = r.selectionSeenAt
      reads.copiedSeenAt = r.copiedSeenAt
      reads.lastSelection = r.lastSelection
      reads.lastCopied = r.lastCopied
      reads.selectionSource = r.source
      reads.selection = r.selection
      reads.selectionFresh = r.fresh
      reads.landed(true, had)
    }
  }

  // Qt 6.11's editable TextInput reads every foreign clipboard offer when
  // it changes. Card uses TextEdit instead and sends its explicit paste keys
  // here, where the shared Reader enforces both a deadline and a byte cap.
  function pasteInput(target, multiline) {
    if (!pasteReader.busy)
      pasteReader.run(Sources.pasteArgv(), {
        target: target, direct: typeof target !== "string",
        multiline: multiline === true
      })
  }

  function insertPaste(field, text, multiline) {
    var start = field.selectionStart
    var end = field.selectionEnd
    if (end > start) field.remove(start, end)
    var value = String(text || "")
    if (!multiline) value = value.replace(/[\r\n]+/g, " ")
    field.insert(start, value)
    field.cursorPosition = start + value.length
  }

  Reader {
    id: pasteReader
    timeoutMs: 2000
    maxBytes: 65536
    terminateLines: false
    onFinished: function(text, ok, tag) {
      if (!ok) {
        reads.warn(pasteReader.overflowed ? "Paste is larger than 64 KiB" : "Could not read the clipboard", "")
        return
      }
      if (!reads.opened || !tag || (tag.target === "palette" && !reads.paletteOpen)) return
      var target
      if (tag.direct === true) {
        if (!tag.target || typeof tag.target.insert !== "function") return
        target = tag.target
      } else target = tag.target === "palette" ? reads.paletteInput : reads.input
      reads.insertPaste(target, text, tag.multiline === true)
    }
  }
}
