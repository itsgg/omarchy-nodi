// Markdown for the preview pane: pictures and HTML go, so nothing a
// provider prints can make Nodi load a file or a page; code stays.

import { test } from "node:test";
import assert from "node:assert/strict";
import { load } from "./load.mjs";

const Markdown = load("lib/Markdown.js");

test("pictures keep their alt text where simple; any other form is escaped, never drawn", () => {
  assert.equal(Markdown.escapeLines("see ![a cat](https://x.test/cat.png) here"), "see a cat here");
  assert.equal(Markdown.escapeLines('![chart](/home/u/a.png "title")'), "chart");
  // The four shapes Qt fetched through the first version (Fable 2026-10-04).
  assert.equal(Markdown.escapeLines("![a [b] c](https://x.test/p.png)"), "\\![a [b] c](https://x.test/p.png)", "brackets in the alt text");
  assert.equal(Markdown.escapeLines("![a\\]b](https://x.test/p.png)"), "\\![a\\]b](https://x.test/p.png)", "an escaped bracket in the alt text");
  assert.equal(Markdown.escapeLines("![logo]\n\n[logo]: https://x.test/l.png"), "\\![logo]\n\n[logo]: https://x.test/l.png", "a shortcut reference picture");
  assert.equal(Markdown.escapeLines('<table\nbackground="https://x.test/bg.png"\n><tr><td>x</td></tr></table>'),
               '\\<table\nbackground="https://x.test/bg.png"\n>\\<tr>\\<td>x\\</td>\\</tr>\\</table>', "a tag split over lines");
});

test("a character escaped already stays escaped: escaping it again frees it", () => {
  // Fable 2026-10-04: "\\![" became "\\\\![", a backslash and then a picture Qt fetched.
  assert.equal(Markdown.escapeLines("\\![a [b]](https://x.test/p.png)"), "\\![a [b]](https://x.test/p.png)", "an escaped picture is a link");
  assert.equal(Markdown.escapeLines("\\![logo]\n\n[logo]: https://x.test/l.png"), "\\![logo]\n\n[logo]: https://x.test/l.png", "and its reference form");
  assert.equal(Markdown.escapeLines("\\![x](https://x.test/p.png)"), "\\![x](https://x.test/p.png)", "a plain one too, its alt text not taken");
  assert.equal(Markdown.escapeLines('\\<img src="https://x.test/t.gif">'), '\\<img src="https://x.test/t.gif">');
  assert.equal(Markdown.escapeLines("\\\\![x](https://x.test/p.png)"), "\\\\x", "two backslashes are one, and the picture is still a picture");
  assert.equal(Markdown.escapeLines('\\\\<img src="https://x.test/t.gif">'), '\\\\\\<img src="https://x.test/t.gif">');
  assert.equal(Markdown.escapeLines("\\\\\\![a [b]](u)"), "\\\\\\![a [b]](u)", "three: escaped");
});

test("an escaped backtick opens no code span, in escapeLines() and in the pane alike", () => {
  // Code to escapeLines() and prose to md4c: "\\`<img src=x>`" was left as written.
  assert.equal(Markdown.escapeLines("\\`<img src=x>`"), "\\`\\<img src=x>`");
  assert.equal(Markdown.forPane("\\`<img src=x>`"), "\\`\\<img src=x>`");
  assert.equal(Markdown.escapeLines("\\``<i>` x`"), "\\``<i>` x`", "the backtick after it opens a run of its own");
  assert.equal(Markdown.escapeLines("a``<b>`"), "a``\\<b>`", "a run closes only on a run as long");
  assert.equal(Markdown.escapeLines("`a\\`<i>"), "`a\\`\\<i>", "a backslash inside a span is the span's, and closes nothing");
});

test("HTML is escaped, links and autolinks stay", () => {
  assert.equal(Markdown.escapeLines('a <img src="https://x.test/t.gif"> b'), 'a \\<img src="https://x.test/t.gif"> b');
  assert.equal(Markdown.escapeLines("<!-- <img src=x> -->kept"), "\\<!-- \\<img src=x> -->kept");
  assert.equal(Markdown.escapeLines("[the docs](https://x.test/docs)"), "[the docs](https://x.test/docs)");
  assert.equal(Markdown.escapeLines("<https://x.test/raw>"), "<https://x.test/raw>");
  assert.equal(Markdown.escapeLines("2 < 3 and 4 > 1"), "2 \\< 3 and 4 > 1");
  assert.equal(Markdown.escapeLines("use `a<b>` here <i>"), "use `a<b>` here \\<i>", "inline code as written");
});

test("fenced code is left as written, and a fence is what Qt's parser takes for one", () => {
  const code = "```html\n<img src=\"a.png\">\n![x](y)\n```\nafter <b>bold</b>";
  assert.equal(Markdown.escapeLines(code), "```html\n<img src=\"a.png\">\n![x](y)\n```\nafter \\<b>bold\\</b>");
  const tilde = "~~~\n<img src=a>\n~~~\n<img src=b>";
  assert.equal(Markdown.escapeLines(tilde), "~~~\n<img src=a>\n~~~\n\\<img src=b>");
  assert.equal(Markdown.escapeLines("````\n```\n<i>\n````\n<i>x</i>"), "````\n```\n<i>\n````\n\\<i>x\\</i>", "a shorter fence inside a longer one is code");
  assert.equal(Markdown.escapeLines("```x`y\n<img src=z>"), "```x`y\n\\<img src=z>", "a backtick in the info string: not a fence, so prose");
});

test("an autolink is kept only as md4c reads one, and never one holding a picture", () => {
  // Fable 2026-10-04: each fetched through the pane while "<x:" was taken for a link.
  const pic = "![a[b]](https://x.test/p.png)";
  assert.equal(Markdown.forPane("<x:" + pic + ">"), "\\<x:\\" + pic + ">", "a one-letter scheme is prose");
  for (const scheme of ["x", "a".repeat(32), "a".repeat(40)])
    assert.ok(!/(^|[^\\])!\[/.test(Markdown.forPane("<" + scheme + ":" + pic + ">")), scheme.length + " letters: the picture is escaped");
  for (const path of ["\u0001", "\u007f"])
    assert.ok(!/(^|[^\\])!\[/.test(Markdown.forPane("<ab:" + path + pic + ">")), "a control character: prose");
  assert.ok(!/(^|[^\\])!\[/.test(Markdown.forPane("see <ab:" + pic + "> here")), "a picture inside a link-like run is escaped even if md4c took it for a link");
  assert.equal(Markdown.forPane("<" + "a".repeat(31) + ":x>"), "<" + "a".repeat(31) + ":x>", "31 letters is a link");
  assert.equal(Markdown.forPane("<https://x.test/raw>"), "<https://x.test/raw>");
});

test("long text is cut, and nothing is nothing", () => {
  assert.equal(Markdown.escapeLines("a".repeat(70000)).length, Markdown.MAX);
  assert.equal(Markdown.escapeLines(undefined), "");
  assert.equal(Markdown.escapeLines(null), "");
});

test("code is drawn as text in the pane's own font, lines, indent and characters kept", () => {
  assert.equal(Markdown.forPane("run `a*b*c` now"), "run a\\*b\\*c now");
  const block = Markdown.forPane("```sh\nif x; then\n  echo *ok* <b>\nfi\n```\nafter");
  assert.equal(block, "\nif x; then  \n\u00a0\u00a0echo \\*ok\\* \\<b\\>  \nfi  \n\nafter");
  assert.equal(Markdown.forPane("``a `tick` b``"), "a \\`tick\\` b", "a span with ticks inside");
  assert.equal(Markdown.forPane("![p](https://x.test/p.png) `x`"), "p x", "safe first: the picture goes either way");
  assert.equal(Markdown.forPane("use `a<b>` here"), "use a\\<b\\> here", "inline code shows its characters, no stray backslash");
});


// Qt 6.12's HTML of "See [the **docs**](https://x.test/a) and <https://x.test/b>."
// (a TextEdit read as rich text, as components/MarkdownHtml.qml does).
const QT_HTML = "<!DOCTYPE HTML PUBLIC \"-//W3C//DTD HTML 4.0//EN\" \"http://www.w3.org/TR/REC-html40/strict.dtd\">\n<html><head><meta name=\"qrichtext\" content=\"1\" /><meta charset=\"utf-8\" /><style type=\"text/css\">\np, li { white-space: pre-wrap; }\nhr { height: 1px; border-width: 0; }\nli.unchecked::marker { content: \"\\2610\"; }\nli.checked::marker { content: \"\\2612\"; }\n</style></head><body style=\" font-family:'Adwaita Sans'; font-size:11pt; font-weight:400; font-style:normal;\">\n<p style=\" margin-top:7px; margin-bottom:7px; margin-left:0px; margin-right:0px; -qt-block-indent:0; text-indent:0px;\">See <a href=\"https://x.test/a\"><span style=\" text-decoration: underline; color:#0000ff;\">the </span></a><a href=\"https://x.test/a\"><span style=\" font-weight:700; text-decoration: underline; color:#0000ff;\">docs</span></a> and <a href=\"https://x.test/b\"><span style=\" text-decoration: underline; color:#0000ff;\">https://x.test/b</span></a>.</p></body></html>";

test("links in Qt's HTML of Markdown take the theme's colour, no underline, and the Text's font", () => {
  const out = Markdown.inkLinks(QT_HTML, "#99c1dc");
  assert.ok(!/#0000ff/.test(out), "no palette blue left");
  assert.ok(!/underline/.test(out), "no underline");
  assert.equal((out.match(/<a href="https:\/\/x\.test\/a" style="text-decoration: none; color:#99c1dc;"><span style=" text-decoration: none; color:#99c1dc;">the <\/span><\/a>/g) || []).length, 1, "the link and its span");
  assert.match(out, /<span style=" font-weight:700; text-decoration: none; color:#99c1dc;">docs<\/span>/, "bold kept");
  assert.match(out, /<a href="https:\/\/x\.test\/b" style="text-decoration: none; color:#99c1dc;">/, "an autolink too");
  assert.match(out, /<body>/, "the document's font dropped");
  assert.ok(out.includes("See ") && out.includes(" and ") && out.includes("margin-top:7px"), "the rest as Qt wrote it");
});

test("a bad colour leaves the link's colour alone, and no picture survives", () => {
  const out = Markdown.inkLinks(QT_HTML, "red; background-image:url(x)");
  assert.ok(!/background-image|url\(/.test(out), "nothing of the colour is written");
  assert.match(out, /color:#0000ff;/, "Qt's colour stays");
  assert.ok(!/underline/.test(out));
  assert.equal(Markdown.inkLinks('<p>a<img src="https://x.test/p.png" />b<IMG\nsrc=x></p>', "#99c1dc"), "<p>ab</p>");
  assert.equal(Markdown.inkLinks("", "#99c1dc"), "");
});
