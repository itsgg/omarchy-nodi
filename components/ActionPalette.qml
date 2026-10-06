import QtQuick
import qs.Commons
import qs.Ui
import "../lib/Scroll.js" as Scroll

// Ctrl+K: the actions of the row it opened for, the row's own first. Drawn
// as the list's rows are, and held as the list is: seven, then a part of
// the next, scrolled to keep the chosen one clear (Fable 2026-10-05: its own
// radius, colours, size and spacing, and no cap, so eleven actions made a
// card that reached the bottom of the screen). Grouped as the list is, a
// header over Copy and Manage, and each action's chord on its right
// (ROADMAP 52).
Column {
  id: actionList
  property var nodi

  Text {
    leftPadding: Style.spacing.lg
    width: parent.width
    height: nodi.sectionHeight
    verticalAlignment: Text.AlignBottom
    bottomPadding: Style.spacing.xs
    textFormat: Text.PlainText
    objectName: "paletteTitle"
    text: nodi.paletteRow ? nodi.paletteRow.title : ""
    horizontalAlignment: Text.AlignLeft
    color: nodi.secondary
    font.family: nodi.fontFamily
    font.pixelSize: Style.font.caption
    font.bold: true
    elide: Text.ElideRight
  }

  Item {
    width: actionList.width
    height: actions.height

  ListView {
    id: actions
    width: actionList.width
    height: nodi.paletteHeight(nodi.paletteActions)
    clip: true
    boundsBehavior: Flickable.StopAtBounds
    model: nodi.paletteOpen ? nodi.paletteActions : []
    currentIndex: nodi.paletteIndex
    Accessible.role: Accessible.List
    Accessible.name: "Actions"
    Accessible.ignored: !nodi.paletteOpen
    // Clear of the fades, as the list's selection is (lib/Scroll.js): with
    // Contain alone the chosen action sat under one (Fable 2026-10-05).
    onCurrentIndexChanged: Scroll.keep(actions, currentIndex, nodi.rowPeek, ListView.Contain)

    delegate: Item {
      id: actionCell
      required property int index
      required property var modelData
      width: actions.width
      height: nodi.rowHeight + (modelData.section ? nodi.sectionHeight : 0)
      Accessible.role: Accessible.ListItem
      Accessible.name: String(modelData.label || "")
      Accessible.description: modelData.confirm && nodi.paletteArmed === modelData.label ? "Enter again" : (modelData.chord ? String(modelData.chord) : "")
      Accessible.selectable: true
      Accessible.selected: index === nodi.paletteIndex

      Text {
        visible: !!actionCell.modelData.section
        anchors.left: parent.left
        anchors.leftMargin: Style.spacing.lg
        anchors.top: parent.top
        height: nodi.sectionHeight
        verticalAlignment: Text.AlignBottom
        bottomPadding: Style.spacing.xs
        textFormat: Text.PlainText
        text: actionCell.modelData.section || ""
        color: nodi.secondary
        font.family: nodi.fontFamily
        font.pixelSize: Style.font.caption
        font.bold: true
      }

    Rectangle {
      id: actionItem
      readonly property int index: actionCell.index
      readonly property var modelData: actionCell.modelData
      readonly property bool selected: index === nodi.paletteIndex
      readonly property bool armed: modelData.confirm && nodi.paletteArmed === modelData.label
      anchors.left: parent.left
      anchors.right: parent.right
      anchors.bottom: parent.bottom
      height: nodi.rowHeight
      radius: nodi.cornerRadius
      color: selected ? nodi.selectedBackground : "transparent"

      BorderOverlay {
        borderSpec: actionItem.selected ? nodi.selectedBorderSpec : Border.none()
        radius: nodi.cornerRadius
      }

      // The selected row's mark where the fill would be all (item 72).
      Rectangle {
        visible: actionItem.selected && nodi.selectionBar
        anchors.left: parent.left
        anchors.leftMargin: Style.spacing.xs + nodi.rowInsetLeft
        anchors.verticalCenter: parent.verticalCenter
        width: nodi.barWidth
        height: Math.max(nodi.barWidth * 3, parent.height - nodi.barInset * 2)
        radius: width / 2
        color: nodi.foreground
      }

      IconTile {
        id: actionTile
        anchors.left: parent.left
        anchors.leftMargin: Style.spacing.lg + nodi.rowInsetLeft
        anchors.verticalCenter: parent.verticalCenter
        glyph: actionItem.modelData.icon || "󰐊"
        selected: actionItem.selected
        size: nodi.tileSize
        radius: nodi.tileRadius
        foreground: nodi.foreground
        selectedText: nodi.selectedInk
        fontFamily: nodi.fontFamily
      }
      Text {
        anchors.left: actionTile.right
        anchors.leftMargin: Style.spacing.xxl
        anchors.right: actionBadge.visible ? actionBadge.left : parent.right
        anchors.rightMargin: Style.spacing.lg + (actionBadge.visible ? 0 : nodi.rowInsetRight)
        anchors.verticalCenter: parent.verticalCenter
        textFormat: Text.PlainText
        text: actionItem.modelData.label
        // Left, as every row: right-to-left text is right-aligned unless told (ROADMAP 76).
        horizontalAlignment: Text.AlignLeft
        color: actionItem.selected ? nodi.selectedInk : nodi.foreground
        font.family: nodi.fontFamily
        font.pixelSize: Style.font.heading
        font.weight: Font.Medium
        elide: Text.ElideRight
      }
      // The chord that runs it, or the second Enter it waits for.
      Keycap {
        id: actionBadge
        visible: actionItem.armed || !!actionItem.modelData.chord
        anchors.right: parent.right
        anchors.rightMargin: Style.spacing.lg + nodi.rowInsetRight
        anchors.verticalCenter: parent.verticalCenter
        label: actionItem.armed ? "Enter again" : (actionItem.modelData.chord || "")
        strong: actionItem.armed
        foreground: nodi.foreground
        tone: actionItem.armed ? Color.urgent : nodi.foreground
        fontFamily: nodi.fontFamily
        rounded: nodi.cornerRadius > 0
      }
      MouseArea {
        anchors.fill: parent
        hoverEnabled: true
        cursorShape: Qt.PointingHandCursor
        // Only real pointer movement selects, as in the list: typing into
        // Ctrl+K slides actions under a resting pointer, which reports
        // them as entered, and Enter then ran the one under it (Sonnet
        // 2026-10-06).
        onPositionChanged: function(mouse) {
          var p = mapToItem(null, mouse.x, mouse.y)
          if (p.x === nodi.lastPointer.x && p.y === nodi.lastPointer.y) return
          var first = nodi.lastPointer.x < 0
          nodi.lastPointer = Qt.point(p.x, p.y)
          if (!first && nodi.paletteIndex !== actionItem.index) { nodi.paletteIndex = actionItem.index; nodi.paletteArmed = "" }
        }
        onClicked: { nodi.runPaletteAction(actionItem.index); nodi.focusInput() }
      }
    }
    }
  }

  // Actions hidden above or below fade the edge, as the list's do.
  Rectangle {
    anchors.left: parent.left
    anchors.right: parent.right
    anchors.top: parent.top
    height: Math.min(nodi.rowPeek, parent.height / 2)
    visible: opacity > 0
    opacity: actions.contentHeight > actions.height ? Math.max(0, Math.min(1, (actions.contentY - actions.originY) / height)) : 0
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
    opacity: actions.contentHeight > actions.height
      ? Math.max(0, Math.min(1, (actions.originY + actions.contentHeight - actions.height - actions.contentY) / height)) : 0
    gradient: Gradient {
      GradientStop { position: 0; color: Util.alpha(nodi.opaqueCard, 0) }
      GradientStop { position: 1; color: nodi.opaqueCard }
    }
  }
  }

  // What was typed matches no action.
  Text {
    visible: nodi.paletteOpen && nodi.paletteActions.length === 0
    width: actionList.width
    leftPadding: Style.spacing.lg + nodi.rowInsetLeft
    height: nodi.rowHeight
    verticalAlignment: Text.AlignVCenter
    textFormat: Text.PlainText
    text: "No action matches"
    color: nodi.secondary
    font.family: nodi.fontFamily
    font.pixelSize: Style.font.heading
  }
}
