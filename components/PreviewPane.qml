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
  // Another preview starts at its top, or follows an answer as it streams.
  // By the row and what it shows, not by the object: the preview is made
  // again on every recompute and at every word of an answer, which kept
  // nothing scrolled; and a preview of Markdown alone has no title, which
  // carried one row's scroll to the next (Fable 2026-10-04). An answer is
  // one pane for all its rows (Paste, Copy, Again...), so not by the row:
  // it kept its place as it finished and as the rows were arrowed through.
  readonly property string ident: (p.follow ? "answer" : (nodi.selectedRow ? nodi.selectedRow.key : ""))
    + "\n" + (p.title || "") + "\n" + (p.subtitle || "") + "\n" + (p.image || "")
  onIdentChanged: { body.scrolled = false; body.contentY = 0 }

  // By lines or pages (a page is the text's height), kept in bounds; from
  // the keyboard (lib/Keys.js: Shift with the arrows or PageUp and
  // PageDown, and Ctrl+D and Ctrl+U). Scrolling an answer that streams
  // stops it following its newest words.
  function scroll(lines, pages) {
    if (!body.visible) return
    var line = bodyText.font.pixelSize * bodyText.lineHeight
    var to = body.contentY + lines * line + pages * body.height
    body.contentY = Math.max(0, Math.min(to, Math.max(0, body.contentHeight - body.height)))
    body.scrolled = true
  }
  readonly property bool hasImage: !!p.image
  readonly property bool hasMarkdown: !hasImage && typeof p.markdown === "string" && p.markdown !== ""
  readonly property bool hasText: !hasImage && (hasMarkdown || !!p.text)
  // More text than the pane shows: the footer says how to scroll it.
  readonly property bool overflows: visible && body.visible && body.contentHeight > body.height + 1

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
    property bool scrolled: false
    // An answer as it streams keeps its newest words in view, until it is
    // scrolled by hand.
    onContentHeightChanged: if (pane.p.follow && !scrolled && contentHeight > height) contentY = contentHeight - height
    onMovementStarted: scrolled = true

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
