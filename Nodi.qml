import Quickshell
import Quickshell.Io
import Quickshell.Hyprland
import Quickshell.Wayland
import QtQuick
import "components"
import "lib/Engine.js" as Engine
import "lib/Rows.js" as Rows
import "lib/Run.js" as Run
import "lib/Jsonc.js" as Jsonc
import "lib/Menu.js" as Menu
import "lib/Toggles.js" as Toggles
import "lib/Sources.js" as Sources
import "lib/Hotkey.js" as Hotkey
// Not "Keys": that name is QtQuick's attached Keys (Keys.onPressed below).
import "lib/Keys.js" as NodiKeys
import "lib/Config.js" as Config
import "lib/Prefs.js" as Prefs
import "lib/History.js" as History
import "lib/Match.js" as Match
import "lib/tzcities.js" as Tz
import "lib/Describe.js" as Describe
import "lib/Pick.js" as Pick
import "lib/Pane.js" as Pane
import "lib/Opens.js" as Opens
import "lib/PickLog.js" as PickLog
import "providers/apps.js" as Apps
import "providers/answers.js" as Answers

// Nodi: a command bar for Omarchy. This file draws, takes keys and fetches
// data; what a query means is decided by providers/, run through
// lib/Engine.js, and what a row does is built by lib/Run.js.
Item {
  id: root

  property var shell: null
  property var manifest: null
  readonly property string pluginId: (manifest && manifest.id) || "io.github.itsgg.nodi"

  property bool opened: false
  // Which example the empty field suggests (lib/Engine.js placeholder): the
  // next one on each open, from a random first one so a restart does not
  // always begin with the same; set at the open, so a settings change does
  // not swap it while the bar is up.
  property int opens: Math.floor(Math.random() * 1000)
  property string placeholder: "Search"
  property bool ctrlHeld: false        // Ctrl is down: rows show the digit that runs them
  property int selectedIndex: 0
  property var results: []
  property var shownQuery: null     // the query the rows on screen answer; null when nothing is shown yet
  property var mode: null           // { label, icon } while a prefix like ":" or "w " is typed
  property string armedKey: ""      // the row waiting for its second Enter
  property bool paletteOpen: false
  property int paletteIndex: 0
  property var paletteActions: []
  property string paletteArmed: ""

  readonly property string home: Quickshell.env("HOME")
  readonly property string user: Quickshell.env("USER")
  // The shell assigns this on load (shell.qml's plugin loader); readonly
  // would make that assignment throw and stop the shell wiring Nodi in.
  property string omarchyPath: Quickshell.env("OMARCHY_PATH") || "/usr/share/omarchy"
  readonly property string pluginDir: String(Qt.resolvedUrl(".")).replace(/^file:\/\//, "").replace(/\/$/, "")
  readonly property string userConfigPath: home + "/.config/omarchy/extensions/nodi.json"
  readonly property string cacheDir: home + "/.cache/nodi"
  readonly property string stateDir: home + "/.local/state/nodi"
  // The hotkey's Hyprland global shortcut, "appid:name" (lib/Hotkey.js plan).
  readonly property string toggleShortcut: pluginId + ":toggle"

  // ---------------------------------------------------------------- data

  property var defaultConfig: ({})
  property var userConfig: ({})
  property bool userConfigGood: false   // a nodi.json has parsed since load
  property string configWarned: ""      // the error last notified, so each is said once
  property string hotkeyWarned: ""
  readonly property var config: Config.merge(defaultConfig, userConfig)

  property var zones: ({})          // { "Asia/Tokyo": { offset: 540, abbr: "JST" } }
  property real zonesFetchedAt: 0
  property string localZone: ""
  property var emojis: []
  property var apps: []
  property var appEntries: ({})
  property var hiddenApps: ({})
  property var history: ({})        // row key -> { n, t }: what was run, how often, when (lib/History.js)
  property var picks: ({})          // query -> row key -> { n, t }: what was picked for what was typed
  property var reminders: []        // Omarchy's pending reminders, for the home view
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
  property bool cacheReady: false

  // ---------------------------------------------------------------- look

  // How it looks and measures, from components/Look.qml.
  // Held wide under Ctrl+K too, so the actions do not narrow the card.
  Look { id: look; screenWidth: panel.width; screenHeight: panel.height; wide: root.preview !== null || (root.paletteOpen && root.anyPreview) }
  readonly property alias background: look.background
  readonly property alias foreground: look.foreground
  readonly property alias secondary: look.secondary
  readonly property alias opaqueCard: look.opaqueCard
  readonly property alias secondaryOnSelected: look.secondaryOnSelected
  readonly property alias selectedInk: look.selectedInk
  readonly property alias border: look.border
  readonly property alias borderSpec: look.borderSpec
  readonly property alias selectedBorderSpec: look.selectedBorderSpec
  readonly property alias rowInsetLeft: look.rowInsetLeft
  readonly property alias rowInsetRight: look.rowInsetRight
  readonly property alias scrim: look.scrim
  readonly property alias selectedBackground: look.selectedBackground
  readonly property alias selectedText: look.selectedText
  readonly property alias cornerRadius: look.cornerRadius
  readonly property alias fontFamily: look.fontFamily
  readonly property alias contentMargin: look.contentMargin
  readonly property alias inputFont: look.inputFont
  readonly property alias inputHeight: look.inputHeight
  readonly property alias rowHeight: look.rowHeight
  readonly property alias heroHeight: look.heroHeight
  readonly property alias sectionHeight: look.sectionHeight
  readonly property alias footerHeight: look.footerHeight
  readonly property alias tileSize: look.tileSize
  readonly property alias tileRadius: look.tileRadius
  readonly property alias maxRows: look.maxRows
  readonly property alias rowPeek: look.rowPeek
  function paletteHeight(count) { return look.paletteHeight(count) }
  readonly property alias cardWidth: look.cardWidth
  readonly property alias listColumn: look.listColumn
  readonly property alias paneMin: look.paneMin
  readonly property alias answerMax: look.answerMax

  readonly property var rows: results
  readonly property bool showingHelp: root.rows.length > 0 && !!root.rows[0].help
  readonly property var selectedRow: root.rows[root.selectedIndex] || null
  // The words the selected row, or else the mode, takes: under the field.
  readonly property string argsHint: root.paletteOpen ? "" : ((root.selectedRow && root.selectedRow.hint) || (root.mode && root.mode.hint) || "")
  readonly property bool noResults: root.rows.length === 0 && input.text.trim() !== ""
  readonly property bool inHelpTopic: /^\s*\?\s*\S/.test(input.text)
  property point lastPointer: Qt.point(-1, -1)

  function rowSize(row) { return look.rowSize(row) }
  readonly property real listHeight: look.listHeight(root.rows, root.showingHelp)

  // ---------------------------------------------------------------- lifecycle

  // payloadJson may carry a starting query: '{"query": ":"}' opens emoji search.
  function open(payloadJson) {
    // This open's times (lib/Opens.js), from its start: an open while the
    // bar is up is not one, and leaves the record as it was.
    var starting = !root.opened
    if (starting) root.openRec = Opens.start(Date.now(), root.openBy || "call", false)
    root.openBy = ""
    // Sizes change at once until the card is up (startReads).
    card.animated = false
    var payload = {}
    try { payload = JSON.parse(payloadJson || "{}") || {} } catch (e) {}
    // A pick stays open only for its own opening: anything else that opens
    // the bar ends it, nothing chosen.
    if (root.pickSession && payload.pick !== root.pickSession.id) root.endPick("cancel")
    // So is a confirm word, before the payload's query is typed.
    root.endWord()
    if (typeof payload.query === "string") {
      input.text = payload.query
      input.cursorPosition = payload.query.length
    } else if (starting && input.text && Date.now() - root.closedAt > root.keepQueryMs) {
      // A kept query lasts two minutes, then the bar opens on its home
      // view (his call 2026-10-05; Raycast, PowerToys and Alfred keep one
      // for 2 to 5 minutes). It is not kept across a restart: no file
      // holds it since (Fable 2026-10-05).
      input.text = ""
    }
    root.recallAt = -1
    launchFeedback.opened()
    root.noteWindow()
    root.opens++
    root.placeholder = root.pickSession ? (root.pickSession.placeholder || "Pick one") : Engine.placeholder(root.config, root.opens)
    root.aliasRow = null
    root.endCapture()
    root.opened = true
    root.selectedIndex = 0
    root.shownQuery = null
    root.armedKey = ""
    root.paletteOpen = false
    root.lastPointer = Qt.point(-1, -1)
    // The windows as last kept, for the first ranking.
    root.readWindows()
    // The reads (windows, toggles, themes...) start 60 ms after, once the
    // card is on screen: each start forks the shell, and started here they
    // held the first frame back about 70 ms (161 ms from the key to the
    // screen against 92, measured 2026-10-04). The window's frameSwapped
    // reaches QML through card.Window.window (the open times below), so
    // ROADMAP 30 may wait for the frame instead of a clock.
    root.readsPending = true
    readsAfterFrame.restart()
    // A kept query: the field held text the payload did not give.
    if (starting && root.openRec) root.openRec.held = input.text !== "" && typeof payload.query !== "string"
    if (starting) root.trail = PickLog.typed([], Match.normalise(input.text))
    root.recompute()
    Opens.stamp(root.openRec, "ranked", Date.now())
    var given = typeof payload.query === "string"
    Qt.callLater(function() { input.forceActiveFocus(); if (!given) input.selectAll() })
    // Whatever the field holds now was not typed this time (the last query,
    // a payload's): Escape closes over it (lib/Keys.js view.typed).
    root.typedSinceOpen = false
  }

  // The field changed since the bar opened. Escape closes the bar either
  // way; this only decides whether a help topic goes back to the topics
  // (opened this time) or is closed over (the bar reopened on it).
  property bool typedSinceOpen: false

  property bool readsPending: false

  // The window that had the focus when the bar opened (README, "The window
  // you came from"), for the providers that act on it: Hyprland's active
  // toplevel at the press, before the bar's layer takes the keyboard (a
  // layer is never a window, so it is never this one). What its last IPC
  // record lacks is filled in when the window list lands (lib/Sources.js).
  // An open while the bar is up keeps it: the focus has not moved since.
  property var cameFromTop: null
  property var cameFrom: Sources.windowContext(null, [])

  function noteWindow() {
    if (root.opened) return
    var t = Hyprland.activeToplevel
    root.cameFromTop = t ? { address: String(t.address || ""), title: String(t.title || ""), ipc: t.lastIpcObject || {},
                             workspace: t.workspace ? String(t.workspace.name || "") : "" } : null
    root.cameFrom = Sources.windowContext(root.cameFromTop, root.windows)
  }

  function startReads() {
    // The card is on screen by now: its size changes animate from here on.
    card.animated = true
    if (!root.readsPending) return
    root.readsPending = false
    readsAfterFrame.stop()
    root.refreshWindows()
    root.refreshToggles()
    root.refreshThemes()
    root.refreshReminders()
    root.refreshZones()
    requests.request("omarchy-commands")
    if (Date.now() - root.guardsAt > 60 * 1000) root.evaluateGuards()
  }

  Timer { id: readsAfterFrame; interval: 60; onTriggered: root.startReads() }

  readonly property int keepQueryMs: 120000
  property real closedAt: 0

  function close() {
    root.closedAt = Date.now()
    card.animated = false
    root.keepOpenTime()
    // A pick closed without a choice: its command hears that nothing was.
    root.endPick("cancel")
    root.opened = false
    root.ctrlHeld = false     // a Ctrl+digit closes the bar before Ctrl is let go
    root.paletteOpen = false
    root.aliasRow = null
    root.endWord()
    root.endCapture()
    askSession.recycle()
    // Nobody sees an answer once the bar is closed: it stops, and the next
    // open asks afresh.
    answerSession.reset()
  }

  function dismiss() {
    root.close()
    if (root.shell && typeof root.shell.hide === "function") root.shell.hide(root.pluginId)
  }

  // After an action the bar starts empty next time; a plain close keeps the query.
  function finish() {
    input.text = ""
    root.selectedIndex = 0
    root.dismiss()
  }

  function toggle() {
    if (root.opened) root.dismiss()
    else root.open("{}")
  }

  // ---------------------------------------------------------------- picks

  // The queries this open, keystroke by keystroke, and every row run from
  // one, for the ranking harness (lib/PickLog.js, ROADMAP 42).
  property var trail: []
  property var pickLog: []
  property bool pickLogLoaded: false

  function logPick(e) {
    root.pickLog = PickLog.add(root.pickLog, e)
    if (root.cacheReady && root.pickLogLoaded) pickLogFile.setText(PickLog.serialize(root.pickLog))
  }

  FileView {
    id: pickLogFile
    path: root.cacheDir + "/picks-log.json"
    printErrors: false
    atomicWrites: true
    onLoaded: { root.pickLog = PickLog.parse(text()).concat(root.pickLog).slice(-PickLog.MAX); root.pickLogLoaded = true }
    onLoadFailed: root.pickLogLoaded = true
  }

  // ---------------------------------------------------------------- open times

  // Each open's start, first ranking, first frame and Hyprland's openlayer
  // (lib/Opens.js), kept on the close for `make opens`: measured as he
  // uses the bar, since a test open would show on his screen (ROADMAP 30).
  property var openRec: null
  property string openBy: ""
  property var openTimes: []
  property bool openTimesLoaded: false

  function keepOpenTime() {
    if (!root.openRec) return
    root.openTimes = Opens.add(root.openTimes, root.openRec)
    root.openRec = null
    if (root.cacheReady && root.openTimesLoaded) openTimesFile.setText(Opens.serialize(root.openTimes))
  }

  FileView {
    id: openTimesFile
    path: root.cacheDir + "/opens.json"
    printErrors: false
    atomicWrites: true
    onLoaded: { root.openTimes = Opens.parse(text()).concat(root.openTimes).slice(-Opens.MAX); root.openTimesLoaded = true }
    onLoadFailed: root.openTimesLoaded = true
  }

  // The first frame the bar's window swaps after the open.
  Connections {
    target: card.Window.window
    ignoreUnknownSignals: true
    function onFrameSwapped() { if (root.openRec && root.openRec.frame === -1) Opens.stamp(root.openRec, "frame", Date.now()) }
  }

  // Hyprland maps the layer: what the compositor shows.
  Connections {
    target: Hyprland
    function onRawEvent(event) {
      if (root.openRec && event.name === "openlayer" && event.data === Hotkey.NAMESPACE) Opens.stamp(root.openRec, "layer", Date.now())
    }
  }

  // ---------------------------------------------------------------- queries

  function services() {
    var desktop = desktopState.snapshot()
    desktopTimer.seen = JSON.stringify(desktop)
    return {
      zones: root.zones, localZone: root.localZone,
      emojis: root.emojis, apps: root.apps, windows: root.windows, history: root.history, picks: root.picks, reminders: root.reminders,
      activeWorkspace: root.activeWorkspace, clipboard: root.clipboard, files: root.recentFiles, menu: root.menu,
      toggleStates: root.toggleStates, themes: root.themes, home: root.home, descriptions: root.appDescriptions,
      request: requests.request,
      prefs: root.prefs,
      ask: { phase: askSession.phase, question: askSession.question, answer: askSession.answer, error: askSession.error, model: askSession.model },
      answer: { phase: answerSession.phase, keyword: answerSession.keyword, question: answerSession.question, text: answerSession.text,
                error: answerSession.error },
      window: root.cameFrom,
      undo: undoer.entries,
      desktop: desktop
    }
  }

  function recompute() {
    var before = { query: root.shownQuery, key: root.selectedRow ? root.selectedRow.key : "", index: root.selectedIndex }
    if (root.captureRow) {
      root.results = Engine.hotkeyPrompt(root.captureRow, root.captureNote)
      root.mode = { label: "Hotkey", icon: "󰌌" }
    } else if (root.aliasRow) {
      root.results = Engine.aliasPrompt(input.text, root.aliasRow)
      root.mode = { label: "Alias", icon: "󰌌" }
    } else if (root.wordAsk) {
      root.results = Engine.wordPrompt(input.text, root.wordAsk)
      root.mode = { label: "Confirm", icon: "󰀦" }
    } else if (root.pickSession) {
      root.results = Pick.rows(input.text, root.pickSession.rows || [])
      root.mode = { label: "Pick", icon: Pick.PROVIDER.icon }
    } else {
      root.results = Engine.run(input.text, root.config, root.services())
      root.mode = Engine.mode(input.text, root.config)
    }
    root.selectedIndex = NodiKeys.reselect(before, root.rows, input.text)
    root.shownQuery = input.text
    if (root.rows.length > 0) card.keepVisible(root.selectedIndex)
  }

  function move(delta) {
    root.armedKey = ""
    var n = root.rows.length
    if (n === 0) return
    root.selectedIndex = (root.selectedIndex + delta + n) % n
    card.keepVisible(root.selectedIndex)
  }

  function complete(row) {
    if (!row || !row.complete) return false
    input.text = row.complete
    if (row.select) input.selectAll()
    else input.cursorPosition = row.complete.length
    root.selectedIndex = 0
    return true
  }

  // Enter on a row. A row that asks twice is armed by the first Enter and
  // run by the second; moving or typing disarms it.
  function activate(index) {
    var row = root.rows[index]
    if (!row) return
    if (row.nodi) { root.doNodi(row); return }
    if (row.run) {
      if (row.confirmWord) {
        root.askWord({ title: row.title, word: row.confirmWord, run: row.run, risk: row.risk, toggle: row.toggle,
                       key: row.remember ? row.key : "", snap: History.snapshot(row), undoable: row.undoable })
        return
      }
      if (row.confirm && root.armedKey !== row.key) {
        root.selectedIndex = index
        root.armedKey = row.key
        return
      }
      root.armedKey = ""
      root.execute(row.run, row.toggle, row.remember ? row.key : "", History.snapshot(row), row.title, row.undoable)
      return
    }
    if (row.complete && !row.copy) { root.complete(row); return }
    if (row.copy) root.execute(Run.copy(row.copy), "", row.remember ? row.key : "", null)
  }

  // A desktop action's command, by its place; a run that names the action's
  // id gets it only if that place still holds that action, else nothing.
  function appAction(id, index, actionId) {
    var entry = root.appEntries[id]
    var action = entry && entry.actions ? entry.actions[index] : null
    if (action && actionId && String(action.id || "") !== actionId) action = null
    return action ? Array.prototype.slice.call(action.command || []) : null
  }

  // The one place a row's run starts a program. `key` is the row's, so what
  // was run is remembered for ranking (lib/History.js). An undoable one is
  // run where what it prints is read (components/Undoer.qml).
  function execute(run, toggleId, key, snap, name, undoable) {
    // Watched for failing, by the row's name (lib/Run.js watched), unless
    // the Undoer runs it and says so itself.
    var argv = Run.command(run, root.appAction, undoable && run.kind === "exec" ? "" : (name || (snap && snap.title) || ""))
    if (!argv) return
    var query = Match.normalise(input.text)
    // What was typed and shown, before the bar empties (lib/PickLog.js);
    // a pick's choice ranks nothing.
    if (key && query && !root.pickSession) root.logPick(PickLog.entry(Date.now(), root.trail, query, key, root.rows))
    root.finish()
    if (undoable && run.kind === "exec") undoer.run(argv, name || (snap && snap.title) || "")
    else Quickshell.execDetached(argv)
    if (run.kind === "app") launchFeedback.begin(name || (snap && snap.title) || run.id)
    if (key) root.remember(key, query, snap)
    if (toggleId) {
      root.toggleStates = Toggles.flipped(root.toggleStates, toggleId)
      toggleReprobe.restart()
    }
  }

  // ---------------------------------------------------------------- Ctrl+K

  // What the palette needs to know besides the row.
  function paletteContext() {
    return { activeWorkspace: root.activeWorkspace, prefs: root.prefs, knows: function(key) { return History.knows(root.history, root.picks, key) } }
  }

  // The palette acts on the row it opened for: results that refresh under it
  // (a toggle reprobe, a window list) must not move its actions to another
  // row (codex 2026-10-02).
  property var paletteRow: null

  function openPalette() {
    var acts = Rows.actionsFor(root.selectedRow, root.paletteContext())
    if (acts.length === 0) return
    root.paletteRow = root.selectedRow
    root.paletteActions = acts
    root.paletteIndex = 0
    root.paletteArmed = ""
    root.paletteOpen = true
  }

  function runPaletteAction(index) {
    var a = root.paletteActions[index]
    if (!a) return
    // A word is the action's one confirmation: no second Enter before it
    // (Fable 2026-10-05).
    if (a.confirm && !a.confirmWord && root.paletteArmed !== a.label) {
      root.paletteIndex = index
      root.paletteArmed = a.label
      return
    }
    root.paletteOpen = false
    var row = root.paletteRow
    if (!row) return
    if (a.confirmWord) {
      var mine = index === 0 && row.remember
      root.askWord({ title: index === 0 ? row.title : a.label, word: a.confirmWord, run: a.run, risk: a.risk,
                     toggle: index === 0 ? row.toggle : "", key: mine ? row.key : "", snap: mine ? History.snapshot(row) : null, undoable: a.undoable })
      return
    }
    if (a.nodi === "forget") {
      root.forget(row.key)
      return
    }
    if (a.nodi) { root.setPref(a, row); return }
    var own = index === 0
    var remembered = own && row.remember
    root.execute(a.run, own ? row.toggle : "", remembered ? row.key : "", remembered ? History.snapshot(row) : null, own ? row.title : a.label, a.undoable)
  }

  function helpBack() {
    input.text = "?"
    input.cursorPosition = 1
    root.selectedIndex = 0
  }

  // ---------------------------------------------------------------- yours

  // Aliases, favourites and hidden rows (lib/Prefs.js), set from Ctrl+K and
  // kept in ~/.local/state/nodi/prefs.json.
  property var prefs: Prefs.empty()
  property bool prefsLoaded: false
  // The row an alias is being made for: the field takes the word, Enter
  // saves it, Esc gives up.
  property var aliasRow: null

  function setPref(a, row) {
    var snap = History.snapshot(row)
    if (a.nodi === "alias") {
      root.aliasRow = row
      input.text = ""
      root.recompute()
      return
    }
    if (a.nodi === "hotkey") {
      root.captureRow = row
      root.captureNote = ""
      Quickshell.execDetached(["hyprctl", "eval", Hotkey.captureStartLua()])
      root.ensureHotkey()
      root.recompute()
      return
    }
    if (a.nodi === "link") {
      root.savePrefs(Prefs.withLink(root.prefs, row.key, snap) || root.prefs)
      Quickshell.execDetached(Run.command(Run.copy(Hotkey.deeplink(root.pluginId, row.key))))
      root.finish()
      return
    }
    var next = a.nodi === "favourite" ? Prefs.toggledFavourite(root.prefs, row.key, snap)
      : a.nodi === "hide" ? Prefs.hiddenRow(root.prefs, row.key, snap)
      : a.nodi === "unalias" ? Prefs.withoutAlias(root.prefs, a.alias)
      : a.nodi === "unhotkey" ? Prefs.withoutHotkey(root.prefs, row.key)
      : null
    if (next) root.savePrefs(next)
    root.recompute()
  }

  function savePrefs(next) {
    var rowKeys = function(p) { var o = {}; for (var c in p.hotkeys) o[c] = p.hotkeys[c].key; return JSON.stringify(o) }
    var keysChanged = rowKeys(root.prefs) !== rowKeys(next)
    root.prefs = next
    if (root.prefsLoaded) prefsFile.setText(Prefs.serialize(next))
    if (keysChanged) root.ensureHotkey()
  }

  // A row that runs only once a word is typed (Rows confirmWord): the field
  // takes the word, Enter on it runs the row, Esc gives it up and the query
  // comes back. { title, word, run, risk, toggle, key, snap, query }.
  property var wordAsk: null

  function askWord(w) {
    w.query = input.text
    root.armedKey = ""
    root.wordAsk = w
    input.text = ""
    root.recompute()
  }

  function endWord() {
    if (!root.wordAsk) return
    var q = root.wordAsk.query
    root.wordAsk = null
    input.text = q
    input.cursorPosition = q.length
    root.recompute()
  }

  // The row a hotkey is being set for: the next chord pressed is it, unless
  // something else holds it; Esc gives up.
  property var captureRow: null
  property string captureNote: ""

  function endCapture() {
    if (!root.captureRow) return
    root.captureRow = null
    Quickshell.execDetached(["hyprctl", "eval", Hotkey.captureEndLua()])
  }

  function captureKey(key, modifiers) {
    if (key === Qt.Key_Escape) { root.endCapture(); root.recompute(); return true }
    var chord = NodiKeys.chord(key, modifiers)
    if (!chord) {
      // A modifier on its own is the start of a chord; anything else is a
      // key the hotkey cannot use.
      if (!NodiKeys.isModifier(key)) { root.captureNote = "That key cannot start a hotkey"; root.recompute() }
      return true
    }
    var taken = Hotkey.holder(root.lastBinds, chord)
    if (taken) { root.captureNote = chord + " opens " + taken; root.recompute(); return true }
    var next = Prefs.withHotkey(root.prefs, chord, root.captureRow.key, History.snapshot(root.captureRow))
    root.endCapture()
    if (next) root.savePrefs(next)
    root.recompute()
    return true
  }

  // A row by its key, from a hotkey or a deeplink: `omarchy-shell shell call
  // io.github.itsgg.nodi runRow '<key>'` (lib/Hotkey.js deeplink). It runs
  // what the row ran when the hotkey or the link was set.
  function runRow(key) {
    // The window focused at the press, as a provider resolving the row sees
    // it, not the one of the bar's last open (Fable 2026-10-05).
    root.noteWindow()
    var saved = Prefs.snapshotFor(root.prefs, String(key || ""), root.history)
    // The row as its provider gives it now, when it can (lib/Engine.js resolve).
    var live = saved ? Engine.resolve(String(key), saved, root.config, root.services()) : null
    var s = live ? History.snapshot(live) : saved
    // A moment's row (a kill by pid) is never run again (lib/History.js).
    var replayable = History.replayable(s)
    var argv = replayable ? Run.command(s.run, root.appAction, String(s.title || "")) : null
    if (!argv) return "unknown row"
    // A row that asks before it runs is run from the bar only: `nodi run`
    // names any remembered row, where a hotkey or a link is never given one.
    if (s.confirm) return "it asks before it runs; open it in the bar"
    // The bar is not open: what is focused now is what a launch replaces,
    // not what was focused when the bar last opened (codex 2026-10-04).
    if (s.run.kind === "app") launchFeedback.opened()
    if (s.undoable && s.run.kind === "exec") undoer.run(argv, s.title)
    else Quickshell.execDetached(argv)
    if (s.run.kind === "app") launchFeedback.begin(s.title)
    root.remember(String(key), "", s)
    if (s.toggle) { root.toggleStates = Toggles.flipped(root.toggleStates, s.toggle); toggleReprobe.restart() }
    return "ok"
  }

  // Enter on a row whose action is Nodi's own.
  function doNodi(row) {
    if (row.nodi === "saveAlias" && root.aliasRow) {
      var next = Prefs.withAlias(root.prefs, input.text, root.aliasRow.key, History.snapshot(root.aliasRow))
      if (next) root.savePrefs(next)
      root.aliasRow = null
      input.text = ""
    } else if (row.nodi === "show") {
      root.savePrefs(Prefs.shownRow(root.prefs, row.key))
    } else if (row.nodi === "ask") {
      var q = input.text.replace(/^\s*ask\s+/i, "").trim()
      if (q) askSession.send(q)
    } else if (row.nodi === "runWord" && root.wordAsk) {
      if (input.text.trim() !== root.wordAsk.word) return
      var w = root.wordAsk
      root.wordAsk = null
      // The query is what the row was picked for, not the word (Fable
      // 2026-10-05: typing "send" later lifted the row).
      input.text = w.query
      root.execute(w.run, w.toggle, w.key, w.snap, w.title, w.undoable)
      return
    } else if (row.nodi === "undo") {
      // Enter twice: the empty bar opens on it, and one Enter there is too
      // easily the Enter for the row under it.
      if (root.armedKey !== row.key) { root.armedKey = row.key; return }
      root.armedKey = ""
      var u = undoer.take(row.key)
      if (u) root.execute(u.run, "", "", null, u.title, false)
      return
    } else if (row.nodi === "answer") {
      var spec = Answers.spec(input.text, root.config.answers, root.cameFrom)
      if (spec) answerSession.start(spec)
    } else if (row.nodi === "pick" && root.pickSession) {
      var line = Pick.lineOf(row.key)
      if (line < 0) return
      root.endPick("pick " + line)
      root.dismiss()
      return
    }
    root.recompute()
  }

  // ---------------------------------------------------------------- nodi pick

  // `nodi pick` (bin/nodi, components/PickSession.qml): the rows a program
  // gave on stdin, in the bar until one is chosen or the bar closes. The
  // field gets back what it held once the pick ends, so a pick never
  // becomes the query the bar remembers.
  readonly property var pickSession: picks.current

  function pick(argJson) { return picks.request(argJson, input.text) }
  // Asked by bin/nodi while it waits, so a bar reloaded mid-pick ends it.
  function pickAlive(id) { return picks.alive(id) }
  function endPick(answer) { picks.end(answer) }

  PickSession {
    id: picks
    onReady: root.open(JSON.stringify({ query: "", pick: picks.current.id }))
    onEnded: function(before) { input.text = before }
  }

  FileView {
    id: prefsFile
    path: root.stateDir + "/prefs.json"
    printErrors: false
    atomicWrites: true
    onLoaded: { root.prefs = Prefs.load(text()); root.prefsLoaded = true }
    onLoadFailed: root.prefsLoaded = true
  }

  // ---------------------------------------------------------------- keys

  // The card's field and list, by the names the functions here use.
  readonly property alias input: card.input
  readonly property alias list: card.list

  function focusInput() { input.forceActiveFocus() }

  // A new query: nothing armed, the palette closed, the top row selected;
  // in `ask `, the session starts warming while the question is typed.
  function queryChanged() {
    root.typedSinceOpen = true
    if (!root.recalling) root.recallAt = -1
    root.trail = PickLog.typed(root.trail, Match.normalise(input.text))
    if (/^\s*ask\s/i.test(input.text)) askSession.warm()
    root.armedKey = ""
    root.paletteOpen = false
    root.selectedIndex = 0
    root.recompute()
  }

  // A key in the field: true when Nodi took it.
  function handleKey(key, modifiers, repeat) {
    if (root.captureRow) return repeat ? true : root.captureKey(key, modifiers)
    var name = root.keyName(key)
    if (!name) return false
    var act = NodiKeys.decide({ name: name, ctrl: (modifiers & Qt.ControlModifier) !== 0, shift: (modifiers & Qt.ShiftModifier) !== 0,
                               repeat: !!repeat }, root.keyView())
    if (!act) return false
    root.perform(act)
    return true
  }


  // The keys lib/Keys.js decides on, by name; any other key is typing.
  function keyName(key) {
    switch (key) {
    case Qt.Key_Escape: return "Escape"
    case Qt.Key_Return: return "Return"
    case Qt.Key_Enter: return "Enter"
    case Qt.Key_Tab: return "Tab"
    case Qt.Key_Up: return "Up"
    case Qt.Key_Down: return "Down"
    case Qt.Key_Backspace: return "Backspace"
    case Qt.Key_K: return "K"
    case Qt.Key_N: return "N"
    case Qt.Key_P: return "P"
    case Qt.Key_D: return "D"
    case Qt.Key_U: return "U"
    case Qt.Key_W: return "W"
    case Qt.Key_E: return "E"
    case Qt.Key_F: return "F"
    case Qt.Key_B: return "B"
    case Qt.Key_R: return "R"
    case Qt.Key_PageUp: return "PageUp"
    case Qt.Key_PageDown: return "PageDown"
    }
    return key >= Qt.Key_1 && key <= Qt.Key_9 ? String(key - Qt.Key_1 + 1) : ""
  }

  // What the keys need to know of the screen.
  function keyView() {
    return {
      palette: root.paletteOpen ? { count: root.paletteActions.length, index: root.paletteIndex } : null,
      armed: !!root.armedKey,
      helpTopic: root.inHelpTopic && !root.pickSession,
      backToTopics: root.inHelpTopic && !root.pickSession && !input.selectedText && /^\s*\?[a-z]+$/.test(input.text) && root.showingHelp
                    && !!root.rows[0].helpTopic && input.cursorPosition === input.text.length,
      text: input.text,
      prompting: !!root.aliasRow || !!root.wordAsk,
      typed: root.typedSinceOpen,
      pick: !!root.pickSession,
      answering: root.answerShown && answerSession.running,
      rows: root.rows.length,
      selected: root.selectedIndex,
      page: Math.max(1, Math.floor(list.height / Math.max(1, root.rowHeight))),
      pane: card.paneScrolls
    }
  }

  // Ctrl+R: the queries picks were made for, newest first, one older on
  // each press, the one in the field skipped; any other change starts over.
  property var recallList: []
  property int recallAt: -1
  property bool recalling: false

  function recall() {
    if (root.recallAt === -1) {
      var now = Match.normalise(input.text)
      root.recallList = History.recentQueries(root.picks, 50).filter(function(q) { return q !== now })
    }
    if (root.recallList.length === 0) return
    root.recallAt = (root.recallAt + 1) % root.recallList.length
    root.recalling = true
    input.text = root.recallList[root.recallAt]
    input.cursorPosition = input.text.length
    root.recalling = false
  }

  // A readline edit of the field, worked out by lib/Keys.js edited().
  function edit(how) {
    var r = NodiKeys.edited(how, input.text, input.cursorPosition, input.selectionStart, input.selectionEnd)
    input.deselect()
    if (r.text !== input.text) input.text = r.text
    input.cursorPosition = r.at
  }

  function perform(act) {
    switch (act.do) {
    case "move": root.move(act.by); break
    case "select": root.armedKey = ""; root.selectedIndex = act.index; card.keepVisible(act.index); break
    case "paneScroll": card.scrollPane(act.lines, 0); break
    case "panePage": card.scrollPane(0, act.by); break
    case "activate": root.selectedIndex = act.index; root.activate(act.index); break
    case "complete":
      // Tab fills in what the row offers; with nothing to fill in, it asks
      // the query (providers/ask.js), as Raycast's Tab to AI does.
      if (root.selectedRow && Rows.canComplete(root.selectedRow)) root.complete(root.selectedRow)
      else if (input.text.trim() && !root.mode && !root.aliasRow && !root.captureRow && !root.wordAsk && !root.pickSession) { input.text = "ask " + input.text.trim(); input.cursorPosition = input.text.length }
      break
    case "copy":
      var r = root.rows[act.index]
      if (r && r.copy) root.execute(Run.copy(r.copy), "", "", null, r.title)
      break
    case "palette": root.openPalette(); break
    case "paletteClose": root.paletteOpen = false; break
    case "paletteMove": root.paletteIndex = act.to; root.paletteArmed = ""; break
    case "paletteRun": root.runPaletteAction(act.index); break
    case "disarm": root.armedKey = ""; break
    case "helpBack": root.helpBack(); break
    case "dismiss": root.dismiss(); break
    case "stopAnswer": answerSession.stop(); break
    case "edit": root.edit(act.how); break
    case "recall": root.recall(); break
    case "cancelPrompt":
      if (root.wordAsk) { root.endWord(); break }
      root.aliasRow = null; input.text = ""; root.recompute(); break
    }
  }

  onConfigChanged: {
    if (root.opened) root.recompute()
    root.zonesFetchedAt = 0
    root.ensureHotkey()
    root.describeApps()
  }

  // ---------------------------------------------------------------- hotkey

  // Nodi binds its own hotkey in the running Hyprland (hyprctl eval): no
  // config file is edited. Hyprland drops runtime binds when its config
  // reloads, so this runs again after every reload, after a config change,
  // and at startup. A key something else holds is left alone, asked again
  // once in case the holder is unloading (the old bar on the swap).
  property bool configsLoaded: false
  property string boundHotkey: ""
  property string warnedConflict: ""
  property bool conflictRetried: false
  property bool defaultConfigSeen: false
  property bool userConfigSeen: false

  // One reconcile at a time: a read of the binds, then the eval it plans,
  // finished before the next read, so two reconciles cannot both see the key
  // unbound and bind it twice (codex 2026-10-02). A request during one runs
  // once after it.
  property bool hotkeyQueued: false
  property bool hotkeyFresh: true         // this Nodi has not bound its key yet

  // The hotkey, straight from Hyprland: no process is started for a press.
  GlobalShortcut {
    appid: root.pluginId
    name: "toggle"
    description: "Open or close Nodi"
    onPressed: { root.openBy = root.opened ? "" : "key"; root.toggle() }
  }
  property string lastBinds: "[]"         // the binds as last read, for checking a chord being set
  property var boundRows: ({})            // combo -> the row key this Nodi bound it to
  property var rowConflictsWarned: ({})

  function ensureHotkey() {
    if (!root.configsLoaded) return
    if (bindsReader.busy || evalReader.busy) { root.hotkeyQueued = true; return }
    bindsReader.run(["/usr/bin/hyprctl", "binds", "-j"])
  }

  // Deferred: `finished` is emitted while the reader's process may still
  // count as running, and a request made then would queue with nothing left
  // to start it (Fable 2026-10-02).
  function hotkeyIdle() {
    if (!root.hotkeyQueued) return
    root.hotkeyQueued = false
    Qt.callLater(root.ensureHotkey)
  }

  function reconcileHotkey(bindsJson) {
    var hotkey = String(root.config.hotkey || "").trim()
    if (hotkey && !Hotkey.parseCombo(hotkey) && root.hotkeyWarned !== hotkey) {
      root.hotkeyWarned = hotkey
      Quickshell.execDetached(["notify-send", "-a", "Nodi", "Nodi has no hotkey",
        "\"" + hotkey + "\" is not a key combination. Write it as \"SUPER + SPACE\" in ~/.config/omarchy/extensions/nodi.json."])
    }
    root.lastBinds = bindsJson
    var p = Hotkey.plan(bindsJson, hotkey, root.toggleShortcut, { scrim: root.scrim.a, card: root.background.a }, root.hotkeyFresh)
    if (p.bound) root.hotkeyFresh = false
    // The rows' hotkeys (Ctrl+K, lib/Prefs.js) in the same eval.
    var rows = Hotkey.planRows(bindsJson, root.prefs.hotkeys, root.pluginId, root.boundRows)
    root.boundRows = rows.bound
    for (var c = 0; c < rows.conflicts.length; c++) {
      if (root.rowConflictsWarned[rows.conflicts[c]]) continue
      root.rowConflictsWarned[rows.conflicts[c]] = true
      Quickshell.execDetached(["notify-send", "-a", "Nodi", "A row's hotkey is taken", rows.conflicts[c] + " is bound to something else now; set the row another one from Ctrl+K."])
    }
    var lua = p.lua.concat(rows.lua)
    if (lua.length > 0) evalReader.run(["/usr/bin/hyprctl", "eval", lua.join("\n")])
    else root.hotkeyIdle()
    root.boundHotkey = p.bound ? hotkey : ""
    if (p.conflict && !root.conflictRetried) {
      root.conflictRetried = true
      hotkeyRetry.start()
      return
    }
    if (p.conflict && root.warnedConflict !== hotkey) {
      root.warnedConflict = hotkey
      console.warn("nodi: " + hotkey + " is already used by \"" + p.conflict + "\"; not binding it")
      Quickshell.execDetached(["notify-send", "-a", "Nodi", "Nodi has no hotkey",
        hotkey + " already opens \"" + p.conflict + "\". Set another \"hotkey\" in ~/.config/omarchy/extensions/nodi.json."])
    }
    if (!p.conflict) root.conflictRetried = false
  }

  Reader {
    id: bindsReader
    timeoutMs: 3000
    onFinished: function(text, ok) { if (ok) root.reconcileHotkey(text); else root.hotkeyIdle() }
  }

  Reader {
    id: evalReader
    timeoutMs: 3000
    onFinished: root.hotkeyIdle()
  }

  Timer { id: hotkeyRetry; interval: 3000; onTriggered: root.ensureHotkey() }

  Connections {
    target: Hyprland
    function onRawEvent(event) {
      if (event && String(event.name) === "configreloaded") root.ensureHotkey()
    }
  }

  // Unloading releases the key, unless another Nodi has taken this one's
  // place (lib/Hotkey.js releaseArgv says why and how).
  Component.onDestruction: {
    if (root.captureRow) Quickshell.execDetached(["hyprctl", "eval", Hotkey.captureEndLua()])
    var combos = [Hotkey.parseCombo(root.boundHotkey)].concat(Object.keys(root.prefs.hotkeys).map(Hotkey.parseCombo))
    var argv = Hotkey.releaseArgv(combos, root.pluginId, (root.omarchyPath || "/usr/share/omarchy") + "/bin/omarchy-shell")
    if (argv) Quickshell.execDetached(argv)
  }

  // What the release asks through the shell: a Nodi is loaded.
  function ping() { return "ok" }

  // Both files read once, each counted by itself.
  function configLoaded(which) {
    if (which === "default") root.defaultConfigSeen = true
    if (which === "user") root.userConfigSeen = true
    if (root.defaultConfigSeen && root.userConfigSeen && !root.configsLoaded) {
      root.configsLoaded = true
      hotkeyStart.start()
      hotkeyRecheck.start()
      if (root.configPending) { var e = root.configPending; root.configPending = ""; root.configError(e) }
    }
  }

  Timer { id: hotkeyStart; interval: 600; onTriggered: root.ensureHotkey() }

  // A second look once a reload has settled: whatever an earlier instance
  // did to the key while this one read the binds, the key is bound after.
  // Released keys wait for no successor (Component.onDestruction), so this
  // is the belt for a successor slower to load than that wait.
  Timer { id: hotkeyRecheck; interval: 5000; onTriggered: root.ensureHotkey() }

  // ---------------------------------------------------------------- config

  FileView {
    path: root.pluginDir + "/config.default.json"
    watchChanges: true
    printErrors: false
    onLoaded: {
      try { root.defaultConfig = Jsonc.parse(text()) } catch (e) { console.warn("nodi: bad config.default.json: " + e) }
      root.configLoaded("default")
    }
    onFileChanged: reload()
  }

  // A nodi.json that does not parse never takes effect: the last good one
  // stays, or the defaults at startup, and a notification says so once.
  // After startup a change is read again once it has settled, so an editor
  // that empties the file and then writes it is read whole, not halfway.
  function userConfigRead(text) {
    var r = Config.read(text)
    if (r.error) root.configError(r.error)
    else { root.userConfig = r.config; root.userConfigGood = true; root.configWarned = "" }
    root.configLoaded("user")
  }

  Timer { id: userConfigSettle; interval: 300; onTriggered: userConfigFile.reload() }

  FileView {
    id: userConfigFile
    path: root.userConfigPath
    watchChanges: true
    printErrors: false
    onLoaded: root.userConfigRead(text())
    // No file is no settings; one that cannot be read is an error.
    onLoadFailed: function(error) {
      if (error === FileViewError.FileNotFound) root.userConfigRead("")
      else {
        root.configError(error === FileViewError.PermissionDenied ? "it cannot be read: permission denied"
          : error === FileViewError.NotAFile ? "it is not a file" : "it cannot be read")
        root.configLoaded("user")
      }
    }
    onFileChanged: { if (root.configsLoaded) userConfigSettle.restart(); else reload() }
  }

  // Said once both config files are in, so the default hotkey it names is known.
  property string configPending: ""

  function configError(error) {
    console.warn("nodi: " + root.userConfigPath + ": " + error)
    if (!root.configsLoaded) { root.configPending = error; return }
    if (root.configWarned === error) return
    root.configWarned = error
    var keeping = root.userConfigGood ? "Keeping the last settings that worked."
      : "Using the defaults until it is fixed; the hotkey is " + String(root.config.hotkey || "") + "."
    Quickshell.execDetached(["notify-send", "-a", "Nodi", "nodi.json has an error", error + ". " + keeping])
  }

  // ---------------------------------------------------------------- cache

  Reader {
    id: cacheMaker
    timeoutMs: 3000
    onFinished: function(text, ok) { root.cacheReady = ok; if (ok) root.describeApps() }
  }

  FileView {
    id: historyFile
    path: root.cacheDir + "/history.json"
    printErrors: false
    atomicWrites: true
    onLoaded: {
      var loaded = History.load(text())
      root.history = loaded.rows
      root.picks = loaded.picks
    }
    // No history yet: start from the launch counts the old bar left, if any.
    onLoadFailed: launchesFile.reload()
  }

  FileView {
    id: launchesFile
    path: root.cacheDir + "/launches.json"
    printErrors: false
    blockLoading: false
    preload: false
    onLoaded: {
      try { root.history = History.fromLaunches(JSON.parse(text()) || {}, Date.now()) } catch (e) {}
    }
  }

  function remember(key, query, snap) {
    var now = Date.now()
    root.history = History.record(root.history, key, now, snap)
    if (query) root.picks = History.pick(root.picks, query, key, now)
    root.saveHistory()
  }

  // "Reset ranking": the row goes back to where its name alone puts it.
  function forget(key) {
    var f = History.forget(root.history, root.picks, key)
    root.history = f.rows
    root.picks = f.picks
    root.saveHistory()
    root.recompute()
  }

  function saveHistory() {
    if (root.cacheReady) historyFile.setText(History.serialize(root.history, root.picks))
  }

  // What Omarchy's launcher shows while a slow app starts.
  LaunchFeedback { id: launchFeedback }

  // Actions that say how to take them back (lib/Undo.js).
  Undoer {
    id: undoer
    env: ({ PATH: Quickshell.env("PATH") || "" })
    onEntriesChanged: if (root.opened) root.recompute()
    onFailed: function(title, why) { Quickshell.execDetached(["notify-send", "-a", "Nodi", (title || "An action") + " failed", why]) }
  }

  // An answer a program of yours streams (providers/answers.js).
  Answer {
    id: answerSession
    env: ({ PATH: Quickshell.env("PATH") || "" })
    onPhaseChanged: if (root.opened) root.recompute()
  }

  // A quick answer from Claude, held open (components/Ask.qml).
  Ask {
    id: askSession
    model: String((root.config.ask && root.config.ask.model) || "haiku")
    workDir: root.cacheDir + "/ask"
    onPhaseChanged: if (root.opened) root.recompute()
  }

  // The answer the card shows, while the query is the question it answers.
  readonly property bool asking: /^\s*ask\s/i.test(input.text)
  readonly property string askShown: root.asking && askSession.phase !== "idle"
    && askSession.question === input.text.replace(/^\s*ask\s+/i, "").trim() ? askSession.answer : ""
  // A streamed answer (providers/answers.js), while the query is its question.
  readonly property bool answerShown: Answers.shown(input.text, root.config.answers,
    { phase: answerSession.phase, keyword: answerSession.keyword, question: answerSession.question })
  // The pane beside the list (item 26), as lib/Pane.js chooses it.
  readonly property bool anyPreview: root.rows.some(Pane.hasPane)
  readonly property var preview: root.readPreview(Pane.choose({
    paletteOpen: root.paletteOpen,
    ask: root.askShown !== "" ? { question: askSession.question, model: askSession.model, text: root.askShown } : null,
    answer: root.answerShown ? { question: answerSession.question, title: answerSession.title, text: answerSession.text, seq: answerSession.seq } : null,
    word: root.wordAsk,
    palette: root.paletteOpen ? { row: root.paletteRow, action: root.paletteActions[root.paletteIndex] || null, actions: root.paletteActions,
                                  armed: !!root.paletteArmed && !!root.paletteActions[root.paletteIndex] && root.paletteArmed === root.paletteActions[root.paletteIndex].label } : null,
    row: root.selectedRow, armed: !!root.selectedRow && root.armedKey === root.selectedRow.key, anyPreview: root.anyPreview
  }))

  // A preview that names a read gets it now, for the selected row only; the
  // read's arrival recomputes the rows, and this binding with them.
  function readPreview(p) {
    if (!p || !p.read) return p
    return Rows.withRead(p, requests.request(p.read.source, p.read.param), function(ms) {
      return Qt.formatDateTime(new Date(ms), "yyyy-MM-dd HH:mm")
    })
  }

  // Media, audio devices, Bluetooth, Wi-Fi and the battery, as they are.
  Desktop { id: desktopState }

  // While a desktop row is on screen it is read again every two seconds,
  // so a track paused or a device disconnected elsewhere shows (codex
  // 2026-10-04); a snapshot costs 0.04 ms, measured in Quickshell.
  // Only when something changed since the rows were built (services()
  // records what they were built from): a recompute rebuilds the list and
  // would snap a scrolled one back to the selected row (Fable 2026-10-04).
  Timer {
    id: desktopTimer
    property string seen: ""
    interval: 2000
    repeat: true
    running: root.opened && root.rows.some(function(r) { return r.provider === "desktop" })
    onTriggered: if (JSON.stringify(desktopState.snapshot()) !== seen) root.recompute()
  }

  // ---------------------------------------------------------------- reads

  // What providers ask for through ctx.request (lib/Requests.js): the
  // process list, a directory, exchange rates, Omarchy's command list. Each
  // arrival recomputes the bar while it is open.
  Requests {
    id: requests
    providers: Engine.providers()
    env: ({ user: root.user, home: root.home, cacheDir: root.cacheDir, path: Quickshell.env("PATH") || "" })
    onArrived: if (root.opened) root.recompute()
  }

  // The rates saved by the last read, so conversions work offline from the
  // start; a read replaces them only after the API's next-update time.
  FileView {
    path: root.cacheDir + "/rates.json"
    printErrors: false
    onLoaded: requests.seed("rates", "", text(), Date.now())
  }

  // ---------------------------------------------------------------- zones

  function refreshZones() {
    if (zonesReader.busy || Date.now() - root.zonesFetchedAt < 60 * 60 * 1000) return
    var t = root.config.time || {}
    var extra = (t.zones || []).concat(t.home ? [t.home] : [])
    // "@local Europe/Berlin" first, then "zone +hhmm ABBR" per zone.
    zonesReader.run(["/usr/bin/bash", "-c",
      "lz=$(timedatectl show -p Timezone --value 2>/dev/null); "
      + "[ -n \"$lz\" ] || lz=$(readlink /etc/localtime 2>/dev/null | sed 's|.*/zoneinfo/||'); "
      + "echo \"@local $lz\"; "
      + "for z in \"$@\" $lz; do printf '%s ' \"$z\"; TZ=\"$z\" date +'%z %Z'; done", "nodi-zones"].concat(Tz.allZones(extra)))
  }

  Reader {
    id: zonesReader
    timeoutMs: 5000
    onFinished: function(text, ok) {
      // A failed or cut read keeps the zones there were and is tried again
      // in a minute, not an hour (codex 2026-10-04).
      if (!ok) { root.zonesFetchedAt = Date.now() - 59 * 60 * 1000; return }
      var z = Sources.zones(text)
      root.zones = z.zones
      if (z.local) root.localZone = z.local
      root.zonesFetchedAt = Date.now()
      if (root.opened) root.recompute()
    }
  }

  // ---------------------------------------------------------------- emoji

  FileView {
    path: root.omarchyPath + "/shell/plugins/emojis/emojis.json"
    printErrors: false
    onLoaded: {
      try {
        var data = JSON.parse(text())
        root.emojis = Array.isArray(data) ? data : []
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
    var values = DesktopEntries.applications.values || []
    for (var i = 0; i < values.length; i++) {
      var e = values[i]
      var id = String(e.id || "")
      if (!id || e.noDisplay || root.hiddenApps[id]) continue
      var keywords = []
      try { for (var k = 0; k < e.keywords.length; k++) keywords.push(String(e.keywords[k])) } catch (err) {}
      var actions = []
      try { for (var a = 0; a < e.actions.length; a++) actions.push({ index: a, id: String(e.actions[a].id || ""), name: String(e.actions[a].name || "") }) } catch (err2) {}
      byId[id] = e
      list.push({ id: id, name: String(e.name || id), generic: String(e.genericName || ""), comment: String(e.comment || ""),
                  keywords: keywords, icon: String(e.icon || ""), wmclass: String(e.startupClass || ""), actions: actions,
                  exec: String(e.execString || ""), terminal: !!e.runInTerminal })
    }
    root.appEntries = byId
    root.apps = list
    if (root.opened) root.recompute()
    root.describeApps()
  }

  function iconSource(icon) {
    var value = String(icon || "")
    if (value.charAt(0) === "/") return Rows.fileUrl(value)
    var themed = value ? Quickshell.iconPath(value, true) : ""
    return themed || Quickshell.iconPath("application-x-executable", true)
  }

  Timer { id: appsDebounce; interval: 300; onTriggered: root.rebuildApps() }

  Connections {
    target: DesktopEntries.applications
    function onValuesChanged() { appsDebounce.restart() }
  }

  FileView {
    path: root.omarchyPath + "/default/omarchy/launcher.hides"
    watchChanges: true
    printErrors: false
    onLoaded: { root.hiddenApps = Sources.hidden(text()); appsDebounce.restart() }
    onFileChanged: reload()
  }

  // ---------------------------------------------------------------- app descriptions

  // A few words on what an app is for, for the apps whose entry says nothing
  // of it (lib/Describe.js): Omarchy's own from a table, the rest from
  // Claude when "apps": { "describe": true } is set, asked once per app in
  // one batch and kept in ~/.cache/nodi/app-descriptions.json; a new app is
  // asked about when the list is rebuilt. A failed ask waits an hour.
  property var appDescriptions: ({})
  property bool descriptionsLoaded: false
  property real describeFailedAt: 0

  function describeApps() {
    if (!root.descriptionsLoaded || !root.cacheReady || !(root.config.apps && root.config.apps.describe === true)) return
    if (describer.busy || Date.now() - root.describeFailedAt < 60 * 60 * 1000) return
    var list = Describe.wanted(root.apps, root.appDescriptions, Apps.undescribed)
    if (list.length === 0) return
    describer.run(Describe.argv(String((root.config.ask && root.config.ask.model) || "haiku"), list, root.cacheDir + "/ask"), list)
  }

  Reader {
    id: describer
    timeoutMs: 60000
    onFinished: function(text, ok, tag) {
      var fresh = ok ? Describe.parse(text, tag || []) : null
      if (!fresh) {
        root.describeFailedAt = Date.now()
        console.warn("nodi: describing apps failed; asking again in an hour")
        return
      }
      root.appDescriptions = Describe.merged(root.appDescriptions, fresh)
      descriptionsFile.setText(Describe.serialize(root.appDescriptions))
      if (root.opened) root.recompute()
      // A batch is at most forty apps; the next one, if any, after this.
      Qt.callLater(root.describeApps)
    }
  }

  FileView {
    id: descriptionsFile
    path: root.cacheDir + "/app-descriptions.json"
    printErrors: false
    atomicWrites: true
    onLoaded: { root.appDescriptions = Describe.load(text()); root.descriptionsLoaded = true; root.describeApps() }
    onLoadFailed: { root.descriptionsLoaded = true; root.describeApps() }
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
    root.windows = w.list
    root.activeWorkspace = w.activeWorkspace
    if (root.cameFromTop) root.cameFrom = Sources.windowContext(root.cameFromTop, w.list)
  }

  // A burst of records (one per window on a refresh) read once.
  Timer { id: windowsSettle; interval: 30; onTriggered: { root.readWindows(); if (root.opened) root.recompute() } }
  Timer { id: windowsAsk; interval: 120; onTriggered: root.refreshWindows() }

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
    function onRawEvent(event) { if (event && root.windowEvents[String(event.name)] === true) windowsAsk.restart() }
  }

  // ---------------------------------------------------------------- Omarchy's menu

  function rebuildMenu() {
    var merged = Menu.merge([root.menuDefault, root.menuUser])
    // The last guard answers stay until the new ones land; they are keyed by id.
    root.menu = { items: merged.items, order: merged.order, when: root.menu.when, checked: root.menu.checked }
    root.evaluateGuards()
  }

  function evaluateGuards() {
    var script = Menu.guardScript({ items: root.menu.items, order: root.menu.order })
    if (!script) return
    // A login shell, as Omarchy's menu evaluates them, so a guard sees the
    // PATH the user's profile sets. The order the script's indexes point
    // into travels with the run.
    guardsReader.run(["/usr/bin/bash", "-lc", script], root.menu.order)
  }

  Reader {
    id: guardsReader
    timeoutMs: 20000
    onFinished: function(text, ok, tag) {
      // A batch cut short has not answered every row; keep the last full one.
      if (!ok) return
      var g = Menu.parseGuards(text, { order: tag || [] })
      root.menu = { items: root.menu.items, order: root.menu.order, when: g.when, checked: g.checked }
      root.guardsAt = Date.now()
      if (root.opened) root.recompute()
    }
  }

  FileView {
    path: root.omarchyPath + "/default/omarchy/omarchy-menu.jsonc"
    watchChanges: true
    printErrors: false
    onLoaded: { root.menuDefault = Menu.parseItems(text()); root.rebuildMenu() }
    onLoadFailed: { root.menuDefault = []; root.rebuildMenu() }
    onFileChanged: reload()
  }

  FileView {
    path: root.home + "/.config/omarchy/extensions/omarchy-menu.jsonc"
    watchChanges: true
    printErrors: false
    onLoaded: { root.menuUser = Menu.parseItems(text()); root.rebuildMenu() }
    onLoadFailed: { root.menuUser = []; root.rebuildMenu() }
    onFileChanged: reload()
  }

  // ---------------------------------------------------------------- toggles

  function refreshToggles() {
    togglesReader.run(["/usr/bin/bash", "-c", Toggles.probeScript()])
  }

  Reader {
    id: togglesReader
    timeoutMs: 4000
    onFinished: function(text, ok) {
      root.toggleStates = Toggles.parse(text)
      if (root.opened) root.recompute()
    }
  }

  // After a toggle runs, ask again once its command has had time to land.
  Timer { id: toggleReprobe; interval: 1500; onTriggered: root.refreshToggles() }

  // ---------------------------------------------------------------- reminders

  function refreshReminders() {
    remindersReader.run(["/usr/bin/bash", "-c", "omarchy-reminder show --json"])
  }

  Reader {
    id: remindersReader
    timeoutMs: 3000
    onFinished: function(text, ok) {
      root.reminders = Sources.reminders(text)
      if (root.opened && !input.text.trim()) root.recompute()
    }
  }

  // ---------------------------------------------------------------- themes

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
      root.themes = Sources.themes(text)
      if (root.opened) root.recompute()
    }
  }

  // ---------------------------------------------------------------- clipboard and files

  FileView {
    path: root.home + "/.local/state/omarchy/clipboard-history.json"
    watchChanges: true
    printErrors: false
    onLoaded: { root.clipboard = Sources.clipboard(text()); if (root.opened) root.recompute() }
    onLoadFailed: root.clipboard = []
    onFileChanged: reload()
  }

  FileView {
    path: root.home + "/.local/share/recently-used.xbel"
    watchChanges: true
    printErrors: false
    onLoaded: { root.recentFiles = Sources.recentFiles(text(), 500); if (root.opened) root.recompute() }
    onFileChanged: reload()
  }

  Component.onCompleted: {
    root.refreshWindows()
    cacheMaker.run(["/usr/bin/mkdir", "-p", root.cacheDir, root.stateDir, root.cacheDir + "/ask"])
    appsDebounce.restart()
    requests.request("omarchy-commands")
  }

  // ---------------------------------------------------------------- UI

  PanelWindow {
    id: panel
    visible: root.opened
    anchors { top: true; bottom: true; left: true; right: true }
    color: "transparent"
    WlrLayershell.namespace: Hotkey.NAMESPACE
    WlrLayershell.layer: WlrLayer.Overlay
    WlrLayershell.keyboardFocus: WlrKeyboardFocus.Exclusive
    exclusionMode: ExclusionMode.Ignore

    Rectangle { anchors.fill: parent; color: root.scrim }

    MouseArea { anchors.fill: parent; onClicked: root.dismiss() }

    Card {
      id: card
      nodi: root
      anchors.horizontalCenter: parent.horizontalCenter
      y: Math.round(panel.height * 0.22)
    }
  }
}
