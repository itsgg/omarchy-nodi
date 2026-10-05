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
  readonly property color secondary: rgb(Contrast.secondary(foreground, Color.muted, opaqueCard))
  readonly property color secondaryOnSelected: rgb(Contrast.readable(foreground, selectedFill, 4.5))
  // The selected title, its glyph and the mode chip: the theme's selected
  // text where it reads on the fill, else the text colour.
  readonly property color selectedInk: rgb(Contrast.guard(selectedText, selectedFill, foreground))

  function rgb(c) { return Qt.rgba(c.r, c.g, c.b, 1) }
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
  readonly property int paneMin: Style.space(280)
  // An answer from Ask scrolls past this.
  readonly property int answerMax: Math.round(screenHeight * 0.35)

  function rowSize(row) {
    return (row.hero ? heroHeight : rowHeight) + (row.section ? sectionHeight : 0)
  }

  function listHeight(rows, showingHelp) {
    var total = 0
    for (var i = 0; i < rows.length && (showingHelp || i < maxRows); i++) total += rowSize(rows[i])
    if (!showingHelp && rows.length > maxRows) total += rowPeek
    return Math.min(total, screenHeight * 0.6)
  }

  // Ctrl+K's actions, held as the list is: seven, then a part of the next.
  function paletteHeight(count) {
    return Math.min(count, maxRows) * rowHeight + (count > maxRows ? rowPeek : 0)
  }
}
