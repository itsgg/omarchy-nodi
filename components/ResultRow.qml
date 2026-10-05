import QtQuick
import qs.Commons
import qs.Ui

// One result: its picture, title, what it is, and a badge for its state.
Item {
  id: rowItem
  property var nodi
  required property int index
  required property var modelData
  readonly property bool selected: index === nodi.selectedIndex
  readonly property bool hero: !!modelData.hero
  readonly property bool armed: nodi.armedKey !== "" && nodi.armedKey === modelData.key
  readonly property string section: modelData.section || ""
  // While Ctrl is held the first nine rows show the digit that runs them
  // (Ctrl+1 to Ctrl+9), in the badge slot (his ruling 2026-10-04); not
  // while a hotkey is being set, where Ctrl is part of the chord.
  readonly property bool digit: !!nodi.ctrlHeld && index < 9 && !nodi.captureRow && !armed

  width: ListView.view ? ListView.view.width : 0
  height: nodi.rowSize(modelData)

  // Nearer the rows it heads than the group above it.
  Text {
    visible: rowItem.section !== ""
    anchors.left: parent.left
    anchors.leftMargin: Style.spacing.lg
    anchors.top: parent.top
    height: nodi.sectionHeight
    verticalAlignment: Text.AlignBottom
    bottomPadding: Style.spacing.xs
    text: rowItem.section
    color: nodi.secondary
    font.family: nodi.fontFamily
    font.pixelSize: Style.font.caption
    font.bold: true
  }

  Rectangle {
    anchors.left: parent.left
    anchors.right: parent.right
    anchors.bottom: parent.bottom
    height: rowItem.hero ? nodi.heroHeight : nodi.rowHeight
    radius: nodi.cornerRadius
    // No animation: under key repeat a fade lit two or three rows at once.
    color: rowItem.selected ? nodi.selectedBackground : "transparent"

    BorderOverlay {
      borderSpec: rowItem.selected ? nodi.selectedBorderSpec : Border.none()
      radius: nodi.cornerRadius
    }

    IconTile {
      id: tile
      anchors.left: parent.left
      anchors.leftMargin: Style.spacing.lg + nodi.rowInsetLeft
      anchors.verticalCenter: parent.verticalCenter
      glyph: rowItem.modelData.icon || ""
      glyphFont: rowItem.modelData.iconFont || ""
      imageSource: rowItem.modelData.image ? nodi.iconSource(rowItem.modelData.image) : ""
      fill: !!rowItem.modelData.imageFill
      swatch: rowItem.modelData.swatch || ""
      selected: rowItem.selected
      size: rowItem.hero ? Math.round(nodi.tileSize * 1.4) : nodi.tileSize
      radius: nodi.tileRadius
      foreground: nodi.foreground
      selectedText: nodi.selectedInk
      fontFamily: nodi.fontFamily
    }

    Keycap {
      id: badge
      visible: rowItem.digit || rowItem.armed || rowItem.modelData.badge !== ""
      anchors.right: parent.right
      anchors.rightMargin: Style.spacing.lg + nodi.rowInsetRight
      anchors.verticalCenter: parent.verticalCenter
      label: rowItem.digit ? String(rowItem.index + 1) : (rowItem.armed ? "Enter again" : rowItem.modelData.badge)
      strong: !rowItem.digit && (rowItem.armed || rowItem.modelData.badgeTone === "on")
      // The word in the text colour, the state in the fill and the border:
      // accent or urgent text on its own tint read under 4.5 in most themes.
      foreground: nodi.foreground
      tone: rowItem.digit ? nodi.foreground : (rowItem.armed ? Color.urgent : (rowItem.modelData.badgeTone === "on" ? Color.accent : nodi.foreground))
      fontFamily: nodi.fontFamily
      rounded: nodi.cornerRadius > 0
    }

    // The shell's row padding between a tile and its words: md read tight
    // beside a filled plate (Fable 2026-10-05).
    Column {
      anchors.left: tile.right
      anchors.leftMargin: Style.spacing.xxl
      anchors.right: badge.visible ? badge.left : parent.right
      anchors.rightMargin: Style.spacing.lg + (badge.visible ? 0 : nodi.rowInsetRight)
      anchors.verticalCenter: parent.verticalCenter
      spacing: rowItem.hero ? Style.spacing.sm : Style.spacing.xxs

      Text {
        width: parent.width
        textFormat: Text.PlainText
        text: rowItem.modelData.title
        color: rowItem.selected ? nodi.selectedInk : nodi.foreground
        font.family: nodi.fontFamily
        // Omarchy's menu draws its rows' names so: heading size, Medium
        // (Menu.qml; his ask 2026-10-05, to look as the menu Nodi took over).
        font.pixelSize: rowItem.hero ? Style.font.displayLarge : Style.font.heading
        font.weight: rowItem.hero ? Font.Bold : Font.Medium
        elide: Text.ElideRight
      }

      Text {
        width: parent.width
        visible: text !== ""
        textFormat: Text.PlainText
        text: rowItem.modelData.subtitle || ""
        color: rowItem.selected ? nodi.secondaryOnSelected : nodi.secondary
        font.family: nodi.fontFamily
        font.pixelSize: Style.font.bodySmall
        elide: Text.ElideRight
      }
    }

    MouseArea {
      anchors.fill: parent
      hoverEnabled: true
      cursorShape: Qt.PointingHandCursor
      // Only real pointer movement selects: rows sliding under a
      // resting pointer report positions too, but it has not moved.
      onPositionChanged: function(mouse) {
        var p = mapToItem(null, mouse.x, mouse.y)
        if (p.x === nodi.lastPointer.x && p.y === nodi.lastPointer.y) return
        var first = nodi.lastPointer.x < 0
        nodi.lastPointer = Qt.point(p.x, p.y)
        if (!first && nodi.selectedIndex !== rowItem.index) { nodi.selectedIndex = rowItem.index; nodi.armedKey = "" }
      }
      onClicked: {
        nodi.selectedIndex = rowItem.index
        nodi.activate(rowItem.index)
        nodi.focusInput()
      }
    }
  }
}
