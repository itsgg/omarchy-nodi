import QtQuick
import QtQuick.Window
import "components"
import "scenes.js" as Scenes
import "lib/Rows.js" as Rows
import "lib/Pane.js" as Pane

// Draws Nodi's real card (components/Card.qml) for each scene in
// scenes.js and saves it as a PNG, on Qt's offscreen platform. The card
// reads everything from `nodi`; here that is a stand-in holding a scene's
// rows and state, with the bar's own look and sizes (components/Look.qml).
Window {
  id: win
  visible: true
  width: look.cardWidth + 120
  height: 1000
  color: look.scrim

  readonly property string outDir: Qt.application.arguments[Qt.application.arguments.length - 1]
  property int current: -1

  Look { id: look; screenWidth: 1920; screenHeight: 1200; wide: fake.preview !== null || (fake.paletteOpen && fake.anyPreview) }

  QtObject {
    id: fake
    readonly property color background: look.background
    readonly property color foreground: look.foreground
    readonly property var selectedBorderSpec: look.selectedBorderSpec
    readonly property real rowInsetLeft: look.rowInsetLeft
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
      ask: answerShown !== "" ? { question: typed.replace(/^\s*ask\s+/i, ""), model: "haiku", text: answerShown } : null,
      answer: streamed, word: wordAsk,
      palette: paletteOpen ? { row: paletteRow, action: paletteActions[paletteIndex] || null, actions: paletteActions,
                               armed: !!paletteArmed && !!paletteActions[paletteIndex] && paletteArmed === paletteActions[paletteIndex].label } : null,
      row: selectedRow, armed: !!selectedRow && armedKey === selectedRow.key, anyPreview: anyPreview
    }))
    // A scene's `reads` stand in for the reader: path -> what file-head gives.
    property var reads: ({})
    function readPreview(p) {
      if (!p || !p.read) return p
      var v = reads[p.read.param]
      return Rows.withRead(p, v ? { state: "ready", value: v } : { state: "pending" }, function() { return "2026-10-03 21:40" })
    }
    readonly property int answerMax: look.answerMax
    property string answerShown: ""
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
    function queryChanged() {}
    function handleKey() { return false }
    function focusInput() {}
    function activate() {}
    function runPaletteAction() {}
    function paletteTyped() {}
  }

  // What is grabbed: the card on the bar's scrim over an opaque backdrop
  // (the scrim is translucent), with a margin round it.
  Rectangle {
    id: frame
    width: card.width + 120
    height: card.height + 80
    color: Qt.darker(look.background, 1.4)

    Rectangle { anchors.fill: parent; color: look.scrim }

    Card {
      id: card
      nodi: fake
      x: 60
      y: 40
    }
  }

  function show(i) {
    var s = Scenes.scenes[i]
    fake.typed = s.query
    fake.rows = s.rows
    fake.mode = s.mode
    fake.selectedIndex = s.selectedIndex
    // Open before the index: the palette's list takes its model on open,
    // which puts its current index back to 0 (Fable 2026-10-05).
    fake.paletteActions = s.paletteActions
    fake.paletteRow = s.paletteRow
    fake.paletteOpen = s.paletteOpen
    fake.paletteIndex = s.paletteIndex
    fake.paletteArmed = s.paletteArmed
    fake.armedKey = s.armedKey
    fake.ctrlHeld = !!s.ctrlHeld
    fake.reads = s.reads || ({})
    fake.aliasRow = s.aliasRow || null
    fake.answerShown = s.answer || ""
    fake.streamed = s.streamed || null
    fake.wordAsk = s.wordAsk || null
    card.input.text = s.query
    card.paletteInput.text = s.paletteFilter || ""
    card.keepVisible(s.selectedIndex)
  }

  // One scene at a time: set it, let it lay out and paint, grab it, and
  // only when the grab is saved go on, since a grab is taken on a later
  // frame than the one that asked for it.
  function next() {
    win.current++
    if (win.current >= Scenes.scenes.length) { quitTimer.start(); return }
    win.show(win.current)
    settle.restart()
  }

  // A scene may carry `after`: states applied one a settle before the
  // grab, as keys would apply them, to see what a sequence leaves behind
  // (Fable's review harness 2026-10-05).
  property int step: 0

  // The selected row whole in the list's view, with the list up: a list
  // that lost its scroll hides it (Fable 2026-10-05). The log line fails
  // tools/render.sh.
  function checkSelected(name) {
    if (fake.paletteOpen || !fake.rows.length) return
    var l = card.list
    var it = l.itemAtIndex(fake.selectedIndex)
    if (!it || it.y < l.contentY - 0.5 || it.y + it.height > l.contentY + l.height + 0.5)
      console.log("Error: " + name + ": the selected row is out of view (contentY " + l.contentY + ", height " + l.height + ")")
  }

  Timer {
    id: settle
    interval: 250
    onTriggered: {
      var s = Scenes.scenes[win.current]
      var name = s.name
      if (s.after && win.step < s.after.length) {
        // In Nodi's order (openPalette): the actions before the palette
        // opens, the index after, as show() sets them (Fable 2026-10-05).
        var o = s.after[win.step++]
        var first = ["paletteActions", "paletteRow", "paletteOpen"]
        first.forEach(function(k) { if (k in o) fake[k] = o[k] })
        for (var k in o) if (first.indexOf(k) === -1) fake[k] = o[k]
        settle.restart()
        return
      }
      win.step = 0
      win.checkSelected(name)
      frame.grabToImage(function(result) {
        result.saveToFile(win.outDir + "/" + name + ".png")
        console.log("SHOT " + name)
        win.next()
      })
    }
  }

  Component.onCompleted: next()

  Timer { id: quitTimer; interval: 400; onTriggered: Qt.quit() }
}
