pragma Singleton
import QtQuick
import "BorderGeometry.js" as Geometry
import "Theme.js" as Theme

// The render harness's stand-in for the shell's Color singleton: the same
// palette and menu roles, computed the same way, from the live theme that
// tools/render/theme.mjs resolved, with no Quickshell underneath.
QtObject {
  id: root
  property color foreground: Theme.theme.colors.foreground
  property color background: Theme.theme.colors.background
  property color accent: Theme.theme.colors.accent
  property color urgent: Theme.theme.colors.urgent
  property color muted: Theme.theme.colors.muted
  property var shellValues: Theme.theme.shellValues

  function clampAlpha(v) { var n = Number(v); return isFinite(n) ? Math.max(0, Math.min(1, n)) : 1 }
  function alpha(c, a) { if (typeof c === "string") c = Qt.color(c); return Qt.rgba(c.r, c.g, c.b, clampAlpha(a)) }

  function pick(key, fallback) {
    var v = shellValues[key]
    return (typeof v === "string" && v.length > 0) ? v : fallback
  }

  function pickAlpha(key, fallback) {
    var v = shellValues[key]
    if (typeof v !== "string" || v.length === 0) return fallback
    var n = Number(v)
    return isFinite(n) ? clampAlpha(n) : fallback
  }

  function firstColorToken(value) {
    var parts = String(value || "").replace(/^\s+|\s+$/g, "").split(/\s+/)
    for (var i = 0; i < parts.length; i++) if (!parts[i].match(/^-?\d+(?:\.\d+)?deg$/)) return parts[i]
    return value
  }

  function flatColor(value, fallback) {
    var token = firstColorToken(value)
    var role = String(token || "").replace(/^\s+|\s+$/g, "").toLowerCase()
    if (root.shellValues[role] && root.shellValues[role] !== token) return flatColor(root.shellValues[role], fallback)
    if (role === "foreground" || role === "text") return root.foreground
    if (role === "accent") return root.accent
    if (role === "urgent") return root.urgent
    if (role === "muted") return root.muted
    if (role === "background") return root.background
    if (role === "transparent") return Qt.rgba(0, 0, 0, 0)
    var color = Geometry.canonicalColor(token, 1)
    if (typeof color === "string" && color === token && token.charAt(0) !== "#") return fallback
    return color
  }

  function composed(colorKey, alphaKey, colorFallback, alphaFallback) {
    return alpha(flatColor(pick(colorKey, colorFallback), colorFallback), pickAlpha(alphaKey, alphaFallback))
  }

  readonly property QtObject menu: QtObject {
    property color background: root.composed("menu.background", "menu.background-alpha", root.background, 1.0)
    property color text: root.pick("menu.text", root.foreground)
    property color border: root.composed("menu.border", "menu.border-alpha", root.foreground, 1.0)
    property color scrim: root.composed("menu.scrim", "menu.scrim-alpha", root.background, 0.5)
    property color selectedBackground: root.composed("menu.selected-background", "menu.selected-background-alpha", root.foreground, 0.08)
    property color selectedText: root.pick("menu.selected-text", root.accent)
    property color selectedBorder: root.composed("menu.selected-border", "menu.selected-border-alpha", root.foreground, 0.0)
  }
}
