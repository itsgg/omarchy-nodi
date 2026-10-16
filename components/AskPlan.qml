import QtQuick
import qs.Commons

// Structured, non-executable ACP plan entries.
Column {
  id: planView
  property var nodi
  property var entries: []
  width: parent ? parent.width : 0
  spacing: Style.spacing.sm

  Repeater {
    model: planView.entries || []
    Row {
      required property var modelData
      width: planView.width
      spacing: Style.spacing.sm

      Text {
        text: modelData.status === "completed" ? "󰄬"
          : modelData.status === "in_progress" ? "󰔟"
          : modelData.status === "blocked" ? "󰅖" : "󰄱"
        textFormat: Text.PlainText
        color: modelData.status === "completed"
          ? nodi.secondary : nodi.foreground
        font.family: nodi.fontFamily
        font.pixelSize: Style.font.caption
      }

      Text {
        width: parent.width - x
        text: String(modelData.content || "")
        textFormat: Text.PlainText
        color: modelData.status === "completed"
          ? nodi.secondary : nodi.foreground
        font.family: nodi.fontFamily
        font.pixelSize: Style.font.caption
        wrapMode: Text.Wrap
      }
    }
  }
}
