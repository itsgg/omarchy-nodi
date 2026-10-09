.pragma library

// Works out which Lua to hand `hyprctl eval` so that exactly one binding, the
// configured "hotkey", opens Nodi. Pure: the input is `hyprctl binds -j`, so
// it is tested without Hyprland.
//
// Nodi's bindings are recognised by their description. Nothing is written to
// any config file; Hyprland forgets runtime binds when its config reloads,
// which is why Nodi.qml calls this again after every reload.

var DESCRIPTION = "Nodi"
var NAMESPACE = "nodi"

var MOD_BITS = { SHIFT: 1, CAPS: 2, CTRL: 4, CONTROL: 4, ALT: 8, MOD1: 8, MOD2: 16, MOD3: 32, SUPER: 64, WIN: 64, LOGO: 64, MOD4: 64, MOD5: 128 }
var MOD_ORDER = [["SUPER", 64], ["CTRL", 4], ["ALT", 8], ["SHIFT", 1], ["MOD5", 128], ["MOD3", 32], ["MOD2", 16], ["CAPS", 2]]

// A key as Hyprland reads it: a name in capitals, but "code:20" and
// "mouse:272" with the prefix in lower case, which Hyprland matches as
// written (codex 2026-10-04).
function canonKey(key) {
  var k = String(key).trim()
  var m = k.match(/^(code|mouse|mouse_up|mouse_down|mouse_left|mouse_right):(.*)$/i)
  return m ? m[1].toLowerCase() + ":" + m[2] : k.toUpperCase()
}

// "SUPER + ALT + C" -> { mask: 72, key: "C" }; null when empty or unparseable,
// or when the key is a modifier: "SUPER" or "SUPER + +" alone would bind the
// Super key itself (agy 2026-10-03).
function parseCombo(text) {
  var parts = String(text || "").split("+").map(function(p) { return p.trim() }).filter(function(p) { return p })
  if (parts.length === 0) return null
  var mask = 0, key = ""
  for (var i = 0; i < parts.length; i++) {
    var up = parts[i].toUpperCase()
    if (MOD_BITS[up] !== undefined && i < parts.length - 1) mask |= MOD_BITS[up]
    else if (!key && i === parts.length - 1) key = canonKey(parts[i])
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
  return b.key ? canonKey(b.key) : (b.keycode ? "code:" + b.keycode : "")
}

// A bind that answers in the default submap: its own, or one that answers
// in every submap. A bind of another submap holds nothing here (codex
// 2026-10-04).
function inScope(b) {
  return !b.submap || String(b.submap_universal) === "true"
}

function matches(b, combo) {
  return !!combo && inScope(b) && b.modmask === combo.mask && bindKey(b) === combo.key
}

// A Lua string: every control character as a decimal escape, a carriage
// return in a row's title among them (codex 2026-10-04: it ended the
// string and with it the whole eval).
function luaString(s) {
  return '"' + String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/[\x00-\x1f\x7f]/g, function(c) {
    return "\\" + ("00" + c.charCodeAt(0)).slice(-3)
  }) + '"'
}

// Whether a bind other than Nodi's holds the chord of `b` too: then unbinding
// it, which takes every bind on the chord, would take that one as well.
function sharedWith(binds, b, ours) {
  var combo = { mask: b.modmask, key: bindKey(b) }
  return binds.some(function(o) { return !ours(o) && matches(o, combo) })
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

// The key reaches Nodi as a Hyprland global shortcut, `trigger` being its
// "appid:name": the compositor tells the shell over Wayland, where an
// exec_cmd started omarchy-shell and with it qs, about 80 ms a press before
// Nodi heard it (measured 2026-10-04). `fresh`: the first plan of a Nodi
// that has just loaded binds its key again even when a Nodi bind holds it,
// since a bind's dispatch cannot be read back and an older Nodi bound it
// differently.
function plan(bindsJson, hotkey, trigger, alphas, fresh) {
  var binds = []
  try { binds = JSON.parse(bindsJson) || [] } catch (e) { binds = [] }
  var want = parseCombo(hotkey)
  var lua = []
  var mine = 0

  var isOurs = function(o) { return o.description === DESCRIPTION }
  for (var i = 0; i < binds.length; i++) {
    var b = binds[i]
    if (b.description !== DESCRIPTION) continue
    if (matches(b, want)) mine++
    // A chord Nodi has left, unbound unless something else holds it too.
    else if (!sharedWith(binds, b, isOurs)) lua.push("hl.unbind(" + luaString(comboString(b.modmask, bindKey(b))) + ")")
  }

  if (!want || (mine === 1 && !fresh)) return { lua: lua, conflict: "", bound: mine === 1 }
  // Bound twice (two reconciles that raced): one press would open and close
  // the bar. Clear the key and bind it once, unless something else is bound
  // there too: unbinding takes every bind on the key, so that one is left as
  // it is until Hyprland's next reload drops Nodi's runtime binds. A fresh
  // Nodi's own bind is replaced the same way.
  if (mine > 1 || (mine === 1 && fresh)) {
    var foreign = binds.some(function(o) { return o.description !== DESCRIPTION && matches(o, want) })
    if (foreign) return { lua: lua, conflict: "", bound: true }
    lua.push("hl.unbind(" + luaString(comboString(want.mask, want.key)) + ")")
  }

  for (var j = 0; j < binds.length && mine === 0; j++) {
    if (binds[j].description !== DESCRIPTION && matches(binds[j], want))
      return { lua: lua, conflict: binds[j].description || binds[j].dispatcher || "another binding", bound: false }
  }

  lua.push("hl.bind(" + luaString(comboString(want.mask, want.key)) + ", hl.dsp.global(" + luaString(trigger)
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
// "ok"), and unbinds only when none is; and a chord that a bind other than
// Nodi's holds too, by the binds as they are then, is left alone (codex
// 2026-10-04). Data reaches bash as arguments: after the first four, the
// chord's mask, its key and its unbind, three at a time. The jq reads a
// bind as bindKey() and matches() do, a keycode bind as "code:N", and
// Nodi's own as its description says ("Nodi", or "Nodi: " and a row's);
// a looser reading unbound another's keycode bind, or one named "Nodify"
// (codex 2026-10-05). With none loaded, the fifth argument, Lua, is
// evaluated first: the window rules turned off (lib/WindowRules.js), so
// what he set from Ctrl+K goes with Nodi (codex's review, 2026-10-09).
var RELEASE_SCRIPT = 'sleep "$1"; [ "$("$2" shell call "$3" ping x 2>/dev/null)" = ok ] && exit 0; h=$4 x=$5; shift 5; '
  + '[ -n "$x" ] && "$h" eval "$x" >/dev/null 2>&1; '
  + 'binds=$("$h" binds -j 2>/dev/null) || exit 0; '
  + 'while [ "$#" -ge 3 ]; do '
  + 'n=$(printf "%s" "$binds" | jq --argjson m "$1" --arg k "$2" \''
  + 'def canon: if test("^(code|mouse|mouse_up|mouse_down|mouse_left|mouse_right):"; "i") then (capture("^(?<p>[^:]*):(?<r>.*)$") | (.p | ascii_downcase) + ":" + .r) else ascii_upcase end; '
  + '[.[] | select(.modmask == $m '
  + 'and ((if (.key // "") != "" then .key elif ((.keycode // 0) > 0) then "code:" + (.keycode | tostring) else "" end) | canon) == $k '
  + 'and ((.description // "") as $d | ($d == "Nodi" or ($d | startswith("Nodi: "))) | not) '
  + 'and ((.submap // "") == "" or (.submap_universal | tostring) == "true"))] | length\' 2>/dev/null); '
  + '[ "$n" = 0 ] && "$h" eval "$3" >/dev/null 2>&1; shift 3; done'

// `combos`: one parsed combo, or a list (Nodi's own key and the rows' keys);
// `lua`, what else to evaluate when none is loaded ("" for nothing).
function releaseArgv(combos, pluginId, omarchyShell, hyprctl, delaySeconds, lua) {
  var list = (Array.isArray(combos) ? combos : [combos]).filter(function(c) { return !!c })
  if (list.length === 0 && !lua) return null
  var argv = ["/usr/bin/bash", "-c", RELEASE_SCRIPT, "nodi-release", String(delaySeconds === undefined ? 3 : delaySeconds),
              omarchyShell, pluginId, hyprctl || "/usr/bin/hyprctl", String(lua || "")]
  for (var i = 0; i < list.length; i++)
    argv.push(String(list[i].mask), list[i].key, "hl.unbind(" + luaString(comboString(list[i].mask, list[i].key)) + ")")
  return argv
}

// The chords this Nodi may hold, to release when it unloads: its own key,
// the rows' keys as prefs.json has them, and those it bound, which differ
// for a moment after one is changed (codex's review, 2026-10-09). Each
// once.
function held(own, prefsHotkeys, boundRows) {
  var seen = {}, out = []
  var all = [own].concat(Object.keys(prefsHotkeys || {}), Object.keys(boundRows || {}))
  for (var i = 0; i < all.length; i++) {
    var c = all[i] ? parseCombo(all[i]) : null
    if (!c || seen[c.mask + " " + c.key]) continue
    seen[c.mask + " " + c.key] = true
    out.push(c)
  }
  return out
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
  var isRow = function(o) { return String(o.description || "").indexOf(ROW_PREFIX) === 0 }
  for (var i = 0; i < binds.length; i++) {
    var b = binds[i]
    var combo = comboString(b.modmask, bindKey(b))
    if (!isRow(b)) continue
    if (hotkeys[combo]) { have[combo] = (have[combo] || 0) + 1; continue }
    if (!sharedWith(binds, b, isRow)) lua.push("hl.unbind(" + luaString(combo) + ")")
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
