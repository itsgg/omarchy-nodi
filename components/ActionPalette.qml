import QtQuick
import qs.Commons

// Ctrl+K: the actions of the row it opened for, the row's own first.
Column {
  id: actionList
  property var nodi
  spacing: Style.space(2)

  Text {
    leftPadding: Style.spacing.md
    width: parent.width
    height: nodi.sectionHeight
    verticalAlignment: Text.AlignVCenter
    textFormat: Text.PlainText
    text: nodi.paletteRow ? nodi.paletteRow.title : ""
    color: nodi.foreground
    opacity: 0.5
    font.family: nodi.fontFamily
    font.pixelSize: Style.font.caption
    font.bold: true
    elide: Text.ElideRight
  }

  Repeater {
    model: nodi.paletteOpen ? nodi.paletteActions : []
    delegate: Rectangle {
      id: actionItem
      required property int index
      required property var modelData
      readonly property bool selected: index === nodi.paletteIndex
      readonly property bool armed: modelData.confirm && nodi.paletteArmed === modelData.label
      width: actionList.width
      height: nodi.rowHeight
      radius: nodi.cornerRadius > 0 ? Style.space(8) : 0
      color: selected ? nodi.selectedBackground : "transparent"

      IconTile {
        id: actionTile
        anchors.left: parent.left
        anchors.leftMargin: Style.spacing.md
        anchors.verticalCenter: parent.verticalCenter
        glyph: actionItem.modelData.icon || "󰐊"
        selected: actionItem.selected
        size: nodi.tileSize
        radius: nodi.tileRadius
        foreground: nodi.foreground
        selectedText: nodi.selectedText
        fontFamily: nodi.fontFamily
      }
      Text {
        anchors.left: actionTile.right
        anchors.leftMargin: Style.spacing.md
        anchors.right: actionBadge.visible ? actionBadge.left : parent.right
        anchors.rightMargin: Style.spacing.md
        anchors.verticalCenter: parent.verticalCenter
        textFormat: Text.PlainText
        text: actionItem.modelData.label
        color: actionItem.selected ? nodi.selectedText : nodi.foreground
        font.family: nodi.fontFamily
        font.pixelSize: Style.font.subtitle
        elide: Text.ElideRight
      }
      Keycap {
        id: actionBadge
        visible: actionItem.armed
        anchors.right: parent.right
        anchors.rightMargin: Style.spacing.md
        anchors.verticalCenter: parent.verticalCenter
        label: "Enter again"
        strong: true
        foreground: Color.urgent
        fontFamily: nodi.fontFamily
        rounded: nodi.cornerRadius > 0
      }
      MouseArea {
        anchors.fill: parent
        hoverEnabled: true
        cursorShape: Qt.PointingHandCursor
        onEntered: nodi.paletteIndex = actionItem.index
        onClicked: { nodi.runPaletteAction(actionItem.index); nodi.focusInput() }
      }
    }
  }
}
