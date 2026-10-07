import QtQuick
import QtTest
import "../components"
import "../lib/Rows.js" as Rows
import ".."

// Ask's spinner (ROADMAP 85): it turns while the answer is on its way,
// stops with the answer, and never turns under reduced motion (ROADMAP
// 73), where the line beside it says the same.
Item {
  id: top
  width: 1400
  height: 900

  Look { id: look; screenWidth: 1920; screenHeight: 1200; chrome: card.chrome; wide: fake.preview !== null }
  FakeNodi { id: fake; look: look }
  Card { id: card; nodi: fake; x: 20; y: 20 }

  TestCase {
    name: "Spinner"
    when: windowShown

    function init() {
      fake.reducedMotion = false
      fake.opens = true
      fake.typed = "ask how do I list open ports"
      fake.rows = [Rows.normalize({ key: "ask:wait", title: "Asking Claude...", subtitle: "how do I list open ports", copy: "" }, { id: "ask", name: "Ask" }, 0, 0)]
      fake.selectedIndex = 0
      fake.askPane = { busy: true, status: "Asking Claude" }
      wait(100)
    }

    function cleanup() { fake.askPane = null }

    function test_turns_while_the_answer_is_on_its_way_and_stops_with_it() {
      var s = findChild(card, "askSpinner")
      verify(s && s.visible, "the spinner shows while busy")
      verify(s.turning, "and turns")
      fake.askPane = { busy: false, status: "" }
      fake.answerShown = "Use ss."
      wait(50)
      verify(!s.visible && !s.turning, "the answer done: gone, still")
      compare(s.rotation, 0, "upright again")
      fake.answerShown = ""
    }

    function test_still_under_reduced_motion() {
      fake.reducedMotion = true
      wait(50)
      var s = findChild(card, "askSpinner")
      verify(s && s.visible, "still shown")
      verify(!s.turning, "but not turning")
    }
  }
}
