.pragma library
.import "../lib/Match.js" as Match
.import "../lib/Run.js" as Run
.import "../lib/Toggles.js" as Toggles
.import "../lib/Score.js" as Score
.import "../lib/Reminders.js" as Reminders

// What Omarchy's menu cannot say in one row: a level ("volume 60"), a
// reminder with its minutes and message, a theme by name, and the toggles
// the menu has no row for (Bluetooth, Wi-Fi, sound, microphone). Everything
// runs through Omarchy's own commands, so the OSD and the sink resolution
// are Omarchy's; but reminders are Nodi's own (lib/Reminders.js).
//
// From Nodi.qml: ctx.toggleStates (lib/Toggles.js, levels included) and
// ctx.themes = { list: [{ name, preview }], current }.

// Set an absolute volume on the sink Omarchy's volume keys move (through any
// DSP sink to the physical one), then show Omarchy's OSD. The level arrives
// as $1, checked to be 0 to 100 before it gets here.
var VOLUME_SCRIPT = 'sink=$(omarchy-audio-output-sink) && [ -n "$sink" ] || exit 1; '
  + 'pactl set-sink-mute "$sink" 0; pactl set-sink-volume "$sink" "$1%"; '
  + 'if [ "$1" -eq 0 ]; then icon=volume-muted; else icon=volume-high; fi; omarchy-osd -i "$icon" -p "$1"'

// Mute ($1 = 1) or unmute ($1 = 0) the output as asked, then Omarchy's OSD:
// Omarchy's own command only toggles, so "volume mute" unmuted a muted
// output (codex 2026-10-04).
var MUTE_SCRIPT = 'sink=$(omarchy-audio-output-sink) && [ -n "$sink" ] || exit 1; pactl set-sink-mute "$sink" "$1"; '
  + 'p=$(pactl get-sink-volume "$sink" | grep -o "[0-9]*%" | head -n 1 | tr -d %); '
  + 'if [ "$1" = 1 ]; then icon=volume-muted; else icon=volume-high; fi; omarchy-osd -i "$icon" -p "${p:-0}"'

var EXTRAS = [
  { key: "reload-hyprland", title: "Reload Hyprland", subtitle: "Hyprland config", icon: "󰑓",
    keywords: "reload hyprland config compositor wm refresh", run: Run.exec(["hyprctl", "reload"]) },
  { key: "shot-region", title: "Screenshot of a Region", subtitle: "Capture > Screenshot", icon: "󰩭",
    keywords: "screenshot capture region area snip select print", run: Run.exec(["omarchy-capture-screenshot", "region"]) },
  { key: "shot-window", title: "Screenshot of a Window", subtitle: "Capture > Screenshot", icon: "󰖯",
    keywords: "screenshot capture window print", run: Run.exec(["omarchy-capture-screenshot", "windows"]) },
  { key: "shot-full", title: "Screenshot of the Whole Screen", subtitle: "Capture > Screenshot", icon: "󰍹",
    keywords: "screenshot capture fullscreen full whole screen display print", run: Run.exec(["omarchy-capture-screenshot", "fullscreen"]) },
  { key: "record-full", title: "Record the Whole Screen", subtitle: "Capture > Screenrecord, no audio", icon: "󰑋",
    keywords: "record recording screenrecord video capture fullscreen whole screen", run: Run.exec(["omarchy-capture-screenrecording", "--fullscreen"]) },
  { key: "bg-next", title: "Next Background", subtitle: "Style > Background", icon: "󰸉",
    keywords: "background wallpaper next cycle", run: Run.exec(["omarchy-theme-bg-next"]) },
  { key: "display-off", title: "Turn the Display Off", subtitle: "Until a key or touch", icon: "󰶐",
    keywords: "display screen off sleep dpms blank", run: Run.exec(["omarchy-brightness-display", "off"]) }
]

function level(ctx, id) {
  var s = (ctx.toggleStates || {})[id]
  return s && /^\d+$/.test(s.value) ? parseInt(s.value, 10) : null
}

function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)) }

// An argument still on its way to a level ("+", "u" for up): the mode keeps
// the query and shows a hint. Anything else ("control") is not a level, and
// the rest of Nodi answers it ("volume control" is an app).
function partial(arg, words) {
  if (/^[+-]?\s*\d{0,3}\s*%?$/.test(arg)) return true
  for (var i = 0; i < words.length; i++) if (words[i].indexOf(arg) === 0) return true
  return false
}

// A word on its way to a level ("vol mu"): the level as the label, the
// words it takes on the hint line.
function hint(key, title, text, icon, complete, words) {
  return [{ key: key, title: title, subtitle: text, icon: icon, score: 98, copy: "", complete: complete, hint: words }]
}

// ---------------------------------------------------------------- volume

function volumeRows(arg, ctx) {
  var now = level(ctx, "volume")
  var at = now === null ? "" : "Now " + now + "%"
  var step = function(text, delta, score) {
    return { key: "volume:" + delta, title: text, subtitle: at || "Output volume", icon: delta > 0 ? "󰝝" : "󰝞",
             score: score, copy: "", run: Run.exec(["omarchy-audio-output-volume", (delta > 0 ? "+" : "-") + Math.abs(delta)]) }
  }
  var mute = function(score) {
    return { key: "volume:mute", title: "Mute or Unmute Sound", subtitle: at || "Output volume", icon: "󰖁",
             score: score, copy: "", run: Run.exec(["omarchy-audio-output-volume", "mute-toggle"]) }
  }
  if (!arg) {
    return [
      { key: "volume:prompt", title: "Volume", subtitle: at || "Output volume", icon: "󰕾",
        score: 98, copy: "", complete: "volume ", hint: "volume <0-100> | +10 | -10 | mute" },
      step("Volume Up 5%", 5, 97), step("Volume Down 5%", -5, 96), mute(95)
    ]
  }
  if (/^(up|raise|louder)$/.test(arg)) return [step("Volume Up 5%", 5, 99)]
  if (/^(down|lower|quieter)$/.test(arg)) return [step("Volume Down 5%", -5, 99)]
  if (arg === "toggle") return [mute(99)]
  if (arg === "mute" || arg === "unmute") {
    var on = arg === "mute"
    return [{ key: "volume:" + arg, title: on ? "Mute Sound" : "Unmute Sound", subtitle: at || "Output volume", icon: on ? "󰖁" : "󰕾",
              score: 99, copy: "", run: Run.exec(["bash", "-c", MUTE_SCRIPT, "nodi-mute", on ? "1" : "0"]) }]
  }
  var m = arg.match(/^([+-])\s*(\d{1,3})\s*%?$/)
  if (m) {
    var d = clamp(parseInt(m[2], 10), 1, 100)
    return [step((m[1] === "+" ? "Volume Up " : "Volume Down ") + d + "%", m[1] === "+" ? d : -d, 99)]
  }
  m = arg.match(/^(\d{1,3})\s*%?$/)
  if (m) {
    var v = clamp(parseInt(m[1], 10), 0, 100)
    // The level once, as the badge (Fable's look review).
    return [{ key: "volume:set", title: "Volume", subtitle: at || "Output volume", icon: v === 0 ? "󰖁" : "󰕾", actionLabel: "Set",
              score: 99, copy: "", badge: v + "%", run: Run.exec(["bash", "-c", VOLUME_SCRIPT, "nodi-volume", String(v)]) }]
  }
  if (partial(arg, ["up", "raise", "louder", "down", "lower", "quieter", "mute", "unmute", "toggle"]))
    return hint("volume:hint", "Volume", at || "Output volume", "󰕾", "volume ", "volume <0-100> | +10 | -10 | mute")
  return []
}

// ---------------------------------------------------------------- brightness

function brightnessRows(arg, ctx) {
  var now = level(ctx, "brightness")
  var at = now === null ? "" : "Now " + now + "%"
  var set = function(title, value, icon, score) {
    return { key: "brightness:" + value, title: title, subtitle: at || "Focused display", icon: icon,
             score: score, copy: "", run: Run.exec(["omarchy-brightness-display", value]) }
  }
  if (!arg) {
    return [
      { key: "brightness:prompt", title: "Brightness", subtitle: at || "Display", icon: "󰃠",
        score: 98, copy: "", complete: "brightness ", hint: "brightness <1-100> | +10 | -10 | off" },
      set("Brightness Up 5%", "+5%", "󰃠", 97), set("Brightness Down 5%", "5%-", "󰃞", 96), set("Turn the Display Off", "off", "󰶐", 94)
    ]
  }
  if (/^(up|raise|brighter|more)$/.test(arg)) return [set("Brightness Up 5%", "+5%", "󰃠", 99)]
  if (/^(down|lower|dimmer|less)$/.test(arg)) return [set("Brightness Down 5%", "5%-", "󰃞", 99)]
  if (/^(max|full)$/.test(arg)) return [set("Brightness to 100%", "100%", "󰃠", 99)]
  if (/^off$/.test(arg)) return [set("Turn the Display Off", "off", "󰶐", 99)]
  if (/^on$/.test(arg)) return [set("Turn the Display On", "on", "󰃠", 99)]
  var m = arg.match(/^([+-])\s*(\d{1,3})\s*%?$/)
  if (m) {
    var d = clamp(parseInt(m[2], 10), 1, 100)
    return [set((m[1] === "+" ? "Brightness Up " : "Brightness Down ") + d + "%", m[1] === "+" ? "+" + d + "%" : d + "%-", m[1] === "+" ? "󰃠" : "󰃞", 99)]
  }
  m = arg.match(/^(\d{1,3})\s*%?$/)
  if (m) {
    var v = clamp(parseInt(m[1], 10), 1, 100)
    var row = set("Brightness", v + "%", "󰃠", 99)
    row.badge = v + "%"
    row.actionLabel = "Set"
    return [row]
  }
  if (partial(arg, ["up", "raise", "brighter", "more", "down", "lower", "dimmer", "less", "max", "full", "off", "on"]))
    return hint("brightness:hint", "Brightness", at || "Display", "󰃠", "brightness ", "brightness <1-100> | +10 | -10 | off")
  return []
}

// ---------------------------------------------------------------- reminders

function minutesOf(num, unit) {
  var n = parseFloat(num)
  var u = String(unit || "m").toLowerCase()
  return Math.round(/^h/.test(u) ? n * 60 : n)
}

function duration(mins) {
  if (mins < 60) return mins + " min"
  var h = mins / 60
  return (mins % 60 ? h.toFixed(1) : String(h)) + (h === 1 ? " hour" : " hours")
}

// Nodi's own (lib/Reminders.js): set, listed and cleared by the bar itself
// (`nodi` actions), the words in no program's arguments; Omarchy's reminder
// put them in systemd-run's, its timer's and its notifications' (the
// marketplace's review, 2026-10-10). ctx.reminders is the bar's list.
function clearRow(score) {
  return { key: "remind:clear", title: "Clear All Reminders", subtitle: "All pending", icon: "󰂛", score: score, copy: "",
           confirm: true, nodi: "remindClear", actionLabel: "Clear", remember: false }
}

function reminderRows(raw, ctx) {
  var nowMs = (ctx.now ? ctx.now() : new Date()).getTime()
  var h24 = !(ctx.config && ctx.config.time && ctx.config.time.clock24 === false)
  if (/^reminders?\s*$|^reminders?\s+(show|list)$/i.test(raw)) {
    var mine = Reminders.pending(ctx.reminders)
    if (!mine.length) return [{ key: "remind:none", title: "No reminder set", subtitle: "remind <minutes> <message>", icon: "󰂚", score: 97,
                                copy: "", complete: "remind 15 ", remember: false }]
    return mine.map(function(r, i) {
      var d = Reminders.describe(r, nowMs, h24)
      return { key: "remind:pending:" + r.id, title: d.title, subtitle: d.subtitle, icon: "󰂚", score: 97 - i * 0.01, copy: r.message,
               remember: false, group: "Reminders" }
    }).concat([clearRow(90)])
  }
  if (/^reminders?\s+clear$/i.test(raw)) return [clearRow(98)]
  var m = raw.match(/^remind(?:er)?(?:\s+me)?(?:\s+in)?(?:\s+(\d+(?:\.\d+)?)\s*(m|min|mins|minutes?|h|hr|hrs|hours?)?\b)?(?:\s+(?:to\s+)?(.*))?$/i)
  if (!m) return []
  if (!m[1]) {
    return [{ key: "remind:prompt", title: "Reminder", subtitle: "Shown by Nodi when it is due", icon: "󰂚",
              score: 95, copy: "", complete: "remind 15 ", hint: "remind <minutes> <message>" }]
  }
  var mins = minutesOf(m[1], m[2])
  if (mins < 1 || mins > Reminders.MAX_MINUTES) return []
  var msg = (m[3] || "").trim()
  return [{
    key: "remind:" + mins,
    title: msg ? "Remind in " + duration(mins) + ": " + msg : "Remind in " + duration(mins),
    subtitle: "Shown by Nodi at " + Reminders.clock(nowMs + mins * 60000, h24),
    icon: "󰂚",
    score: 98,
    copy: "",
    actionLabel: "Set",
    remember: false,
    nodi: "remindSet",
    data: { minutes: mins, message: msg }
  }]
}

// ---------------------------------------------------------------- themes

function themeRows(needle, ctx) {
  var themes = ctx.themes && Array.isArray(ctx.themes.list) ? ctx.themes.list : []
  if (themes.length === 0) return [{ key: "theme:loading", title: "Reading themes...", subtitle: "Omarchy themes", icon: "󰸌", score: 40, copy: "" }]
  var current = ctx.themes.current || ""
  var nw = Match.words(needle)
  var out = []
  for (var i = 0; i < themes.length; i++) {
    var t = themes[i]
    if (nw.length > 0 && !Match.prefixesAll(nw, Match.words(t.name))) continue
    var exact = needle && Match.fold(t.name) === Match.fold(needle)
    var isCurrent = t.name === current
    out.push({
      key: "theme:" + t.name,
      title: t.name,
      subtitle: isCurrent ? "Current theme" : "Theme",
      image: t.preview || "",
      imageFill: true,
      preview: t.preview ? { title: t.name, subtitle: isCurrent ? "Current theme" : "Theme", image: t.preview } : null,
      icon: "󰸌",
      score: exact ? 99 : 95 - out.length * 0.01,
      copy: t.name,
      badge: isCurrent ? "Current" : "",
      badgeTone: isCurrent ? "on" : "",
      actionLabel: "Apply",
      run: Run.exec(["omarchy-theme-set", t.name])
    })
  }
  // Nothing here for "theme switcher": the rest of Nodi answers it.
  return out
}

// ---------------------------------------------------------------- toggles

function extraRows(q, ctx) {
  var out = []
  var toggles = Toggles.extras()
  for (var i = 0; i < toggles.length; i++) {
    var t = toggles[i]
    var tier = Score.tier(q, { name: t.title, keywords: t.keywords })
    if (!tier) continue
    var b = Toggles.badge((ctx.toggleStates || {})[t.id])
    out.push({ key: "toggle:" + t.id, title: t.title, subtitle: "Toggle", icon: t.icon, tier: tier, kind: "toggle", copy: "",
               badge: b.text, badgeTone: b.tone, toggle: t.id, actionLabel: "Toggle", run: Run.exec(t.argv) })
  }
  for (var j = 0; j < EXTRAS.length; j++) {
    var e = EXTRAS[j]
    var et = Score.tier(q, { name: e.title, keywords: e.keywords })
    // Nodi's own shortcuts rank under Omarchy's rows of the same name.
    if (et) out.push({ key: "system:" + e.key, title: e.title, subtitle: e.subtitle, icon: e.icon, tier: et, kind: "action", offset: -0.5, copy: "", run: e.run })
  }
  return out
}

var provider = {
  id: "system",
  name: "System",
  icon: "󰒓",
  modes: [
    { pattern: /^\s*(vol|volume)\s/i, label: "Volume", icon: "󰕾", exclusive: true, hint: "volume <0-100> | +10 | -10 | mute" },
    { pattern: /^\s*(bright|brightness)\s/i, label: "Brightness", icon: "󰃠", exclusive: true, hint: "brightness <1-100> | +10 | -10 | off" },
    { pattern: /^\s*remind(ers?)?\s/i, label: "Reminders", icon: "󰂚", exclusive: true, hint: "remind <minutes> <message> | reminders" },
    { pattern: /^\s*themes?\s/i, label: "Themes", icon: "󰸌", exclusive: true, hint: "theme [name]" }
  ],
  commands: [
    { title: "Set the volume", keywords: "volume sound audio loudness speaker", text: "volume 60, vol +10, vol mute", complete: "volume " },
    { title: "Set the brightness", keywords: "brightness display screen backlight dim", text: "brightness 70, bright -10", complete: "brightness " },
    { title: "Set a reminder", keywords: "remind reminder timer alarm notify", text: "remind 15 call mom", complete: "remind 15 " },
    { title: "Switch theme", keywords: "theme themes colours colors appearance style", text: "Every Omarchy theme, with a preview", complete: "theme " }
  ],
  help: [
    { id: "system", title: "Volume, brightness, reminders, themes", icon: "󰒓", about: "Levels, reminders and themes by name",
      examples: [{ q: "volume 60", note: "Through Omarchy's own volume command and OSD" }, { q: "bright -10", note: "The focused display" },
                 { q: "remind 15 call mom", note: "Nodi says it in 15 minutes, in its own toast" }, { q: "theme ", note: "Every theme, the current one marked" },
                 { q: "bluetooth", note: "Bluetooth, ON or OFF" }] }
  ],
  match: function(query, ctx) {
    var raw = String(query).trim().replace(/\s+/g, " ")
    var q = raw.toLowerCase()
    var m
    if ((m = q.match(/^(?:vol|volume)(?:\s+(.*))?$/))) return volumeRows((m[1] || "").trim(), ctx)
    if ((m = q.match(/^(?:bright|brightness)(?:\s+(.*))?$/))) return brightnessRows((m[1] || "").trim(), ctx)
    if (/^remind/i.test(raw)) return reminderRows(raw, ctx)
    if ((m = q.match(/^themes?(?:\s+(.*))?$/))) return themeRows((m[1] || "").trim(), ctx)
    if (q.length < 2) return []
    return extraRows(q, ctx)
  }
}
