import Quickshell
import Quickshell.Io
import Quickshell.Hyprland
import QtQuick
import "../lib/Menu.js" as Menu
import "../lib/Toggles.js" as Toggles
import "../lib/Sources.js" as Sources
import "../lib/Appearance.js" as Appearance
import "../lib/Ansi.js" as Ansi
import "../lib/tzcities.js" as Tz

// What the rows are built from on the desktop, read ahead of an open and
// kept current: the apps and their icons, the windows, Omarchy's menu and
// its guards, the toggles, the appearance, the themes, the time zones, the
// emoji, the clipboard history and the recent files. Nodi.qml reads them
// here (services, desktop.apps) and starts the reads an open is due
// (startReads); what it changes it changes through a call (flip, menuRan,
// forgetZones).
Item {
  id: desktop
  visible: false

  property string home: ""
  property string omarchyPath: ""
  // nodi.json's "time": the zones it names beside the local one.
  property var timeConfig: ({})

  // A read changed what the rows are built from: an open bar recomputes.
  signal updated()
  // The app list was rebuilt (rebuildApps), after `updated`.
  signal appsRebuilt()
  // The GTK icon theme changed or cannot be read: icon rasters are stale.
  signal iconThemeChanged(string why)
  // The window list was read again (readWindows).
  signal windowsRead()

  property var zones: ({})          // { "Asia/Tokyo": { offset: 540, abbr: "JST" } }
  property real zonesFetchedAt: 0
  property string localZone: ""
  property var emojis: []
  property var apps: []
  property var appIcons: Object.create(null)
  property var appEntries: ({})
  property var hiddenApps: ({})
  property var windows: []
  property var activeWorkspace: null
  property var clipboard: []
  property var recentFiles: []
  property var menuDefault: []
  property var menuUser: []
  property var menu: ({ items: {}, order: [], when: {}, checked: {} })
  property real guardsAt: 0
  property var toggleStates: ({})
  property var themes: ({ list: [], current: "" })

  // When each probe an open would start last answered (lib/Probes.js): one
  // seconds old is this open's, and the themes are kept longer, the current
  // theme watched (theme.name below).
  property real togglesAt: 0
  property real appearanceAt: 0
  property real themesAt: 0

  // ---------------------------------------------------------------- zones

  function refreshZones() {
    if (zonesReader.busy || Date.now() - desktop.zonesFetchedAt < 60 * 60 * 1000) return
    var t = desktop.timeConfig || {}
    var extra = (t.zones || []).concat(t.home ? [t.home] : [])
    // Sources.ZONES_READ: the local zone, then each zone tzdata has.
    zonesReader.run(Sources.zonesArgv(Tz.allZones(extra)))
  }

  // A new config may name other zones: read at the next open.
  function forgetZones() { desktop.zonesFetchedAt = 0 }

  Reader {
    id: zonesReader
    timeoutMs: 5000
    onFinished: function(text, ok) {
      // A failed or cut read keeps the zones there were and is tried again
      // in a minute, not an hour (codex 2026-10-04).
      if (!ok) { desktop.zonesFetchedAt = Date.now() - 59 * 60 * 1000; return }
      var z = Sources.zones(text)
      desktop.zones = z.zones
      if (z.local) desktop.localZone = z.local
      desktop.zonesFetchedAt = Date.now()
      desktop.updated()
    }
  }

  // ---------------------------------------------------------------- emoji

  FileView {
    path: desktop.omarchyPath + "/shell/plugins/emojis/emojis.json"
    printErrors: false
    onLoaded: {
      try {
        var data = JSON.parse(text())
        desktop.emojis = Array.isArray(data) ? data : []
      } catch (e) {
        console.warn("nodi: bad emojis.json: " + e)
      }
    }
  }

  // ---------------------------------------------------------------- apps

  // Desktop entries, filtered as Omarchy's launcher filters them: NoDisplay
  // entries and the ids in its launcher.hides are left out.
  function rebuildApps() {
    var list = []
    var byId = {}
    var icons = Object.create(null)
    var values = DesktopEntries.applications.values || []
    for (var i = 0; i < values.length; i++) {
      var e = values[i]
      var id = String(e.id || "")
      if (!id || e.noDisplay || desktop.hiddenApps[id]) continue
      var keywords = []
      try { for (var k = 0; k < e.keywords.length; k++) keywords.push(String(e.keywords[k])) } catch (err) {}
      var actions = []
      try { for (var a = 0; a < e.actions.length; a++) actions.push({ index: a, id: String(e.actions[a].id || ""), name: String(e.actions[a].name || "") }) } catch (err2) {}
      var icon = String(e.icon || "")
      if (icon) icons[icon] = true
      byId[id] = e
      list.push({ id: id, name: String(e.name || id), generic: String(e.genericName || ""), comment: String(e.comment || ""),
                  keywords: keywords, icon: icon, wmclass: String(e.startupClass || ""), actions: actions,
                  exec: String(e.execString || ""), terminal: !!e.runInTerminal })
    }
    desktop.appEntries = byId
    desktop.apps = list
    desktop.appIcons = icons
    desktop.updated()
    desktop.appsRebuilt()
  }

  // The list is rebuilt once a burst of changes has settled.
  function readAppsSoon() { appsDebounce.restart() }

  Timer {
    id: appsDebounce
    interval: 300
    onTriggered: desktop.rebuildApps()
  }

  Connections {
    target: DesktopEntries.applications
    function onValuesChanged() { appsDebounce.restart() }
  }

  // GTK resolves named icons through this theme. Keep their rasters until
  // the catalog or theme changes; a settings edit starts a new cache epoch.
  FileView {
    path: desktop.home + "/.config/gtk-3.0/settings.ini"
    watchChanges: true
    printErrors: false
    property bool initialized: false
    property string iconTheme: ""
    onLoaded: {
      var match = /^\s*gtk-icon-theme-name\s*=\s*(.*?)\s*$/m.exec(String(text()))
      var current = match ? match[1] : ""
      if (initialized && current !== iconTheme) desktop.iconThemeChanged("icon theme changed")
      iconTheme = current
      initialized = true
    }
    onLoadFailed: {
      if (initialized && iconTheme !== "") desktop.iconThemeChanged("icon theme unreadable")
      iconTheme = ""
      initialized = true
    }
    onFileChanged: reload()
  }

  FileView {
    path: desktop.omarchyPath + "/default/omarchy/launcher.hides"
    watchChanges: true
    printErrors: false
    onLoaded: { desktop.hiddenApps = Sources.hidden(text()); appsDebounce.restart() }
    onFileChanged: reload()
  }

  // ---------------------------------------------------------------- windows

  // The windows, kept current from Quickshell's own model of Hyprland
  // (ROADMAP 32): it asks over Hyprland's socket, no program started, and
  // each toplevel keeps its last `hyprctl clients` record. Asked again when
  // Hyprland says a window opened, closed, moved, was retitled or took the
  // focus, so the list is ready when the bar opens; before, each open
  // started `hyprctl` 60 ms on, and `w` had no windows at its first key.
  function refreshWindows() { Hyprland.refreshToplevels() }

  function readWindows() {
    var tops = Hyprland.toplevels.values
    var clients = []
    for (var i = 0; i < tops.length; i++) if (tops[i] && tops[i].lastIpcObject) clients.push(tops[i].lastIpcObject)
    var fw = Hyprland.focusedWorkspace
    var w = Sources.windowsFrom(clients, fw ? { id: fw.id, name: String(fw.name || "") } : null)
    desktop.windows = w.list
    desktop.activeWorkspace = w.activeWorkspace
    desktop.windowsRead()
  }

  // A burst of records (one per window on a refresh) read once.
  Timer { id: windowsSettle; interval: 30; onTriggered: { desktop.readWindows(); desktop.updated() } }
  Timer { id: windowsAsk; interval: 120; onTriggered: desktop.refreshWindows() }

  Instantiator {
    model: Hyprland.toplevels
    // A window gone changes no record: its removal is read too (Fable).
    onObjectRemoved: windowsSettle.restart()
    delegate: Connections {
      required property var modelData
      target: modelData
      function onLastIpcObjectChanged() { windowsSettle.restart() }
    }
  }

  readonly property var windowEvents: ({ openwindow: true, closewindow: true, movewindowv2: true, windowtitlev2: true,
                                          activewindowv2: true, changefloatingmode: true, workspacev2: true })
  Connections {
    target: Hyprland
    function onRawEvent(event) { if (event && desktop.windowEvents[String(event.name)] === true) windowsAsk.restart() }
  }

  // ---------------------------------------------------------------- Omarchy's menu

  function rebuildMenu() {
    var merged = Menu.merge([desktop.menuDefault, desktop.menuUser])
    // The last guard answers stay until the new ones land; they are keyed by id.
    desktop.menu = { items: merged.items, order: merged.order, when: desktop.menu.when, checked: desktop.menu.checked }
    desktop.evaluateGuards()
  }

  function evaluateGuards() {
    var script = Menu.guardScript({ items: desktop.menu.items, order: desktop.menu.order })
    if (!script) return
    // A login shell, as Omarchy's menu evaluates them, so a guard sees the
    // PATH the user's profile sets. The order the script's indexes point
    // into travels with the run.
    guardsReader.run(["/usr/bin/bash", "-lc", script], desktop.menu.order)
  }

  // A row of the menu ran: one that changes what the guards answer has
  // them asked again at the next open (lib/Menu.js staleAfter).
  function menuRan(key) { if (Menu.staleAfter(key)) desktop.guardsAt = 0 }

  Reader {
    id: guardsReader
    timeoutMs: 20000
    onFinished: function(text, ok, tag) {
      // A batch cut short has not answered every row; keep the last full one.
      if (!ok) return
      var g = Menu.parseGuards(text, { order: tag || [] })
      desktop.menu = { items: desktop.menu.items, order: desktop.menu.order, when: g.when, checked: g.checked }
      desktop.guardsAt = Date.now()
      desktop.updated()
    }
  }

  FileView {
    path: desktop.omarchyPath + "/default/omarchy/omarchy-menu.jsonc"
    watchChanges: true
    printErrors: false
    onLoaded: { desktop.menuDefault = Menu.parseItems(text()); desktop.rebuildMenu() }
    onLoadFailed: { desktop.menuDefault = []; desktop.rebuildMenu() }
    onFileChanged: reload()
  }

  FileView {
    path: desktop.home + "/.config/omarchy/extensions/omarchy-menu.jsonc"
    watchChanges: true
    printErrors: false
    onLoaded: { desktop.menuUser = Menu.parseItems(text()); desktop.rebuildMenu() }
    onLoadFailed: { desktop.menuUser = []; desktop.rebuildMenu() }
    onFileChanged: reload()
  }

  // ---------------------------------------------------------------- toggles

  function refreshToggles() {
    togglesReader.run(["/usr/bin/bash", "-c", Toggles.probeScript()])
  }

  // A toggle ran: its state flipped at once, and asked again once its
  // command has had time to land.
  function flip(id) {
    desktop.toggleStates = Toggles.flipped(desktop.toggleStates, id)
    toggleReprobe.restart()
  }

  Reader {
    id: togglesReader
    timeoutMs: 4000
    onFinished: function(text, ok) {
      desktop.toggleStates = Toggles.parse(text)
      desktop.updated()
      if (ok) desktop.togglesAt = Date.now()
    }
  }

  // After a toggle runs, ask again once its command has had time to land.
  Timer { id: toggleReprobe; interval: 1500; onTriggered: desktop.refreshToggles() }

  // ---------------------------------------------------------------- appearance

  // The desktop's motion and contrast preferences (ROADMAP 73), read at
  // each open: higher contrast marks the selected row in every theme and
  // raises secondary text to 7:1; reduced motion, or Hyprland's
  // animations off, leaves the card's resizing unanimated.
  property var appearance: ({ highContrast: false, reducedMotion: false })
  readonly property bool reducedMotion: !!desktop.appearance.reducedMotion
  function refreshAppearance() { appearanceReader.run(["/usr/bin/bash", "-c", Appearance.PROBE]) }
  Reader {
    id: appearanceReader
    timeoutMs: 3000
    onFinished: function(text, ok) {
      var a = Appearance.parse(text)
      if (a.highContrast !== desktop.appearance.highContrast || a.reducedMotion !== desktop.appearance.reducedMotion) desktop.appearance = a
      if (ok) desktop.appearanceAt = Date.now()
    }
  }

  // ---------------------------------------------------------------- themes

  // The theme's sixteen colours, which a file's coloured lines are drawn
  // in (lib/Ansi.js, ROADMAP 82): read where the shell reads its theme,
  // and again at each open, so a theme switched to is the next open's.
  // The shell's path, which no XDG_STATE_HOME moves (Commons/Color.qml).
  property var themeColours: ({})
  FileView {
    id: themeColors
    path: desktop.home + "/.local/state/omarchy/current/theme/colors.toml"
    printErrors: false
    onLoaded: desktop.themeColours = Ansi.paletteFrom(text())
  }
  function reloadThemeColours() { themeColors.reload() }

  // The current theme, watched: a switch is the next open's at once, with
  // no probe at each open (lib/Probes.js keeps the list ten minutes). The
  // name is written after the theme is in place (omarchy-theme-set), and
  // read once it has settled.
  FileView {
    path: desktop.home + "/.local/state/omarchy/current/theme.name"
    watchChanges: true
    printErrors: false
    onFileChanged: { reload(); themeSwitched.restart() }
  }
  Timer { id: themeSwitched; interval: 200; onTriggered: { themeColors.reload(); desktop.refreshThemes() } }

  function refreshThemes() {
    themesReader.run(["/usr/bin/bash", "-c",
      "printf '@current\\t%s\\n' \"$(omarchy-theme-current 2>/dev/null)\"; "
      + "for d in \"$HOME/.config/omarchy/themes\"/*/ \"$OMARCHY_PATH/themes\"/*/; do "
      + "[ -d \"$d\" ] || continue; p=\"\"; [ -f \"$d/preview.png\" ] && p=\"${d%/}/preview.png\"; "
      + "printf '%s\\t%s\\n' \"$(basename \"$d\")\" \"$p\"; done"])
  }

  Reader {
    id: themesReader
    timeoutMs: 3000
    onFinished: function(text, ok) {
      desktop.themes = Sources.themes(text)
      desktop.updated()
      if (ok) desktop.themesAt = Date.now()
    }
  }

  // ---------------------------------------------------------------- clipboard and files

  FileView {
    path: desktop.home + "/.local/state/omarchy/clipboard-history.json"
    watchChanges: true
    printErrors: false
    onLoaded: { desktop.clipboard = Sources.clipboard(text()); desktop.updated() }
    onLoadFailed: desktop.clipboard = []
    onFileChanged: reload()
  }

  FileView {
    path: desktop.home + "/.local/share/recently-used.xbel"
    watchChanges: true
    printErrors: false
    onLoaded: { desktop.recentFiles = Sources.recentFiles(text(), 500); desktop.updated() }
    onFileChanged: reload()
  }
}
