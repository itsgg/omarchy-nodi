import QtQuick
import QtTest
import "../components"
import "../lib/Rows.js" as Rows
import ".."

// A decoded icon rebinds the rows that show it and no others (IconRef.qml):
// bound to one revision for every raster, each decode had every visible row
// call the image cache again.
Item {
  id: top
  width: 1100
  height: 800

  Look { id: look; screenWidth: 1920; screenHeight: 1200; chrome: card.chrome }
  FakeNodi { id: fake; look: look }
  Card { id: card; nodi: fake; x: 20; y: 20 }

  function rows(keys) {
    return keys.map(function(k, i) {
      return Rows.normalize({ key: "app:" + k, title: "App " + k, subtitle: "Something", image: "/icons/" + k + ".png", kind: "app", tier: "prefix",
                             run: { kind: "app", id: k } }, { id: "apps", name: "Apps" }, 0, i)
    })
  }

  TestCase {
    name: "Icons"
    when: windowShown

    function test_a_raster_rebinds_only_its_own_rows() {
      fake.typed = "a"
      fake.rows = top.rows(["a", "b", "c"])
      fake.selectedIndex = 0
      wait(50)
      var before = JSON.parse(JSON.stringify(fake.iconReads))
      verify(before["/icons/a.png"] > 0 && before["/icons/b.png"] > 0, "each row read its picture")
      fake.rasterChanged(fake.iconKey("/icons/b.png", false))
      wait(20)
      compare(fake.iconReads["/icons/b.png"], before["/icons/b.png"] + 1, "the row whose raster landed reads it again")
      compare(fake.iconReads["/icons/a.png"], before["/icons/a.png"], "the others do not")
      compare(fake.iconReads["/icons/c.png"], before["/icons/c.png"])
      fake.rasterChanged("")
      wait(20)
      compare(fake.iconReads["/icons/a.png"], before["/icons/a.png"] + 1, "a drop of every raster reaches every row")
    }
  }
}
