import QtQuick
import QtTest
import qs.Commons
import "../components"

// The card centered on every screen it opens on (his report 2026-10-25: on
// this laptop's 1536x960 the wide card sat 140 px right of center, its left
// edge held where the narrow card's would be). Wide or not, its middle is
// the screen's, and it keeps the shell's gap from the left edge.
Item {
  Look { id: look }

  TestCase {
    name: "Center"

    function test_the_card_is_centered_at_every_resolution_wide_or_not() {
      var screens = [[1024, 768], [1280, 800], [1366, 768], [1536, 960], [1920, 1080], [1920, 1200], [2560, 1440], [3840, 2160]]
      var split = 0
      for (var i = 0; i < screens.length; i++)
        for (var w = 0; w < 2; w++) {
          look.screenWidth = screens[i][0]
          look.screenHeight = screens[i][1]
          look.wide = w === 1
          var at = screens[i].join("x") + (look.wide ? " wide" : "")
          if (look.twoColumn) split++
          fuzzyCompare(look.cardX + look.cardWidth / 2, look.screenWidth / 2, 0.5, at)
          verify(look.cardX >= Style.gapsOut, at + ": " + look.cardX + " px from the left edge")
        }
      // The list beside its pane, where the card sat off center, is held.
      verify(split > 0, "no screen drew the card in two columns")
    }
  }
}
