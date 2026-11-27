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
import "lib/Probes.js" as Probes
import "lib/Conversations.js" as Conversations
import "lib/PickLog.js" as PickLog
import "lib/Markdown.js" as Markdown
import "lib/Appearance.js" as Appearance
import "lib/Ansi.js" as Ansi
import "lib/Toasts.js" as Toasts
import "lib/Reminders.js" as Reminders
import "lib/HomeSources.js" as HomeParser
import "lib/PromptContext.js" as PromptContext
import "lib/NodiActions.js" as NodiActions
import "lib/NodiMcp.js" as NodiMcp
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
  // The first preview can widen the card; keep that width until this open
  // ends so live result filtering cannot make it contract and expand again.
  property bool wideForOpen: false
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
  readonly property string runtimeDir: Quickshell.env("XDG_RUNTIME_DIR")
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
  readonly property var config: Config.merge(defaultConfig, userConfig, root.pluginDir,
                                              { home: root.home, runtimeDir: root.runtimeDir })

  property var zones: ({})          // { "Asia/Tokyo": { offset: 540, abbr: "JST" } }
  property real zonesFetchedAt: 0
  property string localZone: ""
  property var emojis: []
  property var apps: []
  property var appIcons: Object.create(null)
  property var appEntries: ({})
  property var hiddenApps: ({})
  property var history: ({})        // row key -> { n, t }: what was run, how often, when (lib/History.js)
  property var picks: ({})          // query -> row key -> { n, t }: what was picked for what was typed
  property var reminders: []        // Nodi's own pending reminders (lib/Reminders.js)
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
  property bool foldersWarned: false

  // ---------------------------------------------------------------- look

  // How it looks and measures, from components/Look.qml.
  // Held wide after a preview appears, so live search does not make the
  // card contract and expand as its result set changes.
  Look { id: look; screenWidth: panel.width; screenHeight: panel.height; chrome: card.chrome; highContrast: root.appearance.highContrast
         wide: root.wideForOpen || (root.shownQuery === root.queryNow()
           && (root.preview !== null || (root.paletteOpen && root.anyPreview))) }
  readonly property alias background: look.background
  readonly property alias foreground: look.foreground
  readonly property alias link: look.link
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
  readonly property alias twoColumn: look.twoColumn
  readonly property alias paneMin: look.paneMin
  readonly property alias stackPanePreferredHeight: look.stackPanePreferredHeight
  readonly property alias bodyMax: look.bodyMax
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

  property bool entered: false

  // payloadJson may carry a starting query: '{"query": ":"}' opens emoji search.
  function open(payloadJson) {
    // This open's times (lib/Opens.js), from its start: an open while the
    // bar is up is not one, and leaves the record as it was.
    var starting = !root.opened
    if (starting) {
      root.entered = false
      Qt.callLater(function() { root.entered = true })
      root.wideForOpen = false
      root.frameShows = false
      root.openRec = Opens.start(Date.now(), root.openBy || "call", false)
    }
    root.openBy = ""
    // The window it opened over, first: a payload's query below is
    // answered over it, a script filter's run told of it (Cursor
    // 2026-10-07: noted after, the last window was).
    root.noteWindow()
    // Sizes change at once until the card is up (startReads).
    card.animated = false
    var payload = {}
    // bin/nodi carries its payload in a file (Carried.qml); a path in no
    // folder of its own opens the bar as nothing asked.
    var carriedJson = carried.read(payloadJson)
    try { payload = JSON.parse(carriedJson || "{}") || {} } catch (e) {}
    // A pick stays open only for its own opening: anything else that opens
    // the bar ends it, nothing chosen.
    if (root.pickSession && payload.pick !== root.pickSession.id) root.endPick("cancel")
    // So is a confirm word, before the payload's query is typed.
    root.endWord()
    // The field set here is ranked once, below, with this open's state:
    // ranked as it was set, the engine ran before the state was reset and
    // again after it.
    root.quietQuery = true
    try {
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
    } finally {
      root.quietQuery = false
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
    // A reopen refreshes the pictures whose rasters went stale, each alone.
    images.refreshStale()
    // Made once a shell: again at an open only until they are.
    if (!root.cacheReady) root.makeFolders()
    root.placeholder = root.pickSession ? (root.pickSession.placeholder || "Pick one") : Engine.placeholder(root.config, root.opens)
    root.aliasRow = null
    root.endCapture()
    // The first row before the bar counts as open: the pane's window
    // picture starts as it opens, and took the last open's row first
    // (Cursor 2026-10-07).
    root.selectedIndex = 0
    root.opened = true
    // prefs.json is read again at each open: a hand edit is taken, a fix
    // of one with an error too, and one that broke it stops the saves
    // before any writes over it (codex's review, 2026-10-09).
    if (root.prefsLoaded) prefsFile.reload()
    // The registry's programs are looked for again when that look is old,
    // or what it asked changed (lib/Probes.js): an installed remembered
    // agent can recover precedence, and a removed non-current one is
    // disabled before it is selected.
    root.lookForAgents()
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

  // When each probe an open would start last answered (lib/Probes.js): one
  // seconds old is this open's, and the agents and the themes are kept
  // longer, the current theme watched (themeName).
  property real togglesAt: 0
  property real appearanceAt: 0
  property real themesAt: 0
  property var agentsSeen: null
  function agentsKey(tag) { return tag + "\n" + (Quickshell.env("PATH") || "") }
  function lookForAgents() {
    if (Probes.agentsDue(root.agentsSeen, Date.now(), root.agentsKey(agentProbe.probeTag()))) agentProbe.look()
  }
  Connections {
    target: agentProbe
    function onFinished(text, ok, tag) { if (ok && tag === agentProbe.probeTag()) root.agentsSeen = { at: Date.now(), key: root.agentsKey(tag) } }
  }
  Connections { target: togglesReader; function onFinished(text, ok) { if (ok) root.togglesAt = Date.now() } }
  Connections { target: appearanceReader; function onFinished(text, ok) { if (ok) root.appearanceAt = Date.now() } }
  Connections { target: themesReader; function onFinished(text, ok) { if (ok) root.themesAt = Date.now() } }
  // An Ask that failed as a missing program fails: looked for again now.
  Connections {
    target: askSession
    function onErrorChanged() {
      if (!Probes.suggestsMissing(askSession.error)) return
      root.agentsSeen = null
      agentProbe.look()
    }
  }

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
    // unless it is still held unseen, when it shows whole.
    card.animated = !root.contentHeld
    if (!root.readsPending) return
    root.readsPending = false
    readsAfterFrame.stop()
    root.refreshWindows()
    var now = Date.now()
    if (Probes.due(root.togglesAt, now, Probes.FRESH_MS)) root.refreshToggles()
    if (Probes.due(root.appearanceAt, now, Probes.FRESH_MS)) root.refreshAppearance()
    themeColors.reload()
    if (Probes.due(root.themesAt, now, Probes.THEMES_MAX_AGE_MS)) root.refreshThemes()
    root.checkReminders()
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
      // Which leads, the selection or the copy (lib/Sources.js selectionRead).
      var r = Sources.selectionRead(Sources.selections(text), {
        field: input.text, lastSelection: root.lastSelection, lastCopied: root.lastCopied,
        selectionSeenAt: root.selectionSeenAt, copiedSeenAt: root.copiedSeenAt,
        now: Date.now(), keepMs: root.keepQueryMs
      })
      root.selectionSeenAt = r.selectionSeenAt
      root.copiedSeenAt = r.copiedSeenAt
      root.lastSelection = r.lastSelection
      root.lastCopied = r.lastCopied
      root.selectionSource = r.source
      root.selection = r.selection
      root.selectionFresh = r.fresh
      var got = root.selection
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

  // Qt 6.11's editable TextInput reads every foreign clipboard offer when
  // it changes. Card uses TextEdit instead and sends its explicit paste keys
  // here, where the shared Reader enforces both a deadline and a byte cap.
  function pasteInput(target, multiline) {
    if (!pasteReader.busy)
      pasteReader.run(Sources.pasteArgv(), {
        target: target, direct: typeof target !== "string",
        multiline: multiline === true
      })
  }

  function insertPaste(field, text, multiline) {
    var start = field.selectionStart
    var end = field.selectionEnd
    if (end > start) field.remove(start, end)
    var value = String(text || "")
    if (!multiline) value = value.replace(/[\r\n]+/g, " ")
    field.insert(start, value)
    field.cursorPosition = start + value.length
  }

  Reader {
    id: pasteReader
    timeoutMs: 2000
    maxBytes: 65536
    terminateLines: false
    onFinished: function(text, ok, tag) {
      if (!ok) {
        root.toast(pasteReader.overflowed ? "Paste is larger than 64 KiB" : "Could not read the clipboard", "")
        return
      }
      if (!root.opened || !tag || (tag.target === "palette" && !root.paletteOpen)) return
      var target
      if (tag.direct === true) {
        if (!tag.target || typeof tag.target.insert !== "function") return
        target = tag.target
      } else target = tag.target === "palette" ? card.paletteInput : input
      root.insertPaste(target, text, tag.multiline === true)
    }
  }

  readonly property int keepQueryMs: 120000
  property real closedAt: 0

  function close() {
    root.closedAt = Date.now()
    root.entered = false
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
    // A close inside the open's first 60 ms runs none of its reads, and
    // brings no tray menus up behind a hidden bar.
    readsAfterFrame.stop()
    root.readsPending = false
    trayMenus.active = false
    root.aliasRow = null
    root.endWord()
    root.endCapture()
    root.pendingFileAsk = null
    if (askFileReader.active) askFileReader.cancel()
    // Claude's conversation goes on (ROADMAP 43), so a kept question sent
    // with its text is asked again with it; a run it waits on is refused.
    askSession.hidden()
    // A streamed answer goes on, and its conversation with it, as Ask's
    // does (components/Answer.qml): reopened on the same question, there it is.
  }

  function dismiss() {
    root.close()
    if (root.shell && typeof root.shell.hide === "function") root.shell.hide(root.pluginId)
  }

  // After an action the bar starts empty next time; a plain close keeps the query.
  // Emptied after the close too: a pick or a confirm word the close ends
  // gives the field back what it held, which an action's close must not
  // keep (Fable 2026-10-06: Claude's run landing while one was open).
  // The field is emptied without ranking: the bar is closing, and the next
  // open ranks what it opens on.
  function finish() {
    root.quietQuery = true
    try {
      input.text = ""
      root.selectedIndex = 0
      root.dismiss()
      if (input.text !== "") input.text = ""
    } finally {
      root.quietQuery = false
    }
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

  // Only with "picks": true: the queries he typed, kept for make picks and
  // make replay, are no one else's to keep by default.
  function logPick(e) {
    if (root.config.picks !== true) return
    root.pickLog = PickLog.add(root.pickLog, e)
    if (root.cacheReady && root.pickLogLoaded) pickLogFile.setText(PickLog.serialize(root.pickLog))
  }

  FileView {
    id: pickLogFile
    path: root.cacheDir + "/picks-log.json"
    printErrors: false
    atomicWrites: true
    onLoaded: { if (root.config.picks === true) root.pickLog = PickLog.parse(text()).concat(root.pickLog).slice(-PickLog.MAX); root.pickLogLoaded = true }
    onLoadFailed: root.pickLogLoaded = true
  }

  // ---------------------------------------------------------------- conversations

  // Streamed answers' conversations, kept to reopen (lib/Conversations.js),
  // in a folder his alone, saved once it is made (cacheReady).
  property var conversations: []
  property bool conversationsLoaded: false

  function keepConversation() {
    var s = answerSession
    if (!s.conversation || !s.text || (s.phase !== "done" && s.phase !== "stopped")) return
    root.conversations = Conversations.record(root.conversations, { id: s.conversation, keyword: s.keyword, title: s.title, at: Date.now(),
      turns: s.turns.concat([{ question: s.question, text: s.text }]) })
    root.saveConversations()
  }
  function saveConversations() {
    if (root.cacheReady && root.conversationsLoaded) conversationsFile.setText(Conversations.serialize(root.conversations))
  }

  FileView {
    id: conversationsFile
    path: root.stateDir + "/conversations.json"
    printErrors: false
    atomicWrites: true
    onLoaded: {
      var held = root.conversations
      root.conversations = Conversations.merge(Conversations.parse(text()), held)
      root.conversationsLoaded = true
      // Rewrites older entries without their effective request, which could
      // contain selected text or a previous Ask transcript.
      root.saveConversations()
    }
    onLoadFailed: {
      root.conversationsLoaded = true
      if (root.conversations.length) root.saveConversations()
    }
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

  // The first frame the bar's window swaps that shows the card (Opens.shows):
  // one held is not seen (contentHeld), and one made while the entrance
  // still had it at opacity 0 showed nothing. The card's opacity is read as
  // a frame is made, after its animations step (afterAnimating), and that
  // frame stamped once swapped; a card already whole stamps at its swap.
  property bool frameShows: false
  Connections {
    target: card.Window.window
    ignoreUnknownSignals: true
    function onAfterAnimating() {
      if (root.openRec && root.openRec.frame === -1) root.frameShows = Opens.shows(card.opacity, root.contentHeld)
    }
    function onFrameSwapped() {
      if (!root.openRec || root.openRec.frame !== -1) return
      if (root.frameShows || (card.opacity >= 1 && Opens.shows(card.opacity, root.contentHeld))) Opens.stamp(root.openRec, "frame", Date.now())
    }
  }

  // Hyprland maps the layer: what the compositor shows.
  Connections {
    target: Hyprland
    function onRawEvent(event) {
      if (root.openRec && event.name === "openlayer" && event.data === Hotkey.NAMESPACE) Opens.stamp(root.openRec, "layer", Date.now())
    }
  }

  // ---------------------------------------------------------------- queries

  property string askStatus: ""

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
      homeSources: watchedHome.snapshots,
      ask: { phase: askSession.phase, question: askSession.question, message: askSession.message, answer: askSession.answer, error: askSession.error,
             agentId: typeof askSession.agent === "string" ? askSession.agent : "",
             agent: askSession.agentName, model: askSession.modelName, status: root.askStatus, activity: askSession.activity,
             proposal: root.proposed(), context: askSession.context, capturing: windowShot.active, install: askSession.install,
             missing: root.agentMissing ? root.agentProgram : "", turns: askSession.turns, agents: root.askAgents,
             sessionId: askSession.sessionId, commands: askSession.commands, plans: askSession.plans,
             resultActions: askSession.resultActions, remoteSessions: askSession.remoteSessions,
             form: askSession.form },
      conversations: root.conversations,
      answer: { phase: answerSession.phase, keyword: answerSession.keyword, question: answerSession.question, text: answerSession.text,
                error: answerSession.error, running: answerSession.running, conversation: answerSession.conversation,
                reopened: answerSession.reopened,
                follows: answerSession.follows(answerSession.keyword, Answers.freshFor(root.config.answers, answerSession.keyword)) },
      window: root.cameFrom,
      selection: { text: root.selection, fresh: root.selectionFresh, source: root.selectionSource, clipboard: root.lastCopied },
      undo: undoer.entries,
      desktop: desktop
    }
  }

  // The keys of the rows on screen, as far as a card shows them.
  function shownKeys() { return root.rows.slice(0, 8).map(function(r) { return r.key }).join("\u0001") }

  function recompute() {
    var sel = root.selectedRow
    var before = { query: root.shownQuery, key: sel ? sel.key : "", index: root.selectedIndex,
                   acts: !!(sel && (sel.run || sel.nodi || sel.complete || sel.copy)) }
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
      if (root.execute(row.run, row.toggle, row.remember ? row.key : "", History.snapshot(row), row.title, row.undoable,
                       row.provider === "home" ? row.key : "", row.homeExecution)) root.teach(row)
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
  function currentHomeExecutable(run, key, token) {
    if (!run || run.kind !== "exec" || !key) return true
    return HomeParser.currentExecutable(watchedHome.snapshots, key, token, run, Date.now())
  }

  function execute(run, toggleId, key, snap, name, undoable, homeKey, homeExecution) {
    if (!root.currentHomeExecutable(run, homeKey, homeExecution)) {
      root.armedKey = ""
      if (root.paletteOpen) root.closePalette()
      return false
    }
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
    if (Menu.staleAfter(key)) root.guardsAt = 0
    if (toggleId) {
      root.toggleStates = Toggles.flipped(root.toggleStates, toggleId)
      toggleReprobe.restart()
    }
    return true
  }

  function openLink(url, source) {
    var run = Run.link(url)
    if (!run) {
      root.toast("Link not opened", "Only http, https and mail links can open from a preview.")
      return false
    }
    var opened = root.execute(run, "", "", null)
    if (opened && source && source.ask === true)
      askSession.openedLink(url, source.turn)
    return opened
  }

  function setAskFormField(name, value) {
    askSession.setFormField(name, value)
  }

  function submitAskForm() {
    return askSession.submitForm()
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
    if (!Rows.activatable(a)) return
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
    if (!Rows.activatable(a)) return
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
    if (a.nodi === "askWith" && (a.ask || row.ask)) {
      var askSpec = a.ask || row.ask
      var extraEnv = askSpec.context === "selection" && root.selection ? { NODI_SELECTION: root.selection } : {}
      root.dispatchAsk(askSpec.question, askSpec.message, askSpec.context, askSpec.purpose, extraEnv, undefined, askSpec.file)
      return
    }
    if (a.nodi === "complete") {
      if (a.data) {
        input.text = String(a.data)
        input.cursorPosition = input.text.length
        root.closePalette()
        root.recompute()
      } else {
        root.complete(row)
      }
      return
    }
    if (a.nodi === "askAgent" && a.data) { root.selectAskAgent(a.data.id); return }
    if (a.nodi) { root.setPref(a, row); return }
    var own = !!a.own
    var remembered = own && row.remember
    root.execute(a.run, own ? row.toggle : "", remembered ? row.key : "", remembered ? History.snapshot(row) : null,
                 own ? row.title : a.label, a.undoable, row.provider === "home" ? row.key : "", a.homeExecution)
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
  // Why prefs.json is no prefs, "" when it is (Prefs.problem): while it is
  // not, nothing is written over it, and each open reads it again.
  property string prefsBroken: ""
  property string prefsWarned: ""
  // The text last read or written: a read at an open that finds the same
  // does nothing more.
  property string prefsText: ""
  function warnPrefs(why) {
    if (root.prefsWarned === why) return
    root.prefsWarned = why
    root.toast("prefs.json has an error",
      why + ". Nothing you set from Ctrl+K is saved over it until it is fixed: " + root.stateDir + "/prefs.json")
  }
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
    if (!next) root.toast("Window rule not kept",
      "Nodi keeps fifty at most, and they must fit one hyprctl call. Take one back in ?mine.")
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
    if (root.prefsBroken) root.warnPrefs(root.prefsBroken)
    // Once its folder is made his alone: FileView makes a missing one 0755
    // (the marketplace's review, 2026-10-10); a change before then waits.
    else if (root.prefsLoaded && root.cacheReady) { root.prefsText = Prefs.serialize(next); prefsFile.setText(root.prefsText) }
    else if (root.prefsLoaded) root.prefsWaiting = true
    if (keysChanged) root.ensureHotkey()
  }
  property bool prefsWaiting: false
  onCacheReadyChanged: {
    if (!root.cacheReady) return
    if (root.prefsWaiting) { root.prefsWaiting = false; root.savePrefs(root.prefs) }
    if (root.remindersWaiting) { root.remindersWaiting = false; root.saveReminders() }
    root.saveConversations()
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
  // key, with when (lib/NodiMcp.js keepFound).
  property var foundRows: ({})
  property var foundOrder: []
  readonly property int foundMs: NodiMcp.FOUND_MS

  function foundRow(key) { return NodiMcp.foundRow(root.foundRows, key, Date.now()) }

  // What bin/nodi carries in a file, never an IPC argument (Carried.qml):
  // an agent's search, a row's key, Ask's tool server's messages. A path
  // in no folder of bin/nodi's is refused, never read.
  Carried { id: carried }

  // `nodi mcp`'s search: the rows as JSON, each kept for a run.
  function search(carriedQuery) {
    var query = carried.read(carriedQuery)
    if (query === null) return "[]"
    var rows = root.agentRows(query)
    var kept = NodiMcp.keepFound(root.foundRows, root.foundOrder, rows, Date.now())
    root.foundRows = kept.rows
    root.foundOrder = kept.order
    return NodiMcp.searchReply(rows)
  }

  function oneLine(text) { return NodiMcp.oneLine(text) }

  // What a key runs (lib/NodiMcp.js keySnapshot): with `agent`, a row
  // `nodi mcp`'s search found first; else the saved row as its provider
  // gives it now.
  function keySnapshot(k, agent) {
    return NodiMcp.keySnapshot(k, agent, root.foundRows, root.prefs, root.history, Date.now(),
      function(key, saved) { return Engine.resolve(key, saved, root.config, root.services()) })
  }

  // Rows `nodi mcp` showed him to propose, by key, kept until his Enter
  // runs one, so what runs is what he saw however late he answers (Fable
  // 2026-10-06); the last eight.
  property var shownRows: ({})
  property var shownOrder: []

  // What a row is, for `nodi mcp` to show before it is run: JSON, or
  // "unknown row".
  function describeRow(carriedKey) {
    var key = carried.read(carriedKey)
    if (key === null) return "unknown row"
    var k = String(key || "")
    var a = root.keySnapshot(k, true)
    if (!a || !a.s || !a.s.run) return "unknown row"
    // One that asks for a typed word is never run for an agent, so it is
    // not kept for a run (bin/nodi refuses it before asking him).
    root.shownOrder = NodiMcp.keepShown(root.shownRows, root.shownOrder, k, a)
    return NodiMcp.describeReply(k, a.s)
  }

  // `nodi mcp`'s run: a row its search found, else a saved one; a row that
  // asks first is refused.
  function runFound(key) { var k = carried.read(key); return k === null ? "unknown row" : root.runKey(k, false, true) }

  // A row an agent proposed and he chose with Enter (`nodi mcp` propose):
  // that Enter is the row's second one, so a row that asks runs; one that
  // asks for a typed word still does not.
  function runProposed(key) { var k = carried.read(key); return k === null ? "unknown row" : root.runKey(k, true, true) }

  // Ask's tool server (`nodi mcp --ask`): one message from the agent Ask
  // holds, with its session's token, as the one argument the shell's
  // facade passes (components/Ask.qml serveCall).
  function askMcp(arg) { var a = carried.read(arg); return a === null ? "unknown" : askSession.serveCall(a) }

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
  function runRow(key) {
    var k = carried.read(key)
    // A hotkey's bind names its keys: the row is its own in prefs.json.
    if (k !== null && /^hotkey:/.test(k)) k = Prefs.rowOfHotkey(root.prefs, k) || null
    return k === null ? "unknown row" : root.runKey(k, false, false)
  }

  // A proposed row runs as it was shown (shownRows). Over IPC it takes one
  // argument, so neither flag can be set from there.
  function runKey(key, confirmed, agent) {
    // The window focused at the press, as a provider resolving the row sees
    // it, not the one of the bar's last open (Fable 2026-10-05).
    root.noteWindow()
    var k = String(key || "")
    var proposed = confirmed === true && agent === true
    // A proposed row runs only as it was shown (lib/NodiMcp.js takeShown).
    var a
    if (proposed) {
      var taken = NodiMcp.takeShown(root.shownRows, root.shownOrder, k)
      if (!taken) return "unknown row"
      a = taken.a
      root.shownOrder = taken.order
    } else a = root.keySnapshot(k, agent === true)
    // Whether it may run, and as what (lib/NodiMcp.js runPlan).
    var plan = NodiMcp.runPlan({ key: k, a: a, confirmed: confirmed, agent: agent, proposed: proposed,
                                 homeCurrent: root.currentHomeExecutable, appAction: root.appAction })
    if (plan.refusal) return plan.refusal
    var s = plan.s
    var argv = plan.argv
    var remember = plan.remember
    // The bar is not open: what is focused now is what a launch replaces,
    // not what was focused when the bar last opened (codex 2026-10-04).
    if (s.run.kind === "app") launchFeedback.opened()
    if (s.undoable && s.run.kind === "exec" && Array.isArray(argv)) undoer.run(argv, s.title)
    else Quickshell.execDetached(argv)
    if (s.run.kind === "app") launchFeedback.begin(s.title)
    if (remember) root.remember(k, "", s)
    if (s.toggle) { root.toggleStates = Toggles.flipped(root.toggleStates, s.toggle); toggleReprobe.restart() }
    if (Menu.staleAfter(k)) root.guardsAt = 0
    if (s.run.kind === "copy") root.markOwnCopy(s.run.text)
    return "ok"
  }

  // Enter on a row whose action is Nodi's own: what it does is
  // lib/NodiActions.js decide, its effects applied here in order.
  function doNodi(row) {
    root.applyEffects(NodiActions.decide(row, {
      query: root.queryNow(), now: Date.now(), prefs: root.prefs, aliasRow: root.aliasRow,
      wordAsk: root.wordAsk, armedKey: root.armedKey, selection: root.selection,
      cameFrom: root.cameFrom, answers: root.config.answers, conversations: root.conversations,
      pickSession: root.pickSession, askBusy: askSession.busy(), proposal: askSession.proposal,
      shooting: windowShot.active,
      resultAction: function(index) { return askSession.resultAction(index) },
      answer: { message: answerSession.message, keyword: answerSession.keyword,
                question: answerSession.question, conversation: answerSession.conversation },
      screens: function() { return { focused: Hyprland.focusedMonitor, all: Hyprland.monitors.values || [] } }
    }))
  }

  // The effects lib/NodiActions.js returns, in order: a call that `need`s a
  // result ends them without one, and its `then` runs only with one.
  function applyEffects(effects) {
    for (var i = 0; i < effects.length; i++) {
      var e = effects[i]
      if (e.do === "set") root[e.key] = e.value
      else if (e.do === "text") {
        input.text = e.text
        if (e.cursor) input.cursorPosition = input.text.length
      } else if (e.do === "recompute") root.recompute()
      else if (e.do === "call") {
        var target = e.on === "ask" ? askSession : e.on === "answer" ? answerSession
          : e.on === "tray" ? trayMenus : e.on === "shot" ? windowShot : root
        var result = target[e.fn].apply(target, e.args)
        if (e.need && !result) return
        if (e.then && result) root.applyEffects(e.then)
      }
    }
  }

  // A question about the window, held with what it is about until its
  // picture is taken (askWindow, windowShot).
  function holdShotAsk(a) {
    root.shotAsk = Object.assign({}, a, { captured: root.askCapture(a.message, a.context, a.purpose) })
  }

  function runUndo(key) {
    var u = undoer.take(key)
    if (u) root.execute(u.run, "", "", null, u.title, false)
  }

  // The answer "fallback" names, asked of what the field now holds.
  function startFallbackAnswer(data) {
    var fbSpec = Answers.spec(input.text, root.config.answers, root.cameFrom, data.message)
    if (fbSpec) { fbSpec.fresh = data.fresh === true; answerSession.start(fbSpec) }
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

  function pick(argJson) { var a = carried.read(argJson); return a === null ? "refused" : picks.request(a, input.text) }
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
    onLoaded: {
      var r = Prefs.reread({ loaded: root.prefsLoaded, text: root.prefsText, broken: root.prefsBroken }, text())
      // Read again at an open and as it was: nothing to do.
      if (r.act === "none") return
      root.prefsBroken = r.act === "broken" ? r.why : ""
      if (r.act === "broken") root.warnPrefs(r.why)
      else { root.prefsWarned = ""; root.prefsText = r.text; root.prefs = r.prefs }
      root.prefsLoaded = true; root.noteQueued(); root.ensureHotkey(); root.applyRules(); if (root.opened) root.recompute() }
    // No file (none yet, or one with an error deleted): what is held stands,
    // and the next change is saved.
    onLoadFailed: {
      var first = !root.prefsLoaded
      root.prefsBroken = ""; root.prefsWarned = ""; root.prefsText = ""
      root.prefsLoaded = true
      if (first) { root.noteQueued(); root.ensureHotkey(); root.applyRules(); if (root.opened) root.recompute() }
    }
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
    if (root.directAskAgent && !askSession.busy() && !root.queryUsesDirectAgent(root.queryNow()))
      root.directAskAgent = ""
    if (/^\s*ask\s/i.test(root.queryNow())) askSession.warm()
    root.armedKey = ""
    root.closePalette()
    // Steps belong to their keyword: a query without it ends them.
    if (root.filterStep && !Engine.startsWithKeyword(root.queryNow(), root.filterStep.keyword)) root.endSteps()
    root.selectedIndex = 0
    if (!root.quietQuery) root.recompute()
  }

  // Set while the bar changes the field itself and ranks after (open,
  // finish): the change is not ranked as it is made.
  property bool quietQuery: false

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
      root.toast("Nodi has no hotkey",
        "\"" + hotkey + "\" is not a key combination. Write it as \"SUPER + SPACE\" in ~/.config/omarchy/extensions/nodi.json.")
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
      root.toast("A row's hotkey is taken", rows.conflicts[c] + " is bound to something else now; set the row another one from Ctrl+K.")
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
      root.toast("Nodi has no hotkey",
        hotkey + " already opens \"" + p.conflict + "\". Set another \"hotkey\" in ~/.config/omarchy/extensions/nodi.json.")
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

  // External JSONL rows are watched continuously by FileView delegates. They
  // are snapshots only: opening the bar starts no source program and does not
  // wait for a source read.
  HomeSources {
    id: watchedHome
    sources: root.config.home || []
    onUpdated: {
      if (root.paletteOpen && root.paletteRow && root.paletteRow.provider === "home") root.closePalette()
      for (var i = 0; i < diagnostics.length; i++)
        console.warn("nodi: home source " + diagnostics[i].id + " (" + diagnostics[i].file + "): " + diagnostics[i].error)
      if (root.opened && !root.homeHeld && root.queryNow().trim() === "") root.recompute()
    }
  }

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
    else {
      root.userConfig = r.config; root.userConfigGood = true; root.configWarned = ""
      // His settings read whole, and no "picks": true among them: a log
      // kept before goes, as none is kept now (codex's review, 2026-10-09).
      if (root.config.picks !== true) { root.pickLog = []; Quickshell.execDetached(["/usr/bin/rm", "-f", "--", root.cacheDir + "/picks-log.json"]) }
    }
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
    root.toast("nodi.json has an error", error + ". " + keeping)
  }

  // ---------------------------------------------------------------- cache

  Reader {
    id: cacheMaker
    timeoutMs: 3000
    // Once made, ready for good: a later open's install failing (a slow
    // disk past the 3 s) does not hold writes back again; one that never
    // succeeds says so, once (Fable 2026-10-10: changes waited unsaid).
    onFinished: function(text, ok) {
      if (ok && !root.cacheReady) { root.cacheReady = true; root.describeApps() }
      else if (!ok && !root.cacheReady && !root.foldersWarned) {
        root.foldersWarned = true
        root.toast("Nodi cannot make its folders", root.cacheDir + " and " + root.stateDir + ": what you change is kept until they can be made, at the next open.")
      }
    }
  }
  // Each his alone (0700), made so or made so now: at start, and at an
  // open only until they are made. Made again at every open, they cost a
  // fork each time to cover a folder deleted while the shell runs, which
  // the next write would make again at 0755 (the marketplace's review,
  // 2026-10-10).
  function makeFolders() {
    cacheMaker.run(["/usr/bin/install", "-d", "-m", "700", root.cacheDir, root.stateDir, root.cacheDir + "/ask", root.dataDir])
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

  // Nodi's own notices (components/Toast.qml), never a notification:
  // notify-send held the words in its arguments, and Omarchy's
  // notification host puts each popup's text in bash arguments, where
  // another local user can read them in /proc (the marketplace's review,
  // 2026-10-10).
  Toast { id: toaster; look: look }

  // root.toast(title, body) from Nodi itself; over IPC (`omarchy-shell shell
  // call <id> toast "@file:<path>"`, the TOAST of a detached script, Run.js)
  // only a payload carried in a nodi-ipc folder (Carried.qml), so no words
  // ever ride in the call's argument.
  function toast(title, body) {
    if (body !== undefined) { toaster.show(title, body); return "ok" }
    var a = String(title === undefined || title === null ? "" : title)
    var text = a.indexOf("@file:") === 0 ? carried.read(a) : null
    var t = text === null ? null : Toasts.fromCarried(text)
    if (!t) return "unknown"
    toaster.show(t.title, t.body)
    return "ok"
  }

  // Actions that say how to take them back (lib/Undo.js).
  Undoer {
    id: undoer
    env: ({ PATH: Quickshell.env("PATH") || "" })
    onEntriesChanged: if (root.opened) root.recompute()
    onFailed: function(title, why) { root.toast((title || "An action") + " failed", why) }
  }

  // An answer a program of yours streams (providers/answers.js).
  Answer {
    id: answerSession
    env: ({ PATH: Quickshell.env("PATH") || "" })
    onPhaseChanged: if (root.opened) root.recompute()
  }

  readonly property var askRegistry: Agents.registry(root.config.ask)
  property var agentAvailability: ({})
  readonly property var resolvedAgent: Agents.chosen(root.config.ask && root.config.ask.agent, root.omarchyAgent,
                                                     root.prefs.askAgent, root.askRegistry, root.agentAvailability)
  property string directAskAgent: ""
  property var pendingAsk: null
  readonly property var effectiveAskAgent: root.directAskAgent || root.resolvedAgent
  readonly property string resolvedModel: Agents.modelFor(root.effectiveAskAgent, root.config.ask, root.omarchyAgent, root.askRegistry)
  readonly property string resolvedAgentId: typeof root.resolvedAgent === "string" ? root.resolvedAgent : ""
  readonly property string effectiveAgentId: typeof root.effectiveAskAgent === "string" ? root.effectiveAskAgent : ""
  readonly property string agentProgram: Agents.program(root.effectiveAskAgent, root.askRegistry)
  readonly property string resolvedAgentProgram: Agents.program(root.resolvedAgent, root.askRegistry)
  readonly property string resolvedAvailabilityKey: root.effectiveAgentId || (root.agentProgram ? "__legacy__" : "")
  readonly property bool agentMissing: !!root.resolvedAvailabilityKey && root.agentAvailability[root.resolvedAvailabilityKey] === false
  readonly property var askAgents: root.askRegistry.map(function(a) {
    var program = Agents.program(a.id, root.askRegistry)
    var reason = Agents.disabledReason(a.id)
    var available = root.agentAvailability[a.id] === true
    return { id: a.id, name: a.name, model: Agents.modelFor(a.id, root.config.ask, root.omarchyAgent, root.askRegistry),
             policy: Agents.policy(a.id, root.askRegistry),
             missing: root.agentAvailability[a.id] === false ? program : "", reason: reason, available: available,
             current: a.id === root.resolvedAgentId }
  })

  // What the agent is told of the Ask beside its question
  // (lib/PromptContext.js), seen now, as the Ask is chosen and never before:
  // the window the bar came from, and the selection only when the action is
  // about it (`context`) and the message holds its text, so the structured
  // copy never carries what the textual prompt does not.
  function askContext(message, context, purpose) {
    var snap = {
      purpose: purpose || "",
      window: Sources.windowSnapshot(root.cameFrom, root.windows),
      clipboard: root.lastCopied || "",
      primarySelection: root.selection || ""
    }
    var source = context === "copied" ? "clipboard" : context === "selection" ? "selection" : ""
    if (source && root.selectionSource === source && root.selection !== "" && String(message || "").indexOf(root.selection) !== -1) {
      var seen = source === "clipboard" ? root.copiedSeenAt : root.selectionSeenAt
      snap.selection = { text: root.selection, source: source === "clipboard" ? "clipboard" : "primary", ageMs: Math.max(0, Date.now() - seen) }
    }
    return snap
  }

  // What askContext saw, with the window's own address, which stays here:
  // taken when the Ask is chosen and carried by an Ask that waits for a
  // picture (askWindow), so that what is sent is of the window the question
  // was asked about, not of the one the bar knows when the picture is done.
  function askCapture(message, context, purpose) {
    return { snapshot: root.askContext(message, context, purpose), address: String(root.cameFrom.address || "") }
  }

  property var pendingFileAsk: null

  function askRoute(qText, agentId) {
    return PromptContext.askRoute({ answered: !!Answers.spec(qText, root.config.answers, root.cameFrom), agentId: agentId || "",
                                    busy: askSession.busy(), shooting: windowShot.active })
  }

  // An Ask, its context expanded (window, clipboard, selection and files),
  // so that an answers filter of his and an ACP agent get the same question.
  function dispatchAsk(question, rawMessage, context, purpose, extraEnv, image, filePath, agentId, answerFresh, commandQuery) {
    var qText = commandQuery || ("ask " + question)
    // Busy: nothing of this Ask is done, the field left as he has it.
    if (root.askRoute(qText, agentId) === "busy") return
    root.pendingFileAsk = null
    if (askFileReader.active) askFileReader.cancel()
    // An agent named in the field keeps its name there: "ask " would end
    // the direct Ask (queryUsesDirectAgent).
    if (!(agentId && !commandQuery) && input.text !== qText) {
      input.text = qText
      input.cursorPosition = input.text.length
    }
    var snap = root.askCapture(rawMessage || question, context, purpose).snapshot
    var env = extraEnv || (context === "selection" && root.selection ? { NODI_SELECTION: root.selection } : {})

    // Only what he typed is read for mentions (PromptContext.mentionSource):
    // selected or copied text may carry an @f: of its own.
    var targets = PromptContext.fileTargets(PromptContext.mentionSource(context, question, rawMessage), filePath, root.home)

    if (targets.length > 0) {
      var token = Math.random()
      root.pendingFileAsk = {
        question: question, rawMessage: rawMessage, context: context,
        purpose: purpose, extraEnv: env, image: image, targets: targets,
        agentId: agentId, snapshot: snap, token: token,
        answerFresh: !!answerFresh, commandQuery: commandQuery
      }
      askFileReader.run(PromptContext.fileReadArgv(targets), root.pendingFileAsk)
      return
    }

    root.finishDispatchAsk(question, rawMessage, context, purpose, env, image, snap, agentId, answerFresh, commandQuery)
  }

  function finishDispatchAsk(question, rawMessage, context, purpose, extraEnv, image, snapshot, agentId, answerFresh, commandQuery) {
    var qText = commandQuery || ("ask " + question)
    var expanded = PromptContext.expandFor(context, question, rawMessage, snapshot)
    // Again after a file read: the agent may have taken another question since.
    var route = root.askRoute(qText, agentId)
    if (route === "busy") return
    if (route === "answer") {
      var ansSpec = Answers.spec(qText, root.config.answers, root.cameFrom, expanded, extraEnv)
      if (answerFresh) ansSpec.fresh = true
      answerSession.start(ansSpec)
      return
    }
    root.askRows = ({ turn: "", rows: ({}) })
    root.startAsk(agentId || "", question, expanded, context, image, purpose, { snapshot: snapshot, address: String(root.cameFrom.address || "") })
  }

  // `captured` (askCapture) is the context of an Ask chosen earlier.
  function startAsk(id, question, message, context, image, purpose, captured) {
    if (root.pendingAsk || askSession.busy() || windowShot.active) return false
    var direct = !!id
    var target = direct ? Agents.canonicalId(id) : root.resolvedAgent
    if (direct && (!Agents.byId(root.askRegistry, target) || Agents.disabledReason(target)
        || root.agentAvailability[target] !== true)) return false
    var made = captured && captured.snapshot ? captured : root.askCapture(message, context, purpose)
    var snapshot = made.snapshot
    root.pendingAsk = { direct: direct, target: target, question: String(question || ""),
                        message: message, context: context, image: image, snapshot: snapshot, cwdWait: false }
    root.directAskAgent = direct ? target : ""
    root.askStatus = askSession.status
    // The window's working directory, one bounded read now; the Ask waits
    // for it, and goes without it when the read fails (windowCwdReader). The
    // pid goes in the reader's environment, never its argv, and only while
    // the window list still holds this window's address with that pid: a pid
    // is a number another program may take. The address stays here, out of
    // what the agent is told.
    var pid = snapshot.window.pid || 0
    var address = made.address
    var env = Sources.cwdEnv(pid)
    if (env && Sources.sameWindow(root.windows, address, pid)) {
      root.pendingAsk.cwdWait = true
      windowCwdReader.run(Sources.cwdArgv(), { pending: root.pendingAsk, pid: pid, address: address, env: env })
      return true
    }
    if (direct ? askSession.agent === target : askSession.agent === root.resolvedAgent)
      root.flushAsk()
    else Qt.callLater(root.flushAsk)
    return true
  }

  // The read of the window's working directory (Sources.cwdArgv), started
  // only by startAsk: a second at most, and 8 KB. Its answer is the
  // pending Ask's if that is still the one waiting and the window list still
  // holds the same window (address and pid) as it did at the start; failing,
  // timing out, another pid's answer, a vanished process or a replaced
  // window leave the directory out, and the Ask goes on.
  Reader {
    id: windowCwdReader
    timeoutMs: 1000
    maxBytes: 8192
    onFinished: function(text, ok, tag) {
      var pending = tag ? tag.pending : null
      if (!pending || root.pendingAsk !== pending) return
      var cwd = ok && Sources.sameWindow(root.windows, tag.address, tag.pid) ? Sources.windowCwd(text, tag.pid) : ""
      if (cwd) pending.snapshot.window.cwd = cwd
      pending.cwdWait = false
      root.flushAsk()
    }
  }

  // Bounded (PromptContext.flushStep): an Ask whose agent never comes is
  // given up, said in a toast, never left pending to refuse the next.
  function flushAsk() {
    var pending = root.pendingAsk
    if (!pending || pending.cwdWait) return
    var step = PromptContext.flushStep(pending, askSession.agent, root.resolvedAgent, root.directAskAgent)
    if (step === "wait") {
      pending.tries = (pending.tries || 0) + 1
      Qt.callLater(root.flushAsk)
      return
    }
    root.pendingAsk = null
    if (step === "drop") {
      if (!pending.prepare) root.toast("Ask did not send the question", "The agent changed while it waited; ask again")
      return
    }
    if (pending.prepare) askSession.prepare(pending.question, pending.message, pending.context)
    else askSession.send(pending.question, pending.message, pending.context, pending.image, pending.snapshot)
  }

  function prepareDirectAsk(id, question, message, context) {
    var target = Agents.canonicalId(id)
    if (!Agents.byId(root.askRegistry, target) || Agents.disabledReason(target)
        || root.agentAvailability[target] !== true) return false
    root.pendingAsk = { direct: true, prepare: true, target: target, question: String(question || ""),
                        message: message, context: context }
    root.directAskAgent = target
    if (askSession.agent === target) root.flushAsk()
    else Qt.callLater(root.flushAsk)
    return true
  }

  function selectAskAgent(id) {
    id = Agents.canonicalId(id)
    var available = root.agentAvailability[id]
    if (!Agents.byId(root.askRegistry, id) || Agents.disabledReason(id)
        || (id === root.resolvedAgentId ? available === false : available !== true)) return false
    var next = Prefs.withAskAgent(root.prefs, id)
    if (!next) return false
    if (id === root.resolvedAgentId) {
      root.savePrefs(next)
      root.directAskAgent = ""
      return true
    }
    root.askRows = ({ turn: "", rows: ({}) })
    root.savePrefs(next)
    root.directAskAgent = ""
    return true
  }

  // Availability for every palette agent, from the same login PATH its
  // session uses. The resolved agent's missing state is one entry in this
  // map, never a second interpretation of raw configuration.
  onAskRegistryChanged: agentProbe.look()
  onResolvedAgentChanged: agentProbe.look()
  onEffectiveAskAgentChanged: {
    // A palette choice or an availability change must end every operation
    // owned by the old agent before the new name is presented.
    root.shotAsk = null
    askSession.switchAway()
  }
  onAgentMissingChanged: if (root.opened) root.recompute()
  Reader {
    id: agentProbe
    timeoutMs: 5000
    // The session's PATH, as Ask's agent has it (Ask.qml environment), then
    // the login shell's: found here is found there.
    extraEnvironment: ({ PATH: Quickshell.env("PATH") || "" })
    function probeTag() {
      var all = root.askRegistry.map(function(a) {
        return [a.id, Agents.disabledReason(a.id) ? "" : Agents.program(a.id, root.askRegistry)]
      })
      if (!root.resolvedAgentId && root.resolvedAgentProgram) all.push(["__legacy__", root.resolvedAgentProgram])
      return JSON.stringify(all)
    }
    function look() {
      var argv = ["/usr/bin/bash", "-lc",
        'while [ "$#" -ge 2 ]; do id=$1 p=$2; shift 2; command -v -- "$p" >/dev/null 2>&1 && printf "%s\\tyes\\n" "$id" || printf "%s\\tno\\n" "$id"; done',
        "nodi-agent-probe"]
      for (var i = 0; i < root.askRegistry.length; i++)
        argv.push(root.askRegistry[i].id, Agents.disabledReason(root.askRegistry[i].id) ? ""
                                                   : Agents.program(root.askRegistry[i].id, root.askRegistry))
      if (!root.resolvedAgentId && root.resolvedAgentProgram) argv.push("__legacy__", root.resolvedAgentProgram)
      agentProbe.run(argv, probeTag())
    }
    onFinished: function(text, ok, tag) {
      if (tag !== agentProbe.probeTag() || !ok) return
      var found = {}
      var lines = String(text || "").trim().split("\n")
      for (var i = 0; i < lines.length; i++) {
        var pair = lines[i].split("\t")
        if (pair.length === 2) found[pair[0]] = pair[1] === "yes"
      }
      root.agentAvailability = found
      if (root.opened) root.recompute()
    }
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

  property bool askWasBusy: false

  // A quick answer from a coding agent, held open over ACP (components/Ask.qml).
  function syncAskPhase() {
    if (!askSession.busy() && root.directAskAgent && !root.queryUsesDirectAgent(root.queryNow()))
      root.directAskAgent = ""
    if (root.askWasBusy && !askSession.busy() && askSession.phase === "done" && !root.opened) {
      if (root.config.ask && root.config.ask.notifyOnDone && askSession.answer.trim()) {
        toaster.show("Answer ready: " + askSession.agentName, askSession.question)
      }
    }
    root.askWasBusy = askSession.busy()
    if (root.opened) root.recompute()
  }

  function syncAskStatus() {
    root.askStatus = askSession.status
    if (root.opened) root.recompute()
  }

  Ask {
    id: askSession
    registry: root.askRegistry
    agent: root.effectiveAskAgent
    model: root.resolvedModel
    workDir: root.cacheDir + "/ask"
    dataDir: root.dataDir
    toolServer: root.pluginDir + "/bin/nodi"
    // Codex starts an MCP server with only the variables named here.
    toolEnv: ({ WAYLAND_DISPLAY: Quickshell.env("WAYLAND_DISPLAY") || "" })
    version: String((root.manifest && root.manifest.version) || "")
    // The bar's rows as the agent's tools, unless nodi.json says
    // "ask": { "actions": false } (ROADMAP 44).
    acts: !(root.config.ask && root.config.ask.actions === false)
    mcp: AskTools.servers(root.config.ask && root.config.ask.mcpServers)
    customInstructions: String((root.config.ask && root.config.ask.instructions) || "")
    // Variables of his the agent needs beyond those Ask passes (Ask.qml).
    passed: Array.isArray(root.config.ask && root.config.ask.environment) ? root.config.ask.environment : []
    searcher: root.askSearch
    resolver: root.askResolve
    committer: root.askCommit
    shown: root.opened
    onActionTurnChanged: root.askRows = ({ turn: actionTurn, rows: ({}) })
    onPhaseChanged: Qt.callLater(root.syncAskPhase)
    onActivityChanged: if (root.opened) root.recompute()
    onInteractionRevisionChanged: if (root.opened && !askSession.form) root.recompute()
    // A status can change inside Ask's exit/reset handlers. Recomputing
    // there can select the Ask fallback and warm a new session before the
    // old handler has finished clearing it.
    onStatusChanged: Qt.callLater(root.syncAskStatus)
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
      // Once this read has ended: the reader is still active while it
      // reports, which startAsk refuses.
      var image = data ? { mediaType: "image/jpeg", data: data } : undefined
      var message = data ? a.message : a.question + "\n\n(The window could not be captured.)"
      var context = data ? a.context : ""
      Qt.callLater(function() { root.startAsk("", a.question, message, context, image, a.purpose, a.captured) })
    }
  }

  Reader {
    id: askFileReader
    timeoutMs: 1000
    maxBytes: PromptContext.FILE_READ_BYTES
    cancelable: true
    onFinished: function(text, ok, tag) {
      if (!tag || !root.pendingFileAsk || root.pendingFileAsk.token !== tag.token) return
      var pending = root.pendingFileAsk
      root.pendingFileAsk = null
      // A file not read is said so in the prompt (PromptContext.fileReads).
      pending.snapshot.files = PromptContext.attachFiles(pending.snapshot.files, pending.targets,
                                                         PromptContext.fileReads(text, ok, pending.targets))
      root.finishDispatchAsk(
        pending.question, pending.rawMessage, pending.context,
        pending.purpose, pending.extraEnv, pending.image, pending.snapshot, pending.agentId,
        pending.answerFresh, pending.commandQuery
      )
    }
  }

  // What the agent found for one turn, by key. Request tombstones live in
  // Ask for the ACP session; search rows do not cross turn boundaries.
  property var askRows: ({ turn: "", rows: ({}) })

  // The bar's ranking for a query, for an agent (lib/Engine.js agentRows).
  function agentRows(q) { return Engine.agentRows(q, root.config, root.services()) }

  // Its unfiltered top row, for a direct run that must never substitute.
  function agentTop(q) { return Engine.agentTop(q, root.config, root.services()) }

  // A row as an agent reads it; a row that asks says how.
  function agentData(r) { return NodiMcp.agentData(r) }

  // The agent's exploratory search: as data, with its live rows scoped to
  // the prompt turn that requested them.
  function askSearch(q, turnId) {
    var rows = root.agentRows(q)
    var all = root.askRows.turn === turnId ? Object.assign({}, root.askRows.rows) : {}
    for (var i = 0; i < rows.length; i++) all[rows[i].key] = rows[i]
    root.askRows = { turn: String(turnId), rows: all }
    return rows.map(root.agentData)
  }

  function askCheckRow(row) {
    if (row.confirmWord) return "That row asks for a typed word; he must run it from the bar himself."
    if (row.help) return "That top-ranked row is help and cannot be run."
    if (row.nodi) return "That top-ranked row belongs to Nodi and cannot be run by an agent."
    if (!Run.command(row.run, root.appAction, row.title)) return "That row cannot run here."
    return ""
  }

  function askClone(value) {
    if (!value || typeof value !== "object") return value
    var out = Array.isArray(value) ? [] : {}
    for (var key in value)
      if (Object.prototype.hasOwnProperty.call(value, key)) out[key] = root.askClone(value[key])
    return out
  }

  function askSnapshot(row, turnId) {
    return root.askClone({
      key: String(row.key || ""),
      title: String(row.title || ""),
      subtitle: String(row.subtitle || ""),
      risk: String(row.risk || ""),
      confirmWord: String(row.confirmWord || ""),
      run: row.run,
      toggle: row.toggle,
      rememberKey: row.remember ? String(row.key || "") : "",
      history: History.snapshot(row),
      undoable: !!row.undoable,
      provider: String(row.provider || ""),
      homeExecution: typeof row.homeExecution === "string" ? row.homeExecution : "",
      turn: String(turnId)
    })
  }

  // A direct query resolves only the top-ranked row. If that row is not
  // runnable, a lower row is never silently substituted.
  function askResolve(kind, value, turnId) {
    var row = null
    if (kind === "query") {
      row = root.agentTop(value)
    } else {
      row = root.askRows.turn === String(turnId) ? root.askRows.rows[value] : null
    }
    if (!row) return { ok: false, error: "No matching row" }
    var why = root.askCheckRow(row)
    if (why) return { ok: false, error: why }
    return { ok: true, snapshot: root.askSnapshot(row, turnId) }
  }

  // Enter executes exactly the proposal snapshot captured before the card
  // appeared; no live row is resolved at commit time.
  function askCommit(snapshot) {
    input.text = ""
    var executed = root.execute(snapshot.run, snapshot.toggle, snapshot.rememberKey,
                                snapshot.history, snapshot.title, snapshot.undoable,
                                snapshot.provider === "home" ? snapshot.key : "", snapshot.homeExecution)
    return executed
      ? { status: "executed", key: snapshot.key, title: snapshot.title }
      : { status: "failed", key: snapshot.key, title: snapshot.title,
          message: "The captured action could not be dispatched." }
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
    if (p.kind === "action" && p.snapshot) return p.snapshot
    if (p.kind === "metadataAction" && p.snapshot) return p.snapshot
    if ((p.kind === "elicitation" || p.kind === "command") && askSession.form)
      return { key: "form:" + p.kind, title: p.title || "Answer " + askSession.agentName,
               subtitle: p.subtitle || "", run: null, risk: "", confirmWord: "",
               form: askSession.form, input: {} }
    return null
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
      root.keepConversation()
      if (answerSession.phase === "done" && !root.opened) {
        if (root.config.ask && root.config.ask.notifyOnDone && answerSession.text.trim()) {
          toaster.show("Answer ready: " + (answerSession.title || answerSession.keyword), answerSession.question)
        }
      }
      if (!root.answerShown) return
      if (answerSession.phase === "done") card.announce(answerSession.title + ". " + Markdown.spoken(answerSession.text, 600))
      else if (answerSession.phase === "error") card.announce(answerSession.title + " failed. " + (answerSession.error || ""))
    }
  }

  // A direct Ask's query, and the question a query asks (lib/Agents.js).
  function queryUsesDirectAgent(query) {
    return Agents.usesDirect(query, root.askRegistry, root.directAskAgent)
  }

  function askQuestion(query) {
    return Agents.askQuestion(query, root.askRegistry, root.directAskAgent)
  }

  // The answer the card shows, while the query is the question it answers:
  // its pane from the Enter that asked it, waiting, then its words.
  readonly property var shownAskQuestion: root.askQuestion(root.composedQuery)
  readonly property bool asking: root.shownAskQuestion !== null
  readonly property bool askOn: root.asking && askSession.phase !== "idle" && askSession.question !== ""
    && askSession.question === root.shownAskQuestion
  readonly property string askShown: root.askOn ? askSession.answer : ""
  // A streamed answer (providers/answers.js), while the query is its question.
  readonly property bool answerShown: Answers.shown(root.composedQuery, root.config.answers,
    { phase: answerSession.phase, keyword: answerSession.keyword, question: answerSession.question, running: answerSession.running,
      follows: answerSession.follows(answerSession.keyword, Answers.freshFor(root.config.answers, answerSession.keyword)),
      reopened: answerSession.reopened })
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
                          busy: askSession.phase === "waiting" || askSession.phase === "streaming", status: root.askStatus,
                          error: askSession.phase === "error" ? askSession.error : "", turns: askSession.turns,
                          plans: askSession.plans, form: askSession.form,
                          answerTurn: askSession.turn !== null
                            ? askSession.actionTurn : askSession.completedTurn } : null,
      proposal: root.asking && askSession.phase === "proposing" ? root.proposed() : null,
      agent: askSession.agentName,
      answer: root.answerShown ? { question: answerSession.question, title: answerSession.title, text: answerSession.text, seq: answerSession.seq,
                                   busy: answerSession.running, turns: answerSession.turns } : null,
      word: root.wordAsk,
      // All the actions, not the ones typed for: the pane holds its width
      // while Ctrl+K is filtered (Sonnet 2026-10-06).
      palette: root.paletteOpen ? { row: root.paletteRow, action: root.paletteActions[root.paletteIndex] || null, actions: root.paletteAll,
                                    armed: !!root.paletteArmed && !!root.paletteActions[root.paletteIndex] && root.paletteArmed === root.paletteActions[root.paletteIndex].label } : null,
      row: root.selectedRow, armed: !!root.selectedRow && root.armedKey === root.selectedRow.key, anyPreview: root.anyPreview
    })
  }
  readonly property var preview: paneRead.preview
  function holdWideForOpen() {
    // Ignore the previous open's rows until recompute has caught up with the
    // current query; otherwise reopening with a different query could inherit
    // a stale wide layout.
    if (root.opened && root.shownQuery !== null && root.shownQuery === root.queryNow()
        && (root.preview !== null || (root.paletteOpen && root.anyPreview)))
      root.wideForOpen = true
  }
  onPreviewChanged: holdWideForOpen()
  onAnyPreviewChanged: holdWideForOpen()
  onPaletteOpenChanged: holdWideForOpen()
  onShownQueryChanged: holdWideForOpen()
  onOpenedChanged: if (!opened) wideForOpen = false

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
    // Held, the read that completes the rows draws them once. Otherwise
    // the rows are ranked once for every read that lands in one turn of
    // the event loop (several sockets' batches, a seed with a read).
    onArrived: if (root.opened) { if (root.homeHeld && root.homeReadsIn()) root.releaseHome(); else Qt.callLater(root.recomputeArrived) }
    // A read that brought the same rows again still completes them.
    onLanded: if (root.opened && root.homeHeld) root.settleHome()
  }

  function recomputeArrived() { if (root.opened) root.recompute() }

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
    // Sources.ZONES_READ: the local zone, then each zone tzdata has.
    zonesReader.run(Sources.zonesArgv(Tz.allZones(extra)))
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
    var icons = Object.create(null)
    var values = DesktopEntries.applications.values || []
    for (var i = 0; i < values.length; i++) {
      var e = values[i]
      var id = String(e.id || "")
      if (!id || e.noDisplay || root.hiddenApps[id]) continue
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
    root.appEntries = byId
    root.apps = list
    root.appIcons = icons
    if (root.opened) root.recompute()
    root.describeApps()
  }

  // Up to 48 app icons, decoded once and held, at the sizes the rows draw them
  // (components/ResultRow.qml: a row's tile, the top hit's larger one). A
  // row's picture loads off the GUI thread, and Qt keeps a picture nobody
  // holds only for a while, dropping a quarter of them every 30 s; the rows
  // go when the bar closes, so a later open decoded them again, and they
  // came in after the rows' words (his report 2026-10-11). These warm in the
  // background; a visible row can promote its icon ahead of them. Held here,
  // every open finds cached icons and draws them with the rows.
  // A few MB.
  readonly property var warmIcons: {
    var seen = ({})
    var out = []
    for (var i = 0; i < root.apps.length && out.length < 48; i++) {
      var icon = root.apps[i].icon
      if (icon && !seen[icon]) { seen[icon] = true; out.push(icon) }
    }
    return out
  }
  Item {
    visible: false
    Repeater {
      model: root.warmIcons
      Item {
        required property string modelData
        IconRef { id: warm; nodi: root; value: modelData; background: true }
        IconTile { imageSource: warm.url; size: root.tileSize }
        IconTile { imageSource: warm.url; size: Math.round(root.tileSize * 1.4) }
      }
    }
  }

  Images { id: images; pluginDir: decodeURIComponent(root.pluginDir); onRasterChanged: function(key) { root.rasterChanged(key) } }

  // A picture's raster landed or went, by its key ("" for all): each
  // IconRef reads its own source again on its own key alone.
  signal rasterChanged(string key)
  function iconKey(icon, large) { return images.keyOf(String(icon || "") || "application-x-executable", large) }
  // Called by an IconRef's binding, which says when to call it again; an
  // open asks again for the stale ones (images.refreshStale).
  function iconSource(icon, large, background) {
    var value = String(icon || "")
    return images.source(value || "application-x-executable", !!large, !!background, !!root.appIcons[value])
  }

  Timer {
    id: appsDebounce
    interval: 300
    onTriggered: { root.rebuildApps(); images.catalog(root.apps) }
  }

  Connections {
    target: DesktopEntries.applications
    function onValuesChanged() { appsDebounce.restart() }
  }

  // GTK resolves named icons through this theme. Keep their rasters until
  // the catalog or theme changes; a settings edit starts a new cache epoch.
  FileView {
    path: root.home + "/.config/gtk-3.0/settings.ini"
    watchChanges: true
    printErrors: false
    property bool initialized: false
    property string iconTheme: ""
    onLoaded: {
      var match = /^\s*gtk-icon-theme-name\s*=\s*(.*?)\s*$/m.exec(String(text()))
      var current = match ? match[1] : ""
      if (initialized && current !== iconTheme) images.invalidate("icon theme changed")
      iconTheme = current
      initialized = true
    }
    onLoadFailed: {
      if (initialized && iconTheme !== "") images.invalidate("icon theme unreadable")
      iconTheme = ""
      initialized = true
    }
    onFileChanged: reload()
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
    describer.run(Describe.argv(model, list, root.cacheDir + "/ask"), { list: list, env: { NODI_TEXT: Describe.request(list) } })
  }

  Reader {
    id: describer
    timeoutMs: 60000
    onFinished: function(text, ok, tag) {
      var fresh = ok ? Describe.parse(text, (tag && tag.list) || []) : null
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

  // Nodi's own (lib/Reminders.js), kept in its 0700 state folder and shown
  // as its own toast: Omarchy's reminder held the words in the arguments of
  // its timer and its notifications (the marketplace's review, 2026-10-10),
  // and asking it for its list made its own jq hold each one. Looked at by
  // the wall clock every fifteen seconds while one is set, at each open
  // and at the shell's start, so one due while the machine slept or the
  // shell was off is shown as soon as it can be, said as late.
  property bool remindersLoaded: false
  property bool remindersWaiting: false
  property int remindersMade: 0
  readonly property bool clock24: !(root.config.time && root.config.time.clock24 === false)

  FileView {
    id: remindersFile
    path: root.stateDir + "/reminders.json"
    printErrors: false
    atomicWrites: true
    // Read once, at the start: those set before it was read are kept with
    // its own; a file with an error is left as it is (Reminders.broken).
    onLoaded: {
      var why = Reminders.broken(text())
      var held = root.reminders
      root.remindersBroken = why
      if (why) root.toast("reminders.json has an error",
        why + ". Nodi neither reads it nor writes over it until it is fixed or removed and the shell restarted: " + root.stateDir + "/reminders.json")
      else root.reminders = Reminders.merged(Reminders.parse(text()), held)
      root.remindersLoaded = true
      if (held.length) root.saveReminders()
      root.checkReminders()
    }
    onLoadFailed: { root.remindersLoaded = true; if (root.reminders.length) root.saveReminders(); root.checkReminders() }
  }
  property string remindersBroken: ""

  // Once its folder is made his alone, as prefs.json is (savePrefs).
  function saveReminders() {
    if (!root.remindersLoaded) return
    if (root.remindersBroken) return
    if (!root.cacheReady) { root.remindersWaiting = true; return }
    remindersFile.setText(Reminders.serialize(root.reminders))
  }

  function checkReminders() {
    if (!root.remindersLoaded) return
    var now = Date.now()
    var d = Reminders.due(root.reminders, now)
    if (!d.fire.length) return
    for (var i = 0; i < d.fire.length; i++) {
      var t = Reminders.toast(d.fire[i], now, root.clock24)
      root.toast(t.title, t.body)
    }
    root.reminders = d.keep
    root.saveReminders()
    if (root.opened) root.recompute()
  }

  Timer {
    interval: 15000
    repeat: true
    running: root.reminders.length > 0
    onTriggered: root.checkReminders()
  }

  function setReminder(data) {
    var now = Date.now()
    var made = Reminders.add(root.reminders, data.minutes, data.message, now, now.toString(36) + "-" + (++root.remindersMade))
    if (!made) { root.toast("Reminder not set", "Fifty are set already, or the time is out of range"); return }
    root.reminders = made.list
    root.saveReminders()
    root.toast(made.entry.message || "Reminder set", "At " + Reminders.clock(made.entry.at, root.clock24))
  }

  function clearReminders() {
    root.reminders = []
    root.saveReminders()
    root.toast("Reminders cleared", "")
  }

  // ---------------------------------------------------------------- themes

  // The current theme, watched: a switch is the next open's at once, with
  // no probe at each open (lib/Probes.js keeps the list ten minutes). The
  // name is written after the theme is in place (omarchy-theme-set), and
  // read once it has settled.
  FileView {
    path: root.home + "/.local/state/omarchy/current/theme.name"
    watchChanges: true
    printErrors: false
    onFileChanged: { reload(); themeSwitched.restart() }
  }
  Timer { id: themeSwitched; interval: 200; onTriggered: { themeColors.reload(); root.refreshThemes() } }

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
    // Each his alone (0700), made so or made so now: they hold what he
    // typed, pinned and set (codex's review, 2026-10-09).
    agentProbe.look()
    root.makeFolders()
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

    Rectangle {
      anchors.fill: parent
      color: root.scrim
      opacity: root.entered || root.reducedMotion ? 1.0 : 0.0
      Behavior on opacity {
        enabled: !root.reducedMotion
        NumberAnimation { duration: 90; easing.type: Easing.OutCubic }
      }
    }

    MouseArea { anchors.fill: parent; onClicked: root.dismiss() }

    Card {
      id: card
      nodi: root
      x: look.cardX
      y: look.cardTop
      // Unseen until the empty bar's rows are whole so the card fades in whole
      // without popping from text-bar to expanded overlay.
      opacity: (!root.contentHeld && (root.entered || root.reducedMotion)) ? 1.0 : 0.0
      scale: root.entered || root.reducedMotion ? 1.0 : 0.96
      transformOrigin: Item.Center

      Behavior on opacity {
        enabled: !root.reducedMotion && !root.contentHeld
        NumberAnimation { duration: 120; easing.type: Easing.OutCubic }
      }
      Behavior on scale {
        enabled: !root.reducedMotion
        NumberAnimation { duration: 120; easing.type: Easing.OutCubic }
      }
    }
  }
}
