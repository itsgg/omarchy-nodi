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
  Behavior on height { enabled: card.animated; NumberAnimation { duration: 90; easing.type: Easing.OutCubic } }
  // The pane comes and goes with the selected row: Kadhir's 140 ms.
  Behavior on width { enabled: card.animated; NumberAnimation { duration: 140; easing.type: Easing.OutCubic } }

  MouseArea { anchors.fill: parent; onClicked: {} }

  // The pane beside the list, by lines or pages, from the keyboard.
  function scrollPane(lines, pages) { pane.scroll(lines, pages) }

  // The row at `index` in view, clear of the fades (lib/Scroll.js).
  function keepVisible(index) { Scroll.keep(list, index, nodi.rowPeek, ListView.Contain) }
  // Whether the pane holds text to scroll: a picture or a title alone does
  // not, and Shift+Down there moves the list as it did.
  readonly property bool paneScrolls: pane.visible && pane.hasText

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
      width: parent.width
      height: nodi.inputHeight

      // In the tiles' column, so what is typed starts where a row's title
      // does (Fable 2026-10-05).
      Text {
        id: promptGlyph
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

        Text {
          anchors.fill: parent
          verticalAlignment: Text.AlignVCenter
          visible: !input.text
          text: nodi.placeholder || "Search"
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

        Text {
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
            anchors.verticalCenter: parent.verticalCenter
            text: nodi.mode ? (nodi.mode.icon || "") : ""
            visible: text !== ""
            color: nodi.selectedInk
            font.family: nodi.fontFamily
            font.pixelSize: Style.font.body
          }
          Text {
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
        visible: !nodi.mode && !input.text
        anchors.right: parent.right
        anchors.rightMargin: Style.spacing.lg + nodi.rowInsetRight
        anchors.verticalCenter: parent.verticalCenter
        spacing: Style.spacing.md
        Keycap { label: "?"; anchors.verticalCenter: parent.verticalCenter; foreground: nodi.foreground; fontFamily: nodi.fontFamily; rounded: nodi.cornerRadius > 0 }
        Text {
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
      width: parent.width
      visible: nodi.argsHint !== ""
      // Under what is typed, which it describes.
      leftPadding: Style.spacing.lg + nodi.rowInsetLeft + nodi.tileSize + Style.spacing.xxl
      bottomPadding: Style.spacing.md
      textFormat: Text.PlainText
      text: nodi.argsHint
      color: nodi.secondary
      font.family: nodi.fontFamily
      font.pixelSize: Style.font.caption
      elide: Text.ElideRight
    }

    Rectangle {
      width: parent.width
      height: 1
      color: nodi.foreground
      opacity: 0.1
      visible: nodi.rows.length > 0 || nodi.noResults
    }

    // ---------- nothing matched ----------
    Column {
      width: parent.width
      visible: nodi.noResults
      spacing: Style.spacing.sm
      topPadding: Style.spacing.md
      bottomPadding: Style.spacing.md
      Text {
        width: parent.width
        horizontalAlignment: Text.AlignHCenter
        textFormat: Text.PlainText
        text: "No match for \"" + input.text.trim() + "\""
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
        Text { anchors.verticalCenter: parent.verticalCenter; text: "Help"; color: nodi.secondary; font.family: nodi.fontFamily; font.pixelSize: Style.font.bodySmall }
      }
    }

    // ---------- results or Ctrl+K's actions, and beside them the pane ----------
    // One area for both, so the pane shows beside the actions as it does
    // beside the rows: an action that asks shows its command there (it was
    // drawn inside the results, hidden with them; Fable 2026-10-05).
    Item {
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
      nodi: card.nodi
      scrollable: pane.overflows
      width: parent.width
      visible: nodi.paletteOpen || nodi.rows.length > 0
    }

  }
}
