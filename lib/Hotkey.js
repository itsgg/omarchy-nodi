.pragma library

// Works out which Lua to hand `hyprctl eval` so that exactly one binding, the
// configured "hotkey", opens Nodi. Pure: the input is `hyprctl binds -j`, so
// it is tested without Hyprland.
//
// Nodi's bindings are recognised by their description. Nothing is written to
// any config file; Hyprland forgets runtime binds when its config reloads,
// which is why Nodi.qml calls this again after every reload.
// Ported from omarchy-commandbar (Saikomantisu, MIT).

var DESCRIPTION = "Nodi"
var NAMESPACE = "nodi"

var MOD_BITS = { SHIFT: 1, CAPS: 2, CTRL: 4, CONTROL: 4, ALT: 8, MOD1: 8, MOD2: 16, MOD3: 32, SUPER: 64, WIN: 64, LOGO: 64, MOD4: 64, MOD5: 128 }
var MOD_ORDER = [["SUPER", 64], ["CTRL", 4], ["ALT", 8], ["SHIFT", 1], ["MOD5", 128], ["MOD3", 32], ["MOD2", 16], ["CAPS", 2]]

// "SUPER + ALT + C" -> { mask: 72, key: "C" }; null when empty or unparseable,
// or when the key is a modifier: "SUPER" or "SUPER + +" alone would bind the
// Super key itself (agy 2026-10-03).
function parseCombo(text) {
  var parts = String(text || "").split("+").map(function(p) { return p.trim().toUpperCase() }).filter(function(p) { return p })
  if (parts.length === 0) return null
  var mask = 0, key = ""
  for (var i = 0; i < parts.length; i++) {
    if (MOD_BITS[parts[i]] !== undefined && i < parts.length - 1) mask |= MOD_BITS[parts[i]]
    else if (!key && i === parts.length - 1) key = parts[i]
    else return null
  }
  return key && MOD_BITS[key] === undefined ? { mask: mask, key: key } : null
}

function comboString(mask, key) {
  var names = []
  for (var i = 0; i < MOD_ORDER.length; i++) if (mask & MOD_ORDER[i][1]) names.push(MOD_ORDER[i][0])
  names.push(key)
  return names.join(" + ")
}

function bindKey(b) {
  // Keycode binds ("code:20") report the key in `keycode`.
  return b.key ? String(b.key).toUpperCase() : (b.keycode ? "CODE:" + b.keycode : "")
}

function matches(b, combo) {
  return !!combo && b.modmask === combo.mask && bindKey(b) === combo.key
}

function luaString(s) {
  return '"' + String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n") + '"'
}

// Returns { lua: [statements], conflict: "description" | "", bound: bool }.
// The layer rule's blur: behind the card only. Blur skips pixels at or
// under `ignore_alpha`, so it is set between the theme's scrim and card
// alphas; a theme whose card is no more opaque than its scrim gets none.
function frostRule(alphas) {
  var scrim = alphas && typeof alphas.scrim === "number" ? alphas.scrim : 0.5
  var card = alphas && typeof alphas.card === "number" ? alphas.card : 0.93
  if (card <= scrim + 0.05) return ""
  return ", blur = true, ignore_alpha = " + (Math.round((scrim + card) / 2 * 100) / 100)
}

function plan(bindsJson, hotkey, command, alphas) {
  var binds = []
  try { binds = JSON.parse(bindsJson) || [] } catch (e) { binds = [] }
  var want = parseCombo(hotkey)
  var lua = []
  var mine = 0

  for (var i = 0; i < binds.length; i++) {
    var b = binds[i]
    if (b.description !== DESCRIPTION) continue
    if (matches(b, want)) mine++
    else lua.push("hl.unbind(" + luaString(comboString(b.modmask, bindKey(b))) + ")")
  }

  if (!want || mine === 1) return { lua: lua, conflict: "", bound: mine === 1 }
  // Bound twice (two reconciles that raced): one press would open and close
  // the bar. Clear the key and bind it once, unless something else is bound
  // there too: unbinding takes every bind on the key, so that one is left as
  // it is until Hyprland's next reload drops Nodi's runtime binds.
  if (mine > 1) {
    var foreign = binds.some(function(o) { return o.description !== DESCRIPTION && matches(o, want) })
    if (foreign) return { lua: lua, conflict: "", bound: true }
    lua.push("hl.unbind(" + luaString(comboString(want.mask, want.key)) + ")")
  }

  for (var j = 0; j < binds.length && mine === 0; j++) {
    if (binds[j].description !== DESCRIPTION && matches(binds[j], want))
      return { lua: lua, conflict: binds[j].description || binds[j].dispatcher || "another binding", bound: false }
  }

  lua.push("hl.bind(" + luaString(comboString(want.mask, want.key)) + ", hl.dsp.exec_cmd(" + luaString(command)
    + "), { description = " + luaString(DESCRIPTION) + " })")
  // Frosted behind the card only (his ruling 2026-10-04). Hyprland blurs a
  // layer only while decoration:blur:enabled is on, which Omarchy ships off.
  lua.push("hl.layer_rule({ match = { namespace = " + luaString("^" + NAMESPACE + "$") + " }, no_anim = true, animation = \"none\"" + frostRule(alphas) + " })")
  return { lua: lua, conflict: "", bound: true }
}

// The argv that releases the key when this Nodi unloads. Disabled or
// removed, the key should go; but a reload replaces this instance with
// another holding the same key by the same name, and Hyprland's unbind
// takes every bind on the key, the successor's too (2026-10-02). So the
// release waits, asks the shell whether a Nodi is loaded (`ping` answers
// "ok"), and unbinds only when none is. Data reaches bash as arguments.
var RELEASE_SCRIPT = 'sleep "$1"; [ "$("$2" shell call "$3" ping x 2>/dev/null)" = ok ] || "$4" eval "$5" >/dev/null 2>&1'

// `combos`: one parsed combo, or a list (Nodi's own key and the rows' keys).
function releaseArgv(combos, pluginId, omarchyShell, hyprctl, delaySeconds) {
  var list = (Array.isArray(combos) ? combos : [combos]).filter(function(c) { return !!c })
  if (list.length === 0) return null
  var lua = list.map(function(c) { return "hl.unbind(" + luaString(comboString(c.mask, c.key)) + ")" }).join("\n")
  return ["/usr/bin/bash", "-c", RELEASE_SCRIPT, "nodi-release", String(delaySeconds === undefined ? 3 : delaySeconds),
          omarchyShell, pluginId, hyprctl || "/usr/bin/hyprctl", lua]
}

// ---------------------------------------------------------------- row hotkeys

// A row's hotkey (lib/Prefs.js hotkeys) runs the row through the shell:
// `omarchy-shell shell call <plugin> runRow '<key>'`, which is also the
// row's deeplink. Only the row's key is quoted into the command, never the
// row's own command. Nodi's row binds are known by their description.
var ROW_PREFIX = "Nodi: "

function shellQuote(s) { return "'" + String(s).replace(/'/g, "'\\''") + "'" }

function deeplink(pluginId, key) {
  return "omarchy-shell shell call " + pluginId + " runRow " + shellQuote(key)
}

// Returns { lua, conflicts: [combo], bound: { combo: key } }: unbinds Nodi
// row binds no longer wanted, binds the wanted ones not bound, and leaves
// alone a combo that something else holds. A bind's command cannot be read
// back (a Lua bind shows an index), so `bound`, what this Nodi bound each
// combo to last, says which row a bind runs: a combo moved to another row,
// or bound by an earlier Nodi, is bound again (Fable 2026-10-02).
function planRows(bindsJson, hotkeysIn, pluginId, bound) {
  bound = bound || {}
  // By each combo's canonical name: a key written "super+f" by hand is the
  // bind Hyprland reports as "SUPER + F", not one to unbind and bind again
  // on every reload (Fable 2026-10-04).
  var hotkeys = Object.create(null)
  for (var h in hotkeysIn || {}) {
    var p = parseCombo(h)
    if (p) hotkeys[comboString(p.mask, p.key)] = hotkeysIn[h]
  }
  var binds = []
  try { binds = JSON.parse(bindsJson) || [] } catch (e) { binds = [] }
  var lua = []
  var conflicts = []
  var have = Object.create(null)
  for (var i = 0; i < binds.length; i++) {
    var b = binds[i]
    var combo = comboString(b.modmask, bindKey(b))
    if (String(b.description || "").indexOf(ROW_PREFIX) !== 0) continue
    if (hotkeys[combo]) { have[combo] = (have[combo] || 0) + 1; continue }
    lua.push("hl.unbind(" + luaString(combo) + ")")
  }
  var now = {}
  for (var wanted in hotkeys) {
    var want = parseCombo(wanted)
    if (!want) continue
    var name = comboString(want.mask, want.key)
    var rowKey = hotkeys[wanted].key
    if (have[name] === 1 && bound[name] === rowKey) { now[name] = rowKey; continue }
    var foreign = binds.some(function(o) { return String(o.description || "").indexOf(ROW_PREFIX) !== 0 && matches(o, want) })
    if (foreign) { conflicts.push(name); continue }
    if (have[name]) lua.push("hl.unbind(" + luaString(name) + ")")
    lua.push("hl.bind(" + luaString(name) + ", hl.dsp.exec_cmd(" + luaString(deeplink(pluginId, rowKey))
      + "), { description = " + luaString(ROW_PREFIX + String(hotkeys[wanted].s.title || rowKey)) + " })")
    now[name] = rowKey
  }
  return { lua: lua, conflicts: conflicts, bound: now }
}

// While a row's hotkey is being set, Hyprland's binds are out of the way:
// a submap with nothing in it but Escape (also passed on, so Nodi gives up
// with it), so a chord something holds reaches Nodi and can be refused,
// rather than run. Escape gets out of it even if Nodi has gone.
var CAPTURE_SUBMAP = "nodi-capture"

// Defining a submap again adds its binds again (three definitions left
// three Escapes); the unbind inside keeps it at one, and touches only the
// submap's Escape, not the global one (both checked live, 2026-10-02).
function captureStartLua() {
  return "hl.define_submap(" + luaString(CAPTURE_SUBMAP) + ", \"reset\", function() hl.unbind(\"ESCAPE\"); hl.bind(\"ESCAPE\", hl.dsp.submap(\"reset\"), { non_consuming = true }) end)\n"
    + "hl.dispatch(hl.dsp.submap(" + luaString(CAPTURE_SUBMAP) + "))"
}

function captureEndLua() { return "hl.dispatch(hl.dsp.submap(\"reset\"))" }

// What already holds a chord, by its description, or "" when it is free or
// one of Nodi's own row binds (which a new hotkey replaces).
function holder(bindsJson, chordText) {
  var want = parseCombo(chordText)
  var binds = []
  try { binds = JSON.parse(bindsJson) || [] } catch (e) { binds = [] }
  for (var i = 0; want && i < binds.length; i++) {
    var d = String(binds[i].description || "")
    if (matches(binds[i], want) && d.indexOf(ROW_PREFIX) !== 0) return d || binds[i].dispatcher || "another binding"
  }
  return ""
}
