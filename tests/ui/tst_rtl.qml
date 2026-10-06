import QtQuick
import QtTest
import "../components"
import "../lib/Rows.js" as Rows
import ".."

// Right-to-left titles start at the left, as every other (ROADMAP 76):
// Qt aligns such text right unless told.
Item {
  width: 1100
  height: 800

  Look { id: look; screenWidth: 1920; screenHeight: 1200; chrome: card.chrome }
  FakeNodi { id: fake; look: look }
  Card { id: card; nodi: fake; x: 20; y: 20 }

  TestCase {
    name: "RightToLeft"
    when: windowShown

    function test_titles_align_left() {
      fake.typed = "notes"
      fake.rows = [
        Rows.normalize({ key: "file:a", title: "ملاحظات.md", subtitle: "שלום", kind: "item", tier: "prefix",
                         run: { kind: "open", target: "/tmp/a" } }, { id: "files", name: "Files" }, 0, 0)
      ]
      fake.selectedIndex = 0
      wait(50)
      var title = findChild(card.list.itemAtIndex(0), "title")
      verify(title, "the row's title")
      compare(title.effectiveHorizontalAlignment, Text.AlignLeft, "an Arabic title starts at the left")
      fake.paletteActions = [{ label: "פתח", icon: "" }]
      fake.paletteRow = fake.rows[0]
      fake.paletteOpen = true
      wait(50)
      var head = findChild(card, "paletteTitle")
      compare(head.effectiveHorizontalAlignment, Text.AlignLeft, "Ctrl+K's heading too")
    }
  }
}
