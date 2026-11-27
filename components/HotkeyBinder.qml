import QtQuick
import "../lib/Hotkey.js" as Hotkey

// Nodi binds its own hotkey in the running Hyprland (hyprctl eval): no
// config file is edited. Hyprland drops runtime binds when its config
// reloads, so Nodi.qml asks again (ensure) after every reload, after a
// config change, and at startup. A key something else holds is left alone,
// asked again once in case the holder is unloading (the old bar on the
// swap). The rows' hotkeys (Ctrl+K, lib/Prefs.js) go in the same eval.
// What to bind is lib/Hotkey.js plan and planRows.
Item {
  id: binder
  visible: false

  // Nothing is asked until both config files are read (Nodi.qml configLoaded).
  property bool ready: false
  property string hotkey: ""             // nodi.json's "hotkey", trimmed
  property var rowHotkeys: ({})          // prefs.hotkeys
  property string pluginId: ""
  property string toggleShortcut: ""     // "appid:name" (lib/Hotkey.js plan)
  property real scrimAlpha: 0
  property real cardAlpha: 0

  // What Nodi says in its toast.
  signal warn(string title, string body)

  property string boundHotkey: ""
  property string warnedConflict: ""
  property string hotkeyWarned: ""
  property bool conflictRetried: false
  property string lastBinds: "[]"         // the binds as last read, for checking a chord being set
  property var boundRows: ({})            // combo -> the row key this Nodi bound it to
  property var rowConflictsWarned: ({})

  // One reconcile at a time: a read of the binds, then the eval it plans,
  // finished before the next read, so two reconciles cannot both see the key
  // unbound and bind it twice (codex 2026-10-02). A request during one runs
  // once after it.
  property bool hotkeyQueued: false
  property bool hotkeyFresh: true         // this Nodi has not bound its key yet

  function ensure() {
    if (!binder.ready) return
    if (bindsReader.busy || evalReader.busy) { binder.hotkeyQueued = true; return }
    bindsReader.run(["/usr/bin/hyprctl", "binds", "-j"])
  }

  // The first look once the config is read, and a second once a reload has
  // settled: whatever an earlier instance did to the key while this one
  // read the binds, the key is bound after. Released keys wait for no
  // successor (Nodi.qml Component.onDestruction), so this is the belt for
  // a successor slower to load than that wait.
  function start() {
    hotkeyStart.start()
    hotkeyRecheck.start()
  }

  // Deferred: `finished` is emitted while the reader's process may still
  // count as running, and a request made then would queue with nothing left
  // to start it (Fable 2026-10-02).
  function idle() {
    if (!binder.hotkeyQueued) return
    binder.hotkeyQueued = false
    Qt.callLater(binder.ensure)
  }

  function reconcile(bindsJson) {
    var hotkey = binder.hotkey
    if (hotkey && !Hotkey.parseCombo(hotkey) && binder.hotkeyWarned !== hotkey) {
      binder.hotkeyWarned = hotkey
      binder.warn("Nodi has no hotkey",
        "\"" + hotkey + "\" is not a key combination. Write it as \"SUPER + SPACE\" in ~/.config/omarchy/extensions/nodi.json.")
    }
    binder.lastBinds = bindsJson
    var p = Hotkey.plan(bindsJson, hotkey, binder.toggleShortcut, { scrim: binder.scrimAlpha, card: binder.cardAlpha }, binder.hotkeyFresh)
    if (p.bound) binder.hotkeyFresh = false
    var rows = Hotkey.planRows(bindsJson, binder.rowHotkeys, binder.pluginId, binder.boundRows)
    binder.boundRows = rows.bound
    for (var c = 0; c < rows.conflicts.length; c++) {
      if (binder.rowConflictsWarned[rows.conflicts[c]]) continue
      binder.rowConflictsWarned[rows.conflicts[c]] = true
      binder.warn("A row's hotkey is taken", rows.conflicts[c] + " is bound to something else now; set the row another one from Ctrl+K.")
    }
    var lua = p.lua.concat(rows.lua)
    if (lua.length > 0) evalReader.run(["/usr/bin/hyprctl", "eval", lua.join("\n")])
    else binder.idle()
    binder.boundHotkey = p.bound ? hotkey : ""
    if (p.conflict && !binder.conflictRetried) {
      binder.conflictRetried = true
      hotkeyRetry.start()
      return
    }
    if (p.conflict && binder.warnedConflict !== hotkey) {
      binder.warnedConflict = hotkey
      console.warn("nodi: " + hotkey + " is already used by \"" + p.conflict + "\"; not binding it")
      binder.warn("Nodi has no hotkey",
        hotkey + " already opens \"" + p.conflict + "\". Set another \"hotkey\" in ~/.config/omarchy/extensions/nodi.json.")
    }
    if (!p.conflict) binder.conflictRetried = false
  }

  Reader {
    id: bindsReader
    timeoutMs: 3000
    onFinished: function(text, ok) { if (ok) binder.reconcile(text); else binder.idle() }
  }

  Reader {
    id: evalReader
    timeoutMs: 3000
    onFinished: binder.idle()
  }

  Timer { id: hotkeyRetry; interval: 3000; onTriggered: binder.ensure() }
  Timer { id: hotkeyStart; interval: 600; onTriggered: binder.ensure() }
  Timer { id: hotkeyRecheck; interval: 5000; onTriggered: binder.ensure() }
}
