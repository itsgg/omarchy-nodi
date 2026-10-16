import QtQuick
import qs.Commons

// A bounded ACP elicitation form. AskInteraction owns validation and the
// values; this component only edits supported primitive fields. Clipboard
// reads go through Nodi's capped, timed reader instead of Qt's implicit
// clipboard integration.
Column {
  id: formView
  property var nodi
  property var form: null
  property var shownFields: []
  property string shownFormKey: ""
  width: parent ? parent.width : 0
  spacing: Style.spacing.md

  function syncForm() {
    if (!formView.form) {
      shownFormKey = ""
      shownFields = []
    } else {
      var key = typeof formView.form.id + ":" + JSON.stringify(formView.form.id)
      if (shownFormKey === key) return
      shownFormKey = key
      shownFields = Array.isArray(formView.form.fields)
        ? formView.form.fields : []
    }
  }
  onFormChanged: syncForm()
  Component.onCompleted: syncForm()

  Text {
    width: parent.width
    visible: text !== ""
    text: formView.form ? String(formView.form.message || "") : ""
    textFormat: Text.PlainText
    color: nodi.foreground
    font.family: nodi.fontFamily
    font.pixelSize: Style.font.subtitle
    wrapMode: Text.Wrap
  }

  Repeater {
    model: formView.shownFields

    Column {
      id: fieldView
      required property var modelData
      width: formView.width
      spacing: Style.spacing.xs
      readonly property bool choice: modelData.type === "boolean"
        || modelData.type === "enum"
      readonly property bool unsupported: modelData.type === "unsupported"
      property var shownValue: modelData.value

      Text {
        width: parent.width
        text: String(fieldView.modelData.title || fieldView.modelData.name)
          + (fieldView.modelData.required ? " *" : "")
        textFormat: Text.PlainText
        color: nodi.secondary
        font.family: nodi.fontFamily
        font.pixelSize: Style.font.caption
        wrapMode: Text.Wrap
      }

      Rectangle {
        width: parent.width
        height: Math.max(Style.space(34), editor.implicitHeight + Style.spacing.sm * 2)
        color: "transparent"
        border.width: Style.spacing.hairline
        border.color: Util.alpha(nodi.foreground, 0.18)
        radius: Math.max(1, nodi.cornerRadius / 2)

        TextEdit {
          id: editor
          objectName: "askFormEditor"
          anchors.fill: parent
          anchors.margins: Style.spacing.sm
          visible: !fieldView.choice && !fieldView.unsupported
          textFormat: TextEdit.PlainText
          text: String(fieldView.modelData.value === undefined
            ? "" : fieldView.shownValue)
          color: nodi.foreground
          selectionColor: nodi.selectedBackground
          selectedTextColor: nodi.selectedText
          font.family: nodi.fontFamily
          font.pixelSize: Style.font.subtitle
          wrapMode: fieldView.modelData.type === "multiline"
            ? TextEdit.Wrap : TextEdit.NoWrap
          onTextChanged: if (activeFocus)
            formView.nodi.setAskFormField(
              fieldView.modelData.name, text)
          Keys.priority: Keys.BeforeItem
          Keys.onPressed: function(event) {
            if (event.matches(StandardKey.Paste)) {
              formView.nodi.pasteInput(
                editor, fieldView.modelData.type === "multiline")
              event.accepted = true
            }
          }

          MouseArea {
            anchors.fill: parent
            acceptedButtons: Qt.MiddleButton
            onPressed: function(mouse) { mouse.accepted = true }
          }

          DropArea {
            anchors.fill: parent
            onEntered: function(drag) { drag.accepted = true }
            onDropped: function(drop) { drop.accepted = true }
          }
        }

        Text {
          anchors.fill: parent
          anchors.margins: Style.spacing.sm
          visible: fieldView.choice || fieldView.unsupported
          textFormat: Text.PlainText
          text: fieldView.unsupported ? "Unsupported"
            : fieldView.modelData.type === "boolean"
            ? (fieldView.shownValue ? "Yes" : "No")
            : String(fieldView.shownValue)
          color: nodi.foreground
          font.family: nodi.fontFamily
          font.pixelSize: Style.font.subtitle
          verticalAlignment: Text.AlignVCenter
          elide: Text.ElideRight
        }

        MouseArea {
          anchors.fill: parent
          enabled: fieldView.choice && !fieldView.unsupported
          cursorShape: Qt.PointingHandCursor
          onClicked: {
            if (fieldView.modelData.type === "boolean") {
              fieldView.shownValue = !fieldView.shownValue
              formView.nodi.setAskFormField(
                fieldView.modelData.name, fieldView.shownValue)
              return
            }
            var values = fieldView.modelData.enum || []
            if (!values.length) return
            var at = values.indexOf(fieldView.shownValue)
            fieldView.shownValue = values[(at + 1) % values.length]
            formView.nodi.setAskFormField(
              fieldView.modelData.name, fieldView.shownValue)
          }
        }
      }

      Text {
        width: parent.width
        visible: text !== ""
        text: String(fieldView.modelData.description || "")
        textFormat: Text.PlainText
        color: nodi.secondary
        font.family: nodi.fontFamily
        font.pixelSize: Style.font.caption
        wrapMode: Text.Wrap
      }
    }
  }
}
