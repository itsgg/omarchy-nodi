import QtQuick
import qs.Commons
import "../lib/Markdown.js" as Markdown
import "../lib/Ansi.js" as Ansi

// The selected row's preview beside the list (ROADMAP item 26), shown only
// when the row has one (his ruling 2026-10-04): a header, its labels, then
// the text or the picture. A provider gives `preview` on a row:
//   { title, subtitle, text, markdown, code, mono, follow, image, window,
//     plans, form, answerLink, answerTurn, labels: [[label, value], ...] }
// An answer on its way (lib/Pane.js) is `busy`, and says what it waits on
// in `status` until its words come: Omarchy's own way of waiting
// (Ui/MultiSelect.qml, the weather panel), a spinning 󰦖 and a dim line.
// `markdown` is drawn as Markdown, its pictures and HTML taken out first
// (lib/Markdown.js); `text` is drawn as it is; `code`, bat's coloured
// text, in the theme's colours (lib/Ansi.js, `nodi.themeColours`); `window`, a
// window's address, is that window as it is now (WindowShot.qml), inside
// the shell only (`nodi.captures`): the offscreen renders show its header
// alone.
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
  readonly property string ident: (p.follow ? "answer:" + (p.round || 0) : (nodi.selectedRow ? nodi.selectedRow.key : ""))
    + "\n" + (p.title || "") + "\n" + (p.subtitle || "") + "\n" + (p.image || "")
  onIdentChanged: { body.scrolled = false; body.contentY = 0; blocks.clear(); Qt.callLater(pane.syncBlocks) }

  // The blocks the pane draws, changed in place: a block whose text is the
  // same is left alone, so its Text is not laid out again. The answer is
  // read at most every 80 ms while it streams, however often its words
  // come: an agent's answer arrives a few characters at a time.
  ListModel { id: blocks }
  function syncBlocks() {
    throttle.stop()
    if (!pane.streams) { if (blocks.count) blocks.clear(); return }
    var list = Markdown.blocks(pane.streamed)
    var md = pane.hasMarkdown
    for (var i = 0; i < list.length; i++) {
      if (i < blocks.count) {
        if (blocks.get(i).md !== md) blocks.set(i, { t: list[i], md: md, h: md ? pane.rich(list[i]) : "" })
        else if (blocks.get(i).t !== list[i]) {
          blocks.setProperty(i, "h", md ? pane.rich(list[i]) : "")
          blocks.setProperty(i, "t", list[i])
        }
      } else blocks.append({ t: list[i], md: md, h: md ? pane.rich(list[i]) : "" })
    }
    if (blocks.count > list.length) blocks.remove(list.length, blocks.count - list.length)
  }

  // Markdown is drawn as rich text: Qt's own HTML of it, the same layout to
  // the pixel, with the links in the theme's colour, which Text.linkColor
  // cannot give a Markdown link (MarkdownHtml.qml, Markdown.inkLinks). Made
  // here when a block, the preview or the colour changes, never in a
  // binding: the converter is one TextEdit, and a binding that wrote to it
  // would be told of every other block's change too.
  MarkdownHtml { id: markdownHtml }
  function rich(markdown) {
    return Markdown.inkLinks(markdownHtml.html(Markdown.forPane(markdown), bodyText.font), String(nodi.link))
  }
  readonly property string bodyMarkdown: !pane.streams && pane.hasMarkdown ? String(pane.p.markdown || "") : ""
  property string bodyHtml: ""
  function syncBody() { bodyHtml = bodyMarkdown ? rich(bodyMarkdown) : "" }
  onBodyMarkdownChanged: syncBody()
  // Made again in a new colour or font (a theme, a text size).
  readonly property string ink: String(nodi.link) + "\n" + bodyText.font.family + "\n" + bodyText.font.pixelSize + "\n" + bodyText.font.pointSize
  onInkChanged: {
    for (var i = 0; i < blocks.count; i++) if (blocks.get(i).md) blocks.setProperty(i, "h", rich(blocks.get(i).t))
    syncBody()
  }
  Component.onCompleted: syncBody()
  onStreamedChanged: if (!throttle.running) throttle.start()
  onStreamsChanged: Qt.callLater(pane.syncBlocks)
  // Done: the whole answer at once, not 80 ms later. Called later, not
  // here: the answer's end and its last words come in one preview, and
  // this can be told before `streamed` has its new text.
  readonly property bool busyNow: !!p.busy
  onBusyNowChanged: if (!busyNow) Qt.callLater(pane.syncBlocks)
  Timer { id: throttle; interval: 80; onTriggered: pane.syncBlocks() }

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
  readonly property bool hasWindow: !hasImage && !!p.window && !!nodi.captures
  readonly property bool hasMarkdown: !hasImage && typeof p.markdown === "string" && p.markdown !== ""
  readonly property bool hasCode: !hasImage && !hasMarkdown && typeof p.code === "string" && p.code !== ""
  readonly property bool hasText: !hasImage && (hasMarkdown || !!p.text
    || !!p.form || (p.plans || []).length > 0)
  readonly property bool hasStatus: !hasImage && !hasText && !!p.status
  // An answer on its way or done (Ask's, a streamed one's) is drawn as
  // blocks (lib/Markdown.js blocks()): each finished block laid out once,
  // the last one again as it grows. One Text holding the whole answer was
  // laid out again at every word: 280 s of the GUI thread for an 18 KB
  // answer, the bar frozen meanwhile (measured 2026-10-11). Other previews
  // are short and keep one Text.
  readonly property bool streams: !!p.follow && hasText && !hasCode
  readonly property string streamed: !streams ? "" : hasMarkdown ? p.markdown : String(p.text || "")
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
    anchors.margins: Style.spacing.popupPadding
    spacing: Style.spacing.md

    Text {
      width: parent.width
      visible: text !== ""
      textFormat: Text.PlainText
      text: pane.p.title || ""
      // Left, as every row: right-to-left text is right-aligned unless told (ROADMAP 76).
      horizontalAlignment: Text.AlignLeft
      color: nodi.foreground
      font.family: nodi.fontFamily
      font.pixelSize: Style.font.title
      font.bold: true
      elide: Text.ElideRight
    }
    Row {
      width: parent.width
      visible: subtitle.text !== ""
      spacing: Style.spacing.sm
      // Turning while the answer is on its way, as Omarchy's own spinner
      // turns (Ui/MultiSelect.qml: 󰦖, 800 ms a turn, linear); still under
      // reduced motion (ROADMAP 73), the line beside it saying the same;
      // set upright again when it stops, which an animator does not do by
      // itself.
      Text {
        id: spinner
        objectName: "askSpinner"
        // Whether it turns: an animator leaves `rotation` alone until it stops.
        readonly property bool turning: turn.running
        visible: !!pane.p.busy
        textFormat: Text.PlainText
        text: "󰦖"
        color: nodi.secondary
        font.family: nodi.fontFamily
        font.pixelSize: Style.font.caption
        RotationAnimator on rotation {
          id: turn
          running: spinner.visible && pane.visible && !nodi.reducedMotion
          from: 0
          to: 360
          duration: 800
          loops: Animation.Infinite
          onRunningChanged: if (!running) spinner.rotation = 0
        }
      }
      Text {
        id: subtitle
        width: parent.width - (spinner.visible ? spinner.width + parent.spacing : 0)
        textFormat: Text.PlainText
        text: pane.p.subtitle || ""
        // Left, as every row: right-to-left text is right-aligned unless told (ROADMAP 76).
        horizontalAlignment: Text.AlignLeft
        color: nodi.secondary
        font.family: nodi.fontFamily
        font.pixelSize: Style.font.caption
        elide: Text.ElideMiddle
      }
    }
    Rectangle {
      width: parent.width
      height: Style.spacing.hairline
      color: Util.alpha(nodi.foreground, 0.08)
      // Under a header only: with no title or subtitle there is nothing to
      // divide from.
      visible: !!(pane.p.title || pane.p.subtitle) && ((pane.p.labels || []).length > 0 || pane.hasImage || pane.hasWindow || pane.hasText || pane.hasStatus)
    }
    Repeater {
      model: pane.p.labels || []
      Row {
        required property var modelData
        id: labelRow
        width: head.width
        spacing: Style.spacing.lg
        readonly property int labelWidth: Style.space(90)
        Text {
          width: labelRow.labelWidth
          textFormat: Text.PlainText
          text: String(modelData[0])
          horizontalAlignment: Text.AlignLeft
          color: nodi.secondary
          font.family: nodi.fontFamily
          font.pixelSize: Style.font.caption
          elide: Text.ElideRight
        }
        // Wrapped, whole: a risk is the text the pane is there to have read,
        // and its middle was cut (Fable 2026-10-05).
        Text {
          width: parent.width - labelRow.labelWidth - parent.spacing
          textFormat: Text.PlainText
          text: String(modelData[1])
          horizontalAlignment: Text.AlignLeft
          color: nodi.foreground
          font.family: nodi.fontFamily
          font.pixelSize: Style.font.caption
          wrapMode: Text.Wrap
          maximumLineCount: 14
          elide: Text.ElideRight
        }
      }
    }
  }

  // What an answer waits on, where its words will come.
  Text {
    visible: pane.hasStatus
    anchors.left: parent.left
    anchors.right: parent.right
    anchors.top: head.bottom
    anchors.margins: Style.spacing.popupPadding
    textFormat: Text.PlainText
    text: pane.p.status || ""
    horizontalAlignment: Text.AlignLeft
    color: nodi.secondary
    font.family: nodi.fontFamily
    font.pixelSize: Style.font.subtitle
    wrapMode: Text.Wrap
    maximumLineCount: 3
    elide: Text.ElideRight
  }

  Image {
    visible: pane.hasImage
    anchors.left: parent.left
    anchors.right: parent.right
    anchors.top: head.bottom
    anchors.bottom: parent.bottom
    anchors.margins: Style.spacing.popupPadding
    // No header (a preview of Markdown alone): the pane's own margin only.
    anchors.topMargin: head.height > 0 ? Style.spacing.popupPadding : 0
    fillMode: Image.PreserveAspectFit
    asynchronous: true
    smooth: true
    // A fixed decode size: bound to the pane's own size, which eases in
    // and follows the rows, it re-decoded the picture on every frame.
    sourceSize.width: Style.space(1000)
    sourceSize.height: Style.space(600)
    source: pane.hasImage ? nodi.iconSource(pane.p.image, true) : ""
  }

  Loader {
    id: windowShot
    // While the bar is open: closing it only hides its window, and the
    // capture went on taken each second (Cursor 2026-10-07).
    active: pane.hasWindow && !!nodi.opened
    visible: active
    anchors.left: parent.left
    anchors.right: parent.right
    anchors.top: head.bottom
    anchors.bottom: parent.bottom
    anchors.margins: Style.spacing.popupPadding
    source: "WindowShot.qml"
    // The runtime Loader item is WindowShot; qmllint sees only QObject.
    // qmllint disable missing-property
    onLoaded: item.address = Qt.binding(function() { return String(pane.p.window || "") })
    // qmllint enable missing-property
  }

  Flickable {
    id: body
    visible: pane.hasText
    anchors.left: parent.left
    anchors.right: parent.right
    anchors.top: head.bottom
    anchors.bottom: parent.bottom
    anchors.margins: Style.spacing.popupPadding
    // No header (a preview of Markdown alone): the pane's own margin only.
    anchors.topMargin: head.height > 0 ? Style.spacing.popupPadding : 0
    contentWidth: width
    contentHeight: contentColumn.implicitHeight
    clip: true
    boundsBehavior: Flickable.StopAtBounds
    property bool scrolled: false
    // An answer as it streams keeps its newest words in view, until it is
    // scrolled by hand.
    onContentHeightChanged: if (pane.p.follow && !scrolled && contentHeight > height) contentY = contentHeight - height
    onMovementStarted: scrolled = true

    Column {
      id: contentColumn
      width: body.width
      spacing: Style.spacing.lg

      AskPlan {
        width: contentColumn.width
        visible: (pane.p.plans || []).length > 0
        nodi: pane.nodi
        entries: pane.p.plans || []
      }

      AskForm {
        width: contentColumn.width
        visible: !!pane.p.form
        nodi: pane.nodi
        form: pane.p.form
      }

      // A stream's blocks, laid out one by one (syncBlocks above).
      Column {
        id: blockColumn
        objectName: "paneBlocks"
        visible: pane.streams
        width: contentColumn.width
        // The gap Qt puts between paragraphs inside one Text, near enough.
        spacing: Math.round(bodyText.font.pixelSize * 0.6)
        Repeater {
          model: blocks
          Text {
            required property string t
            required property bool md
            required property string h
            width: blockColumn.width
            wrapMode: Text.Wrap
            textFormat: md ? Text.RichText : Text.PlainText
            text: md ? h : t
            horizontalAlignment: Text.AlignLeft
            color: nodi.foreground
            linkColor: nodi.link
            onLinkActivated: function(link) {
              nodi.openLink(link, {
                ask: pane.p.answerLink === true,
                turn: pane.p.answerTurn || ""
              })
            }
            font.family: nodi.fontFamily
            font.pixelSize: bodyText.font.pixelSize
            lineHeight: bodyText.lineHeight
          }
        }
      }

      Text {
        id: bodyText
        visible: !pane.streams && (pane.hasMarkdown || pane.hasCode || !!pane.p.text)
        width: contentColumn.width
        wrapMode: Text.Wrap
        textFormat: pane.hasMarkdown || pane.hasCode ? Text.RichText : Text.PlainText
        // Empty while a stream is drawn as blocks: bound to the answer, it
        // would be laid out whole at every word though nothing showed it.
        text: pane.streams ? "" : pane.hasMarkdown ? pane.bodyHtml : pane.hasCode ? Ansi.html(pane.p.code, nodi.themeColours) : (pane.p.text || "")
        horizontalAlignment: Text.AlignLeft
        color: nodi.foreground
        linkColor: nodi.link
        onLinkActivated: function(link) {
          nodi.openLink(link, {
            ask: pane.p.answerLink === true,
            turn: pane.p.answerTurn || ""
          })
        }
        font.family: nodi.fontFamily
        font.pixelSize: pane.p.mono ? Style.font.caption : Style.font.subtitle
        lineHeight: 1.15
      }
    }
  }
}
