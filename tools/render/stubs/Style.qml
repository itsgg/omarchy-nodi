pragma Singleton
import QtQuick
import "Theme.js" as Theme

// The render harness's stand-in for the shell's Style singleton: the type
// scale, spacing and border tokens Nodi and Border read, computed as the
// shell computes them from the live theme's [font], [spacing] and
// [controls] sections, with no Quickshell underneath.
QtObject {
  id: root
  readonly property var values: Theme.theme.shellValues

  function section(name) {
    var out = {}
    for (var k in values) if (k.indexOf(name + ".") === 0) out[k.substr(name.length + 1)] = values[k]
    return out
  }

  property int cornerRadius: Theme.theme.cornerRadius
  property int gapsOut: Theme.theme.gapsOut
  property var styleOverrides: Object.assign({}, section("style"), section("controls"))

  function styleNum(key, fallback) { var n = Number(styleOverrides[key]); return isFinite(n) && styleOverrides[key] !== undefined ? n : fallback }
  function styleAlpha(key, fallback) { return Math.max(0, Math.min(1, styleNum(key, fallback))) }
  readonly property int normalBorderWidth: Math.max(0, Math.round(styleNum("normal-border-width", 1)))
  readonly property int hoverBorderWidth: Math.max(0, Math.round(styleNum("hover-cursor-border-width", normalBorderWidth)))
  readonly property int selectedBorderWidth: Math.max(0, Math.round(styleNum("selected-border-width", 0)))
  readonly property int focusBorderWidth: Math.max(0, Math.round(styleNum("focus-border-width", hoverBorderWidth)))
  readonly property real normalBorderAlpha: styleAlpha("normal-border-alpha", 0.4)
  readonly property real hoverBorderAlpha: styleAlpha("hover-cursor-border-alpha", 0.25)
  readonly property real selectedBorderAlpha: styleAlpha("selected-border-alpha", 1.0)
  readonly property real focusBorderAlpha: styleAlpha("focus-border-alpha", hoverBorderAlpha)

  readonly property var fontOverrides: section("font")
  readonly property int fontBaseSize: {
    var n = parseInt(fontOverrides["base-size"], 10)
    return isFinite(n) && n >= 1 ? n : 12
  }
  readonly property real fontScale: Math.max(1 / 12, fontBaseSize / 12)
  readonly property var spacingOverrides: section("spacing")
  readonly property real spacingScale: {
    var n = parseFloat(spacingOverrides["scale"])
    return isFinite(n) && n >= 0 ? n : 1.0
  }
  readonly property bool spacingScaleWithFont: String(spacingOverrides["scale-with-font"] || "true").toLowerCase() !== "false"
  readonly property real effectiveSpacingScale: spacingScale * (spacingScaleWithFont ? fontScale : 1)

  function fontPx(mult) { return Math.max(1, Math.round(fontBaseSize * mult)) }
  function fontToken(key, fallback) { var n = Number(fontOverrides[key]); return (isFinite(n) && n > 0) ? Math.round(n) : fallback }
  function spaceReal(px) { var n = Number(px); return (!isFinite(n) || n <= 0) ? 0 : n * effectiveSpacingScale }
  function space(px) { var n = spaceReal(px); return n <= 0 ? 0 : Math.max(1, Math.round(n)) }
  function spacingToken(key, fallback) {
    var n = Number(spacingOverrides[key])
    return (spacingOverrides[key] !== undefined && isFinite(n) && n >= 0) ? Math.round(n) : space(fallback)
  }

  readonly property QtObject spacing: QtObject {
    readonly property int hairline: root.space(1)
    readonly property int sm: root.spacingToken("sm", 4)
    readonly property int md: root.spacingToken("md", 6)
    readonly property int lg: root.spacingToken("lg", 8)
    readonly property int controlPaddingY: root.spacingToken("control-padding-y", 6)
    readonly property int panelPadding: root.spacingToken("panel-padding", 18)
  }

  readonly property QtObject font: QtObject {
    readonly property string family: Theme.theme.fontFamily
    readonly property string menuFamily: Theme.theme.menuFontFamily
    readonly property int baseSize: root.fontBaseSize
    readonly property int caption: root.fontToken("caption", root.fontPx(0.833))
    readonly property int bodySmall: root.fontToken("body-small", root.fontPx(0.917))
    readonly property int body: root.fontToken("body", root.fontPx(1.0))
    readonly property int subtitle: root.fontToken("subtitle", root.fontPx(1.083))
    readonly property int title: root.fontToken("title", root.fontPx(1.167))
    readonly property int heading: root.fontToken("heading", root.fontPx(1.333))
    readonly property int displayLarge: root.fontToken("display-large", root.fontPx(2.333))
    readonly property int iconLarge: root.fontToken("icon-large", root.fontPx(1.5))
  }
}
