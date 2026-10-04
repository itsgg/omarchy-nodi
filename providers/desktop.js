.pragma library
.import "../lib/Run.js" as Run
.import "../lib/Score.js" as Score

// The desktop as it is now, from Quickshell's own services, which Nodi.qml
// snapshots on each query into ctx.desktop (components/Desktop.qml):
//
//   pause, play, music, a track or an artist    the players, with the track
//   output, headphones, a device's name          audio outputs, the current marked
//   microphone, input                            audio inputs
//   bluetooth, a device's name                   connect or disconnect, with battery
//   wifi, a network's name                       join a saved one; a new one in Omarchy's panel
//   battery                                      charge and time left, as an answer
//
// Each acts through the command Omarchy uses for it, or the player's own
// D-Bus name; everything that reaches a command is a positional argument.

var MPRIS = /^org\.mpris\.MediaPlayer2\.[A-Za-z0-9_.-]+$/
var MAC = /^([0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}$/
var LIMIT = 6

function duration(seconds) {
  var s = Math.round(Number(seconds) || 0)
  if (s <= 0) return ""
  var h = Math.floor(s / 3600), m = Math.round((s % 3600) / 60)
  return h > 0 ? h + " h " + (m < 10 ? "0" : "") + m + " min" : m + " min"
}

// A device's or a network's own name is also a keyword, lower-cased, so a
// camel-cased one is found by its words as typed: "iphone" finds
// "GG's iPhone", which the name alone splits as "i phone" (Fable 2026-10-02).
function named(q, name, words) {
  return Score.tier(q, { name: name, whole: true, keywords: words.concat([String(name).toLowerCase()]) })
}

function mediaRows(q, d) {
  var out = []
  var players = d.media || []
  for (var i = 0; i < players.length; i++) {
    var p = players[i]
    if (!p.canToggle || !MPRIS.test(String(p.dbusName))) continue
    var verb = p.playing ? "Pause" : "Play"
    var track = [p.title, p.artist].filter(function(x) { return x }).join(", ")
    var t = named(q, verb + (p.title ? " " + p.title : ""), ["music", "media", "song", "track", "play", "pause", p.identity, p.artist || "", p.album || ""])
    if (!t) continue
    out.push({
      key: "media:" + p.dbusName,
      title: verb + (p.title ? ": " + p.title : ""),
      subtitle: [p.identity, p.artist].filter(function(x) { return x }).join(", ") || "Media",
      icon: p.playing ? "󰏤" : "󰐊",
      tier: t,
      kind: "action",
      remember: false,
      copy: track,
      run: Run.exec(["busctl", "--user", "call", p.dbusName, "/org/mpris/MediaPlayer2", "org.mpris.MediaPlayer2.Player", "PlayPause"]),
      actionLabel: verb,
      group: "Media"
    })
  }
  return out
}

function audioRows(q, list, input) {
  var out = []
  var words = input ? ["input", "microphone", "mic", "audio input", "recording"] : ["output", "speaker", "speakers", "headphones", "headset", "audio output", "sound output"]
  for (var i = 0; i < (list || []).length; i++) {
    var n = list[i]
    if (!(n.id >= 0) || !n.name) continue
    var t = named(q, n.description || n.name, words)
    if (!t) continue
    out.push({
      key: (input ? "input:" : "output:") + n.name,
      title: n.description || n.name,
      subtitle: input ? "Audio input" : "Audio output",
      badge: n.isDefault ? "Current" : "",
      badgeTone: n.isDefault ? "on" : "",
      icon: input ? "󰍬" : "󰕾",
      tier: t,
      kind: "setting",
      copy: "",
      run: Run.exec([input ? "omarchy-audio-input-set-default" : "omarchy-audio-output-set-default", String(n.id), String(n.name)]),
      actionLabel: "Use",
      group: input ? "Audio inputs" : "Audio outputs"
    })
  }
  return out
}

function bluetoothRows(q, bt) {
  var out = []
  if (!bt || !bt.enabled) return out
  for (var i = 0; i < (bt.devices || []).length; i++) {
    var dev = bt.devices[i]
    if (!dev.paired || !MAC.test(String(dev.address)) || !dev.name) continue
    var t = named(q, dev.name, ["bluetooth", "device", dev.connected ? "disconnect" : "connect"])
    if (!t) continue
    var state = dev.connected ? "connected" : "not connected"
    var battery = dev.battery >= 0 ? ", " + Math.round(dev.battery * 100) + "%" : ""
    out.push({
      key: "bluetooth:" + dev.address,
      title: dev.name,
      subtitle: "Bluetooth, " + state + battery,
      badge: dev.connected ? "ON" : "",
      badgeTone: dev.connected ? "on" : "",
      icon: "󰂯",
      tier: t,
      kind: "toggle",
      copy: "",
      run: Run.exec(["omarchy-bluetooth-device", dev.connected ? "disconnect" : "connect", String(dev.address)]),
      actionLabel: dev.connected ? "Disconnect" : "Connect",
      group: "Bluetooth"
    })
  }
  return out
}

function wifiRows(q, wifi) {
  var out = []
  if (!wifi || !wifi.enabled) return out
  var nets = (wifi.networks || []).slice().sort(function(a, b) { return (b.connected - a.connected) || (b.known - a.known) || (b.signal - a.signal) })
  for (var i = 0; i < nets.length; i++) {
    var n = nets[i]
    if (!n.ssid) continue
    var t = named(q, n.ssid, ["wifi", "wi-fi", "network", "wireless"])
    if (!t) continue
    var row = {
      key: "wifi:" + n.ssid,
      title: n.ssid,
      subtitle: "Wi-Fi, " + Math.round((n.signal || 0) * 100) + "%" + (n.connected ? ", connected" : n.known ? ", saved" : ""),
      badge: n.connected ? "Current" : "",
      badgeTone: n.connected ? "on" : "",
      icon: "󰖩",
      tier: t,
      kind: "setting",
      offset: -0.001 * i,
      copy: n.ssid,
      group: "Wi-Fi"
    }
    if (n.connected) { row.run = null }
    // By SSID: NetworkManager finds the saved profile whatever it is named.
    // nmcli has no "--", so an SSID that reads as an option goes to the panel.
    else if (n.known && n.ssid.charAt(0) !== "-") { row.run = Run.exec(["nmcli", "device", "wifi", "connect", String(n.ssid)]); row.actionLabel = "Join" }
    else { row.run = Run.exec(["omarchy-shell", "omarchy.network", "open"]); row.actionLabel = "Open Wi-Fi" }
    out.push(row)
  }
  return out
}

function batteryRow(q, b) {
  if (!b || !b.present) return []
  var t = named(q, "Battery", ["charge", "power left", "battery level"])
  if (!t) return []
  var pct = Math.round(Number(b.percentage) || 0)
  var when = b.charging ? (b.timeToFull ? "full in " + duration(b.timeToFull) : "charging") : (b.timeToEmpty ? duration(b.timeToEmpty) + " left" : "on battery")
  if (!b.charging && !b.onBattery) when = "plugged in"
  return [{
    key: "battery",
    title: "Battery " + pct + "%",
    subtitle: when.charAt(0).toUpperCase() + when.slice(1),
    icon: pct > 80 ? "󰁹" : pct > 40 ? "󰁾" : "󰁻",
    // An answer when named outright; "bat" ranks it as a setting, under
    // Battle.net, which it names as well (an answer would still be 90 to 74).
    tier: t,
    kind: t === "exact" ? "answer" : "setting",
    remember: false,
    copy: pct + "%",
    run: Run.exec(["omarchy-shell", "omarchy.power", "open"]),
    actionLabel: "Open",
    group: "Battery"
  }]
}

var provider = {
  id: "desktop",
  name: "Desktop",
  icon: "󰍹",
  commands: [
    { title: "Audio output", keywords: "audio output speaker speakers headphones sound device", text: "The outputs, the current one marked", complete: "output" },
    { title: "Bluetooth devices", keywords: "bluetooth devices connect headset", text: "Connect or disconnect, with battery", complete: "bluetooth " }
  ],
  help: [
    { id: "desktop", title: "The desktop, live", icon: "󰍹", about: "Media, audio devices, Bluetooth, Wi-Fi and battery",
      examples: [{ q: "pause" }, { q: "output" }, { q: "bluetooth " }, { q: "wifi " }, { q: "battery" }] }
  ],
  match: function(query, ctx) {
    var d = ctx.desktop
    if (!d) return []
    var q = String(query || "").trim().toLowerCase().replace(/\s+/g, " ")
    if (q.length < 3) return []
    var rows = [].concat(
      mediaRows(q, d),
      audioRows(q, d.sinks, false),
      audioRows(q, d.sources, true),
      bluetoothRows(q, d.bluetooth),
      wifiRows(q, d.wifi).slice(0, LIMIT),
      batteryRow(q, d.battery))
    return rows
  }
}
