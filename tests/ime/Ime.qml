import QtQuick
import QtQuick.Window
import "../components"
import ".."

// The real card under an input method (ROADMAP 76), for tools/render.sh
// with NODI_IME: fcitx5 composes into the field while tools/xkeys.py
// types, and each change is logged: what is committed, the composition,
// the query the results follow (Card.composed), and how many times the
// bar was told the query changed.
Window {
  id: win
  title: "nodi-ime"
  visible: true
  width: 900
  height: 300

  Look { id: look; screenWidth: 1920; screenHeight: 1200; chrome: card.chrome }
  FakeNodi { id: fake; look: look }
  Card { id: card; nodi: fake; x: 20; y: 20 }

  function find(item, name) {
    if (!item) return null
    if (item.objectName === name) return item
    for (var i = 0; i < (item.children || []).length; i++) {
      var f = win.find(item.children[i], name)
      if (f) return f
    }
    return null
  }
  // Whether the field's placeholder and "? for help" show over what is
  // typed: never over a composition (Sonnet 2026-10-07).
  function say() {
    var tells = fake.calls.filter(function(c) { return c[0] === "queryChanged" })
    var told = tells.length
    // What the bar read as it was told: the query of this very change.
    var seen = told ? tells[told - 1][1] : null
    var placeholder = win.find(card, "placeholder"), hint = win.find(card, "helpHint")
    console.log("STATE " + JSON.stringify({ text: card.input.text, preedit: card.input.preeditText, query: card.composed, told: told, seen: seen,
                                            placeholder: !!(placeholder && placeholder.visible), help: !!(hint && hint.visible) }))
  }
  Connections { target: card; function onComposedChanged() { win.say() } }
  Component.onCompleted: {
    fake.probe = function() { return card.composedNow() }
    card.input.forceActiveFocus()
  }
}
