import QtQuick
import qs.Commons

// A key or a short state, drawn as a small keycap: the footer's hints and a
// row's badge ("ON", "Current", "Enter again").
Rectangle {
  id: cap
  property string label: ""
  property color foreground: Color.foreground
  property color tone: foreground       // the fill and border: a state's colour
  property string fontFamily: Style.font.family
  property bool rounded: true
  property bool strong: false
  // A footer key that a click presses (ROADMAP 74); a badge is no button.
  property bool clickable: false
  signal clicked()

  implicitWidth: Math.max(implicitHeight, capText.implicitWidth + Style.spacing.xl)
  implicitHeight: capText.implicitHeight + Style.spacing.sm
  radius: rounded ? Style.spacing.sm : 0
  color: Util.alpha(cap.tone, cap.strong ? 0.16 : 0.08)
  border.width: 1
  border.color: Util.alpha(cap.tone, cap.strong || press.containsMouse ? 0.5 : 0.18)

  Text {
    id: capText
    textFormat: Text.PlainText
    anchors.centerIn: parent
    text: cap.label
    color: cap.foreground
    font.family: cap.fontFamily
    font.pixelSize: Style.font.caption
    font.bold: cap.strong
  }

  MouseArea {
    id: press
    anchors.fill: parent
    enabled: cap.clickable
    hoverEnabled: cap.clickable
    cursorShape: cap.clickable ? Qt.PointingHandCursor : Qt.ArrowCursor
    onClicked: cap.clicked()
  }
}
