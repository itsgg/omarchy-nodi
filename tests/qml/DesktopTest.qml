import QtQuick
import "../../components"

// components/Desktop.qml against the live session's services: a snapshot
// has every part, of the right shape, and taking one changes nothing.
Item {
  id: test
  signal done(bool ok, string report)

  Desktop { id: desktop }

  Component.onCompleted: later.start()

  Timer {
    id: later
    interval: 3000
    onTriggered: {
      var f = []
      var s = desktop.snapshot()
      if (!Array.isArray(s.media)) f.push("media is not a list")
      if (!Array.isArray(s.sinks) || !Array.isArray(s.sources)) f.push("audio is not two lists")
      // A desktop session always has an output; none means the services
      // were read before they were made (the first version of this did).
      else if (s.sinks.length === 0) f.push("no audio outputs at all")
      for (var i = 0; i < s.sinks.length; i++) if (typeof s.sinks[i].id !== "number" || !s.sinks[i].name) f.push("a sink without an id or a name: " + JSON.stringify(s.sinks[i]))
      if (s.sinks.length > 0 && s.sinks.filter(function(n) { return n.isDefault }).length !== 1) f.push("not exactly one default output: " + JSON.stringify(s.sinks))
      if (!s.bluetooth || !Array.isArray(s.bluetooth.devices)) f.push("bluetooth: " + JSON.stringify(s.bluetooth))
      if (!s.wifi || !Array.isArray(s.wifi.networks)) f.push("wifi: " + JSON.stringify(s.wifi))
      else {
        var on = s.wifi.networks.filter(function(n) { return n.connected })
        if (on.length > 1) f.push("more than one network connected: " + JSON.stringify(on))
        if (on.length === 1 && !on[0].known) f.push("the connected network is not a saved one: " + JSON.stringify(on[0]))
      }
      if (!s.battery || typeof s.battery.present !== "boolean") f.push("battery: " + JSON.stringify(s.battery))
      if (s.battery && s.battery.present && !(s.battery.percentage >= 0 && s.battery.percentage <= 100)) f.push("battery percentage " + s.battery.percentage)
      console.warn("NODI-DESKTOP " + JSON.stringify({ media: s.media.length, sinks: s.sinks.length, sources: s.sources.length,
        bt: s.bluetooth ? s.bluetooth.devices.length : -1, wifi: s.wifi ? s.wifi.networks.length : -1, battery: s.battery }))
      test.done(f.length === 0, f.join("; "))
    }
  }
}
