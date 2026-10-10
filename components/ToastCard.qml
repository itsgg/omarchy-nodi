import QtQuick
import qs.Commons

// Nodi's own notices, drawn (lib/Toasts.js keeps them, Toast.qml shows them
// in a window of their own): each a title and a body on the bar's card,
// newest at the bottom, gone at a click. Their words are plain text, never
// markup: a failed row's title or a script's output is anyone's, and a tag
// in rich text loads what it names (the audit of 2026-10-10).
Column {
  id: stack
  property var look
  property var items: []
  signal dismiss(var id)

  readonly property int cardWidth: Math.min(Style.space(380), (look ? look.screenWidth : 1920) - Style.gapsOut * 2)
  spacing: Style.spacing.md

  Repeater {
    model: stack.items
    delegate: Rectangle {
      id: toast
      required property var modelData
      width: stack.cardWidth
      height: words.implicitHeight + Style.spacing.lg * 2
      radius: stack.look.cornerRadius
      color: stack.look.opaqueCard
      border.width: Math.max(1, Style.space(2))
      border.color: stack.look.border

      Accessible.role: Accessible.AlertMessage
      Accessible.name: toast.modelData.title
      Accessible.description: toast.modelData.body

      Column {
        id: words
        anchors.left: parent.left
        anchors.right: parent.right
        anchors.verticalCenter: parent.verticalCenter
        anchors.leftMargin: Style.spacing.xl
        anchors.rightMargin: Style.spacing.xl
        spacing: Style.spacing.xs

        Text {
          width: parent.width
          text: toast.modelData.title
          textFormat: Text.PlainText
          color: stack.look.foreground
          font.family: stack.look.fontFamily
          font.pixelSize: Style.font.body
          font.bold: true
          elide: Text.ElideRight
        }
        Text {
          width: parent.width
          visible: text !== ""
          text: toast.modelData.body
          textFormat: Text.PlainText
          color: stack.look.secondary
          font.family: stack.look.fontFamily
          font.pixelSize: Style.font.bodySmall
          wrapMode: Text.Wrap
          maximumLineCount: 3
          elide: Text.ElideRight
        }
      }

      MouseArea {
        anchors.fill: parent
        cursorShape: Qt.PointingHandCursor
        onClicked: stack.dismiss(toast.modelData.id)
      }
    }
  }
}
