import QtQuick
import QtTest
import "../components"
import ".."

// Nodi's own notices (components/ToastCard.qml, the cards Toast.qml shows
// in a window of their own, 2026-10-10): their words plain text, so a tag
// in a failed row's title or a script's output is shown, never loaded; each
// card said to a screen reader as an alert; a click takes it away.
Item {
  id: top
  width: 600
  height: 500

  Look { id: look; screenWidth: 1920; screenHeight: 1200 }
  property var dismissed: []
  ToastCard {
    id: cards
    look: look
    x: 20
    y: 20
    items: [{ id: 1, title: "<img src='http://127.0.0.1:9/x.png'> Sync notes failed", body: "<b>rsync</b>: connection refused" },
            { id: 2, title: "Reminder", body: "" }]
    onDismiss: function(id) { top.dismissed = top.dismissed.concat([id]) }
  }

  function texts(item, out) {
    for (var i = 0; i < item.children.length; i++) {
      var c = item.children[i]
      if (c.hasOwnProperty("textFormat") && c.hasOwnProperty("text")) out.push(c)
      texts(c, out)
    }
    return out
  }

  TestCase {
    name: "Toast"
    when: windowShown

    function test_words_are_plain_text_and_a_click_dismisses() {
      var shown = top.texts(cards, [])
      verify(shown.length >= 3, "a title and a body, and a title alone: " + shown.length)
      for (var i = 0; i < shown.length; i++) compare(shown[i].textFormat, Text.PlainText, "plain text: " + shown[i].text)
      compare(shown[0].text, "<img src='http://127.0.0.1:9/x.png'> Sync notes failed", "the tag shown as written")
      compare(shown[1].text, "<b>rsync</b>: connection refused")
      verify(!shown[3] || !shown[3].visible || shown[3].text === "", "no body: none drawn")
      var first = cards.children[0]
      compare(first.Accessible.role, Accessible.AlertMessage)
      compare(first.Accessible.name, "<img src='http://127.0.0.1:9/x.png'> Sync notes failed")
      mouseClick(first)
      compare(top.dismissed, [1])
      verify(cards.cardWidth > 0 && cards.cardWidth <= 1920)
    }
  }
}
