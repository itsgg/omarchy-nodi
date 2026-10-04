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

  implicitWidth: Math.max(implicitHeight, capText.implicitWidth + Style.space(10))
  implicitHeight: capText.implicitHeight + Style.space(4)
  radius: rounded ? Style.space(4) : 0
  color: Util.alpha(cap.tone, cap.strong ? 0.16 : 0.08)
  border.width: 1
  border.color: Util.alpha(cap.tone, cap.strong ? 0.5 : 0.18)

  Text {
    id: capText
    anchors.centerIn: parent
    text: cap.label
    color: cap.foreground
    font.family: cap.fontFamily
    font.pixelSize: Style.font.caption
    font.bold: cap.strong
  }
}
