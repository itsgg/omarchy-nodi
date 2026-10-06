.pragma library

// WCAG contrast, for text that reads in every theme. The theme's `muted`
// reads at 5.3:1 on one dark theme and under 2:1 on four others, and the
// accent on a light theme's selection under 4 (Fable 2026-10-04): the bar
// takes colours by their ratio on the surface they sit on, not by name.
// Colours are { r, g, b } in 0..1, as QML colours give them.

function channel(c) { return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4) }

function luminance(c) { return 0.2126 * channel(c.r) + 0.7152 * channel(c.g) + 0.0722 * channel(c.b) }

function ratio(a, b) {
  var x = luminance(a), y = luminance(b)
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)
}

// `fg` at `alpha` over `bg`, as it shows.
function over(fg, alpha, bg) {
  return { r: fg.r * alpha + bg.r * (1 - alpha), g: fg.g * alpha + bg.g * (1 - alpha), b: fg.b * alpha + bg.b * (1 - alpha) }
}

// The faintest mix of `ink` over `base` that still reads at `target`:1,
// as an opaque { r, g, b }; `ink` itself when no lighter mix does.
function readable(ink, base, target) {
  // Whole steps, up to the ink itself, which float steps never reached.
  for (var i = 25; i <= 50; i++) {
    var c = over(ink, i / 50, base)
    if (ratio(c, base) >= target) return c
  }
  return { r: ink.r, g: ink.g, b: ink.b }
}

// Black or white, whichever reads better on `base`.
function extreme(base) {
  var black = { r: 0, g: 0, b: 0 }, white = { r: 1, g: 1, b: 1 }
  return ratio(black, base) >= ratio(white, base) ? black : white
}

// `ink` mixed to `target` on `base`; where even the ink falls short, as a
// theme's text on its selection can of 7:1 (Sonnet 2026-10-06: 15 of 22
// themes), black or white: higher contrast asks for the contrast before
// the theme's colour.
function atLeast(ink, base, target) {
  var c = readable(ink, base, target)
  return ratio(c, base) >= target ? c : extreme(base)
}

// Secondary text (subtitles, headers, footer labels, the placeholder):
// the theme's muted colour where it reads at 4.5:1 on the card (7:1 under
// higher contrast), else the faintest mix of the text colour that does
// (Fable's second look pass).
function secondary(fg, muted, card, target) {
  var t = target || 4.5
  if (ratio(muted, card) >= t) return { r: muted.r, g: muted.g, b: muted.b }
  return t > 4.5 ? atLeast(fg, card, t) : readable(fg, card, t)
}

// `ink` where it reads at 4.5:1 on `fill`, else `fallback`: a light theme's
// accent on its selection reads at 2.8 to 3.9 (his ruling 2026-10-04).
function guard(ink, fill, fallback) {
  return ratio(ink, fill) >= 4.5 ? { r: ink.r, g: ink.g, b: ink.b } : { r: fallback.r, g: fallback.g, b: fallback.b }
}

// Whether the selected row needs a mark of its own (item 72): higher
// contrast is asked for, or its title is the colour of every other title
// (the accent failed on the fill and guard swapped it for the text, or
// the theme's selected text is its text) and the theme draws no selected
// border, so the faint fill would be all.
function needsMark(selectedText, fill, text, bordered, high) {
  if (high) return true
  if (bordered) return false
  var ink = guard(selectedText, fill, text)
  // Within a step of eight bits: #cccfd2 against #cccfd1 is one colour
  // to the eye (Sonnet 2026-10-06).
  var near = function(a, b) { return Math.abs(a - b) <= 1.5 / 255 }
  return near(ink.r, text.r) && near(ink.g, text.g) && near(ink.b, text.b)
}
