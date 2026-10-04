.pragma library

// Every toggle Nodi shows a state for, in one table: which Omarchy menu row it
// decorates (or the row Nodi adds when the menu has none), what ON means for
// that row, and how the state is read. probeScript() turns the table into one
// bash script; parse() reads its "id=value" lines.
//
// ON always means the thing the row names is on: "Notifications ON" means
// they show (do-not-disturb is off), "Window Gaps ON" means there are gaps.
// A state that could not be read is left out, and the row shows no badge
// rather than a guess.

var STATE = "$HOME/.local/state/omarchy"

// probe kinds:
//   present: <path>   ON when the file exists
//   absent: <path>    ON when it does not
//   sh: <script>      prints 1, 0 or a word ("dwindle")
var TABLE = [
  { id: "stay-awake", menu: "trigger.toggle.idle-lock", keywords: "idle caffeine awake inhibit keep display on",
    probe: { present: STATE + "/indicators/stay-awake" } },
  { id: "notifications", menu: "trigger.toggle.notifications", keywords: "dnd do not disturb silence silencing quiet focus",
    probe: { sh: 's=$(timeout 2 omarchy-shell notifications dndState 2>/dev/null); case $s in on) echo 0 ;; off) echo 1 ;; esac' } },
  { id: "nightlight", menu: "trigger.toggle.nightlight", keywords: "night light warm blue temperature hyprsunset",
    probe: { sh: 'timeout 2 omarchy-toggle-nightlight --status 2>/dev/null | jq -r \'if .enabled == true then 1 elif .enabled == false then 0 else empty end\'' } },
  { id: "top-bar", menu: "trigger.toggle.top-bar", keywords: "bar status top hide show panel",
    probe: { absent: STATE + "/toggles/bar-off" } },
  { id: "battery-percentage", menu: "trigger.toggle.battery-percentage", keywords: "battery percent level power",
    probe: { sh: 'f=$HOME/.config/omarchy/shell.json; [ -f "$f" ] || f=$OMARCHY_PATH/config/omarchy/shell.json; jq -r \'[.. | objects | select(.id? == "omarchy.power") | (.showPercentage == true)] | if length > 0 then (if .[0] then 1 else 0 end) else empty end\' "$f" 2>/dev/null' } },
  { id: "workspace-layout", menu: "trigger.toggle.workspace-layout", keywords: "layout dwindle scrolling tiling",
    probe: { sh: 'timeout 1 hyprctl activeworkspace -j 2>/dev/null | jq -r \'.tiledLayout // empty\'' } },
  { id: "window-gaps", menu: "trigger.toggle.window-gaps", keywords: "gaps spacing padding border",
    probe: { absent: STATE + "/toggles/hypr/window-no-gaps.lua" } },
  { id: "one-window-ratio", menu: "trigger.toggle.one-window-ratio", keywords: "aspect ratio square single window",
    probe: { present: STATE + "/toggles/hypr/single-window-aspect-ratio.lua" } },
  { id: "screensaver", menu: "trigger.toggle.screensaver", keywords: "screensaver saver idle",
    probe: { absent: STATE + "/toggles/screensaver-off" } },
  { id: "crash-capture", menu: "trigger.toggle.crash-capture", keywords: "crash coredump report notify",
    probe: { absent: STATE + "/toggles/crash-capture-off" } },
  { id: "touchpad", menu: "trigger.hardware.touchpad", keywords: "touchpad trackpad",
    probe: { absent: STATE + "/toggles/hypr/touchpad-disabled-name" } },
  { id: "touchscreen", menu: "trigger.hardware.touchscreen", keywords: "touchscreen touch",
    probe: { absent: STATE + "/toggles/hypr/touchscreen-disabled-name" } },

  // Rows Omarchy's menu does not have.
  { id: "suspend", title: "Suspend in System Menu", icon: "󰒲", keywords: "suspend system menu power",
    argv: ["omarchy-toggle-suspend"],
    probe: { absent: STATE + "/toggles/suspend-off" } },
  { id: "bluetooth", title: "Bluetooth", icon: "󰂯", keywords: "bluetooth bt radio wireless",
    argv: ["omarchy-bluetooth-power", "toggle"],
    // `toggle` decides on whether a controller is powered, so the badge asks
    // the same question; a hung bluetoothctl leaves the state unknown.
    probe: { sh: 'timeout 3 omarchy-bluetooth-power is-on >/dev/null 2>&1; case $? in 0) echo 1 ;; 1) echo 0 ;; esac' } },
  { id: "wifi", title: "Wi-Fi", icon: "󰖩", keywords: "wifi wi-fi wlan wireless network radio internet",
    argv: ["bash", "-c", 'if [ "$(nmcli radio wifi)" = enabled ]; then nmcli radio wifi off; else nmcli radio wifi on; fi'],
    probe: { sh: 's=$(timeout 1 nmcli radio wifi 2>/dev/null); case $s in enabled) echo 1 ;; disabled) echo 0 ;; esac' } },
  { id: "sound", title: "Sound Output", icon: "󰕾", keywords: "sound mute unmute speaker audio volume output",
    argv: ["omarchy-audio-output-volume", "mute-toggle"],
    probe: { sh: 'k=$(timeout 1 omarchy-audio-output-sink 2>/dev/null) && [ -n "$k" ] && m=$(timeout 1 pactl get-sink-mute "$k" 2>/dev/null) && case $m in *yes) echo 0 ;; *no) echo 1 ;; esac' } },
  { id: "microphone", title: "Microphone", icon: "󰍬", keywords: "mic microphone mute unmute input voice",
    argv: ["omarchy-audio-input-mute"],
    probe: { sh: 'v=$(timeout 1 wpctl get-volume @DEFAULT_AUDIO_SOURCE@ 2>/dev/null) && case $v in *MUTED*) echo 0 ;; Volume*) echo 1 ;; esac' } }
]

// Levels the parameter rows show beside "volume" and "brightness".
var LEVELS = [
  { id: "volume", sh: 'k=$(timeout 1 omarchy-audio-output-sink 2>/dev/null) && [ -n "$k" ] && timeout 1 pactl get-sink-volume "$k" 2>/dev/null | awk \'NR == 1 { for (i = 1; i <= NF; i++) if ($i ~ /%$/) { sub("%", "", $i); print $i; exit } }\'' },
  { id: "brightness", sh: 'timeout 1 brightnessctl -m 2>/dev/null | awk -F, \'NR == 1 { gsub("%", "", $4); print $4 }\'' }
]

function byId(id) {
  for (var i = 0; i < TABLE.length; i++) if (TABLE[i].id === id) return TABLE[i]
  return null
}

function byMenu(menuId) {
  for (var i = 0; i < TABLE.length; i++) if (TABLE[i].menu === menuId) return TABLE[i]
  return null
}

function extras() {
  return TABLE.filter(function(t) { return !t.menu })
}

function line(id, body) {
  // Each probe runs in its own subshell in the background and prints one
  // line; a probe that hangs past its own timeout prints nothing.
  return "( v=$(" + body + "); [ -n \"$v\" ] && printf '%s=%s\\n' " + JSON.stringify(id) + " \"$v\" ) &\n"
}

// One script for every state and level. Ids and paths are constants of this
// file, never data.
function probeScript() {
  var out = ""
  for (var i = 0; i < TABLE.length; i++) {
    var t = TABLE[i]
    var p = t.probe
    if (p.present) out += line(t.id, "[ -e \"" + p.present + "\" ] && echo 1 || echo 0")
    else if (p.absent) out += line(t.id, "[ -e \"" + p.absent + "\" ] && echo 0 || echo 1")
    else if (p.sh) out += line(t.id, p.sh)
  }
  for (var j = 0; j < LEVELS.length; j++) out += line(LEVELS[j].id, LEVELS[j].sh)
  return out + "wait\n"
}

// { id: { on: true|false|null, value: "dwindle" } } for the lines a probe
// printed; ids the table does not know are ignored.
function parse(text) {
  var out = {}
  var lines = String(text || "").split("\n")
  for (var i = 0; i < lines.length; i++) {
    var m = lines[i].match(/^([a-z0-9-]+)=(.*)$/)
    if (!m) continue
    var known = byId(m[1]) || LEVELS.some(function(l) { return l.id === m[1] })
    if (!known) continue
    var v = m[2].trim()
    out[m[1]] = { on: v === "1" ? true : (v === "0" ? false : null), value: v }
  }
  return out
}

// The badge a toggle row shows: "ON", "OFF", the value for a non-boolean
// state, or "" when the state is unknown.
function badge(state) {
  if (!state) return { text: "", tone: "" }
  if (state.on === true) return { text: "ON", tone: "on" }
  if (state.on === false) return { text: "OFF", tone: "" }
  if (state.value) return { text: state.value.charAt(0).toUpperCase() + state.value.slice(1), tone: "" }
  return { text: "", tone: "" }
}

// After Enter: the state flipped at once, so the row answers before the
// re-probe lands. Unknown and non-boolean states are left alone.
function flipped(states, id) {
  var next = {}
  for (var k in states) next[k] = states[k]
  var s = states[id]
  if (s && (s.on === true || s.on === false)) next[id] = { on: !s.on, value: s.on ? "0" : "1" }
  else if (s && id === "workspace-layout") next[id] = { on: null, value: s.value === "scrolling" ? "dwindle" : "scrolling" }
  return next
}
