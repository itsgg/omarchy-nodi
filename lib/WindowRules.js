.pragma library
.import "Hotkey.js" as Hotkey

// Window rules set from Ctrl+K on a window (ROADMAP 79): "always open
// Firefox on workspace 2", "always float Calculator". Kept in prefs.json
// (lib/Prefs.js `rules`, by window class) and handed to Hyprland with
// `hyprctl eval`, so no config file is edited, as the hotkeys are
// (lib/Hotkey.js).
//
// What is handed over is always the whole of them, the same Lua each time
// for the same rules: Hyprland keeps a table of Nodi's rules in its Lua
// state (`nodi_rules`, kept from one eval to the next, measured
// 2026-10-07), each the object hl.window_rule gave back; a rule wanted is
// turned on, or made if it is not there, and every other rule of Nodi's is
// turned off. Handed over twice, nothing changes; two changes in quick
// succession end as the last one, whichever eval lands first; a rule taken
// out of prefs.json while Nodi was not running goes at the next handover.
// Naming a rule again in hl.window_rule adds its effects to the ones it had
// (LuaBindingsConfigRules.cpp, v0.56.2), so a rule is never named twice: it
// is turned on and off by its object (set_enabled), and only when it is
// not already as wanted: each set_enabled has Hyprland weigh every rule
// against every window again (Fable 2026-10-07). A config reload drops
// every rule and makes the Lua state anew (ConfigManager.cpp clears them,
// then reinitLuaState), so the table is gone and every rule is made
// again; an object whose rule went while the table stayed answers nil to
// is_enabled, and is made again too.
//
// A rule's name is its kind and value and the class whole, so no two
// classes share one; a workspace rule's holds its workspace, so a move is
// another rule, the old one turned off.
//
// The Lua is one argument of hyprctl, and Linux takes 128 KB at most in
// one: rules past BUDGET are refused (Prefs.withRule) or left out
// (Prefs.load). Fifty classes of 200 characters in a script outside ASCII
// came to 321 KB; a likely set is about 35 KB (Fable 2026-10-07).

var MAX = 50
var BUDGET = 96 * 1024
// A numbered workspace only: a named or special one is a place of the
// moment, as a saved desktop keeps (lib/Prefs.js WORKSPACE).
var WORKSPACE = /^[1-9]\d{0,2}$/

// A class as Hyprland reports it: printable, at most 200 characters.
function validClass(cls) { return typeof cls === "string" && cls.length > 0 && cls.length <= 200 && !/[\x00-\x1f\x7f]/.test(cls) }

// The class matched whole and as written: every character a regular
// expression reads is escaped.
function classPattern(cls) { return "^(" + String(cls).replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + ")$" }

function workspaceName(cls, ws) { return "nodi:ws:" + ws + ":" + cls }
function floatName(cls) { return "nodi:float:" + cls }

// The rules wanted, by name, each with the field hl.window_rule takes.
function wanted(rules) {
  var out = []
  for (var cls in rules || {}) {
    var r = rules[cls]
    if (!validClass(cls) || !r) continue
    if (WORKSPACE.test(r.workspace || "")) out.push({ name: workspaceName(cls, r.workspace), cls: cls, field: "workspace = " + Hotkey.luaString(r.workspace) })
    if (r.float === true) out.push({ name: floatName(cls), cls: cls, field: "float = true" })
  }
  return out
}

// The Lua that makes Hyprland's rules of Nodi's exactly `rules`.
function lua(rules) {
  var want = wanted(rules)
  var lines = ["nodi_rules = nodi_rules or {}", "local want = {}"]
  for (var i = 0; i < want.length; i++) {
    var w = want[i], name = Hotkey.luaString(w.name)
    lines.push("want[" + name + "] = true")
    lines.push("do local r = nodi_rules[" + name + "]; if r ~= nil and r:is_enabled() ~= nil then if r:is_enabled() == false then r:set_enabled(true) end else nodi_rules[" + name
      + "] = hl.window_rule({ name = " + name + ", match = { class = " + Hotkey.luaString(classPattern(w.cls)) + " }, " + w.field + " }) end end")
  }
  lines.push("for name, r in pairs(nodi_rules) do if not want[name] and r:is_enabled() then r:set_enabled(false) end end")
  return lines.join("\n")
}

// Whether the Lua for `rules` fits one argument, counted in UTF-8 bytes.
function fits(rules) {
  var lua_ = lua(rules)
  var bytes = 0
  for (var i = 0; i < lua_.length; i++) {
    var c = lua_.charCodeAt(i)
    bytes += c < 0x80 ? 1 : c < 0x800 ? 2 : c >= 0xd800 && c < 0xdc00 ? (i++, 4) : 3
  }
  return bytes <= BUDGET
}

// A rule in words: "Opens on workspace 2, floats".
function describe(rule) {
  var parts = []
  if (rule && rule.workspace) parts.push("opens on workspace " + rule.workspace)
  if (rule && rule.float === true) parts.push("floats")
  var s = parts.join(", ")
  return s.charAt(0).toUpperCase() + s.slice(1)
}

// Ctrl+K's rule actions for a window row: its app's rules as they stand,
// each to set or to take back. `win` is the row's data.window: { cls,
// workspace (its number, or "" for a named or special one), app }.
function actions(win, rules) {
  if (!win || !validClass(win.cls)) return []
  var app = String(win.app || win.cls)
  var r = (rules && rules[win.cls]) || {}
  var out = []
  if (r.workspace) out.push({ label: "Stop opening " + app + " on workspace " + r.workspace, nodi: "windowRule", change: { workspace: "" } })
  if (WORKSPACE.test(String(win.workspace || "")) && r.workspace !== String(win.workspace))
    out.push({ label: "Always open " + app + " on workspace " + win.workspace, nodi: "windowRule", change: { workspace: String(win.workspace) } })
  out.push(r.float === true ? { label: "Stop floating " + app, nodi: "windowRule", change: { float: false } }
                            : { label: "Always float " + app, nodi: "windowRule", change: { float: true } })
  return out
}
