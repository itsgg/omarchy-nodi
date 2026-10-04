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
  for (var a = 0.5; a < 1; a += 0.02) {
    var c = over(ink, a, base)
    if (ratio(c, base) >= target) return c
  }
  return { r: ink.r, g: ink.g, b: ink.b }
}

// Secondary text (subtitles, headers, footer labels, the placeholder):
// the theme's muted colour where it reads at 4.5:1 on the card, else the
// faintest mix of the text colour that does (Fable's second look pass).
function secondary(fg, muted, card) {
  return ratio(muted, card) >= 4.5 ? { r: muted.r, g: muted.g, b: muted.b } : readable(fg, card, 4.5)
}

// `ink` where it reads at 4.5:1 on `fill`, else `fallback`: a light theme's
// accent on its selection reads at 2.8 to 3.9 (his ruling 2026-10-04).
function guard(ink, fill, fallback) {
  return ratio(ink, fill) >= 4.5 ? { r: ink.r, g: ink.g, b: ink.b } : { r: fallback.r, g: fallback.g, b: fallback.b }
}
