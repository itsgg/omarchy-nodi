.pragma library

// What the keys and the results do to the selection, as functions of state,
// so node tests them.

// The row to select after the results change. A new query starts at the
// top. The same query re-ranked by data that landed late (windows, toggles,
// themes, read after the bar opens) keeps the row that was selected,
// wherever it moved, so Enter runs the row that was seen (the 2026-10-02
// review, F2). When that row is gone, the place it had, within the list.
//
//   before   { query, key, index } as shown before the change, or null
function reselect(before, rows, query) {
  var n = rows ? rows.length : 0
  if (n === 0 || !before || before.query !== query) return 0
  if (before.key) for (var i = 0; i < n; i++) if (rows[i] && rows[i].key === before.key) return i
  return Math.min(Math.max(0, before.index | 0), n - 1)
}

// What a key does, given what is on screen. Nodi.qml names the key and
// describes the view; this returns the action, or null to let the text
// field have the key.
//
//   key    { name, ctrl }   name: "Escape", "Return", "Tab", "Up", "Down",
//                           "Backspace", or the letter or digit ("K", "1")
//   view   { palette: { count, index } or null, armed, helpTopic,
//            backToTopics, text, rows, selected }
//            helpTopic: one help topic is shown; backToTopics: Backspace
//            there goes back to the list (the cursor at the end of "?x")
//
//   { do: "move", by } | { do: "activate", index } | { do: "complete" }
//   { do: "copy", index }   Ctrl+Enter: what the row would copy
//   { do: "palette" } | { do: "paletteClose" } | { do: "paletteMove", to }
//   { do: "paletteRun", index } | { do: "disarm" } | { do: "helpBack" }
//   { do: "clear" } | { do: "dismiss" } | { do: "cancelAlias" } | { do: "nothing" }
//   view.aliasing: an alias is being typed (Escape gives it up)
//   key.repeat: the key is held. A held key moves the selection and does
//   nothing else: Enter held on a row that asks twice would otherwise arm
//   it and run it on the repeat (codex 2026-10-04).
function decide(key, view) {
  var act = choose(key, view)
  if (key.repeat && act && act.do !== "move" && act.do !== "paletteMove") return { do: "nothing" }
  return act
}

function choose(key, view) {
  var name = key.name
  var ctrl = !!key.ctrl
  var down = name === "Down" || (ctrl && name === "N")
  var up = name === "Up" || (ctrl && name === "P")
  var enter = name === "Return" || name === "Enter"
  var p = view.palette
  if (p) {
    if (name === "Escape" || (ctrl && name === "K")) return { do: "paletteClose" }
    if (p.count === 0) return enter || down || up ? { do: "nothing" } : null
    if (down) return { do: "paletteMove", to: (p.index + 1) % p.count }
    if (up) return { do: "paletteMove", to: (p.index - 1 + p.count) % p.count }
    if (enter) return { do: "paletteRun", index: p.index }
    return null
  }
  if (name === "Escape") {
    if (view.aliasing) return { do: "cancelAlias" }
    if (view.armed) return { do: "disarm" }
    if (view.helpTopic) return { do: "helpBack" }
    return view.text ? { do: "clear" } : { do: "dismiss" }
  }
  if (ctrl && name === "K") return { do: "palette" }
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
