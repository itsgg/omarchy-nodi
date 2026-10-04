pragma Singleton
import QtQuick

// The render harness's stand-in for the shell's Util singleton: the colour
// helpers the components call, as the shell defines them.
QtObject {
  function clamp(value, lo, hi) { var n = Number(value); if (!isFinite(n)) n = lo; return Math.max(lo, Math.min(hi, n)) }
  function clampAlpha(value) { return clamp(value, 0, 1) }
  function alpha(c, opacity) {
    var a = clampAlpha(opacity)
    if (!c) return Qt.rgba(0, 0, 0, a)
    if (typeof c === "string") c = Qt.color(c)
    return Qt.rgba(c.r, c.g, c.b, a)
  }
}
