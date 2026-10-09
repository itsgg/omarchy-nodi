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
import "lib/AskTools.js" as AskTools
import "lib/Acp.js" as Acp
import "lib/Agents.js" as Agents
import "lib/Teach.js" as Teach
import "lib/Hotkey.js" as Hotkey
// Not "Keys": that name is QtQuick's attached Keys (Keys.onPressed below).
import "lib/Keys.js" as NodiKeys
import "lib/Config.js" as Config
import "lib/Prefs.js" as Prefs
import "lib/Starters.js" as Starters
import "lib/WindowRules.js" as WindowRules
import "lib/History.js" as History
import "lib/Match.js" as Match
import "lib/tzcities.js" as Tz
import "lib/Describe.js" as Describe
import "lib/Pick.js" as Pick
import "lib/Pane.js" as Pane
import "lib/Opens.js" as Opens
import "lib/PickLog.js" as PickLog
import "lib/Markdown.js" as Markdown
import "lib/Appearance.js" as Appearance
import "lib/Ansi.js" as Ansi
import "providers/apps.js" as Apps
import "providers/answers.js" as Answers
import "providers/calendar.js" as Calendars
import "providers/chooser.js" as Chooser

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
  property var paletteActions: []   // what Ctrl+K shows: paletteAll, filtered by its field
  property var paletteAll: []
  // A script filter's steps (providers/filters.js): { keyword, trail: [{
  // pick, info, data, retv, label, at }] }, the newest last; null when none.
  property var filterStep: null
  property string paletteArmed: ""

  // A pane may show a window as it is now (components/WindowShot.qml):
  // here, inside the shell, never in the offscreen renders' stand-in.
  readonly property bool captures: true
  readonly property string home: Quickshell.env("HOME")
  readonly property string user: Quickshell.env("USER")
  // The shell assigns this on load (shell.qml's plugin loader); readonly
  // would make that assignment throw and stop the shell wiring Nodi in.
  property string omarchyPath: Quickshell.env("OMARCHY_PATH") || "/usr/share/omarchy"
  readonly property string pluginDir: String(Qt.resolvedUrl(".")).replace(/^file:\/\//, "").replace(/\/$/, "")
  readonly property string userConfigPath: home + "/.config/omarchy/extensions/nodi.json"
  readonly property string cacheDir: home + "/.cache/nodi"
  readonly property string stateDir: home + "/.local/state/nodi"
  // What Nodi installs for itself: an agent's ACP adapter (lib/Agents.js).
  readonly property string dataDir: home + "/.local/share/nodi"
  // The hotkey's Hyprland global shortcut, "appid:name" (lib/Hotkey.js plan).
  readonly property string toggleShortcut: pluginId + ":toggle"

  // ---------------------------------------------------------------- data

  property var defaultConfig: ({})
  property var userConfig: ({})
  property bool userConfigGood: false   // a nodi.json has parsed since load
  property string configWarned: ""      // the error last notified, so each is said once
  property string hotkeyWarned: ""
  readonly property var config: Config.merge(defaultConfig, userConfig, root.pluginDir)

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
  Look { id: look; screenWidth: panel.width; screenHeight: panel.height; chrome: card.chrome; highContrast: root.appearance.highContrast
         wide: root.preview !== null || (root.paletteOpen && root.anyPreview) }
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
  readonly property alias selectionBar: look.selectionBar
  readonly property alias barWidth: look.barWidth
  readonly property alias barInset: look.barInset
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
  function paletteHeight(actions) { return look.paletteHeight(actions) }
  readonly property alias cardWidth: look.cardWidth
  readonly property alias listColumn: look.listColumn
  readonly property alias paneMin: look.paneMin
  readonly property alias answerMax: look.answerMax

  readonly property var rows: results
  readonly property bool showingHelp: root.rows.length > 0 && !!root.rows[0].help
  readonly property var selectedRow: root.rows[root.selectedIndex] || null
  // The Ask fallback selected: its session warms, as `ask ` typed warms it,
  // so the Enter that asks finds it up (ROADMAP 87).
  onSelectedRowChanged: if (root.opened && root.selectedRow && root.selectedRow.key === "fallback:ask") askSession.warm()
  // The words the selected row, or else the mode, takes: under the field.
  readonly property string argsHint: root.paletteOpen ? "" : ((root.selectedRow && root.selectedRow.hint) || (root.mode && root.mode.hint) || "")
  // What is typed, an input method's composition in it while it is being
  // composed (Card.composed, ROADMAP 76): what every answer and mode reads,
  // where the field's own text is for editing it.
  readonly property string composedQuery: card.composed
  // The same, read now: a handler of the field's own change runs before
  // the binding above has caught up, and every keystroke read the one
  // before (Sonnet 2026-10-07). Functions read this; bindings the above.
  function queryNow() { return card.composedNow() }
  readonly property bool noResults: root.rows.length === 0 && root.composedQuery.trim() !== ""
  readonly property bool inHelpTopic: /^\s*\?\s*\S/.test(root.composedQuery)
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
    // The window it opened over, first: a payload's query below is
    // answered over it, a script filter's run told of it (Cursor
    // 2026-10-07: noted after, the last window was).
    root.noteWindow()
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
    // The selection is this open's: until it is read there is none, so the
    // last open's rows never lead this one (Fable 2026-10-06). It is read
    // now, before the first frame (one fork, about 20 ms), and the empty
    // bar's rows wait for it, a quarter second at most: read after the
    // frame, the copied text's rows landed over Recent a moment after it
    // showed (his report 2026-10-07).
    root.openGen++
    if (starting) {
      root.selection = ""
      root.selectionFresh = false
      root.homeHeld = true
      homeHold.restart()
    }
    root.readSelection()
    // The other reads that put rows at the top, started now where they
    // apply, so the hold knows they are on their way.
    root.readAhead(true)
    launchFeedback.opened()
    root.opens++
    root.placeholder = root.pickSession ? (root.pickSession.placeholder || "Pick one") : Engine.placeholder(root.config, root.opens)
    root.aliasRow = null
    root.endCapture()
    // The first row before the bar counts as open: the pane's window
    // picture starts as it opens, and took the last open's row first
    // (Cursor 2026-10-07).
    root.selectedIndex = 0
    root.opened = true
    card.hearAfresh()
    root.shownQuery = null
    root.armedKey = ""
    root.closePalette()
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
    // The card is on screen by now: its size changes animate from here on,
    // unless it is still held unseen, when it shows at its size (Cursor
    // 2026-10-07: the reveal grew in 90 ms).
    card.animated = !root.contentHeld
    if (!root.readsPending) return
    root.readsPending = false
    readsAfterFrame.stop()
    root.refreshWindows()
    root.refreshToggles()
    root.refreshAppearance()
    themeColors.reload()
    root.refreshThemes()
    root.refreshReminders()
    root.refreshZones()
    requests.request("omarchy-commands")
    requests.request("agent-usage")
    trayMenus.active = true
    if (Date.now() - root.guardsAt > 60 * 1000) root.evaluateGuards()
  }

  Timer { id: readsAfterFrame; interval: 60; onTriggered: root.startReads() }

  // The text selected in the window you came from, read once an open
  // (providers/selection.js, ROADMAP 47): Wayland's primary selection,
  // which data-control gives a client without the focus. Fresh for two
  // minutes from when it was first seen, as a kept query is: reopened over
  // the same text its rows are still there, and a selection made long ago
  // leads nothing (Fable 2026-10-06: fresh for one open only hid them on
  // the next). Text selected with the mouse in the bar's own field becomes
  // the primary selection too (Qt writes it on a mouse release), so the
  // field's own text is never taken for one.
  // Text copied with Ctrl+C counts too, by the same two minutes: on
  // Wayland a copy sets the clipboard, not the selection (his report
  // 2026-10-06). Of a fresh selection and a fresh copy, the newer leads,
  // the copy on a tie. The read is Sources.SELECTION_READ.
  property string selection: ""
  property bool selectionFresh: false
  property string selectionSource: "selection"   // or "clipboard"
  property string lastSelection: ""
  property real selectionSeenAt: 0
  property string lastCopied: ""
  property real copiedSeenAt: 0

  // This open's read, tagged with it: a read still running from the last
  // open lands as the last open's, and this one's waits behind it (Cursor
  // 2026-10-07).
  property int openGen: 0
  property bool selectionPending: false
  function readSelection() {
    root.selectionPending = true
    selectionReader.run(Sources.selectionArgv(), { gen: root.openGen })
  }

  // The empty bar's rows, held until what may lead them is read: the
  // copied or selected text, and, where they apply, a file dialog's
  // folders and the calendar's events (each read ahead, at start, so an
  // open finds them). Drawn once, whole, they do not move under the eye.
  property bool homeHeld: false
  // Only the empty bar's own rows wait: a pick, an alias, a confirm word
  // or a hotkey being set shows at once (Cursor 2026-10-07: an unseen
  // pick took Enter).
  readonly property bool contentHeld: root.homeHeld && root.composedQuery.trim() === "" && !root.pickSession && !root.aliasRow
                                      && !root.wordAsk && !root.captureRow
  Timer { id: homeHold; interval: 250; onTriggered: root.releaseHome() }
  function providerOn(id) { return (root.config.providers || []).indexOf(id) !== -1 }
  // A read with nothing yet or one on its way holds the rows; a failed one
  // does not (Cursor 2026-10-07: a refresh due when the hold let go moved
  // them after).
  function settled(key) { var e = requests.cache[key]; return !!e && !e.pending }
  function homeReadsIn() {
    if (root.selectionPending) return false
    if (root.providerOn("chooser") && Chooser.dialogOf(root.cameFrom) && !root.settled("chooser-folders")) return false
    var feeds = Calendars.param(root.config.calendar)
    if (feeds && root.providerOn("calendar") && !root.settled("calendar:" + feeds)) return false
    return true
  }
  // Those reads, started if due: at each open where they apply, and at
  // start and on a new config, so an open finds them in hand.
  function readAhead(opening) {
    if (root.providerOn("chooser") && (!opening || Chooser.dialogOf(root.cameFrom))) requests.request("chooser-folders")
    var feeds = Calendars.param(root.config.calendar)
    if (feeds && root.providerOn("calendar")) requests.request("calendar", feeds)
  }
  function settleHome() { if (root.homeHeld && root.homeReadsIn()) root.releaseHome() }
  function releaseHome() {
    if (!root.homeHeld) return
    root.homeHeld = false
    homeHold.stop()
    Opens.stamp(root.openRec, "settled", Date.now())
    if (!root.opened) return
    var top = root.selectedIndex === 0
    var shown = card.animated
    card.animated = false
    root.recompute()
    if (top) root.selectedIndex = 0
    Qt.callLater(function() { card.animated = shown || !root.readsPending })
  }

  // A copy the bar makes itself is no copy of his to act on: seen, and
  // stale (Fable 2026-10-06: "Copied: 96" led the next open).
  function markOwnCopy(text) {
    root.lastCopied = Sources.clean(text)
    root.copiedSeenAt = 0
  }

  Reader {
    id: selectionReader
    timeoutMs: 1000
    maxBytes: 140000
    onFinished: function(text, ok, tag) {
      // The last open's read: this open's own waits behind it.
      if (!tag || tag.gen !== root.openGen) return
      root.selectionPending = false
      // A read that failed or was cut off knows nothing: this open has no
      // text, and what was seen before stays seen (Fable 2026-10-06: it
      // made an old copy look new at the next read).
      var had = root.selection !== ""
      Opens.stamp(root.openRec, "selection", Date.now())
      if (!ok) {
        root.selection = ""
        root.selectionFresh = false
        // Rows made from an earlier read go too (Fable 2026-10-06).
        if (root.homeHeld) {
          root.settleHome()
          if (root.homeHeld && !root.contentHeld && root.opened && had) root.recompute()
        } else if (root.opened && had) root.recompute()
        return
      }
      var both = Sources.selections(text)
      var now = Date.now()
      // Seen as read; the field's own text is then no text to act on, but
      // still seen, so it does not come back as new (Fable 2026-10-06).
      if (both.primary !== root.lastSelection) root.selectionSeenAt = now
      if (both.clipboard !== root.lastCopied) root.copiedSeenAt = now
      root.lastSelection = both.primary
      root.lastCopied = both.clipboard
      var got = both.primary === input.text ? "" : both.primary
      var copied = both.clipboard === input.text ? "" : both.clipboard
      var fresh = got !== "" && now - root.selectionSeenAt < root.keepQueryMs
      var copiedFresh = copied !== "" && now - root.copiedSeenAt < root.keepQueryMs
      // The newer of a fresh selection and a fresh copy, the copy on a tie
      // (both first seen at this read): a copy is deliberate, a primary
      // selection often a double-click's (Fable 2026-10-06: the copy he
      // reported lost to a stale word). Then a stale selection, which
      // `rewrite`, `case` and `tr <language>` still take.
      var copyFirst = copiedFresh && (!fresh || root.copiedSeenAt >= root.selectionSeenAt)
      root.selectionSource = copyFirst ? "clipboard" : "selection"
      root.selection = root.selectionSource === "clipboard" ? copied : got
      root.selectionFresh = fresh || copiedFresh
      got = root.selection
      // Held, the rows are drawn once, now that it is read; a query on show
      // meanwhile (a payload's) is answered with it at once (Cursor
      // 2026-10-07: it waited for the hold).
      if (root.homeHeld) {
        root.settleHome()
        if (root.homeHeld && !root.contentHeld && root.opened) root.recompute()
        return
      }
      // The open began with none: any selection redraws (`tr ta`, `case `),
      // as does one gone since an open while the bar was up, and a fresh
      // one's first row is chosen while he is still at the top, a kept
      // query's too (Fable 2026-10-06).
      if (!root.opened || (got === "" && !had)) return
      var top = root.selectionFresh && root.selectedIndex === 0
      root.recompute()
      if (top) root.selectedIndex = 0
    }
  }

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
    root.closePalette()
    root.endSteps()
    // Nothing of a step is kept past the open (providers/filters.js).
    requests.forget("filter-step")
    trayMenus.active = false
    root.aliasRow = null
    root.endWord()
    root.endCapture()
    // Claude's conversation goes on (ROADMAP 43), so a kept question sent
    // with its text is asked again with it; a run it waits on is refused.
    askSession.hidden()
    // Nobody sees an answer once the bar is closed: it stops, and the next
    // open asks afresh.
    answerSession.reset()
  }

  function dismiss() {
    root.close()
    if (root.shell && typeof root.shell.hide === "function") root.shell.hide(root.pluginId)
  }

  // After an action the bar starts empty next time; a plain close keeps the query.
  // Emptied after the close too: a pick or a confirm word the close ends
  // gives the field back what it held, which an action's close must not
  // keep (Fable 2026-10-06: Claude's run landing while one was open).
  function finish() {
    input.text = ""
    root.selectedIndex = 0
    root.dismiss()
    if (input.text !== "") input.text = ""
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
    // The first frame that shows the card: one held is not seen (contentHeld).
    function onFrameSwapped() { if (root.openRec && root.openRec.frame === -1 && !root.contentHeld) Opens.stamp(root.openRec, "frame", Date.now()) }
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
    return {
      zones: root.zones, localZone: root.localZone,
      emojis: root.emojis, apps: root.apps, windows: root.windows, history: root.history, picks: root.picks, reminders: root.reminders,
      activeWorkspace: root.activeWorkspace, clipboard: root.clipboard, files: root.recentFiles, menu: root.menu,
      toggleStates: root.toggleStates, themes: root.themes, home: root.home, descriptions: root.appDescriptions,
      request: requests.request,
      pluginId: root.pluginId,
      tray: trayMenus.entries,
      filterStep: root.filterStep,
      session: root.closedAt,
      prefs: root.prefs,
      ask: { phase: askSession.phase, question: askSession.question, answer: askSession.answer, error: askSession.error,
             agent: askSession.agentName, model: askSession.modelName, status: askSession.status, activity: askSession.activity,
             proposal: root.proposed(), context: askSession.context, capturing: windowShot.active, install: askSession.install },
      answer: { phase: answerSession.phase, keyword: answerSession.keyword, question: answerSession.question, text: answerSession.text,
                error: answerSession.error },
      window: root.cameFrom,
      selection: { text: root.selection, fresh: root.selectionFresh, source: root.selectionSource, clipboard: root.lastCopied },
      undo: undoer.entries,
      desktop: desktop
    }
  }

  // The keys of the rows on screen, as far as a card shows them.
  function shownKeys() { return root.rows.slice(0, 8).map(function(r) { return r.key }).join("\u0001") }

  function recompute() {
    var before = { query: root.shownQuery, key: root.selectedRow ? root.selectedRow.key : "", index: root.selectedIndex }
    var keysBefore = root.shownKeys()
    if (root.captureRow) {
      root.results = Engine.hotkeyPrompt(root.captureRow, root.captureNote)
      root.mode = { label: "Hotkey", icon: "󰌌" }
    } else if (root.aliasRow) {
      root.results = Engine.aliasPrompt(root.queryNow(), root.aliasRow)
      root.mode = { label: "Alias", icon: "󰌌" }
    } else if (root.wordAsk) {
      root.results = Engine.wordPrompt(root.queryNow(), root.wordAsk)
      root.mode = { label: "Confirm", icon: "󰀦" }
    } else if (root.pickSession) {
      root.results = Pick.rows(root.queryNow(), root.pickSession.rows || [])
      root.mode = { label: "Pick", icon: Pick.PROVIDER.icon }
    } else {
      var svc = root.services()
      // The empty bar while what may lead it is still being read: nothing
      // yet, rather than rows that move when it lands.
      root.results = root.homeHeld && root.queryNow().trim() === "" ? [] : Engine.run(root.queryNow(), root.config, svc)
      // The desktop the rows show, so the timer redraws them when it moves;
      // a search for Claude does not count (Fable 2026-10-06).
      desktopTimer.seen = JSON.stringify(svc.desktop)
      root.mode = Engine.mode(root.queryNow(), root.config, root.results)
      if (root.opened) root.noteReached(Starters.reachedBy(root.results[0]))
      // A step names where it is: "Wi-Fi > Home".
      if (root.filterStep && root.mode && root.filterStep.trail.length)
        root.mode = { label: root.mode.label + " > " + root.filterStep.trail[root.filterStep.trail.length - 1].label, icon: root.mode.icon, hint: root.mode.hint }
      // A step that printed nothing has done its work: the bar goes, as
      // rofi does when its script prints nothing.
      if (root.opened && root.results.length === 1 && root.results[0].nodi === "filterDone")
        Qt.callLater(function() { if (root.opened) root.finish() })
    }
    root.selectedIndex = NodiKeys.reselect(before, root.rows, root.queryNow())
    // Rows that changed on screen after the first frame, in the open's
    // first three seconds, with nothing typed (blank to full counts): the
    // open's jank (lib/Opens.js moved).
    if (root.openRec && root.openRec.frame >= 0 && !root.typedSinceOpen && Date.now() - root.openRec.at < 3000 && keysBefore !== root.shownKeys())
      root.openRec.moved++
    root.shownQuery = root.queryNow()
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
    // A fallback picked when nothing matched, logged by its key, so their
    // order can be set from his use (ROADMAP 87); the bar remembers none.
    // Not an Ask that cannot be asked now (Fable 2026-10-07: logged, then
    // logged again when it could).
    if (row.provider === "fallback" && !(row.nodi === "askWith" && (askSession.busy() || windowShot.active))) {
      var q = Match.normalise(root.queryNow())
      if (q && !root.pickSession) root.logPick(PickLog.entry(Date.now(), root.trail, q, row.key, root.rows))
    }
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
      // A run that did not start teaches nothing.
      if (root.execute(row.run, row.toggle, row.remember ? row.key : "", History.snapshot(row), row.title, row.undoable)) root.teach(row)
      return
    }
    if (row.complete && !row.copy) { root.complete(row); return }
    if (row.copy) root.execute(Run.copy(row.copy), "", row.remember ? row.key : "", null)
  }

  // The keys for what he just ran by hand, the first few times, in
  // Omarchy's on-screen display as the bar closes (lib/Teach.js, ROADMAP
  // 86); only from Enter or a click here, never from the row's own hotkey
  // or an agent's run.
  property var taught: ({})
  property bool taughtLoaded: false
  function teach(row) {
    if (root.config.teach === false || !root.taughtLoaded || !root.cacheReady) return
    var keys = Teach.keysFor(row, root.boundRows)
    if (!Teach.due(root.taught, row.key, keys)) return
    root.taught = Teach.noted(root.taught, row.key, keys, Date.now())
    taughtFile.setText(Teach.serialize(root.taught))
    Quickshell.execDetached(["omarchy-osd"].concat(Teach.osdArgs(keys)))
  }
  FileView {
    id: taughtFile
    path: root.cacheDir + "/taught.json"
    printErrors: false
    atomicWrites: true
    onLoaded: { root.taught = Teach.parse(text()); root.taughtLoaded = true }
    onLoadFailed: root.taughtLoaded = true
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
    // A paste goes to the window the bar opened over, focused first.
    var argv = Run.command(run, root.appAction, undoable && run.kind === "exec" ? "" : (name || (snap && snap.title) || ""),
                           root.cameFrom ? root.cameFrom.address : "")
    if (!argv) return false
    if (run.kind === "copy") root.markOwnCopy(run.text)
    var query = Match.normalise(root.queryNow())
    // What was typed and shown, before the bar empties (lib/PickLog.js);
    // a pick's choice ranks nothing.
    if (key && query && !root.pickSession) root.logPick(PickLog.entry(Date.now(), root.trail, query, key, root.rows))
    root.finish()
    if (undoable && run.kind === "exec" && Array.isArray(argv)) undoer.run(argv, name || (snap && snap.title) || "")
    else Quickshell.execDetached(argv)
    if (run.kind === "app") launchFeedback.begin(name || (snap && snap.title) || run.id)
    if (key) root.remember(key, query, snap)
    if (toggleId) {
      root.toggleStates = Toggles.flipped(root.toggleStates, toggleId)
      toggleReprobe.restart()
    }
    return true
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

  // Ctrl+K takes what is typed in a field of its own (Card.qml
  // paletteInput), so the query, and all that reads it, stays as it was
  // (ROADMAP 52).
  // Whether it opened: a row may have no actions (a prompt's, Nodi's own).
  function openPalette() {
    var acts = Rows.actionsFor(root.selectedRow, root.paletteContext())
    if (acts.length === 0) return false
    // Noted as the palette closes: its starter must not go from under it,
    // as a toggle's or a reminder's redraw would take it (Cursor 2026-10-07).
    root.reachOnClose = "actions"
    root.paletteRow = root.selectedRow
    root.paletteAll = acts
    root.paletteActions = Rows.filterActions(acts, "")
    root.paletteIndex = 0
    root.paletteArmed = ""
    root.paletteOpen = true
    card.paletteInput.text = ""
    card.paletteInput.forceActiveFocus()
    return true
  }

  function closePalette() {
    if (!root.paletteOpen) return
    root.paletteOpen = false
    card.paletteInput.text = ""
    root.paletteAll = []
    root.paletteActions = []
    input.forceActiveFocus()
    var reached = root.reachOnClose
    root.reachOnClose = ""
    if (root.noteReached(reached) && root.opened && root.queryNow().trim() === "") root.recompute()
  }
  property string reachOnClose: ""

  // What is typed into Ctrl+K: the actions it matches, the first selected.
  function paletteTyped(text) {
    if (!root.paletteOpen) return
    root.paletteActions = Rows.filterActions(root.paletteAll, text)
    root.paletteIndex = 0
    root.paletteArmed = ""
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
    var row = root.paletteRow
    root.closePalette()
    if (row) root.runAction(row, a)
  }

  // An action's chord (lib/Rows.js CHORDS): on the row Ctrl+K opened for,
  // or the selected one. None of them asks first.
  function chordActions() {
    if (root.paletteOpen) return root.paletteAll
    if (root.aliasRow || root.wordAsk || root.pickSession || root.captureRow || !root.selectedRow) return []
    return Rows.actionsFor(root.selectedRow, root.paletteContext())
  }

  // The chord keys at hand. "copy" whenever the row holds a copy, as
  // Ctrl+Enter copies it from the list: a row whose own action is the copy
  // has no Copy action to carry it (Sonnet 2026-10-06).
  function chordKeys() {
    var keys = root.chordActions().map(function(a) { return a.chordKey }).filter(function(k) { return k !== "" })
    var row = root.paletteOpen ? root.paletteRow : root.selectedRow
    if (row && row.copy && keys.indexOf("copy") === -1) keys.push("copy")
    return keys
  }

  function runChord(key) {
    var acts = root.chordActions()
    var row = root.paletteOpen ? root.paletteRow : root.selectedRow
    if (!row) return
    for (var i = 0; i < acts.length; i++) {
      if (acts[i].chordKey !== key || acts[i].confirm) continue
      root.closePalette()
      root.runAction(row, acts[i])
      return
    }
    if (key === "copy" && row.copy) {
      root.closePalette()
      root.execute(Run.copy(row.copy), "", "", null, row.title)
    }
  }

  // Ctrl+K's action, chosen there or by its chord. `own` is the row's own,
  // which a filtered list may not have first.
  function runAction(row, a) {
    if (a.confirmWord) {
      var mine = a.own && row.remember
      root.askWord({ title: a.own ? row.title : a.label, word: a.confirmWord, run: a.run, risk: a.risk,
                     toggle: a.own ? row.toggle : "", key: mine ? row.key : "", snap: mine ? History.snapshot(row) : null, undoable: a.undoable })
      return
    }
    if (a.nodi === "forget") {
      root.forget(row.key)
      return
    }
    if (a.nodi === "complete") { root.complete(row); return }
    if (a.nodi) { root.setPref(a, row); return }
    var own = !!a.own
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
      root.markOwnCopy(Hotkey.deeplink(root.pluginId, row.key))
      Quickshell.execDetached(Run.command(Run.copy(Hotkey.deeplink(root.pluginId, row.key))))
      root.finish()
      return
    }
    if (a.nodi === "windowRule") { root.setWindowRule(a, row); root.recompute(); return }
    var next = a.nodi === "favourite" ? Prefs.toggledFavourite(root.prefs, row.key, snap)
      : a.nodi === "pinClip" ? Prefs.toggledPin(root.prefs, row.key, row.pin)
      : a.nodi === "hide" ? Prefs.hiddenRow(root.prefs, row.key, snap)
      : a.nodi === "unalias" ? Prefs.withoutAlias(root.prefs, a.alias)
      : a.nodi === "unhotkey" ? Prefs.withoutHotkey(root.prefs, row.key)
      : null
    if (next) root.savePrefs(next)
    root.recompute()
  }

  // What a starter teaches was reached, by it or any other way: that
  // starter goes (lib/Starters.js). Once the prefs are read, so a mark is
  // never made on the empty prefs a load then replaces (one made before
  // waits for them); and once a kind.
  function noteReached(id) {
    if (!id) return false
    if (!root.prefsLoaded) {
      if (root.reachQueued.indexOf(id) === -1) root.reachQueued = root.reachQueued.concat([id])
      return false
    }
    var next = Prefs.withTried(root.prefs, id)
    if (next) root.savePrefs(next)
    return !!next
  }
  // Reached before the prefs were read: noted once they are.
  property var reachQueued: []
  function noteQueued() {
    var q = root.reachQueued
    root.reachQueued = []
    for (var i = 0; i < q.length; i++) root.noteReached(q[i])
  }

  // A window rule from Ctrl+K or taken back from ?mine (lib/WindowRules.js):
  // kept, handed to Hyprland at once, and the window floated now when its
  // app is to float.
  function setWindowRule(a, row) {
    var w = a.window || {}
    var next = Prefs.withRule(root.prefs, w.cls, w.app, a.change)
    // Past fifty, or past what one hyprctl call takes: said, not dropped
    // without a word (Fable 2026-10-07). Floating this window needs no rule.
    if (!next) Quickshell.execDetached(["notify-send", "-a", "Nodi", "Window rule not kept",
      "Nodi keeps fifty at most, and they must fit one hyprctl call. Take one back in ?mine."])
    else {
      root.savePrefs(next)
      root.applyRules()
    }
    if (a.change.float === true && row.run && row.run.kind === "window") {
      var f = Run.floatWindow(row.run.address, "enable")
      if (f) Quickshell.execDetached(Run.command(f))
    }
  }

  // Hyprland's rules of Nodi's made exactly the ones kept, all of them each
  // time (lib/WindowRules.js): after the prefs are read, after each config
  // reload, which drops them, and after each change. One reader, so a
  // change asked while one is on its way replaces the one waiting, and
  // the last one wins; a failed eval is tried again three times.
  // Asked anew (prefs read, a reload, a change), it may be tried three
  // times again: a count left from an earlier failure never runs out.
  function applyRules(retry) {
    if (!root.prefsLoaded) return
    if (!retry) rulesRetry.tries = 0
    rulesReader.run(["/usr/bin/hyprctl", "eval", WindowRules.lua(root.prefs.rules)])
  }
  Reader {
    id: rulesReader
    timeoutMs: 3000
    onFinished: function(text, ok) {
      if (ok && String(text).trim() === "ok") { rulesRetry.tries = 0; return }
      console.warn("nodi: the window rules were not handed to Hyprland: " + String(text).trim().slice(0, 200))
      if (rulesRetry.tries < 3) { rulesRetry.tries++; rulesRetry.restart() }
    }
  }
  Timer { id: rulesRetry; interval: 5000; property int tries: 0; onTriggered: root.applyRules(true) }

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

  // ---------------------------------------------------------------- nodi mcp

  // Rows another agent found through `nodi mcp` (bin/nodi, ROADMAP 45), by
  // key, with when: a run names one no hotkey or history holds, for ten
  // minutes, the last 64.
  property var foundRows: ({})
  property var foundOrder: []
  readonly property int foundMs: 10 * 60 * 1000

  function foundRow(key) {
    var f = root.foundRows[String(key || "")]
    return f && Date.now() - f.at < root.foundMs ? f.row : null
  }

  // `nodi mcp`'s search: the rows as JSON, each kept for a run.
  function search(query) {
    var rows = root.agentRows(query)
    var found = {}
    var order = root.foundOrder.slice()
    var now = Date.now()
    for (var k in root.foundRows) found[k] = root.foundRows[k]
    for (var i = 0; i < rows.length; i++) {
      if (!found[rows[i].key]) order.push(rows[i].key)
      found[rows[i].key] = { row: rows[i], at: now }
    }
    while (order.length > 64) delete found[order.shift()]
    root.foundRows = found
    root.foundOrder = order
    return JSON.stringify(rows.map(function(r) {
      var d = root.agentData(r)
      d.command = root.oneLine(Run.describe(r.run))
      if (r.risk) d.risk = r.risk
      return d
    }))
  }

  // What a run does, said on one line: a copy keeps its text, a script its
  // arguments (Fable 2026-10-06: the first line alone lost both).
  function oneLine(text) {
    var t = String(text || "").replace(/\s*\n+\s*/g, " ").trim()
    return t.length > 300 ? t.slice(0, 297) + "..." : t
  }

  // What a key runs: { s: its snapshot, remember }, or null. With `agent`,
  // a row `nodi mcp`'s search found runs as found, the fresher of the two,
  // a moment's row (a kill) included, as Claude's run would, and is
  // remembered only if its provider says so; else the saved row, as its
  // provider gives it now (lib/Engine.js resolve), never a moment's.
  function keySnapshot(k, agent) {
    var found = agent ? root.foundRow(k) : null
    if (found) return { s: History.snapshot(found), remember: !!found.remember }
    var saved = Prefs.snapshotFor(root.prefs, k, root.history)
    var live = saved ? Engine.resolve(k, saved, root.config, root.services()) : null
    var s = live ? History.snapshot(live) : saved
    return History.replayable(s) ? { s: s, remember: true } : null
  }

  // Rows `nodi mcp` showed him to propose, by key, kept until his Enter
  // runs one, so what runs is what he saw however late he answers (Fable
  // 2026-10-06); the last eight.
  property var shownRows: ({})
  property var shownOrder: []

  // What a row is, for `nodi mcp` to show before it is run: JSON, or
  // "unknown row".
  function describeRow(key) {
    var k = String(key || "")
    var a = root.keySnapshot(k, true)
    if (!a || !a.s || !a.s.run) return "unknown row"
    // One that asks for a typed word is never run for an agent, so it is
    // not kept for a run (bin/nodi refuses it before asking him).
    if (!a.s.confirmWord) root.shownRows[k] = a
    root.shownOrder = root.shownOrder.filter(function(x) { return x !== k }).concat([k])
    while (root.shownOrder.length > 8) delete root.shownRows[root.shownOrder.shift()]
    var s = a.s
    return JSON.stringify({ key: k, title: String(s.title || ""), subtitle: String(s.subtitle || ""), command: Run.describe(s.run),
                            risk: String(s.risk || ""), asks: s.confirmWord ? "a typed word" : s.confirm ? "a second Enter" : "" })
  }

  // `nodi mcp`'s run: a row its search found, else a saved one; a row that
  // asks first is refused.
  function runFound(key) { return root.runKey(key, false, true) }

  // A row an agent proposed and he chose with Enter (`nodi mcp` propose):
  // that Enter is the row's second one, so a row that asks runs; one that
  // asks for a typed word still does not.
  function runProposed(key) { return root.runKey(key, true, true) }

  // Ask's tool server (`nodi mcp --ask`): one message from the agent Ask
  // holds, with its session's token, as the one argument the shell's
  // facade passes (components/Ask.qml serveCall).
  function askMcp(arg) { return askSession.serveCall(arg) }

  // A pick whose asker went away (`nodi mcp`'s client closed): ended, and
  // the bar with it, only if it is still the open one.
  function cancelPick(id) {
    if (picks.alive(id) !== "yes") return "ok"
    root.endPick("cancel")
    if (root.opened) root.dismiss()
    return "ok"
  }

  // A row by its key, from a hotkey or a deeplink: `omarchy-shell shell call
  // io.github.itsgg.nodi runRow '<key>'` (lib/Hotkey.js deeplink). It runs
  // what the row ran when the hotkey or the link was set, never what an
  // agent's search found (Fable 2026-10-06: a hotkey ran an agent's stale
  // copy for ten minutes).
  function runRow(key) { return root.runKey(key, false, false) }

  // A proposed row runs as it was shown (shownRows). Over IPC it takes one
  // argument, so neither flag can be set from there.
  function runKey(key, confirmed, agent) {
    // The window focused at the press, as a provider resolving the row sees
    // it, not the one of the bar's last open (Fable 2026-10-05).
    root.noteWindow()
    var k = String(key || "")
    var proposed = confirmed === true && agent === true
    // A proposed row runs only as it was shown; none kept (evicted, or the
    // shell reloaded since) is no row (Fable 2026-10-06).
    if (proposed && !root.shownRows[k]) return "unknown row"
    var a = proposed ? root.shownRows[k] : root.keySnapshot(k, agent === true)
    if (proposed) {
      delete root.shownRows[k]
      root.shownOrder = root.shownOrder.filter(function(x) { return x !== k })
    }
    var s = a ? a.s : null
    var remember = a ? a.remember : false
    // An agent's run at once takes only a row no word of its own reaches
    // (AskTools.refusedAtOnce); any other it proposes.
    var refused = agent === true && !proposed && s ? AskTools.refusedAtOnce(k, s.provider) : ""
    if (refused) return refused
    // Watched by its title unless the Undoer runs it and says so itself,
    // as execute() has it: the Undoer takes an argv, and a watched run is
    // a command and its environment since its title left the arguments
    // (2026-10-09).
    var argv = s ? Run.command(s.run, root.appAction, s.undoable && s.run.kind === "exec" ? "" : String(s.title || "")) : null
    if (!argv) return "unknown row"
    // A row that asks before it runs is run from the bar only: `nodi run`
    // names any remembered row, where a hotkey or a link is never given one.
    if (s.confirmWord) return "it asks for a typed word; open it in the bar"
    if (s.confirm && confirmed !== true) return "it asks before it runs; open it in the bar"
    // The bar is not open: what is focused now is what a launch replaces,
    // not what was focused when the bar last opened (codex 2026-10-04).
    if (s.run.kind === "app") launchFeedback.opened()
    if (s.undoable && s.run.kind === "exec" && Array.isArray(argv)) undoer.run(argv, s.title)
    else Quickshell.execDetached(argv)
    if (s.run.kind === "app") launchFeedback.begin(s.title)
    if (remember) root.remember(k, "", s)
    if (s.toggle) { root.toggleStates = Toggles.flipped(root.toggleStates, s.toggle); toggleReprobe.restart() }
    if (s.run.kind === "copy") root.markOwnCopy(s.run.text)
    return "ok"
  }

  // Enter on a row whose action is Nodi's own.
  function doNodi(row) {
    if (row.nodi === "saveAlias" && root.aliasRow) {
      var next = Prefs.withAlias(root.prefs, root.queryNow(), root.aliasRow.key, History.snapshot(root.aliasRow))
      if (next) root.savePrefs(next)
      root.aliasRow = null
      input.text = ""
    } else if (row.nodi === "show") {
      root.savePrefs(Prefs.shownRow(root.prefs, row.key))
    } else if (row.nodi === "windowRule" && row.data) {
      root.setWindowRule({ window: row.data.window, change: row.data.change }, row)
    } else if (row.nodi === "askAllow") {
      // Not in the first moment after it shows: an Enter pressed for the
      // row that was there runs nothing (Fable 2026-10-06).
      var shown = askSession.proposal ? Date.now() - (askSession.proposal.at || 0) : 0
      if (shown < 400) return
      askSession.allow()
    } else if (row.nodi === "askDeny") {
      askSession.deny()
    } else if (row.nodi === "askWith" && row.ask) {
      // Claude on a text (the selection, a translation): asked as Ask asks,
      // the field showing the question, so the answer and its paste are Ask's.
      if (askSession.busy() || windowShot.active) return
      root.askRows = ({})
      askSession.send(row.ask.question, row.ask.message, row.ask.context)
      input.text = "ask " + row.ask.question
      input.cursorPosition = input.text.length
    } else if (row.nodi === "askNew") {
      if (askSession.busy()) return
      askSession.recycle()
      input.text = "ask "
      input.cursorPosition = input.text.length
    } else if (row.nodi === "askWindow" && row.ask) {
      // The window the bar opened over, captured from its own buffer by
      // its ext-foreign-toplevel handle (grim -T), so the bar on top is not
      // in it; 1280 pixels wide at most (ROADMAP 43).
      var w = root.cameFrom
      if (askSession.busy() || windowShot.active || !w.stableId) return
      root.askRows = ({})
      root.shotAsk = row.ask
      // grim scales the window's buffer, which is its layout width times
      // its own monitor's scale (Fable 2026-10-06), else the focused one's.
      var mon = Hyprland.focusedMonitor
      var mons = Hyprland.monitors.values || []
      for (var mi = 0; mi < mons.length; mi++) if (mons[mi].id === w.monitor) mon = mons[mi]
      var ms = mon && mon.lastIpcObject && Number(mon.lastIpcObject.scale) > 0 ? Number(mon.lastIpcObject.scale) : 1
      var px = w.width * ms
      var scale = px > 1280 ? (1280 / px).toFixed(3) : "1"
      windowShot.run(["/usr/bin/bash", "-c", 'set -o pipefail; grim -T "$1" -s "$2" -t jpeg -q 80 - | base64 -w0', "nodi-shot", w.stableId, scale])
      input.text = "ask " + row.ask.question
      input.cursorPosition = input.text.length
    } else if (row.nodi === "ask") {
      var q = root.queryNow().replace(/^\s*ask\s+/i, "").trim()
      // Not while a window's picture is taken for this question (askWindow).
      if (q && !askSession.busy() && !windowShot.active) { root.askRows = ({}); askSession.send(q) }
    } else if (row.nodi === "runWord" && root.wordAsk) {
      if (root.queryNow().trim() !== root.wordAsk.word) return
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
      var spec = Answers.spec(root.queryNow(), root.config.answers, root.cameFrom)
      if (spec) answerSession.start(spec)
    } else if (row.nodi === "filterNext" && row.next) {
      root.stepInto(row.next)
      return
    } else if (row.nodi === "filterDone") {
      root.finish()
      return
    } else if (row.nodi === "saveDesktop" && row.data) {
      var saved = Prefs.withDesktop(root.prefs, row.data.name, row.data.apps, Date.now())
      if (saved) root.savePrefs(saved)
      Quickshell.execDetached(["notify-send", "-a", "Nodi", "Desktop \"" + row.data.name + "\" saved", row.subtitle])
      root.finish()
      return
    } else if (row.nodi === "forgetDesktop" && row.data) {
      root.savePrefs(Prefs.withoutDesktop(root.prefs, row.data.name))
      input.text = ""
    } else if (row.nodi === "tray") {
      // As a click in the tray's own menu; the bar goes first, as for a run.
      if (trayMenus.trigger(row.key)) root.finish()
      return
    } else if (row.nodi === "pick" && root.pickSession) {
      var line = Pick.lineOf(row.key)
      if (line < 0) return
      root.endPick("pick " + line)
      root.dismiss()
      return
    }
    root.recompute()
  }

  // ---------------------------------------------------------------- steps

  // A script filter one step on (providers/filters.js): the field back to
  // its keyword, for the step's rows to be found by what is typed.
  function stepInto(next) {
    var trail = root.filterStep && root.filterStep.keyword === next.keyword ? root.filterStep.trail.slice() : []
    trail.push({ pick: next.pick, info: next.info, data: next.data, retv: next.retv, label: next.label || next.pick, at: Date.now(), window: root.cameFrom })
    root.filterStep = { keyword: next.keyword, trail: trail }
    root.setKeyword(next.keyword)
  }

  // Escape: a step back, and from the first step, out of the steps.
  function stepBack() {
    if (!root.filterStep) return
    var trail = root.filterStep.trail.slice(0, -1)
    var keyword = root.filterStep.keyword
    root.filterStep = trail.length ? { keyword: keyword, trail: trail } : null
    root.setKeyword(keyword)
  }

  function setKeyword(keyword) {
    var text = keyword + " "
    if (input.text !== text) input.text = text
    else root.recompute()
    input.cursorPosition = text.length
  }

  // The steps given up. A step taken again is another (its `at`); a rofi
  // script's first run stays this open's, read once (Sonnet 2026-10-06).
  function endSteps() {
    root.filterStep = null
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
    // Read after the bar opened: the home is drawn again from them, and
    // what it shows is noted as reached then (Cursor 2026-10-07). The
    // rows' hotkeys and the window rules are bound from them: a pass made
    // before they were read bound neither.
    onLoaded: { root.prefs = Prefs.load(text()); root.prefsLoaded = true; root.noteQueued(); root.ensureHotkey(); root.applyRules(); if (root.opened) root.recompute() }
    onLoadFailed: { root.prefsLoaded = true; root.noteQueued(); root.ensureHotkey(); root.applyRules(); if (root.opened) root.recompute() }
  }

  // ---------------------------------------------------------------- keys

  // The card's field and list, by the names the functions here use.
  readonly property alias input: card.input
  readonly property alias list: card.list

  function focusInput() { (root.paletteOpen ? card.paletteInput : input).forceActiveFocus() }

  // A new query: nothing armed, the palette closed, the top row selected;
  // in `ask `, the session starts warming while the question is typed.
  function queryChanged() {
    root.typedSinceOpen = true
    if (!root.recalling) root.recallAt = -1
    root.trail = PickLog.typed(root.trail, Match.normalise(root.queryNow()))
    if (/^\s*ask\s/i.test(root.queryNow())) askSession.warm()
    root.armedKey = ""
    root.closePalette()
    // Steps belong to their keyword: a query without it ends them.
    if (root.filterStep && !Engine.startsWithKeyword(root.queryNow(), root.filterStep.keyword)) root.endSteps()
    root.selectedIndex = 0
    root.recompute()
  }

  // A key in the field: true when Nodi took it.
  function handleKey(key, modifiers, repeat) {
    if (root.captureRow) return repeat ? true : root.captureKey(key, modifiers)
    var name = root.keyName(key)
    if (!name) return false
    var ctrl = (modifiers & Qt.ControlModifier) !== 0
    var act = NodiKeys.decide({ name: name, ctrl: ctrl, shift: (modifiers & Qt.ShiftModifier) !== 0,
                               repeat: !!repeat }, root.keyView(ctrl))
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
    case Qt.Key_A: return "A"
    case Qt.Key_H: return "H"
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

  // What the keys need to know of the screen; the chords only with Ctrl
  // down, as each asks for the row's actions (Sonnet 2026-10-06).
  function keyView(ctrl) {
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
      stepping: !!root.filterStep,
      answering: root.answerShown && answerSession.running,
      proposing: askSession.phase === "proposing",
      rows: root.rows.length,
      selected: root.selectedIndex,
      page: Math.max(1, Math.floor(list.height / Math.max(1, root.rowHeight))),
      pane: card.paneScrolls,
      chords: ctrl ? root.chordKeys() : []
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
    var f = root.paletteOpen ? card.paletteInput : input
    var r = NodiKeys.edited(how, f.text, f.cursorPosition, f.selectionStart, f.selectionEnd)
    f.deselect()
    if (r.text !== f.text) f.text = r.text
    f.cursorPosition = r.at
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
    case "paletteClose": root.closePalette(); break
    case "chord": root.runChord(act.key); break
    case "paletteMove": root.paletteIndex = act.to; root.paletteArmed = ""; break
    case "paletteRun": root.runPaletteAction(act.index); break
    case "disarm": root.armedKey = ""; break
    case "helpBack": root.helpBack(); break
    case "dismiss": root.dismiss(); break
    case "stopAnswer": answerSession.stop(); break
    case "refuse": askSession.deny(); break
    case "edit": root.edit(act.how); break
    case "recall": root.recall(); break
    case "stepBack": root.stepBack(); break
    case "cancelPrompt":
      if (root.wordAsk) { root.endWord(); break }
      root.aliasRow = null; input.text = ""; root.recompute(); break
    }
  }

  onConfigChanged: {
    if (root.opened) root.recompute()
    if (root.configsLoaded) root.readAhead(false)
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
      if (event && String(event.name) === "configreloaded") { root.ensureHotkey(); root.applyRules() }
    }
  }

  // Unloading releases the key, unless another Nodi has taken this one's
  // place (lib/Hotkey.js releaseArgv says why and how).
  // The window rules he set go too: turned off, as no rule (lib/WindowRules.js).
  Component.onDestruction: {
    if (root.captureRow) Quickshell.execDetached(["hyprctl", "eval", Hotkey.captureEndLua()])
    var combos = Hotkey.held(root.boundHotkey, root.prefs.hotkeys, root.boundRows)
    var rules = root.prefs.rules && Object.keys(root.prefs.rules).length ? WindowRules.lua({}) : ""
    var argv = Hotkey.releaseArgv(combos, root.pluginId, (root.omarchyPath || "/usr/share/omarchy") + "/bin/omarchy-shell", "", undefined, rules)
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
      root.readAhead(false)
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

  // The theme's sixteen colours, which a file's coloured lines are drawn
  // in (lib/Ansi.js, ROADMAP 82): read where the shell reads its theme,
  // and again at each open, so a theme switched to is the next open's.
  // The shell's path, which no XDG_STATE_HOME moves (Commons/Color.qml).
  property var themeColours: ({})
  FileView {
    id: themeColors
    path: root.home + "/.local/state/omarchy/current/theme/colors.toml"
    printErrors: false
    onLoaded: root.themeColours = Ansi.paletteFrom(text())
  }

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

  // Omarchy's default coding agent (omarchy-default-agent), which Ask holds
  // unless nodi.json names another (lib/Agents.js chosen).
  property string omarchyAgent: ""
  FileView {
    path: root.home + "/.config/omarchy/defaults/agent"
    printErrors: false
    watchChanges: true
    onLoaded: root.omarchyAgent = text().trim()
    onLoadFailed: root.omarchyAgent = ""
    onFileChanged: reload()
  }

  // A quick answer from a coding agent, held open over ACP (components/Ask.qml).
  Ask {
    id: askSession
    agent: Agents.chosen(root.config.ask && root.config.ask.agent, root.omarchyAgent)
    model: String((root.config.ask && root.config.ask.model) || "")
    workDir: root.cacheDir + "/ask"
    dataDir: root.dataDir
    toolServer: root.pluginDir + "/bin/nodi"
    version: String((root.manifest && root.manifest.version) || "")
    // The bar's rows as the agent's tools, unless nodi.json says
    // "ask": { "actions": false } (ROADMAP 44).
    acts: !(root.config.ask && root.config.ask.actions === false)
    mcp: AskTools.servers(root.config.ask && root.config.ask.mcpServers)
    // Variables of his the agent needs beyond those Ask passes (Ask.qml).
    passed: Array.isArray(root.config.ask && root.config.ask.environment) ? root.config.ask.environment : []
    searcher: root.askSearch
    checker: root.askCheck
    runner: root.askRun
    shown: root.opened
    onPhaseChanged: if (root.opened) root.recompute()
    onInstallChanged: if (root.opened) root.recompute()
  }

  // ---------------------------------------------------------------- Ask acts

  // A question about the window, waiting for its picture (askWindow).
  property var shotAsk: null

  Reader {
    id: windowShot
    timeoutMs: 5000
    maxBytes: 8388608
    onActiveChanged: if (root.opened) root.recompute()
    onFinished: function(text, ok) {
      var a = root.shotAsk
      root.shotAsk = null
      if (!a) return
      var data = ok ? String(text).replace(/\s+/g, "") : ""
      // No picture (the window gone, grim failing): the question goes as
      // text, and says so.
      if (data) askSession.send(a.question, a.message, a.context, { mediaType: "image/jpeg", data: data })
      else askSession.send(a.question, a.question + "\n\n(The window could not be captured.)", "")
    }
  }

  // What Claude found for the question being answered, by key: it runs
  // only rows its search returned, and a new question starts it afresh.
  property var askRows: ({})

  // The bar's ranking for a query, for an agent (lib/Engine.js agentRows).
  function agentRows(q) { return Engine.agentRows(q, root.config, root.services()) }

  // A row as an agent reads it; a row that asks says how.
  function agentData(r) {
    return { key: r.key, title: r.title, subtitle: r.subtitle, kind: r.kind,
             asks: r.confirmWord ? "a typed word" : r.confirm ? "a second Enter" : "" }
  }

  // Claude's search: as data, its rows kept for its run.
  function askSearch(q) {
    var rows = root.agentRows(q)
    var all = {}
    for (var k in root.askRows) all[k] = root.askRows[k]
    for (var i = 0; i < rows.length; i++) all[rows[i].key] = rows[i]
    root.askRows = all
    return rows.map(root.agentData)
  }

  // Why Claude may not run a key, "" when it may: asked before a run is
  // shown to him, and again before it runs.
  function askCheck(key) {
    var row = root.askRows[key]
    if (!row) return "No row has that key; search first and run a key it returned."
    if (row.confirmWord) return "That row asks for a typed word; he must run it from the bar himself."
    if (!Run.command(row.run, root.appAction, row.title)) return "That row cannot run here."
    return ""
  }

  // Claude's run, after his Enter allowed it: as Enter on the row runs it
  // (execute), so the bar closes first. A paste, a picker or a terminal
  // gets the focus the bar held, and an undoable run is the Undoer's
  // (Fable 2026-10-06: a paste typed into the bar's own field). The
  // conversation goes on, but a next run waits until he opens the bar and
  // asks again (Ask.qml shown). The field is emptied first: Claude's run is
  // a use of the row, not a pick for what was typed.
  function askRun(key) {
    var why = root.askCheck(key)
    if (why) return why
    var row = root.askRows[key]
    input.text = ""
    root.execute(row.run, row.toggle, row.remember ? row.key : "", History.snapshot(row), row.title, row.undoable)
    return "Ran: " + row.title + ". The bar closed; anything more waits until he asks again."
  }

  // What waits for his answer, as the bar shows it.
  function proposed() {
    var p = askSession.proposal
    if (!p) return null
    if (p.kind === "auth")
      return { key: "auth:" + askSession.agent, title: p.title, subtitle: p.subtitle || "The agent opens its own way of signing in", run: null,
               risk: "", confirmWord: "", auth: true, input: {} }
    // Any other tool the agent asks to use: what it is and what it is
    // given (ROADMAP 49, 84).
    if (p.kind === "permission" && !p.key)
      return { key: "tool:" + p.title, title: p.title, subtitle: Acp.inputLine(p.input), run: null, risk: "",
               confirmWord: "", tool: true, input: p.input }
    var row = root.askRows[p.key]
    return row ? { key: p.key, title: row.title, subtitle: row.subtitle, run: row.run, risk: row.risk, confirmWord: row.confirmWord }
               : { key: p.key, title: p.key, subtitle: "A row the agent did not find by searching", run: null, risk: "", confirmWord: "" }
  }

  // An answer said to a screen reader once it ends, its words without
  // Markdown's marks (item 71).
  Connections {
    target: askSession
    function onPhaseChanged() {
      if (!root.asking) return
      if (askSession.phase === "done" && root.askShown !== "") card.announce("Answer. " + Markdown.spoken(root.askShown, 600))
      else if (askSession.phase === "error") card.announce("Ask failed. " + (askSession.error || ""))
    }
  }
  Connections {
    target: answerSession
    function onPhaseChanged() {
      if (!root.answerShown) return
      if (answerSession.phase === "done") card.announce(answerSession.title + ". " + Markdown.spoken(answerSession.text, 600))
      else if (answerSession.phase === "error") card.announce(answerSession.title + " failed. " + (answerSession.error || ""))
    }
  }

  // The answer the card shows, while the query is the question it answers:
  // its pane from the Enter that asked it, waiting, then its words.
  readonly property bool asking: /^\s*ask\s/i.test(root.composedQuery)
  readonly property bool askOn: root.asking && askSession.phase !== "idle" && askSession.question !== ""
    && askSession.question === root.composedQuery.replace(/^\s*ask\s+/i, "").trim()
  readonly property string askShown: root.askOn ? askSession.answer : ""
  // A streamed answer (providers/answers.js), while the query is its question.
  readonly property bool answerShown: Answers.shown(root.composedQuery, root.config.answers,
    { phase: answerSession.phase, keyword: answerSession.keyword, question: answerSession.question })
  // The pane beside the list (item 26), as lib/Pane.js chooses it.
  readonly property bool anyPreview: root.rows.some(Pane.hasPane)
  // The pane beside the list, its read asked for outside any binding
  // (components/PaneRead.qml).
  PaneRead {
    id: paneRead
    store: requests
    formatTime: function(ms) { return Qt.formatDateTime(new Date(ms), "yyyy-MM-dd HH:mm") }
    chosen: Pane.choose({
      paletteOpen: root.paletteOpen,
      ask: root.askOn ? { question: askSession.question, agent: askSession.agentName, model: askSession.modelName, text: askSession.answer,
                          busy: askSession.phase === "waiting" || askSession.phase === "streaming", status: askSession.status,
                          error: askSession.phase === "error" ? askSession.error : "" } : null,
      proposal: root.asking && askSession.phase === "proposing" ? root.proposed() : null,
      agent: askSession.agentName,
      answer: root.answerShown ? { question: answerSession.question, title: answerSession.title, text: answerSession.text, seq: answerSession.seq } : null,
      word: root.wordAsk,
      // All the actions, not the ones typed for: the pane holds its width
      // while Ctrl+K is filtered (Sonnet 2026-10-06).
      palette: root.paletteOpen ? { row: root.paletteRow, action: root.paletteActions[root.paletteIndex] || null, actions: root.paletteAll,
                                    armed: !!root.paletteArmed && !!root.paletteActions[root.paletteIndex] && root.paletteArmed === root.paletteActions[root.paletteIndex].label } : null,
      row: root.selectedRow, armed: !!root.selectedRow && root.armedKey === root.selectedRow.key, anyPreview: root.anyPreview
    })
  }
  readonly property var preview: paneRead.preview

  // Media, audio devices, Bluetooth, Wi-Fi and the battery, as they are.
  Desktop { id: desktopState }

  // The tray's menus while the bar is open (providers/tray.js, ROADMAP 58):
  // opened with the other reads, a frame after the card shows.
  Tray {
    id: trayMenus
    onChanged: if (root.opened) root.recompute()
  }

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

  // Rows that change as you watch (a script filter's "rerun", Rows liveMs):
  // the bar asks again at the quickest of their paces while they show,
  // and the read that lands recomputes it.
  readonly property int liveMs: {
    var m = 0
    for (var i = 0; i < root.rows.length; i++) if (root.rows[i].liveMs && (!m || root.rows[i].liveMs < m)) m = root.rows[i].liveMs
    return m
  }
  Timer {
    id: liveTimer
    interval: Math.max(500, root.liveMs)
    repeat: true
    running: root.opened && root.liveMs > 0
    onTriggered: root.askLive()
  }

  // A tick asks the providers again, so what is due is read, and leaves the
  // list as it is: a read that changes the rows recomputes the bar as it
  // lands, and one that does not is not shown anew (Requests.same).
  function askLive() {
    if (root.aliasRow || root.wordAsk || root.pickSession || root.captureRow) return
    Engine.run(root.queryNow(), root.config, root.services())
  }

  // ---------------------------------------------------------------- reads

  // What providers ask for through ctx.request (lib/Requests.js): the
  // process list, a directory, exchange rates, Omarchy's command list. Each
  // arrival recomputes the bar while it is open.
  Requests {
    id: requests
    providers: Engine.providers()
    env: ({ user: root.user, home: root.home, cacheDir: root.cacheDir, pluginDir: root.pluginDir, path: Quickshell.env("PATH") || "" })
    // Held, the read that completes the rows draws them once.
    onArrived: if (root.opened) { if (root.homeHeld && root.homeReadsIn()) root.releaseHome(); else root.recompute() }
    // A read that brought the same rows again still completes them.
    onLanded: if (root.opened && root.homeHeld) root.settleHome()
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
    // A tray item's picture, as Quickshell serves it.
    if (/^image:\/\//.test(value)) return value
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
    // Ask's model when Ask holds Claude; another agent's model means
    // nothing to claude.
    var model = askSession.agent === "claude" && root.config.ask && root.config.ask.model ? String(root.config.ask.model) : "haiku"
    describer.run(Describe.argv(model, list, root.cacheDir + "/ask"), list)
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
    // A dialog whose floating only the list says: its folders, while held.
    if (root.opened && root.homeHeld) root.readAhead(true)
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

  // The desktop's motion and contrast preferences (ROADMAP 73), read at
  // each open: higher contrast marks the selected row in every theme and
  // raises secondary text to 7:1; reduced motion, or Hyprland's
  // animations off, leaves the card's resizing unanimated.
  property var appearance: ({ highContrast: false, reducedMotion: false })
  readonly property bool reducedMotion: !!root.appearance.reducedMotion
  function refreshAppearance() { appearanceReader.run(["/usr/bin/bash", "-c", Appearance.PROBE]) }
  Reader {
    id: appearanceReader
    timeoutMs: 3000
    onFinished: function(text, ok) {
      var a = Appearance.parse(text)
      if (a.highContrast !== root.appearance.highContrast || a.reducedMotion !== root.appearance.reducedMotion) root.appearance = a
    }
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
      if (root.opened && !root.queryNow().trim()) root.recompute()
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
    // Before the first open, so it is drawn as asked (Sonnet 2026-10-06).
    root.refreshAppearance()
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
      y: look.cardTop
      // Unseen until the empty bar's rows are whole: the GUI thread draws
      // the first frame before it reads the selection's answer, so a card
      // shown at once showed without the rows that then pushed the list
      // down (measured 2026-10-07: the read in at 75 ms, the frame at 74).
      // Shown a frame later, whole. Opacity, not visibility: the field
      // takes the keys meanwhile.
      opacity: root.contentHeld ? 0 : 1
    }
  }
}
