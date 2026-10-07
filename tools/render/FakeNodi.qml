import QtQuick
import "lib/Rows.js" as Rows
import "lib/Pane.js" as Pane
import "lib/Ansi.js" as Ansi
import "qs/Commons/Theme.js" as Theme

// A stand-in for Nodi's root, as Card.qml reads it: a scene's rows and
// state, the bar's own Look (`look`), and its functions as no-ops that
// note each call in `calls`, for tools/render/Harness.qml and the UI tests
// (tests/ui, ROADMAP 74).
QtObject {
  id: fake
  property var look
  property var calls: []
  function note(name, args) { var c = fake.calls.slice(); c.push([name].concat(args || [])); fake.calls = c }
  readonly property color background: look.background
  readonly property color foreground: look.foreground
  readonly property var selectedBorderSpec: look.selectedBorderSpec
  readonly property real rowInsetLeft: look.rowInsetLeft
  readonly property bool selectionBar: look.selectionBar
  readonly property bool reducedMotion: false
  readonly property int barWidth: look.barWidth
  readonly property int barInset: look.barInset
  readonly property real rowInsetRight: look.rowInsetRight
  readonly property color secondary: look.secondary
  readonly property color opaqueCard: look.opaqueCard
  readonly property color secondaryOnSelected: look.secondaryOnSelected
  readonly property color selectedInk: look.selectedInk
  readonly property var borderSpec: look.borderSpec
  readonly property color scrim: look.scrim
  readonly property color selectedBackground: look.selectedBackground
  readonly property color selectedText: look.selectedText
  readonly property int cornerRadius: look.cornerRadius
  readonly property string fontFamily: look.fontFamily
  readonly property int contentMargin: look.contentMargin
  readonly property int inputFont: look.inputFont
  readonly property int inputHeight: look.inputHeight
  readonly property int rowHeight: look.rowHeight
  readonly property int rowPeek: look.rowPeek
  function paletteHeight(actions) { return look.paletteHeight(actions) }
  readonly property int heroHeight: look.heroHeight
  readonly property int sectionHeight: look.sectionHeight
  readonly property int footerHeight: look.footerHeight
  readonly property int tileSize: look.tileSize
  readonly property int tileRadius: look.tileRadius
  readonly property int cardWidth: look.cardWidth
  readonly property int listColumn: look.listColumn
  readonly property int paneMin: look.paneMin
  readonly property bool anyPreview: rows.some(Pane.hasPane)
  readonly property var preview: readPreview(Pane.choose({
    paletteOpen: paletteOpen,
    ask: askPane ? Object.assign({ question: typed.replace(/^\s*ask\s+/i, ""), agent: "Claude", model: "haiku", text: answerShown }, askPane)
       : answerShown !== "" ? { question: typed.replace(/^\s*ask\s+/i, ""), agent: "Claude", model: "haiku", text: answerShown } : null,
    answer: streamed, word: wordAsk,
    palette: paletteOpen ? { row: paletteRow, action: paletteActions[paletteIndex] || null, actions: paletteActions,
                             armed: !!paletteArmed && !!paletteActions[paletteIndex] && paletteArmed === paletteActions[paletteIndex].label } : null,
    row: selectedRow, armed: !!selectedRow && armedKey === selectedRow.key, anyPreview: anyPreview
  }))
  // The theme's sixteen colours, as Nodi.qml reads them.
  readonly property var themeColours: Ansi.paletteFrom(Theme.theme.colorsToml)
  // A scene's `reads` stand in for the reader: path -> what file-head gives.
  property var reads: ({})
  function readPreview(p) {
    if (!p || !p.read) return p
    var v = reads[p.read.param]
    return Rows.withRead(p, v ? { state: "ready", value: v } : { state: "pending" }, function() { return "2026-10-03 21:40" })
  }
  readonly property int answerMax: look.answerMax
  property string answerShown: ""
  // An answer on its way, as Nodi.qml hands Pane.js one: { busy, status, error }.
  property var askPane: null
  // A streamed answer's { question, title, text }, as Nodi.qml hands Pane.js one.
  property var streamed: null
  // A confirm word being asked: { title, word, run, risk }.
  property var wordAsk: null

  property var rows: []
  property int selectedIndex: 0
  property var mode: null
  property bool paletteOpen: false
  property bool ctrlHeld: false
  property var paletteActions: []
  property int paletteIndex: 0
  property string paletteArmed: ""
  property var paletteRow: null
  property string armedKey: ""
  property var aliasRow: null
  property string typed: ""
  readonly property string placeholder: "Search, or try \"100 usd to eur\""
  property point lastPointer: Qt.point(-1, -1)
  readonly property var selectedRow: rows[selectedIndex] || null
  readonly property string argsHint: paletteOpen ? "" : ((selectedRow && selectedRow.hint) || (mode && mode.hint) || "")
  readonly property bool showingHelp: rows.length > 0 && !!rows[0].help
  readonly property bool noResults: rows.length === 0 && typed.trim() !== ""
  readonly property bool inHelpTopic: /^\s*\?\s*\S/.test(typed)
  readonly property real listHeight: look.listHeight(rows, showingHelp)

  function rowSize(row) { return look.rowSize(row) }
  function iconSource(icon) { return icon ? "file://" + String(icon).split("/").map(encodeURIComponent).join("/") : "" }
  function paletteContext() { return { activeWorkspace: 1, knows: function() { return true } } }
  // What the query reads as the bar is told it changed: a test sets
  // `probe` to read it as Nodi would (card.composedNow).
  property var probe: null
  function queryChanged() { fake.note("queryChanged", fake.probe ? [fake.probe()] : []) }
  // Noted, and left to the field, as the real one leaves a letter.
  function handleKey(key, modifiers) { fake.note("handleKey", [key, modifiers || 0]); return false }
  function focusInput() { fake.note("focusInput") }
  function activate(index) { fake.note("activate", [index]) }
  function openPalette() { fake.note("openPalette", [fake.selectedIndex]); return fake.opens }
  // What openPalette answers: whether the row had actions to open.
  property bool opens: true
  function runPaletteAction(index) { fake.note("runPaletteAction", [index]) }
  function paletteTyped() {}
}
