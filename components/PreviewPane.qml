import QtQuick
import qs.Commons
import "../lib/Markdown.js" as Markdown

// The selected row's preview beside the list (ROADMAP item 26), shown only
// when the row has one (his ruling 2026-10-04): a header, its labels, then
// the text or the picture. A provider gives `preview` on a row:
//   { title, subtitle, text, markdown, mono, follow, image, labels: [[label, value], ...] }
// `markdown` is drawn as Markdown, its pictures and HTML taken out first
// (lib/Markdown.js); `text` is drawn as it is.
// Kadhir's pane is the model: a hairline, 16 px inside.
Rectangle {
  id: pane
  property var nodi
  property var preview: null

  readonly property var p: preview || ({})
  readonly property bool hasImage: !!p.image
  readonly property bool hasMarkdown: !hasImage && typeof p.markdown === "string" && p.markdown !== ""
  readonly property bool hasText: !hasImage && (hasMarkdown || !!p.text)

  // No fill: secondary text is chosen to read on the card itself, and a
  // tint under it took four themes just under 4.5:1 (Fable 2026-10-04).
  color: "transparent"
  border.width: Style.spacing.hairline
  border.color: Util.alpha(nodi.foreground, 0.08)
  radius: nodi.cornerRadius
  clip: true

  Column {
    id: head
    anchors.left: parent.left
    anchors.right: parent.right
    anchors.top: parent.top
    anchors.margins: Style.space(16)
    spacing: Style.space(6)

    Text {
      width: parent.width
      visible: text !== ""
      textFormat: Text.PlainText
      text: pane.p.title || ""
      color: nodi.foreground
      font.family: nodi.fontFamily
      font.pixelSize: Style.font.title
      font.bold: true
      elide: Text.ElideRight
    }
    Text {
      width: parent.width
      visible: text !== ""
      textFormat: Text.PlainText
      text: pane.p.subtitle || ""
      color: nodi.secondary
      font.family: nodi.fontFamily
      font.pixelSize: Style.font.caption
      elide: Text.ElideMiddle
    }
    Rectangle {
      width: parent.width
      height: Style.spacing.hairline
      color: Util.alpha(nodi.foreground, 0.08)
      // Under a header only: with no title or subtitle there is nothing to
      // divide from.
      visible: !!(pane.p.title || pane.p.subtitle) && ((pane.p.labels || []).length > 0 || pane.hasImage || pane.hasText)
    }
    Repeater {
      model: pane.p.labels || []
      Row {
        required property var modelData
        width: head.width
        spacing: Style.space(8)
        Text {
          width: Style.space(90)
          textFormat: Text.PlainText
          text: String(modelData[0])
          color: nodi.secondary
          font.family: nodi.fontFamily
          font.pixelSize: Style.font.caption
          elide: Text.ElideRight
        }
        Text {
          width: parent.width - Style.space(98)
          textFormat: Text.PlainText
          text: String(modelData[1])
          color: nodi.foreground
          font.family: nodi.fontFamily
          font.pixelSize: Style.font.caption
          elide: Text.ElideMiddle
        }
      }
    }
  }

  Image {
    visible: pane.hasImage
    anchors.left: parent.left
    anchors.right: parent.right
    anchors.top: head.bottom
    anchors.bottom: parent.bottom
    anchors.margins: Style.space(16)
    // No header (a preview of Markdown alone): the pane's own margin only.
    anchors.topMargin: head.height > 0 ? Style.space(16) : 0
    fillMode: Image.PreserveAspectFit
    asynchronous: true
    smooth: true
    // A fixed decode size: bound to the pane's own size, which eases in
    // and follows the rows, it re-decoded the picture on every frame.
    sourceSize.width: Style.space(1000)
    sourceSize.height: Style.space(600)
    source: pane.hasImage ? nodi.iconSource(pane.p.image) : ""
  }

  Flickable {
    id: body
    visible: pane.hasText
    anchors.left: parent.left
    anchors.right: parent.right
    anchors.top: head.bottom
    anchors.bottom: parent.bottom
    anchors.margins: Style.space(16)
    // No header (a preview of Markdown alone): the pane's own margin only.
    anchors.topMargin: head.height > 0 ? Style.space(16) : 0
    contentWidth: width
    contentHeight: bodyText.implicitHeight
    clip: true
    boundsBehavior: Flickable.StopAtBounds
    // An answer as it streams keeps its newest words in view.
    onContentHeightChanged: if (pane.p.follow && contentHeight > height) contentY = contentHeight - height

    Text {
      id: bodyText
      width: body.width
      wrapMode: Text.Wrap
      textFormat: pane.hasMarkdown ? Text.MarkdownText : Text.PlainText
      text: pane.hasMarkdown ? Markdown.forPane(pane.p.markdown) : (pane.p.text || "")
      color: nodi.foreground
      linkColor: nodi.foreground
      font.family: nodi.fontFamily
      font.pixelSize: pane.p.mono ? Style.font.caption : Style.font.subtitle
      lineHeight: 1.15
    }
  }
}
