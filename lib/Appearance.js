.pragma library

// The desktop's own motion and contrast preferences (ROADMAP 73): the
// portal's org.freedesktop.appearance keys `contrast` ("1: Higher
// contrast") and `reduced-motion` ("1: Reduced motion"), and Hyprland's
// animations:enabled. Read through a Reader at each open, as the toggles
// probe is; a portal that serves neither key, as this machine's serves no
// reduced-motion, leaves both as they were.

// The portal's appearance keys on its first line, Hyprland's option on its
// second.
var PROBE = 'gdbus call --session --dest org.freedesktop.portal.Desktop --object-path /org/freedesktop/portal/desktop'
  + ' --method org.freedesktop.portal.Settings.ReadAll "[\'org.freedesktop.appearance\']" 2>/dev/null | tr -d "\\n"; echo'
  + "\n" + 'hyprctl getoption animations:enabled -j 2>/dev/null | tr -d "\\n"; echo'

// { highContrast, reducedMotion } from what PROBE printed.
function parse(text) {
  var lines = String(text || "").split("\n")
  var portal = lines[0] || ""
  var key = function(name) {
    var m = portal.match(new RegExp("'" + name + "': <(?:uint32 )?(\\d+)>"))
    return m ? Number(m[1]) : 0
  }
  var animations = true
  try {
    var o = JSON.parse(lines[1] || "{}")
    if (o && typeof o.bool === "boolean") animations = o.bool
    else if (o && typeof o.int === "number") animations = o.int !== 0
  } catch (e) {}
  return { highContrast: key("contrast") === 1, reducedMotion: key("reduced-motion") === 1 || !animations }
}
