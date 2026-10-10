import QtQuick
import qs.Commons
import qs.Ui
import "../lib/Scroll.js" as Scroll

// The bar itself: the search field, the results or Ctrl+K's actions, and
// the footer. Everything it shows and does comes from `nodi`, the Nodi
// root, so the render harness can hand it any state.
BorderSurface {
  id: card
  property var nodi
  readonly property alias input: input
  readonly property alias paletteInput: paletteInput
  readonly property alias list: list
  // What is typed, with an input method's composition in it while it is
  // composed (ROADMAP 76): results follow the preedit, as Vicinae's
  // consider_preedit does, not only what is committed.
  readonly property string composed: composedNow()
  // Read at the moment, for a handler of the field's change (Nodi.queryNow).
  function composedNow() {
    return input.preeditText !== "" ? input.text.slice(0, input.cursorPosition) + input.preeditText + input.text.slice(input.cursorPosition) : input.text
  }
  width: nodi.cardWidth
  height: contentTopInset + contentBottomInset + layout.implicitHeight
  radius: nodi.cornerRadius
  color: nodi.background
  borderSpec: nodi.borderSpec
  padding: nodi.contentMargin
  // Animated only once the card is up: at the open it takes its size at
  // once, where the animations played from the size it had when it last
  // closed, the jerk he saw as the bar opened (2026-10-05). Nodi.qml turns
  // this on after the first frame and off at the close.
  property bool animated: false
  // What it holds stays inside it: while the card grows or narrows, the
  // rows and the pane are laid out at their new size at once, and drawn
  // past its edge they showed on the scrim with no card behind them,
  // longest when a loaded machine stretched the animation over slow frames
  // (his report 2026-10-07; tests/ui/tst_grow.qml).
  clip: true
  // None under reduced motion (ROADMAP 73).
  Behavior on height { enabled: card.animated && !nodi.reducedMotion; NumberAnimation { duration: 90; easing.type: Easing.OutCubic } }
  // The pane comes and goes with the selected row: Kadhir's 140 ms.
  Behavior on width { enabled: card.animated && !nodi.reducedMotion; NumberAnimation { duration: 140; easing.type: Easing.OutCubic } }

  MouseArea { anchors.fill: parent; onClicked: {} }

  // The pane beside the list, by lines or pages, from the keyboard.
  function scrollPane(lines, pages) { pane.scroll(lines, pages) }

  // The row at `index` in view, clear of the fades (lib/Scroll.js).
  function keepVisible(index) { Scroll.keep(list, index, nodi.rowPeek, ListView.Contain) }
  // Whether the pane holds text to scroll: a picture or a title alone does
  // not, and Shift+Down there moves the list as it did.
  readonly property bool paneScrolls: pane.visible && pane.hasText

  // ---------- what a screen reader is told (item 71) ----------
  // The field is a search edit named Nodi, its description the selected
  // row; the results a list of rows, the selected one marked; and what
  // changes is announced, politely, the last of a burst (150 ms) only,
  // so a word typed is one announcement: the count and the first row
  // after typing, the row the selection moves to and its place, No match
  // with the first fallback, an armed row's second Enter, and Ctrl+K's
  // actions. Qt's AT-SPI bridge (Qt 6.8 and on) sends an announcement as
  // object:announcement; the bridge starts only when a screen reader asks.
  function spoken(r) {
    if (!r) return ""
    return String(r.title || "") + (r.subtitle ? ", " + r.subtitle : "") + (r.badge ? ", " + r.badge : "")
  }
  readonly property string selectedSpoken: nodi.paletteOpen
    ? (nodi.paletteActions && nodi.paletteActions[nodi.paletteIndex] ? String(nodi.paletteActions[nodi.paletteIndex].label || "") : "")
    : card.spoken(nodi.rows[nodi.selectedIndex])
  property bool rowsMoved: false
  property string lastSaid: ""
  // What the rows were when last announced: a recompute that hands the
  // same rows again (a timer, a read landing) says nothing (Sonnet
  // 2026-10-06: each one said "N results" again).
  property string rowsSaid: ""
  property bool paletteFresh: false
  function rowsKey(rows) {
    var parts = [String(card.composedNow())]
    for (var i = 0; i < rows.length; i++) parts.push(String(rows[i].key) + "\u0001" + card.spoken(rows[i]))
    return parts.join("\u0002")
  }
  // A new open is heard afresh, the same rows as last time included.
  function hearAfresh() {
    card.lastSaid = ""
    card.rowsSaid = ""
  }
  // Words to say as they are (an answer as it ends, Nodi.qml), once.
  property string direct: ""
  function announce(text) {
    card.direct = String(text || "")
    speaker.restart()
  }
  function speak(rowsChanged) {
    if (rowsChanged) {
      var k = card.rowsKey(nodi.rows || [])
      if (k === card.rowsSaid) return
      card.rowsSaid = k
      card.rowsMoved = true
    }
    speaker.restart()
  }
  function utterance() {
    var rows = nodi.rows || []
    var n = rows.length
    if (nodi.paletteOpen) {
      var acts = nodi.paletteActions || []
      var a = acts[nodi.paletteIndex]
      if (a && a.confirm && nodi.paletteArmed === a.label) return "Enter again to " + a.label
      var said = a ? a.label + ", " + (nodi.paletteIndex + 1) + " of " + acts.length : "None match"
      // Whose actions, once as it opens; then the action alone, as keys
      // move or words filter (Sonnet 2026-10-06).
      return card.paletteFresh ? "Actions for " + (nodi.paletteRow ? nodi.paletteRow.title : "the row") + ". " + said : said
    }
    var r = rows[nodi.selectedIndex]
    if (r && nodi.armedKey !== "" && nodi.armedKey === r.key) return "Enter again to " + r.title
    if (n === 0) return card.composed.trim() !== "" ? "No match" : ""
    var place = card.spoken(r) + ", " + (nodi.selectedIndex + 1) + " of " + n
    // Only fallbacks: No match, and the first of them; a key moving among
    // them says each, as among rows (Sonnet 2026-10-06: they were silent).
    if (rows[0].provider === "fallback") return card.rowsMoved ? "No match. " + card.spoken(r) : place
    if (card.rowsMoved) return n + (n === 1 ? " result. " : " results. ") + card.spoken(r)
    return place
  }
  Timer {
    id: speaker
    interval: 150
    onTriggered: {
      var direct = card.direct
      var text = direct || card.utterance()
      card.direct = ""
      card.rowsMoved = false
      card.paletteFresh = false
      // The same words again are not said twice in a row, but for an
      // answer, said as asked each time.
      if (!text || (!direct && text === card.lastSaid)) return
      card.lastSaid = text
      list.Accessible.announce(text)
    }
  }
  Connections {
    target: card.nodi
    function onRowsChanged() { card.speak(true) }
    function onSelectedIndexChanged() { card.speak(false) }
    function onArmedKeyChanged() { card.speak(false) }
    function onPaletteOpenChanged() { card.paletteFresh = card.nodi.paletteOpen; card.speak(false) }
    function onPaletteIndexChanged() { card.speak(false) }
    function onPaletteActionsChanged() { card.speak(false) }
    function onPaletteArmedChanged() { card.speak(false) }
  }

  // What the card takes besides its results and pane: the insets, the
  // field, the argument line, the rule, a no-match note, the footer and the
  // gaps between what shows (a Column's spacing falls between visible
  // children only). Look.bodyMax gives the results the rest (item 70).
  readonly property real chrome: {
    var parts = [field.height, argLine.visible ? argLine.implicitHeight : -1, rule.visible ? rule.height : -1,
                 none.visible ? none.implicitHeight : -1, footer.visible ? footer.height : -1, body.visible ? 0 : -1]
    var h = 0
    var shown = 0
    for (var i = 0; i < parts.length; i++) if (parts[i] >= 0) { h += parts[i]; shown++ }
    return card.contentTopInset + card.contentBottomInset + h + layout.spacing * Math.max(0, shown - 1)
  }

  Column {
    id: layout
    anchors.left: parent.left
    anchors.right: parent.right
    anchors.top: parent.top
    anchors.topMargin: card.contentTopInset
    anchors.rightMargin: card.contentRightInset
    anchors.leftMargin: card.contentLeftInset
    spacing: Style.spacing.md

    // ---------- search field ----------
    Item {
      id: field
      width: parent.width
      height: nodi.inputHeight

      // In the tiles' column, so what is typed starts where a row's title
      // does (Fable 2026-10-05).
      Text {
        id: promptGlyph
        textFormat: Text.PlainText
        anchors.left: parent.left
        anchors.leftMargin: Style.spacing.lg + nodi.rowInsetLeft
        anchors.verticalCenter: parent.verticalCenter
        width: nodi.tileSize
        horizontalAlignment: Text.AlignHCenter
        text: "󰍉"
        color: nodi.secondary
        font.family: nodi.fontFamily
        font.pixelSize: Math.round(nodi.inputFont * 1.05)
      }

      TextInput {
        id: input
        // Under Ctrl+K its own field takes this one's place, so the query
        // waits here as it was (ROADMAP 52).
        visible: !nodi.paletteOpen
        anchors.left: promptGlyph.right
        anchors.leftMargin: Style.spacing.xxl
        anchors.right: modeChip.visible ? modeChip.left : (helpHint.visible ? helpHint.left : parent.right)
        anchors.rightMargin: Style.spacing.md
        anchors.verticalCenter: parent.verticalCenter
        color: nodi.foreground
        selectionColor: nodi.selectedBackground
        selectedTextColor: nodi.selectedText
        font.family: nodi.fontFamily
        font.pixelSize: nodi.inputFont
        clip: true
        focus: true
        onTextChanged: nodi.queryChanged()
        onPreeditTextChanged: nodi.queryChanged()
        Accessible.name: "Nodi"
        Accessible.searchEdit: true
        Accessible.description: card.selectedSpoken
        // Hidden under Ctrl+K, and so from a screen reader too.
        Accessible.ignored: !visible

        Text {
          textFormat: Text.PlainText
          anchors.fill: parent
          verticalAlignment: Text.AlignVCenter
          // Not over a composition either (Sonnet 2026-10-07: it drew on it).
          objectName: "placeholder"
          visible: !card.composed
          // Naming an alias, the field takes a word, not a search: it
          // suggested "uuid" there (2026-10-10, driven live).
          text: nodi.aliasRow ? "A word for " + String(nodi.aliasRow.title || "this row") : (nodi.placeholder || "Search")
          color: nodi.secondary
          font: input.font
          elide: Text.ElideRight
        }

        Keys.priority: Keys.BeforeItem
        Keys.onPressed: function(event) {
          // From the modifiers too, so a Ctrl already down when the bar opens counts.
          nodi.ctrlHeld = event.key === Qt.Key_Control || (event.modifiers & Qt.ControlModifier) !== 0
          if (nodi.handleKey(event.key, event.modifiers, event.isAutoRepeat)) event.accepted = true
        }
        // While Ctrl is held the first nine rows show the digit that runs them.
        Keys.onReleased: function(event) { if (event.key === Qt.Key_Control) nodi.ctrlHeld = false }
        onActiveFocusChanged: if (!activeFocus) nodi.ctrlHeld = false
      }

      // What is typed while Ctrl+K is up: it filters the actions, by the
      // words that start theirs.
      TextInput {
        id: paletteInput
        visible: nodi.paletteOpen
        anchors.left: promptGlyph.right
        anchors.leftMargin: Style.spacing.xxl
        anchors.right: input.right
        anchors.verticalCenter: parent.verticalCenter
        color: nodi.foreground
        selectionColor: nodi.selectedBackground
        selectedTextColor: nodi.selectedText
        font.family: nodi.fontFamily
        font.pixelSize: nodi.inputFont
        clip: true
        onTextChanged: nodi.paletteTyped(text)
        Accessible.name: "Actions for " + (nodi.paletteRow ? nodi.paletteRow.title : "the row")
        Accessible.searchEdit: true
        Accessible.description: card.selectedSpoken
        Accessible.ignored: !visible

        Text {
          textFormat: Text.PlainText
          anchors.fill: parent
          verticalAlignment: Text.AlignVCenter
          visible: !paletteInput.text
          text: "Search actions"
          color: nodi.secondary
          font: paletteInput.font
          elide: Text.ElideRight
        }

        Keys.priority: Keys.BeforeItem
        Keys.onPressed: function(event) {
          if (nodi.handleKey(event.key, event.modifiers, event.isAutoRepeat)) event.accepted = true
        }
      }

      // The mode a prefix puts the bar in: Emoji, Windows, Search Google.
      Rectangle {
        id: modeChip
        visible: !!nodi.mode
        anchors.right: parent.right
        anchors.rightMargin: Style.spacing.lg + nodi.rowInsetRight
        anchors.verticalCenter: parent.verticalCenter
        implicitWidth: chipRow.implicitWidth + Style.spacing.lg * 2
        implicitHeight: chipRow.implicitHeight + Style.spacing.sm * 2
        width: implicitWidth
        height: implicitHeight
        // No rounder than the card it sits in (his ruling 2026-10-04).
        radius: Math.min(nodi.cornerRadius, height / 2)
        color: nodi.selectedBackground

        Row {
          id: chipRow
          anchors.centerIn: parent
          spacing: Style.spacing.md
          Text {
            textFormat: Text.PlainText
            anchors.verticalCenter: parent.verticalCenter
            text: nodi.mode ? (nodi.mode.icon || "") : ""
            visible: text !== ""
            color: nodi.selectedInk
            font.family: nodi.fontFamily
            font.pixelSize: Style.font.body
          }
          Text {
            textFormat: Text.PlainText
            anchors.verticalCenter: parent.verticalCenter
            text: nodi.mode ? nodi.mode.label : ""
            color: nodi.selectedInk
            font.family: nodi.fontFamily
            font.pixelSize: Style.font.bodySmall
            font.bold: true
          }
        }
      }

      Row {
        id: helpHint
        objectName: "helpHint"
        visible: !nodi.mode && !card.composed
        anchors.right: parent.right
        anchors.rightMargin: Style.spacing.lg + nodi.rowInsetRight
        anchors.verticalCenter: parent.verticalCenter
        spacing: Style.spacing.md
        Keycap { label: "?"; anchors.verticalCenter: parent.verticalCenter; foreground: nodi.foreground; fontFamily: nodi.fontFamily; rounded: nodi.cornerRadius > 0 }
        Text {
          textFormat: Text.PlainText
          anchors.verticalCenter: parent.verticalCenter
          text: "for help"
          color: nodi.secondary
          font.family: nodi.fontFamily
          font.pixelSize: Style.font.caption
        }
      }
    }

    // The words the selected row or the mode takes, as a pattern: a label
    // under the field instead of a sentence in a row (item 25).
    Text {
      id: argLine
      width: parent.width
      visible: nodi.argsHint !== ""
      // Under what is typed, which it describes.
      leftPadding: Style.spacing.lg + nodi.rowInsetLeft + nodi.tileSize + Style.spacing.xxl
      bottomPadding: Style.spacing.md
      textFormat: Text.PlainText
      text: nodi.argsHint
      horizontalAlignment: Text.AlignLeft
      color: nodi.secondary
      font.family: nodi.fontFamily
      font.pixelSize: Style.font.caption
      elide: Text.ElideRight
    }

    Rectangle {
      id: rule
      width: parent.width
      height: 1
      color: nodi.foreground
      opacity: 0.1
      visible: nodi.rows.length > 0 || nodi.noResults
    }

    // ---------- nothing matched ----------
    Column {
      id: none
      width: parent.width
      visible: nodi.noResults
      spacing: Style.spacing.sm
      topPadding: Style.spacing.md
      bottomPadding: Style.spacing.md
      Text {
        width: parent.width
        horizontalAlignment: Text.AlignHCenter
        textFormat: Text.PlainText
        text: "No match for \"" + card.composed.trim() + "\""
        color: nodi.foreground
        font.family: nodi.fontFamily
        font.pixelSize: Style.font.subtitle
        elide: Text.ElideMiddle
      }
      // A key and its label, not a sentence (item 25).
      Row {
        anchors.horizontalCenter: parent.horizontalCenter
        spacing: Style.spacing.md
        Keycap { label: "?"; anchors.verticalCenter: parent.verticalCenter; foreground: nodi.foreground; fontFamily: nodi.fontFamily; rounded: nodi.cornerRadius > 0 }
        Text { textFormat: Text.PlainText; anchors.verticalCenter: parent.verticalCenter; text: "Help"; color: nodi.secondary; font.family: nodi.fontFamily; font.pixelSize: Style.font.bodySmall }
      }
    }

    // ---------- results or Ctrl+K's actions, and beside them the pane ----------
    // One area for both, so the pane shows beside the actions as it does
    // beside the rows: an action that asks shows its command there (it was
    // drawn inside the results, hidden with them; Fable 2026-10-05).
    Item {
      id: body
      width: parent.width
      // With a pane, tall enough for it even when one row shows.
      height: nodi.paletteOpen ? Math.max(palette.implicitHeight, nodi.preview ? nodi.paneMin : 0)
        : (nodi.preview ? Math.max(nodi.listHeight, nodi.paneMin) : nodi.listHeight)
      visible: nodi.paletteOpen || nodi.rows.length > 0

      // ---------- Ctrl+K: the selected row's actions ----------
      ActionPalette {
        id: palette
        nodi: card.nodi
        anchors.left: parent.left
        anchors.top: parent.top
        width: nodi.preview ? nodi.listColumn : parent.width
        visible: nodi.paletteOpen
      }

      // Its own height, not the area's: under Ctrl+K the area takes the
      // palette's, and a list resized while hidden lost its scroll (Fable
      // 2026-10-05).
      Item {
        id: listBox
        visible: !nodi.paletteOpen
        anchors.left: parent.left
        anchors.top: parent.top
        height: nodi.preview ? Math.max(nodi.listHeight, nodi.paneMin) : nodi.listHeight
        width: nodi.preview ? nodi.listColumn : parent.width

        ListView {
          id: list
          anchors.fill: parent
          model: nodi.rows
          clip: true
          Accessible.role: Accessible.List
          Accessible.name: "Results"
          // Under Ctrl+K it stays, not showing, which a reader passes
          // over: ignored, it handed its rows up to the window, and the
          // walk found the selected one left there (2026-10-06).
          boundsBehavior: Flickable.StopAtBounds
          currentIndex: nodi.selectedIndex

          delegate: ResultRow { nodi: card.nodi }
        }

        // Rows hidden above or below fade the edge, as Omarchy's menu does
        // (Menu.qml): by how far the list is scrolled, not on a clock.
        Rectangle {
          anchors.left: parent.left
          anchors.right: parent.right
          anchors.top: parent.top
          height: Math.min(nodi.rowPeek, parent.height / 2)
          visible: opacity > 0
          opacity: list.contentHeight > list.height ? Math.max(0, Math.min(1, (list.contentY - list.originY) / height)) : 0
          gradient: Gradient {
            GradientStop { position: 0; color: nodi.opaqueCard }
            GradientStop { position: 1; color: Util.alpha(nodi.opaqueCard, 0) }
          }
        }
        Rectangle {
          anchors.left: parent.left
          anchors.right: parent.right
          anchors.bottom: parent.bottom
          height: Math.min(nodi.rowPeek, parent.height / 2)
          visible: opacity > 0
          opacity: list.contentHeight > list.height
            ? Math.max(0, Math.min(1, (list.originY + list.contentHeight - list.height - list.contentY) / height)) : 0
          gradient: Gradient {
            GradientStop { position: 0; color: Util.alpha(nodi.opaqueCard, 0) }
            GradientStop { position: 1; color: nodi.opaqueCard }
          }
        }
      }

      PreviewPane {
        id: pane
        visible: !!nodi.preview
        nodi: card.nodi
        preview: nodi.preview
        anchors.left: nodi.paletteOpen ? palette.right : listBox.right
        anchors.leftMargin: Style.spacing.md
        anchors.right: parent.right
        anchors.top: parent.top
        anchors.bottom: parent.bottom
      }
    }

    // ---------- footer: what the selected row is, and what the keys do ----------
    Footer {
      id: footer
      objectName: "footer"
      nodi: card.nodi
      scrollable: pane.overflows
      width: parent.width
      visible: nodi.paletteOpen || nodi.rows.length > 0
    }

  }
}
