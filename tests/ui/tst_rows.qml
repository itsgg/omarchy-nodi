import QtQuick
import QtTest
import "../components"
import "../lib/Rows.js" as Rows
import ".."

// The result rows kept across recomputes (Card.syncRows, lib/ListSync.js):
// a row still there after a keystroke is the same delegate, moved if it
// moved, so its tile and picture are not made again. Bound to the rows
// array, every visible row was destroyed and made again per keystroke.
Item {
  id: top
  width: 1100
  height: 800

  Look { id: look; screenWidth: 1920; screenHeight: 1200; chrome: card.chrome }
  FakeNodi { id: fake; look: look }
  Card { id: card; nodi: fake; x: 20; y: 20 }

  function rows(keys, suffix) {
    return keys.map(function(k, i) {
      return Rows.normalize({ key: "app:" + k, title: "App " + k + (suffix || ""), subtitle: "Something", kind: "app", tier: "prefix",
                             run: { kind: "app", id: k } }, { id: "apps", name: "Apps" }, 0, i)
    })
  }

  TestCase {
    name: "Rows"
    when: windowShown

    function title(item) { return findChild(item, "title").text }

    function init() {
      fake.typed = "a"
      fake.rows = top.rows(["a", "b", "c", "d"])
      fake.selectedIndex = 0
      wait(50)
    }

    function test_same_rows_keep_their_delegates() {
      var before = [0, 1, 2, 3].map(function(i) { return card.list.itemAtIndex(i) })
      fake.rows = top.rows(["a", "b", "c", "d"])
      wait(20)
      for (var i = 0; i < 4; i++) verify(card.list.itemAtIndex(i) === before[i], "row " + i + " kept")
    }

    function test_a_narrowed_and_reordered_list_moves_rows() {
      var c = card.list.itemAtIndex(2)
      var a = card.list.itemAtIndex(0)
      fake.rows = top.rows(["c", "a"])
      wait(20)
      compare(card.list.count, 2)
      verify(card.list.itemAtIndex(0) === c, "c moved to the top, kept")
      verify(card.list.itemAtIndex(1) === a, "a moved down, kept")
      compare(c.index, 0)
      compare(title(c), "App c")
    }

    function test_a_changed_row_is_drawn_anew_in_its_delegate() {
      var b = card.list.itemAtIndex(1)
      fake.rows = top.rows(["a", "b", "c", "d"], "!")
      wait(20)
      verify(card.list.itemAtIndex(1) === b)
      compare(title(b), "App b!")
    }

    function test_current_item_follows_the_selection_when_a_row_comes_above() {
      fake.selectedIndex = 0
      fake.rows = top.rows(["z", "a", "b", "c", "d"])
      wait(20)
      compare(card.list.currentIndex, 0)
      fake.selectedIndex = 2
      compare(card.list.currentIndex, 2, "still bound to the selection")
    }
  }
}
