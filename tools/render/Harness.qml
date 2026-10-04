import QtQuick
import QtQuick.Window
import "components"
import "scenes.js" as Scenes
import "lib/Rows.js" as Rows

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
    readonly property int heroHeight: look.heroHeight
    readonly property int sectionHeight: look.sectionHeight
    readonly property int footerHeight: look.footerHeight
    readonly property int tileSize: look.tileSize
    readonly property int tileRadius: look.tileRadius
    readonly property int cardWidth: look.cardWidth
    readonly property int listColumn: look.listColumn
    readonly property int paneMin: look.paneMin
    readonly property bool anyPreview: rows.some(function(r) { return !!r.preview })
    readonly property var preview: paletteOpen ? null
      : (answerShown !== "" ? { title: typed.replace(/^\s*ask\s+/i, ""), subtitle: "Claude, haiku", text: answerShown, follow: true }
         : readPreview((selectedRow && selectedRow.preview) || (anyPreview && selectedRow ? { title: selectedRow.title, subtitle: selectedRow.subtitle } : null)))
    // A scene's `reads` stand in for the reader: path -> what file-head gives.
    property var reads: ({})
    function readPreview(p) {
      if (!p || !p.read) return p
      var v = reads[p.read.param]
      return Rows.withRead(p, v ? { state: "ready", value: v } : { state: "pending" }, function() { return "2026-10-03 21:40" })
    }
    readonly property int answerMax: look.answerMax
    property string answerShown: ""

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
    fake.paletteActions = s.paletteActions
    fake.paletteIndex = s.paletteIndex
    fake.paletteArmed = s.paletteArmed
    fake.paletteRow = s.paletteRow
    fake.paletteOpen = s.paletteOpen
    fake.armedKey = s.armedKey
    fake.ctrlHeld = !!s.ctrlHeld
    fake.reads = s.reads || ({})
    fake.aliasRow = s.aliasRow || null
    fake.answerShown = s.answer || ""
    card.input.text = s.query
    card.list.positionViewAtIndex(s.selectedIndex, ListView.Contain)
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

  Timer {
    id: settle
    interval: 250
    onTriggered: {
      var name = Scenes.scenes[win.current].name
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
