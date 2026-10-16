import QtQuick
import QtTest
import "../components"

Item {
  id: root
  width: 600
  height: 400
  property var formState: ({
    id: 7,
    message: "Details",
    fields: [{ name: "notes", title: "Notes", type: "string", value: "" }]
  })

  QtObject {
    id: fake
    property color foreground: "white"
    property color secondary: "gray"
    property color selectedBackground: "blue"
    property color selectedText: "white"
    property string fontFamily: "sans"
    property real cornerRadius: 8
    function pasteInput() {}
    function setAskFormField(name, value) {
      root.formState = {
        id: 7,
        message: "Details",
        fields: [{ name: "notes", title: "Notes", type: "string", value: value }]
      }
    }
  }

  AskForm {
    id: form
    width: 400
    nodi: fake
    form: root.formState
  }

  TestCase {
    name: "AskForm"
    when: windowShown

    function test_typing_keeps_the_editor_and_focus() {
      var editor = findChild(form, "askFormEditor")
      verify(editor !== null)
      editor.forceActiveFocus()
      keyClick(Qt.Key_A)
      wait(0)
      var after = findChild(form, "askFormEditor")
      compare(after, editor, "editing one character must not recreate the field")
      verify(after.activeFocus, "editing one character must keep keyboard focus")
      keyClick(Qt.Key_B)
      compare(root.formState.fields[0].value, "ab")
    }
  }
}
