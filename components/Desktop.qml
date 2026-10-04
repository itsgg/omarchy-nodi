import QtQuick
import Quickshell.Services.Mpris
import Quickshell.Services.Pipewire
import Quickshell.Services.UPower
import Quickshell.Bluetooth
import Quickshell.Networking

// The desktop as Quickshell's services see it, as plain data for
// providers/desktop.js: the media players, the audio outputs and inputs,
// Bluetooth devices, Wi-Fi networks and the battery. Taken on each query,
// so what the bar shows is what is true now; each part on its own, so a
// machine with no battery or no Bluetooth adapter only lacks that part.
QtObject {
  id: desktop

  // Quickshell makes each service on first use and fills it in after: one
  // first read inside a query found nothing at all. Touched here, at load,
  // they are ready by the first query.
  Component.onCompleted: {
    var warm = [Mpris.players, Pipewire.nodes, Pipewire.defaultAudioSink, Pipewire.defaultAudioSource, UPower.displayDevice,
                Bluetooth.devices, Bluetooth.defaultAdapter, Networking.devices, Networking.wifiEnabled]
  }

  function values(model) {
    try { return model && model.values ? model.values : [] } catch (e) { return [] }
  }

  function media() {
    return desktop.values(Mpris.players).map(function(p) {
      return { dbusName: String(p.dbusName || ""), identity: String(p.identity || ""), title: String(p.trackTitle || ""),
               artist: String(p.trackArtist || ""), album: String(p.trackAlbum || ""), playing: !!p.isPlaying, canToggle: !!p.canTogglePlaying }
    })
  }

  function audio() {
    var sinks = [], sources = []
    var defSink = Pipewire.defaultAudioSink, defSource = Pipewire.defaultAudioSource
    var nodes = desktop.values(Pipewire.nodes)
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i]
      if (!n || !n.audio || n.isStream) continue
      var name = String(n.name || "")
      if (/\.monitor$/.test(name)) continue
      var entry = { id: n.id, name: name, description: String(n.description || n.nickname || name), isDefault: n === defSink || n === defSource }
      if (n.isSink) sinks.push(entry)
      else sources.push(entry)
    }
    return { sinks: sinks, sources: sources }
  }

  function bluetooth() {
    var adapter = Bluetooth.defaultAdapter
    return {
      enabled: !!(adapter && adapter.enabled),
      devices: desktop.values(Bluetooth.devices).map(function(d) {
        return { name: String(d.name || d.deviceName || ""), address: String(d.address || ""), connected: !!d.connected,
                 paired: !!d.paired, battery: d.batteryAvailable ? Number(d.battery) : -1 }
      })
    }
  }

  function wifi() {
    var nets = []
    var devices = desktop.values(Networking.devices)
    for (var i = 0; i < devices.length; i++) {
      if (devices[i].type !== DeviceType.Wifi) continue
      var ns = desktop.values(devices[i].networks)
      for (var j = 0; j < ns.length; j++)
        nets.push({ ssid: String(ns[j].name || ""), signal: Number(ns[j].signalStrength) || 0, known: !!ns[j].known, connected: !!ns[j].connected })
    }
    return { enabled: !!Networking.wifiEnabled, networks: nets }
  }

  function battery() {
    var d = UPower.displayDevice
    if (!d || !d.isPresent || !d.isLaptopBattery) return { present: false }
    var pct = Number(d.percentage) || 0
    return { present: true, percentage: pct <= 1 ? pct * 100 : pct, charging: d.state === UPowerDeviceState.Charging,
             onBattery: !!UPower.onBattery, timeToEmpty: Number(d.timeToEmpty) || 0, timeToFull: Number(d.timeToFull) || 0 }
  }

  function part(f, fallback) {
    try { return f() } catch (e) { return fallback }
  }

  function snapshot() {
    var a = desktop.part(desktop.audio, { sinks: [], sources: [] })
    return {
      media: desktop.part(desktop.media, []),
      sinks: a.sinks,
      sources: a.sources,
      bluetooth: desktop.part(desktop.bluetooth, null),
      wifi: desktop.part(desktop.wifi, null),
      battery: desktop.part(desktop.battery, null)
    }
  }
}
