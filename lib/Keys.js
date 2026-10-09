.pragma library
.import "Graphemes.js" as Graphemes

// What the keys and the results do to the selection, as functions of state,
// so node tests them.

// The row to select after the results change. A new query starts at the
// top. The same query re-ranked by data that landed late (windows, toggles,
// themes, read after the bar opens) keeps the row that was selected,
// wherever it moved, so Enter runs the row that was seen (the 2026-10-02
// review, F2). When that row is gone, the place it had, within the list.
// A row that does nothing is not held: "Asking the AUR...", selected as
// the only row while the reads were out, kept the selection as packages
// landed above it, and the list scrolled them away (2026-10-09, `pkg zed`
// driven live); the top is the best then.
//
//   before   { query, key, index, acts } as shown before the change, or
//            null; acts false: the row selected ran, copied, filled in
//            and did nothing of Nodi's
function reselect(before, rows, query) {
  var n = rows ? rows.length : 0
  if (n === 0 || !before || before.query !== query || before.acts === false) return 0
  if (before.key) for (var i = 0; i < n; i++) if (rows[i] && rows[i].key === before.key) return i
  return Math.min(Math.max(0, before.index | 0), n - 1)
}

// What a key does, given what is on screen. Nodi.qml names the key and
// describes the view; this returns the action, or null to let the text
// field have the key.
//
//   key    { name, ctrl, shift }   name: "Escape", "Return", "Tab", "Up", "Down",
//                           "PageUp", "PageDown", "Backspace", or the letter
//                           or digit ("K", "1")
//   view   { palette: { count, index } or null, armed, helpTopic,
//            backToTopics, text, rows, selected, page, pane }
//            page: the rows a page shows; pane: the pane beside the list is up
//            helpTopic: one help topic is shown; backToTopics: Backspace
//            there goes back to the list (the cursor at the end of "?x")
//
//   { do: "move", by } | { do: "activate", index } | { do: "complete" }
//   { do: "copy", index }   Ctrl+Enter: what the row would copy
//   { do: "palette" } | { do: "paletteClose" } | { do: "paletteMove", to }
//   { do: "paletteRun", index } | { do: "disarm" } | { do: "helpBack" }
//   { do: "dismiss" } | { do: "cancelPrompt" } | { do: "nothing" }
//   { do: "stopAnswer" }
//   { do: "select", index }  PageUp, PageDown: a page of the list, no wrap
//   { do: "paneScroll", lines } | { do: "panePage", by }  Shift with Up,
//            Down, PageUp, PageDown: the pane beside the list, as fzf's
//            Shift+Up and Shift+Down scroll its preview (fzf(1)); and, while
//            a pane is up, vim's Ctrl+D and Ctrl+U, half a page, as
//            Telescope's preview takes them. Without a pane those two keep
//            the field's own (Ctrl+U clears the line, Ctrl+D deletes forward).
//   view.prompting: the field is a prompt, an alias being typed or a
//            confirm word (Escape gives it up)
//   view.typed: false while nothing was typed since the bar opened, so
//            Escape closes over a help topic the bar reopened on
//   view.pick: a `nodi pick` is open, where Enter only chooses
//   view.answering: a streamed answer is on its way (Escape stops it)
//   view.stepping: a script filter is a step on (Escape steps back)
//   view.chords: the chord keys the actions at hand answer to (lib/Rows.js
//            chordKey): letters for Ctrl+Shift, "copy" for Ctrl+Enter in
//            Ctrl+K; { do: "chord", key } runs the one that has it
//   key.repeat: the key is held. A held key moves the selection and does
//   nothing else: Enter held on a row that asks twice would otherwise arm
//   it and run it on the repeat (codex 2026-10-04).
function decide(key, view) {
  var act = choose(key, view)
  if (key.repeat && act && act.do !== "move" && act.do !== "paletteMove" && act.do !== "select"
      && act.do !== "paneScroll" && act.do !== "panePage" && act.do !== "edit") return { do: "nothing" }
  return act
}

// Shift with the arrows or the page keys scrolls the pane while one is
// up; any other Shift key, and these without a pane, do what they did
// (Shift+Enter runs the row, Shift+Down moves the list; Fable 2026-10-04).
function paneKey(name, key, ctrl, view) {
  if (!view.pane) return null
  if (ctrl && (name === "D" || name === "U")) return { do: "panePage", by: name === "D" ? 0.5 : -0.5 }
  if (key.shift && !ctrl) {
    if (name === "Up" || name === "Down") return { do: "paneScroll", lines: name === "Up" ? -3 : 3 }
    if (name === "PageUp" || name === "PageDown") return { do: "panePage", by: name === "PageUp" ? -1 : 1 }
  }
  return null
}

var EDITS = { W: "word", E: "end", F: "right", B: "left" }

function has(list, name) { return !!list && list.indexOf(name) !== -1 }

// The field after a readline edit: { text, at }, `at` the cursor. A word is
// what a shell's Ctrl+W takes, back over spaces and then to the space
// before; with text selected (the kept query is, at an open) it takes
// that. A letter on or back from a selection lands at its end or start.
// A letter is what a reader sees as one (Graphemes.js): an emoji, or a
// Tamil letter of three code points, is passed whole, never stopped
// inside, where the next key typed split it (2026-10-09: half a pair
// then made the query no string encodeURIComponent takes).
function edited(how, text, at, selStart, selEnd) {
  var t = String(text || "")
  var sel = selEnd > selStart
  if (how === "word") {
    if (sel) return { text: t.slice(0, selStart) + t.slice(selEnd), at: selStart }
    var from = at
    while (from > 0 && /\s/.test(t[from - 1])) from--
    while (from > 0 && !/\s/.test(t[from - 1])) from--
    return { text: t.slice(0, from) + t.slice(at), at: from }
  }
  if (how === "end") return { text: t, at: t.length }
  // A selection collapses to its end or start, at a letter's edge too.
  var to = sel ? (how === "right" ? snap(t, selEnd, true) : snap(t, selStart, false)) : step(t, at, how === "right")
  return { text: t, at: Math.max(0, Math.min(t.length, to)) }
}

// Where letters start near `at`, as offsets in `t`: the text around it is
// split, not the whole query, so a held key over a long paste stays quick
// (codex's review, 2026-10-09: 0.6 s a move at 100,000 characters). A
// letter is never near this long; the window's first is skipped, as it
// may begin inside one, unless the window starts the text. All of it is
// split when the window holds no edge on the side asked.
var NEAR = 256
function edges(t, at, whole) {
  var from = whole ? 0 : Math.max(0, at - NEAR), to = whole ? t.length : Math.min(t.length, at + NEAR)
  var parts = Graphemes.split(t.slice(from, to)), out = [], n = from
  if (from === 0) out.push(0)
  for (var i = 0; i < parts.length; i++) {
    n += parts[i].length
    if (i === 0 && from > 0) continue
    out.push(n)
  }
  return out
}

// The next place after `at`, or the one before it, where a letter starts.
function step(t, at, on) {
  for (var pass = 0; pass < 2; pass++) {
    var b = edges(t, at, pass === 1)
    if (on) { for (var j = 0; j < b.length; j++) if (b[j] > at) return b[j] }
    else { for (var k = b.length - 1; k >= 0; k--) if (b[k] < at) return b[k] }
  }
  return on ? t.length : 0
}

// `at` itself when a letter starts there, else the edge after it (`on`)
// or before it.
function snap(t, at, on) {
  if (at <= 0 || at >= t.length) return at
  var b = edges(t, at, false)
  if (b.indexOf(at) !== -1) return at
  return step(t, at, on)
}

function choose(key, view) {
  var name = key.name
  var ctrl = !!key.ctrl
  var down = name === "Down" || (ctrl && name === "N")
  var up = name === "Up" || (ctrl && name === "P")
  var enter = name === "Return" || name === "Enter"
  // Readline's keys in the field, as a shell has them and his popups add
  // them (X 10, ROADMAP 51): Ctrl+W a word back, Ctrl+E to the end, Ctrl+F
  // and Ctrl+B a letter on and back. Qt's field does nothing on Ctrl+W, F
  // and B (Ctrl+E it already maps, the same way); Ctrl+A stays select-all,
  // Ctrl+U clears the line as it does.
  if (ctrl && !key.shift && EDITS[name]) return { do: "edit", how: EDITS[name] }
  // An action's own chord (lib/Rows.js CHORDS), from the list or from
  // Ctrl+K, where it acts on the row Ctrl+K opened for: Ctrl, Shift and a
  // letter. Before the moves and the pane's keys, which take Ctrl+P, N and
  // D with Shift too (ROADMAP 52).
  if (ctrl && key.shift && has(view.chords, name)) return { do: "chord", key: name }
  var p = view.palette
  if (p) {
    if (name === "Escape" || (ctrl && name === "K")) return { do: "paletteClose" }
    // The pane beside the actions scrolls as it does beside the rows: a
    // long command would otherwise be cut off until Escape (Fable 2026-10-05).
    var scroll = paneKey(name, key, ctrl, view)
    if (scroll) return scroll
    // What Ctrl+Enter copies from the list, its chord here too; letters
    // are typed into Ctrl+K's field, which filters the actions.
    if (enter && ctrl) return has(view.chords, "copy") ? { do: "chord", key: "copy" } : { do: "nothing" }
    if (name === "Tab") return { do: "nothing" }
    if (p.count === 0) return enter || down || up ? { do: "nothing" } : null
    if (down) return { do: "paletteMove", to: (p.index + 1) % p.count }
    if (up) return { do: "paletteMove", to: (p.index - 1 + p.count) % p.count }
    if (enter) return { do: "paletteRun", index: p.index }
    return null
  }
  if (name === "Escape") {
    if (view.answering) return { do: "stopAnswer" }
    // What the agent asks for: Escape refuses it (ROADMAP 44, 84).
    if (view.proposing) return { do: "refuse" }
    if (view.prompting) return { do: "cancelPrompt" }
    if (view.armed) return { do: "disarm" }
    // A script filter's step: back one (providers/filters.js).
    if (view.stepping) return { do: "stepBack" }
    // A help topic opened in this open goes back to the topics; one the
    // bar reopened on is closed over.
    if (view.helpTopic && view.typed !== false) return { do: "helpBack" }
    // Otherwise Escape closes the bar, text or not: the query stays for two
    // minutes, and the bar reopens on it selected, so typing replaces it. Clearing it
    // first made closing take two presses, which he felt as Escape being
    // slow (2026-10-05, twice; the close itself measured 12 to 42 ms).
    return { do: "dismiss" }
  }
  // A pick (`nodi pick`) only chooses: no actions, nothing to fill in or
  // to copy.
  if (view.pick && (name === "Tab" || (ctrl && (name === "K" || name === "Return" || name === "Enter")))) return { do: "nothing" }
  if (ctrl && name === "K") return { do: "palette" }
  // An earlier query, again, and one older on each press, as a shell's
  // history; Up is the list's (X 9, ROADMAP 50).
  if (ctrl && name === "R" && !view.pick && !view.prompting) return { do: "recall" }
  var scrolls = paneKey(name, key, ctrl, view)
  if (scrolls) return scrolls
  if (name === "PageUp" || name === "PageDown") {
    if (!view.rows) return { do: "nothing" }
    var step = Math.max(1, (view.page || 1) - 1)
    var to = name === "PageUp" ? Math.max(0, view.selected - step) : Math.min(view.rows - 1, view.selected + step)
    return { do: "select", index: to }
  }
  if (down) return { do: "move", by: 1 }
  if (up) return { do: "move", by: -1 }
  if (ctrl && /^[1-9]$/.test(name)) {
    var n = Number(name) - 1
    return n < view.rows ? { do: "activate", index: n } : { do: "nothing" }
  }
  if (name === "Backspace" && view.backToTopics) return { do: "helpBack" }
  if (name === "Tab") return { do: "complete" }
  if (enter && ctrl) return { do: "copy", index: view.selected }
  if (enter) return { do: "activate", index: view.selected }
  return null
}

// A key press as Hyprland names a chord, "SUPER + SHIFT + F", for a row's
// hotkey; "" until it is one: a modifier on its own, or no Super, Alt or
// Ctrl (a letter alone, or with Shift, is typing). Key and modifier codes
// are Qt's (Qt.Key_*, Qt.*Modifier); Super arrives as Meta.
var MOD = { shift: 0x02000000, ctrl: 0x04000000, alt: 0x08000000, meta: 0x10000000 }
var NAMED = {
  0x20: "SPACE", 0x2c: "COMMA", 0x2e: "PERIOD", 0x2f: "SLASH", 0x2d: "MINUS", 0x3d: "EQUAL", 0x3b: "SEMICOLON",
  0x27: "APOSTROPHE", 0x5b: "BRACKETLEFT", 0x5d: "BRACKETRIGHT", 0x5c: "BACKSLASH", 0x60: "GRAVE",
  0x01000001: "TAB", 0x01000003: "BACKSPACE", 0x01000004: "RETURN", 0x01000005: "RETURN", 0x01000007: "DELETE",
  0x01000010: "HOME", 0x01000011: "END", 0x01000012: "LEFT", 0x01000013: "UP", 0x01000014: "RIGHT", 0x01000015: "DOWN",
  0x01000016: "PRIOR", 0x01000017: "NEXT", 0x01000009: "PRINT"
}
// Shift with a digit arrives as its symbol on a US layout: bound as the digit.
var SHIFTED = { 0x21: "1", 0x40: "2", 0x23: "3", 0x24: "4", 0x25: "5", 0x5e: "6", 0x26: "7", 0x2a: "8", 0x28: "9", 0x29: "0" }

function chord(key, modifiers) {
  var m = modifiers | 0
  if (!(m & (MOD.meta | MOD.alt | MOD.ctrl))) return ""
  var name = ""
  if (key >= 0x41 && key <= 0x5a) name = String.fromCharCode(key)
  else if (key >= 0x30 && key <= 0x39) name = String.fromCharCode(key)
  else if (key >= 0x01000030 && key <= 0x01000047) name = "F" + (key - 0x01000030 + 1)
  else if (NAMED[key]) name = NAMED[key]
  else if ((m & MOD.shift) && SHIFTED[key]) name = SHIFTED[key]
  if (!name) return ""
  var mods = []
  if (m & MOD.meta) mods.push("SUPER")
  if (m & MOD.ctrl) mods.push("CTRL")
  if (m & MOD.alt) mods.push("ALT")
  if (m & MOD.shift) mods.push("SHIFT")
  return mods.join(" + ") + " + " + name
}

// Shift, Ctrl, Super, Alt and the like on their own: the start of a chord.
function isModifier(key) {
  return key >= 0x01000020 && key <= 0x01000023 || key === 0x01000053 || key === 0x01000054 || key === 0x01001103 || key === 0x01000024
}
