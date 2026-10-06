import QtQuick
import QtTest
import "../components"
import ".."

// What the bar reads as each key is typed (ROADMAP 76): the query of that
// very keystroke. Read through the `composed` binding, a handler of the
// field's change saw the one before (Sonnet 2026-10-07).
Item {
  width: 1100
  height: 600

  Look { id: look; screenWidth: 1920; screenHeight: 1200; chrome: card.chrome }
  FakeNodi { id: fake; look: look }
  Card { id: card; nodi: fake; x: 20; y: 20 }

  TestCase {
    name: "Typing"
    when: windowShown

    function test_each_key_reads_its_own_query() {
      fake.probe = function() { return card.composedNow() }
      fake.calls = []
      card.input.forceActiveFocus()
      keyClick(Qt.Key_A)
      keyClick(Qt.Key_B)
      var seen = fake.calls.filter(function(c) { return c[0] === "queryChanged" }).map(function(c) { return c[1] })
      compare(seen, ["a", "ab"])
      keyClick(Qt.Key_Left)
      keyClick(Qt.Key_C)
      seen = fake.calls.filter(function(c) { return c[0] === "queryChanged" }).map(function(c) { return c[1] })
      compare(seen[seen.length - 1], "acb", "typed in the middle, read in the middle")
    }
  }
}
