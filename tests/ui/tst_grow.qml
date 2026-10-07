import QtQuick
import QtTest
import "../components"
import "../lib/Rows.js" as Rows
import ".."

// The card growing (his report 2026-10-07: under load the card showed with
// no background, its icons spilling out, jittering). Its rows and its pane
// take their new size at once while the card animates to it; drawn past
// its edge, they showed on the scrim. Midway through growing taller,
// nothing of the card is drawn below it (this fails without the card's
// clip); growing wider as a pane comes is held too, though the pane
// already follows the card's width.
Item {
  id: top
  width: 1400
  height: 900
  // The scrim, a colour no card has, so anything drawn outside shows.
  Rectangle { anchors.fill: parent; color: "#ff00ff" }

  // Wide while a pane shows, as Nodi.qml and the render harness hold it.
  Look { id: look; screenWidth: 1920; screenHeight: 1200; chrome: card.chrome; wide: fake.preview !== null }
  FakeNodi { id: fake; look: look }
  Card { id: card; nodi: fake; x: 20; y: 20 }

  function rows(n, withPane) {
    var out = []
    for (var i = 0; i < n; i++) out.push(Rows.normalize({ key: "app:a" + i, title: "App " + i, subtitle: "Something", kind: "app", tier: "prefix",
                                                         preview: withPane ? { title: "App " + i, text: "Its details" } : undefined,
                                                         run: { kind: "app", id: "a" + i } }, { id: "apps", name: "Apps" }, 0, i))
    return out
  }

  // The first point of a box (x0, y0 to x1, y1) where something other
  // than the scrim is drawn, or "" where nothing is.
  function drawn(img, x0, y0, x1, y1) {
    for (var y = Math.ceil(y0); y < y1; y += 3)
      for (var x = Math.ceil(x0); x < x1; x += 3)
        if (!Qt.colorEqual(img.pixel(x, y), "#ff00ff")) return x + "," + y
    return ""
  }

  TestCase {
    name: "Grow"
    when: windowShown

    function init() {
      card.animated = false
      fake.opens = true
      fake.typed = "a"
      fake.rows = top.rows(1, false)
      fake.selectedIndex = 0
      wait(200)
      card.animated = true
    }

    function test_growing_taller_draws_nothing_below_the_card() {
      fake.rows = top.rows(8, false)
      wait(40)
      var mid = card.height
      var img = grabImage(top)
      wait(400)
      verify(mid < card.height, "caught before its end: " + mid + " of " + card.height)
      // Between the edge as drawn and where it is going, under the card.
      compare(top.drawn(img, card.x, card.y + mid + 2, card.x + card.width, card.y + card.height), "", "drawn below the card's edge at " + mid)
    }

    function test_growing_wider_draws_nothing_right_of_the_card() {
      fake.rows = top.rows(3, true)
      wait(40)
      var mid = card.width
      var img = grabImage(top)
      wait(400)
      verify(mid < card.width, "caught before its end: " + mid + " of " + card.width)
      compare(top.drawn(img, card.x + mid + 2, card.y, card.x + card.width, card.y + card.height), "", "drawn right of the card's edge at " + mid)
    }
  }
}
