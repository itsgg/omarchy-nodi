import QtQuick
import Quickshell
import Quickshell.Services.SystemTray

// The tray's menus as plain records for providers/tray.js (ROADMAP 58):
// while `active` (the bar open), an opener on each tray item's menu, and on
// each submenu one level down, as Omarchy's Tray.qml opens them (a child
// entry is itself a menu handle, owned by its parent opener's model, so a
// child opener goes before its parent). A record a menu entry:
//
//   { key, app, text, path, icon, checked }
//
// and handles[key] the live entry, which Enter triggers. Menus fill in
// after the opener asks (DBusMenu's AboutToShow), so a change rebuilds the
// records, a beat later, and says so.
Item {
  id: tray
  property bool active: false
  property var entries: []
  property var handles: ({})
  signal changed()

  // [{ opener, item, parent }]: parent "" for an item's own menu, else
  // the entry's text the opener is the submenu of.
  property var openers: []

  Component { id: openerType; QsMenuOpener {} }

  Timer { id: settle; interval: 60; onTriggered: tray.rebuild() }

  onActiveChanged: active ? tray.open() : tray.close()

  function open() {
    tray.close()
    var items = []
    try { items = SystemTray.items.values } catch (e) { items = [] }
    var list = []
    for (var i = 0; i < items.length; i++) {
      var item = items[i]
      // A passive item is one its app says is idle, which the tray hides.
      if (!item || !item.hasMenu || !item.menu || item.status === Status.Passive) continue
      var o = openerType.createObject(tray, { menu: item.menu })
      if (!o) continue
      o.children.valuesChanged.connect(settle.restart)
      list.push({ opener: o, item: item, parent: "", at: item.id })
    }
    tray.openers = list
    settle.restart()
  }

  function close() {
    settle.stop()
    var list = tray.openers
    tray.openers = []
    tray.entries = []
    tray.handles = ({})
    // Deepest first: a submenu's opener holds an entry its parent owns.
    for (var i = list.length - 1; i >= 0; i--) list[i].opener.destroy()
  }

  // The app's name as its item gives it, its first letter raised
  // ("dropbox" is Dropbox's own title).
  function appOf(item) {
    var name = String(item.tooltipTitle || item.title || item.id || "").trim()
    if (name.length > 60) name = name.slice(0, 60)
    return name.charAt(0).toUpperCase() + name.slice(1)
  }

  // The records from the openers as they are now; a submenu met for the
  // first time gets its own opener, whose filling in rebuilds again.
  function rebuild() {
    if (!tray.active) return
    var out = []
    var handles = {}
    var opened = {}
    for (var i = 0; i < tray.openers.length; i++) opened[tray.openers[i].at] = true
    var more = []
    for (var n = 0; n < tray.openers.length; n++) {
      var o = tray.openers[n]
      // An item gone from the tray while the bar is open (Sonnet 2026-10-06).
      if (!o.item || !o.opener) continue
      var values = []
      try { values = o.opener.children.values } catch (e) { values = [] }
      for (var k = 0; k < values.length; k++) {
        var e = values[k]
        if (!e || e.isSeparator) continue
        var text = String(e.text || "").replace(/_(?=[^_])/g, "").trim()
        if (!text) continue
        if (e.hasChildren) {
          // One level down: a submenu's entries, named by where they are.
          // By its place too: two submenus of one name are two.
          var at = o.item.id + "\u0001" + k + "\u0001" + text
          if (!o.parent && !opened[at]) {
            var c = openerType.createObject(tray, { menu: e })
            if (c) {
              c.children.valuesChanged.connect(settle.restart)
              more.push({ opener: c, item: o.item, parent: text, at: at })
              opened[at] = true
            }
          }
          continue
        }
        if (!e.enabled) continue
        var path = o.parent ? o.parent + " > " + text : text
        var key = "tray:" + o.item.id + ":" + path
        // Two entries of one name in one menu are two rows.
        if (handles[key]) key += "#" + n + "." + k
        handles[key] = e
        out.push({ key: key, app: tray.appOf(o.item), text: text, path: path, icon: String(o.item.icon || ""),
                   checked: e.buttonType !== QsMenuButtonType.None && e.checkState === Qt.Checked })
      }
    }
    if (more.length) tray.openers = tray.openers.concat(more)
    tray.entries = out
    tray.handles = handles
    tray.changed()
  }

  // Enter on a record: its entry, if the menu still holds it.
  function trigger(key) {
    var e = tray.handles[key]
    if (!e) return false
    e.triggered()
    return true
  }
}
