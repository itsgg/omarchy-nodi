import QtQuick
import QtTest
import "../components"
import "../lib/Rows.js" as Rows
import ".."

// The mouse on the card (ROADMAP 74): a right click on a row opens its
// actions and runs nothing; a left click runs it; each footer key clicks
// as that key pressed.
Item {
  id: top
  width: 1100
  height: 800

  Look { id: look; screenWidth: 1920; screenHeight: 1200; chrome: card.chrome }
  FakeNodi { id: fake; look: look }
  Card { id: card; nodi: fake; x: 20; y: 20 }

  // Rows as the engine hands them over (Rows.normalize).
  readonly property var sample: [
    Rows.normalize({ key: "app:firefox", title: "Firefox", subtitle: "Web Browser", complete: "firefox ", kind: "app", tier: "prefix",
                     run: { kind: "app", id: "firefox" } }, { id: "apps", name: "Apps" }, 0, 0),
    Rows.normalize({ key: "app:foot", title: "Foot", subtitle: "Terminal", kind: "app", tier: "prefix",
                     run: { kind: "app", id: "foot" } }, { id: "apps", name: "Apps" }, 0, 1)
  ]

  TestCase {
    name: "Mouse"
    when: windowShown

    function init() {
      fake.opens = true
      fake.armedKey = ""
      fake.paletteOpen = false
      fake.typed = "f"
      fake.rows = top.sample
      fake.selectedIndex = 0
      fake.calls = []
      wait(50)
    }

    function called(name) { return fake.calls.filter(function(c) { return c[0] === name }) }

    function test_right_click_opens_the_rows_actions() {
      var row = card.list.itemAtIndex(1)
      verify(row, "the second row is drawn")
      mouseClick(row, 60, row.height - 12, Qt.RightButton)
      compare(fake.selectedIndex, 1, "the row clicked is selected")
      compare(called("openPalette").length, 1, "its actions open")
      compare(called("openPalette")[0][1], 1, "for that row")
      compare(called("activate").length, 0, "a right click runs nothing")
    }

    function test_left_click_runs_the_row() {
      var row = card.list.itemAtIndex(1)
      mouseClick(row, 60, row.height - 12, Qt.LeftButton)
      compare(called("activate").length, 1)
      compare(called("activate")[0][1], 1)
      compare(called("openPalette").length, 0)
    }

    function test_footer_keys_click_as_pressed() {
      var enter = findChild(card, "key-Enter")
      verify(enter && enter.visible, "Enter shows")
      mouseClick(enter)
      compare(called("handleKey")[0].slice(1), [Qt.Key_Return, 0])
      var ctrlK = findChild(card, "key-CtrlK")
      verify(ctrlK && ctrlK.visible, "Ctrl K shows: the row has actions")
      mouseClick(ctrlK)
      compare(called("handleKey")[1].slice(1), [Qt.Key_K, Qt.ControlModifier])
      var tab = findChild(card, "key-Tab")
      verify(tab && tab.visible, "Tab shows: the row fills in")
      mouseClick(tab)
      compare(called("handleKey")[2].slice(1), [Qt.Key_Tab, 0])
      compare(called("focusInput").length, 3, "the field has the keys again after each")
    }

    function test_escape_clicks_back_out_of_actions() {
      fake.paletteActions = [{ label: "Open", icon: "" }]
      fake.paletteRow = top.sample[0]
      fake.paletteOpen = true
      wait(50)
      var esc = findChild(card, "key-Esc")
      verify(esc && esc.visible, "Esc shows under Ctrl+K")
      mouseClick(esc)
      compare(called("handleKey")[0].slice(1), [Qt.Key_Escape, 0])
    }

    function test_a_badge_is_no_button() {
      fake.rows = [Rows.normalize({ key: "toggle:wifi", title: "Wi-Fi", subtitle: "Toggle", badge: "ON", badgeTone: "on", kind: "toggle", tier: "exact",
                                    run: { kind: "exec", argv: ["true"] } }, { id: "system", name: "Toggles" }, 0, 0)]
      wait(50)
      var badge = findChild(card.list.itemAtIndex(0), "badge")
      verify(badge && badge.visible, "the badge shows")
      // On the badge itself (Sonnet 2026-10-06: the click missed it): it
      // runs the row.
      mouseClick(badge)
      compare(called("activate").length, 1)
      compare(called("handleKey").length, 0)
    }

    function test_right_click_on_a_row_without_actions_keeps_its_confirmation() {
      fake.opens = false
      fake.armedKey = top.sample[1].key
      var row = card.list.itemAtIndex(1)
      mouseClick(row, 60, row.height - 12, Qt.RightButton)
      compare(called("openPalette").length, 1)
      compare(fake.armedKey, top.sample[1].key, "nothing opened, nothing let go")
    }

    function test_scroll_key_pages_the_pane() {
      var footer = findChild(card, "footer")
      footer.scrollable = true
      wait(50)
      var scroll = findChild(card, "key-Scroll")
      verify(scroll && scroll.visible, "Scroll shows while the pane has more")
      mouseClick(scroll)
      compare(called("handleKey")[0].slice(1), [Qt.Key_PageDown, Qt.ShiftModifier])
    }
  }
}
