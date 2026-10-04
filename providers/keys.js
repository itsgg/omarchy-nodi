.pragma library
.import "../lib/Run.js" as Run
.import "../lib/Score.js" as Score
.import "../lib/Sources.js" as Sources
.import "omarchy.js" as Omarchy

// Every keybinding, found by what it does, with its keys on the row; Enter
// does what the keys do. From Omarchy's own keybinding records, which
// `omarchy-menu-keybindings --print` keeps current with Hyprland's binds:
//
//   full screen, workspace 3, close window, keys (every binding)
//
// A record runs the way Omarchy's keybindings menu runs it: an exec through
// Hyprland's exec_cmd, a Lua dispatcher through hyprctl dispatch. One with
// no command Nodi can run (Universal copy, a shortcut sent to a web app)
// shows its keys, ranks under one that runs, and Enter copies the keys.
// One whose command is exactly a menu action is left to that menu row, which
// shows its state and, from here, its keys; `keys ` lists them all. What
// closes, removes or powers off asks twice, as in the Omarchy catalog.

var LIMIT = 8

function luaString(s) { return '"' + String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n") + '"' }

function runOf(b) {
  if (b.dispatcher === "exec" && b.arg) return Run.exec(["hyprctl", "dispatch", "hl.dsp.exec_cmd(" + luaString(b.arg) + ")"])
  if (b.dispatcher === "lua" && /^hl\.dsp\./.test(b.arg)) return Run.exec(["hyprctl", "dispatch", b.arg])
  return null
}

// The menu's actions as written, so a binding that runs one exactly is
// left to the menu row. By the whole command: the menu also runs a few
// `omarchy-shell` calls, and matching the program alone dropped all 27
// `omarchy-shell` bindings, play and pause among them (Fable 2026-10-02).
var actionCache = { menu: null, actions: null }

function menuActions(menu) {
  if (!menu || !menu.items) return Object.create(null)
  if (actionCache.menu === menu) return actionCache.actions
  var found = Object.create(null)
  for (var i = 0; i < (menu.order || []).length; i++) {
    var item = menu.items[menu.order[i]]
    if (item && item.action) found[String(item.action).trim()] = true
  }
  actionCache = { menu: menu, actions: found }
  return found
}

// What each binding is matched on, worked out once per read of the
// records rather than on every keystroke (tools/bench.sh).
var fieldsCache = { list: null, fields: null }

function fieldsOf(list) {
  if (fieldsCache.list === list) return fieldsCache.fields
  var fields = list.map(function(b) { return Score.prepare({ name: b.description, whole: true, keywords: [b.chord.replace(/\+/g, " ")] }) })
  fieldsCache = { list: list, fields: fields }
  return fields
}

// `listed`: the whole list with nothing typed, kept in Omarchy's order.
function rowFor(b, tier, listed) {
  var run = runOf(b)
  var row = {
    key: "keys:" + b.chord,
    title: b.description,
    // The command an exec runs; a Lua dispatch is Hyprland's own action,
    // which the title already names.
    subtitle: !run ? "Keys only" : b.dispatcher === "exec" ? String(b.arg || "") || "Keybinding"
            : /lua/.test(String(b.dispatcher)) ? "Hyprland" : (String(b.dispatcher) + " " + String(b.arg || "")).trim(),
    badge: b.chord,
    icon: "󰌌",
    tier: tier,
    kind: "command",
    // The closer name first: "Close window" before "Close all windows".
    offset: listed ? 0 : -Math.min(0.5, b.description.length * 0.01) - (run ? 0 : 4),
    copy: b.chord,
    run: run || Run.copy(b.chord),
    actionLabel: run ? "Run" : "Copy keys",
    group: "Keybindings"
  }
  if (run && Omarchy.CONFIRM.test(b.description + " " + b.arg)) row.confirm = true
  return row
}

var provider = {
  id: "keys",
  name: "Keybindings",
  icon: "󰌌",
  modes: [{ pattern: /^\s*keys\s/i, label: "Keybindings", icon: "󰌌", exclusive: true }],
  sources: {
    keybindings: {
      argv: function() {
        return ["/usr/bin/bash", "-c", 'omarchy-menu-keybindings --print >/dev/null 2>&1; '
          + 'f=$(ls -t "${XDG_CACHE_HOME:-$HOME/.cache}/omarchy"/keybindings-*.records 2>/dev/null | head -1); [ -n "$f" ] && cat -- "$f"']
      },
      parse: function(text, ok) { if (!ok) throw "no keybinding records"; return Sources.keybindings(text) },
      maxAgeMs: 5 * 60 * 1000,
      timeoutMs: 8000
    }
  },
  commands: [
    { title: "Keybindings", keywords: "keys keybindings shortcuts hotkeys bindings chords", text: "Every keybinding by what it does", complete: "keys " }
  ],
  help: [
    { id: "keys", title: "Keybindings", icon: "󰌌", about: "Every keybinding by what it does, its keys beside it",
      examples: [{ q: "keys ", note: "Every keybinding" }, { q: "full screen", hint: "Runs it, and shows the keys" }] }
  ],
  match: function(query, ctx) {
    var whole = /^\s*keys\s/i.test(String(query))
    var q = String(query || "").replace(/^\s*keys(\s+|$)/i, "").trim().toLowerCase().replace(/\s+/g, " ")
    if (!whole && q.length < 3) return []
    var got = ctx.request ? ctx.request("keybindings") : { state: "pending" }
    var list = Array.isArray(got.value) ? got.value : []
    if (whole && list.length === 0) return [{ title: got.state === "error" ? "No keybinding records" : "Reading keybindings...", subtitle: "Keybindings", score: 40, copy: "" }]
    var inMenu = whole ? null : menuActions(ctx.menu)
    var hits = []
    var fields = q ? fieldsOf(list) : null
    for (var i = 0; i < list.length; i++) {
      var b = list[i]
      // Nodi's own key, and a bind left by the bar it replaced, open nothing new.
      if (b.description === "Nodi" || b.description === "Command bar") continue
      if (inMenu && b.dispatcher === "exec" && inMenu[String(b.arg).trim()]) continue
      var t = !q ? "prefix" : Score.tier(q, fields[i])
      if (t) hits.push({ b: b, t: t, s: Score.TIER[t] })
    }
    // With nothing typed after "keys ", Omarchy's own order, which groups them.
    if (q) hits.sort(function(a, b) { return b.s - a.s || a.b.description.length - b.b.description.length })
    return (whole ? hits : hits.slice(0, LIMIT)).map(function(h) { return rowFor(h.b, h.t, whole && !q) })
  },
  // A saved row as the records have it now: "keys:<chord>", while the chord
  // still runs what was saved; a chord bound to something else since keeps
  // the saved row, as a hotkey set on "File manager" should not start
  // running "Full screen" (Fable 2026-10-04). Runs compared as written: one
  // written another way keeps the saved row, so a mismatch costs a stale
  // title, never a wrong command. Only a look: a home view does not start
  // reading the records.
  resolve: function(key, ctx, saved) {
    var got = ctx.request ? ctx.request("keybindings", "", { fetch: false }) : null
    var list = got && Array.isArray(got.value) ? got.value : []
    for (var i = 0; i < list.length; i++) {
      if ("keys:" + list[i].chord !== key) continue
      var row = rowFor(list[i], "exact", false)
      return saved && JSON.stringify(row.run) === JSON.stringify(saved.run) ? row : null
    }
    return null
  }
}
