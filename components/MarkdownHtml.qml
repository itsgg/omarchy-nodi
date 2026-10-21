import QtQuick

// Markdown to Qt's own HTML of it, for PreviewPane.qml to draw as rich text
// with its links recoloured (lib/Markdown.js inkLinks). The same reader
// builds the document either way, so the text is laid out and drawn as
// Text.MarkdownText draws it, to the pixel; only the links' colour is ours.
// Never shown, and read-only: Qt reads the clipboard for a TextEdit only
// when its text is editable (qquicktextcontrol.cpp, canPaste).
TextEdit {
  visible: false
  enabled: false
  readOnly: true
  activeFocusOnPress: false
  // Nothing for a screen reader: an empty text in the tree (make a11y).
  Accessible.ignored: true
  textFormat: TextEdit.MarkdownText

  // Read as rich text, a TextEdit gives the HTML of the document it holds.
  // In the font of the Text that draws it: Qt's reader sets paragraph and
  // list spacing from the document's font, and in another font the HTML
  // spaced the pane's lines apart.
  function html(markdown, textFont) {
    if (textFont) font = textFont
    textFormat = TextEdit.MarkdownText
    text = String(markdown || "")
    textFormat = TextEdit.RichText
    var out = text
    textFormat = TextEdit.MarkdownText
    text = ""
    return out
  }
}
