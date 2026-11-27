import QtQuick
import QtTest
import "../components"
import "../lib/Rows.js" as Rows
import ".."

// The selected row's gliding mark stays with its row: wheeled out of view,
// it goes with the row, clipped by the list, and is never drawn over the
// field or the footer (it sat in the unclipped box beside the list).
Item {
  id: top
  width: 1100
  height: 900
  Rectangle { anchors.fill: parent; color: "#ff00ff" }

  Look { id: look; screenWidth: 1920; screenHeight: 1200; chrome: card.chrome }
  FakeNodi { id: fake; look: look }
  Card { id: card; nodi: fake; x: 20; y: 20 }

  function rows(n) {
    var out = []
    for (var i = 0; i < n; i++) out.push(Rows.normalize({ key: "app:a" + i, title: "App " + i, subtitle: "Something", kind: "app", tier: "prefix",
                                                         run: { kind: "app", id: "a" + i } }, { id: "apps", name: "Apps" }, 0, i))
    return out
  }

  TestCase {
    name: "Pill"
    when: windowShown

    function test_the_mark_leaves_with_its_row() {
      card.animated = false
      fake.typed = "a"
      fake.rows = top.rows(30)
      fake.selectedIndex = 0
      wait(100)
      var pill = findChild(card, "selectionPill")
      verify(pill, "the mark is there")
      var list = card.list
      var row = list.itemAtIndex(0)
      var at = pill.mapToItem(list, 0, 0).y
      verify(at >= 0 && at < row.height, "on its row: " + at)
      // Wheeled down past the selected row, as the wheel scrolls the list.
      list.contentY = list.originY + row.height * 6
      wait(50)
      var now = pill.mapToItem(list, 0, 0).y
      verify(now + pill.height <= 0, "gone above the list with its row: " + now)
      // What draws it clips it: the list, or an item inside it.
      var clipped = false
      for (var p = pill.parent; p && p !== card; p = p.parent) if (p.clip && (p === list || p.parent === list || p === list.contentItem)) clipped = true
      verify(clipped, "clipped by the list")
      // Nothing of it above the list: between the card's top and the
      // list's, the card looks the same with the mark as without it. (Its
      // colour alone can be the border's in a theme.)
      if (pill.visible) {
        var withMark = grabImage(top)
        pill.visible = false
        wait(20)
        var without = grabImage(top)
        pill.visible = true
        var listTop = list.mapToItem(top, 0, 0).y
        var x = Math.round(pill.mapToItem(top, pill.width / 2, 0).x)
        for (var y = Math.ceil(card.y); y < listTop; y++)
          verify(Qt.colorEqual(withMark.pixel(x, y), without.pixel(x, y)), "the mark drawn over the field at " + x + "," + y)
      }
    }
  }
}
