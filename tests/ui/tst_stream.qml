import QtQuick
import QtTest
import "../components"
import "../lib/Rows.js" as Rows
import ".."

// An answer as it streams (components/PreviewPane.qml): drawn as blocks,
// a finished block laid out once and never again as words arrive, the
// whole answer there once it ends; and a streamed answer says it is asking
// until its first words, its spinner turning, as Ask's does.
Item {
  id: top
  width: 1400
  height: 900

  Look { id: look; screenWidth: 1920; screenHeight: 1200; chrome: card.chrome; wide: fake.preview !== null }
  FakeNodi { id: fake; look: look }
  Card { id: card; nodi: fake; x: 20; y: 20 }

  TestCase {
    name: "Stream"
    when: windowShown

    function init() {
      fake.reducedMotion = false
      fake.opens = true
      fake.typed = "pp how do tiling compositors differ"
      fake.rows = [Rows.normalize({ key: "answer:pp:wait", title: "Asking Perplexity...", subtitle: "Esc stops it", copy: "" }, { id: "answers", name: "Answers" }, 0, 0)]
      fake.selectedIndex = 0
    }

    function cleanup() { fake.streamed = null }

    function says(text, busy) {
      fake.streamed = { question: "how do tiling compositors differ", title: "Perplexity", text: text, seq: 1, busy: busy }
    }

    function blockTexts() {
      var col = findChild(card, "paneBlocks")
      var out = []
      for (var i = 0; i < col.children.length; i++) if (col.children[i].text !== undefined) out.push(col.children[i])
      return out
    }

    function test_asking_until_the_first_words() {
      says("", true)
      wait(120)
      var s = findChild(card, "askSpinner")
      verify(s && s.visible && s.turning, "the spinner turns before the first word")
      compare(fake.preview.status, "Asking Perplexity...")
      says("First words.", true)
      wait(120)
      compare(fake.preview.status, "", "the status gives way to the words")
      says("First words.", false)
      wait(50)
      verify(!s.visible, "done: the spinner goes")
    }

    function test_a_finished_block_is_not_laid_out_again() {
      var para = "Hyprland, Sway and niri are tiling compositors with different ideas about layout."
      says("# Tiling\n\n" + para + "\n\n", true)
      wait(150)
      var first = blockTexts()
      compare(first.length, 2, "a heading and a paragraph")
      var heading = first[0]
      var shown = heading.text
      var text = "# Tiling\n\n" + para + "\n\n"
      for (var i = 0; i < 40; i++) { text += "word" + i + " "; says(text, true); wait(5) }
      wait(150)
      var now = blockTexts()
      verify(now[0] === heading, "the heading's Text is the same item")
      compare(now[0].text, shown, "and was not given new text")
      compare(now.length, 3, "the growing paragraph is a block of its own")
      verify(now[2].text.indexOf("word39") !== -1, "with every word so far")
    }

    function test_the_whole_answer_is_there_when_it_ends() {
      var text = "Intro.\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n```\nconfig = 1\n\nmore = 2\n```\n\nLast line."
      says(text.slice(0, 20), true)
      wait(120)
      says(text, false)
      // At once, not after the throttle: the run is over.
      wait(10)
      var all = blockTexts().map(function(t) { return t.text }).join("\n")
      verify(all.indexOf("Last line.") !== -1, "the last words")
      verify(all.indexOf("more = 2") !== -1, "a fence with a blank line inside stays one block")
      compare(blockTexts().length, 4)
    }
  }
}
