import QtQuick
import qs.Commons
import "../lib/Rows.js" as Rows

// What the selected row is, and what the keys do now.
Item {
  id: footer
  property var nodi
  property bool scrollable: false   // the pane holds more than it shows
  height: nodi.footerHeight

  function headed(row) {
    var rows = nodi.rows || []
    for (var i = 0; i < rows.length; i++) if (rows[i].group === row.group && rows[i].section) return true
    return false
  }

  Rectangle { anchors.top: parent.top; width: parent.width; height: 1; color: nodi.foreground; opacity: 0.1 }

  // A key clicked is that key pressed (ROADMAP 74): the same handler the
  // keyboard goes through, then the field has the keys again.
  function press(key, modifiers) {
    nodi.handleKey(key, modifiers || 0, false)
    nodi.focusInput()
  }

  Text {
    textFormat: Text.PlainText
    anchors.left: parent.left
    anchors.leftMargin: Style.spacing.lg + nodi.rowInsetLeft
    anchors.verticalCenter: parent.verticalCenter
    anchors.verticalCenterOffset: 1
    // A group with a header in the list is named there already.
    text: nodi.paletteOpen ? "Actions" : (nodi.selectedRow ? (nodi.selectedRow.help ? "Help" : (footer.headed(nodi.selectedRow) ? "" : nodi.selectedRow.group)) : "")
    color: nodi.secondary
    font.family: nodi.fontFamily
    font.pixelSize: Style.font.caption
  }

  Row {
    anchors.right: parent.right
    anchors.rightMargin: Style.spacing.lg + nodi.rowInsetRight
    anchors.verticalCenter: parent.verticalCenter
    anchors.verticalCenterOffset: 1
    spacing: Style.spacing.md

    readonly property bool back: nodi.paletteOpen || nodi.inHelpTopic || !!nodi.aliasRow || !!nodi.captureRow
    readonly property bool fill: !nodi.paletteOpen && Rows.canComplete(nodi.selectedRow)
    readonly property bool more: !nodi.paletteOpen && !!nodi.selectedRow && !nodi.selectedRow.help
                                 && Rows.actionsFor(nodi.selectedRow, nodi.paletteContext()).length > 1
    readonly property string primary: nodi.paletteOpen
      ? (nodi.paletteActions[nodi.paletteIndex] ? (nodi.paletteArmed ? "Confirm" : "Run") : "")
      : Rows.actionLabel(nodi.selectedRow)
    // An armed row says "Enter again" in its badge (his ruling: one label);
    // the footer keeps its verb and colours the Enter key.
    readonly property bool armed: !!nodi.selectedRow && nodi.armedKey === nodi.selectedRow.key

    Text { textFormat: Text.PlainText; visible: parent.back; anchors.verticalCenter: parent.verticalCenter; text: "Back"; color: nodi.secondary; font.family: nodi.fontFamily; font.pixelSize: Style.font.caption }
    Keycap { objectName: "key-Esc"; visible: parent.back; label: "Esc"; anchors.verticalCenter: parent.verticalCenter; foreground: nodi.foreground; fontFamily: nodi.fontFamily; rounded: nodi.cornerRadius > 0
             clickable: true; onClicked: footer.press(Qt.Key_Escape) }
    Item { visible: parent.back; width: Style.spacing.lg; height: 1 }

    // Only while there is more to see: the keys are fzf's, not a launcher's.
    Text { textFormat: Text.PlainText; visible: footer.scrollable; anchors.verticalCenter: parent.verticalCenter; text: "Scroll"; color: nodi.secondary; font.family: nodi.fontFamily; font.pixelSize: Style.font.caption }
    // A click scrolls the pane a page, as Shift+PgDn does.
    Keycap { objectName: "key-Scroll"; visible: footer.scrollable; label: "Shift 󰁝󰁅"; anchors.verticalCenter: parent.verticalCenter; foreground: nodi.foreground; fontFamily: nodi.fontFamily; rounded: nodi.cornerRadius > 0
             clickable: true; onClicked: footer.press(Qt.Key_PageDown, Qt.ShiftModifier) }
    Item { visible: footer.scrollable; width: Style.spacing.lg; height: 1 }

    Text { textFormat: Text.PlainText; visible: parent.more; anchors.verticalCenter: parent.verticalCenter; text: "Actions"; color: nodi.secondary; font.family: nodi.fontFamily; font.pixelSize: Style.font.caption }
    Keycap { objectName: "key-CtrlK"; visible: parent.more; label: "Ctrl K"; anchors.verticalCenter: parent.verticalCenter; foreground: nodi.foreground; fontFamily: nodi.fontFamily; rounded: nodi.cornerRadius > 0
             clickable: true; onClicked: footer.press(Qt.Key_K, Qt.ControlModifier) }
    Item { visible: parent.more; width: Style.spacing.lg; height: 1 }

    Text { textFormat: Text.PlainText; visible: parent.fill; anchors.verticalCenter: parent.verticalCenter; text: "Fill in"; color: nodi.secondary; font.family: nodi.fontFamily; font.pixelSize: Style.font.caption }
    Keycap { objectName: "key-Tab"; visible: parent.fill; label: "Tab"; anchors.verticalCenter: parent.verticalCenter; foreground: nodi.foreground; fontFamily: nodi.fontFamily; rounded: nodi.cornerRadius > 0
             clickable: true; onClicked: footer.press(Qt.Key_Tab) }
    Item { visible: parent.fill; width: Style.spacing.lg; height: 1 }

    Text {
      id: primaryText
      textFormat: Text.PlainText
      visible: text !== ""
      anchors.verticalCenter: parent.verticalCenter
      text: parent.primary
      color: nodi.foreground
      font.family: nodi.fontFamily
      font.pixelSize: Style.font.caption
      font.bold: true
    }
    // A confirmation shows in the key's urgent fill and border; the word stays readable.
    Keycap { objectName: "key-Enter"; visible: primaryText.text !== ""; label: "Enter"; anchors.verticalCenter: parent.verticalCenter; foreground: nodi.foreground
             clickable: true; onClicked: footer.press(Qt.Key_Return)
             tone: parent.primary === "Confirm" || parent.armed ? Color.urgent : nodi.foreground; strong: parent.primary === "Confirm" || parent.armed
             fontFamily: nodi.fontFamily; rounded: nodi.cornerRadius > 0 }
  }
}
