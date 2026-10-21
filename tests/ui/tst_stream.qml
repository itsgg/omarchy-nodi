import QtQuick
import QtTest
import "../components"
import "../lib/Rows.js" as Rows
import "../lib/Contrast.js" as Contrast
import qs.Commons
import qs.Commons as Commons
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
      look.highContrast = false
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

    function markdownText(item) {
      if (item.visible && item.textFormat === Text.RichText && typeof item.linkAt === "function") return item
      for (var i = 0; i < item.children.length; i++) {
        var found = markdownText(item.children[i])
        if (found) return found
      }
      return null
    }

    function clickLink(text, url) {
      for (var y = 0; y < text.height; y += 2) {
        for (var x = 0; x < text.width; x += 2) {
          if (text.linkAt(x, y) === url) {
            mouseClick(text, x, y)
            return
          }
        }
      }
      fail("the link has no clickable point")
    }

    function openedLinks() {
      return fake.calls.filter(function(c) { return c[0] === "openLink" }).map(function(c) { return c[1] })
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

    function test_a_streamed_markdown_link_opens_its_exact_https_url() {
      var url = "https://example.org/streamed?from=nodi"
      fake.calls = []
      says("[Read it](" + url + ")", false)
      wait(120)
      var text = blockTexts()[0]
      verify(text, "the streamed Markdown block")
      clickLink(text, url)
      compare(openedLinks(), [url])
    }

    function test_an_ordinary_markdown_link_opens_its_exact_https_url() {
      var url = "https://example.org/ordinary?from=nodi"
      fake.calls = []
      fake.streamed = null
      fake.rows = [Rows.normalize({ key: "article", title: "Article", copy: "Article",
                                    preview: { markdown: "[Read it](" + url + ")" } },
                                  { id: "test", name: "Test" }, 0, 0)]
      wait(120)
      var text = markdownText(card)
      verify(text, "the ordinary Markdown text")
      clickLink(text, url)
      compare(openedLinks(), [url])
    }

    // Markdown is drawn as Qt's HTML of it, its links carrying the colour
    // (PreviewPane.qml rich): Text.linkColor never reaches a Markdown link.
    function linkColours(text) {
      return (text.text.match(/<a [^>]*><span style="[^"]*color:(#[0-9a-f]{6});/g) || [])
        .map(function(a) { return a.match(/color:(#[0-9a-f]{6});$/)[1] })
    }

    function test_markdown_links_use_the_readable_theme_accent() {
      var url = "https://example.org/theme"
      says("[Read it](" + url + ")", false)
      wait(120)
      var text = blockTexts()[0]
      compare(text.textFormat, Text.RichText, "drawn as Qt's HTML of the Markdown")
      var expected = String(look.rgb(Contrast.guard(Commons.Color.accent, look.opaqueCard, look.foreground)))
      compare(linkColours(text), [expected], "the link in the active theme's accent")
      verify(Contrast.ratio(Qt.color(expected), look.opaqueCard) >= 4.5, "readable on the card")
      verify(!/#0000ff|underline|<img/i.test(text.text), "no palette blue, underline or picture")
      verify(!text.layer.enabled, "the text is drawn as Qt draws it")
    }

    function test_high_contrast_links_match_in_streamed_and_ordinary_markdown() {
      var url = "https://example.org/high-contrast"
      look.highContrast = true
      says("[Read it](" + url + ")", false)
      wait(120)
      var streamed = blockTexts()[0]
      var expected = String(look.rgb(Contrast.atLeast(Commons.Color.accent, look.opaqueCard, 7)))
      compare(linkColours(streamed), [expected], "the streamed link's enhanced colour")
      verify(Contrast.ratio(Qt.color(expected), look.opaqueCard) >= 7, "the streamed link reaches 7:1")

      fake.streamed = null
      fake.rows = [Rows.normalize({ key: "article", title: "Article", copy: "Article",
                                    preview: { markdown: "[Read it](" + url + ")" } },
                                  { id: "test", name: "Test" }, 0, 0)]
      wait(120)
      var ordinary = markdownText(card)
      verify(ordinary, "the ordinary Markdown text")
      compare(linkColours(ordinary), [expected], "both Markdown paths use the same colour")
    }
  }
}
