import QtQuick
import qs.Commons
import "../lib/Contrast.js" as Contrast

// How the bar looks and measures: Omarchy's menu tokens, so a theme that
// styles the menu styles Nodi, and every size derived from the shell's
// type scale. Nodi.qml and the render harness both build one, so a shot
// is drawn with the bar's own numbers.
QtObject {
  property real screenWidth: 1920
  property real screenHeight: 1200

  property color background: Color.menu.background
  property color foreground: Color.menu.text
  property color border: Color.menu.border
  // Two pixels, as the shell's popups draw theirs (Menu.qml, Clipboard.qml).
  property var borderSpec: Border.surfaceSpec("menu", "border", border, Math.max(1, Style.space(2)))
  // The selected row's border, as Omarchy's menu draws it (Menu.qml): none
  // in a theme that sets no [menu] selected-border, as most do (item 24).
  readonly property var selectedBorderSpec: Border.surfaceSpec("menu", "selected-border", Color.menu.selectedBorder, 0)
  // Every row keeps its content clear of that border, selected or not, as
  // the menu does (Menu.qml:96-97), so a wide one covers nothing and the
  // row does not shift when chosen. Zero where the theme sets none.
  readonly property real rowInsetLeft: Border.left(selectedBorderSpec)
  readonly property real rowInsetRight: Border.right(selectedBorderSpec)
  property color scrim: Color.menu.scrim
  property color selectedBackground: Color.menu.selectedBackground
  property color selectedText: Color.menu.selectedText
  // Colours by their ratio on the surface they sit on (lib/Contrast.js).
  // The card as an opaque colour stands in for what the 0.93 card shows.
  readonly property color opaqueCard: Qt.rgba(background.r, background.g, background.b, 1)
  readonly property color selectedFill: rgb(Contrast.over(selectedBackground, selectedBackground.a, opaqueCard))
  // Subtitles, headers, footer labels, the placeholder: 4.5:1 or better.
  // 7:1 under higher contrast (ROADMAP 73), WCAG's enhanced level: the
  // text colour mixed to it, or black or white where the text colour
  // itself falls short.
  readonly property real secondaryTarget: highContrast ? 7 : 4.5
  readonly property color secondary: rgb(Contrast.secondary(foreground, Color.muted, opaqueCard, secondaryTarget))
  readonly property color secondaryOnSelected: rgb(highContrast ? Contrast.atLeast(foreground, selectedFill, 7) : Contrast.readable(foreground, selectedFill, 4.5))
  // The selected title, its glyph and the mode chip: the theme's selected
  // text where it reads on the fill, else the text colour.
  readonly property color selectedInk: rgb(Contrast.guard(selectedText, selectedFill, foreground))

  function rgb(c) { return Qt.rgba(c.r, c.g, c.b, 1) }

  // The selected row's own mark where the theme leaves it the fill alone
  // (item 72). The fill is 1.1 to 1.2:1 on the card in every Omarchy
  // theme (research 2026-10-05, 23 themes); where the selected title is
  // the colour of every other title (the accent failing on the fill, as in
  // 8 of them, or a theme's selected text that is its text) and the theme
  // draws no selected border, the fill is all there is. Then, and always
  // under higher contrast, a bar in the text colour on the row's left
  // edge: the text colour reads at 4.5:1 or more on every card.
  property bool highContrast: false
  // A selected border is one the theme draws: a width on some side, and a
  // colour or gradient that shows (Sonnet 2026-10-06: a width at alpha 0
  // counted as a border).
  readonly property bool selectedBorderDrawn: Border.left(selectedBorderSpec) + Border.right(selectedBorderSpec)
      + Border.uniformWidth(selectedBorderSpec) + Border.bottom(selectedBorderSpec) > 0
    && (alphaOf(Border.color(selectedBorderSpec)) > 0 || !!(selectedBorderSpec.gradient && selectedBorderSpec.gradient.enabled))
  // A colour's alpha, 0 for one that does not parse (Sonnet 2026-10-06: a
  // theme's "nosuchcolour" threw here).
  function alphaOf(c) {
    var q = Qt.lighter(c, 1.0)
    return q ? q.a : 0
  }
  readonly property bool selectionBar: Contrast.needsMark(selectedText, selectedFill, foreground, selectedBorderDrawn, highContrast)
  readonly property int barWidth: Math.max(2, Style.space(2))
  // How far the bar keeps from the row's top and bottom: clear of the
  // fill's rounded corners where they reach its left edge (a rounding of
  // 20 put its ends outside the fill).
  readonly property int barInset: {
    // The radius a row's fill draws: a Rectangle holds it to half its height.
    var r = Math.min(cornerRadius, rowHeight / 2), x = Style.spacing.xs + rowInsetLeft, m = Style.spacing.md
    return r <= x ? m : Math.max(m, Math.ceil(r - Math.sqrt(r * r - (r - x) * (r - x))))
  }
  readonly property int cornerRadius: Style.cornerRadius
  property string fontFamily: Style.font.menuFamily
  property int contentMargin: Style.spacing.panelPadding
  readonly property int inputFont: Style.font.heading
  property int inputHeight: Math.max(Style.space(38), inputFont + Style.spacing.controlPaddingY * 2)
  // A heading-size name over a small subtitle needs about 8 px above and
  // below: 48 crowded the two lines, and the menu's 58 cost 70 px on a full
  // list (renders compared 2026-10-05).
  property int rowHeight: Math.max(Style.space(52), Style.font.heading + Style.font.bodySmall + Style.spacing.md * 2)
  property int heroHeight: Math.max(Style.space(76), Style.font.displayLarge + Style.font.bodySmall + Style.spacing.md * 3)
  property int sectionHeight: Math.max(Style.space(26), Style.font.caption + Style.spacing.md * 2)
  property int footerHeight: Math.max(Style.space(32), Style.font.caption + Style.spacing.md * 2)
  readonly property int tileSize: Math.max(Style.space(30), Style.font.iconLarge + Style.space(12))
  readonly property int tileRadius: cornerRadius > 0 ? Style.space(7) : 0
  // Up to 7 rows before scrolling; the ? list may grow to fit.
  readonly property int maxRows: 7
  // With more rows than that, a part of the next one shows under the fold,
  // as Omarchy's menu does (Menu.qml rowPeek): the fade over the edge lies
  // on that part, not on the seventh row, which the list held to the pixel
  // and the fade then hid (Fable 2026-10-05, his Spotify row).
  readonly property int rowPeek: Math.round(rowHeight * 0.55)
  // 960 while the selected row has a preview, the list 430 of it, as
  // Kadhir's (his ruling: the pane only when the row has one).
  property bool wide: false
  property int cardWidth: Math.min(Style.space(wide ? 960 : 680), screenWidth - Style.gapsOut * 2)
  readonly property int listColumn: Style.space(430)
  readonly property int paneMin: Math.min(Style.space(280), bodyMax)
  // An answer from Ask scrolls past this.
  readonly property int answerMax: Math.round(screenHeight * 0.35)

  // The card's top, where Nodi.qml puts it, and what the card takes besides
  // its results (Card.chrome): the results and Ctrl+K's actions take at
  // most the rest of the screen under it, so the card stays on screen at
  // every text size (item 70: at Omarchy's 20 on this laptop's 1536x960,
  // eleven scenes ran off the bottom, Ctrl+K by 255 px). Never less than a
  // tall row under its group's header, so the selected row can always be
  // seen whole, on a screen too short for the rest (Sonnet 2026-10-06).
  readonly property int cardTop: Math.round(screenHeight * 0.22)
  property real chrome: 0
  readonly property real bodyMax: Math.max(heroHeight + sectionHeight, screenHeight - cardTop - Style.gapsOut - chrome)

  function rowSize(row) {
    return (row.hero ? heroHeight : rowHeight) + (row.section ? sectionHeight : 0)
  }

  function listHeight(rows, showingHelp) {
    var total = 0
    for (var i = 0; i < rows.length && (showingHelp || i < maxRows); i++) total += rowSize(rows[i])
    if (!showingHelp && rows.length > maxRows) total += rowPeek
    return Math.min(total, screenHeight * 0.6, bodyMax)
  }

  // Ctrl+K's actions, held as the list is: seven, then a part of the next,
  // with their groups' headers. None that match: ActionPalette says so in
  // a line of its own.
  function paletteHeight(actions) {
    var n = actions ? actions.length : 0
    var total = 0
    for (var i = 0; i < n && i < maxRows; i++) total += rowHeight + (actions[i].section ? sectionHeight : 0)
    // Under the row's title, which heads the palette (ActionPalette.qml).
    return Math.min(total + (n > maxRows ? rowPeek : 0), Math.max(rowHeight, bodyMax - sectionHeight))
  }
}
