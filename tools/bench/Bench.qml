import QtQuick
import "lib/Engine.js" as Engine
import "data.js" as Data

// lib/Engine.js timed in Qt's own JavaScript engine, the one the bar runs
// in: every keystroke of tools/bench/queries.mjs over the data of
// tools/bench/data.mjs, held in properties as Nodi.qml holds them.
Item {
  id: bench
  property var d: Data.data
  property var keys: Data.keys
  property var apps: d.apps
  property var emojis: d.emojis
  property var clipboard: d.clipboard
  property var files: d.files
  property var history: d.history
  property var menu: d.menu
  property var config: d.config
  readonly property int rounds: Number(Qt.application.arguments[Qt.application.arguments.length - 1]) || 5

  function request(name, param) {
    var value = name === "rates" ? d.rates : name === "omarchy-commands" ? d.omarchyCommands : name === "keybindings" ? d.keybindings
      : name === "processes" ? [] : name === "clipboard-text" ? "the build is green" : name === "find" ? [] : undefined
    return value === undefined ? { state: "pending" } : { state: "ready", value: value, error: "", at: 0 }
  }

  function services() {
    return {
      zones: d.zones, localZone: "Asia/Kolkata", emojis: bench.emojis, apps: bench.apps, windows: d.windows, history: bench.history,
      picks: {}, reminders: [], activeWorkspace: { id: 1, name: "1" }, clipboard: bench.clipboard, files: bench.files, menu: bench.menu,
      toggleStates: {}, themes: { list: [], current: "" }, home: "/home/u", request: bench.request, prefs: undefined,
      ask: { phase: "idle" }, desktop: {}, now: function() { return new Date(d.now) }
    }
  }

  Component.onCompleted: {
    var spent = {}
    var all = Engine.providers()
    for (var p = 0; p < all.length; p++) {
      if (typeof all[p].match !== "function") continue
      ;(function(prov) {
        var match = prov.match
        spent[prov.id] = 0
        prov.match = function(q, ctx) { var t = Date.now(); try { return match.call(prov, q, ctx) } finally { spent[prov.id] += Date.now() - t } }
      })(all[p])
    }
    var i, r
    for (i = 0; i < keys.length; i++) { Engine.run(keys[i], bench.config, services()); Engine.mode(keys[i], bench.config) }
    for (var id in spent) spent[id] = 0
    var per = keys.map(function() { return 0 })
    var t0 = Date.now()
    for (i = 0; i < keys.length; i++) {
      var t = Date.now()
      for (r = 0; r < rounds; r++) { Engine.run(keys[i], bench.config, services()); Engine.mode(keys[i], bench.config) }
      per[i] = (Date.now() - t) / rounds
    }
    var total = (Date.now() - t0) / rounds
    var sorted = per.slice().sort(function(a, b) { return a - b })
    function pct(x) { return sorted[Math.min(sorted.length - 1, Math.floor(x * sorted.length))].toFixed(1) }
    var slow = keys.map(function(k, n) { return [k, per[n]] }).sort(function(a, b) { return b[1] - a[1] }).slice(0, 8)
    var by = Object.keys(spent).map(function(k) { return [k, spent[k] / rounds] }).sort(function(a, b) { return b[1] - a[1] }).slice(0, 10)
    console.log("BENCH qt: " + keys.length + " keystrokes x " + rounds + ": median " + pct(0.5) + " ms, p95 " + pct(0.95) + " ms, max "
                + sorted[sorted.length - 1].toFixed(1) + " ms, total " + total.toFixed(0) + " ms a round")
    console.log("BENCH slowest: " + slow.map(function(s) { return JSON.stringify(s[0]) + " " + s[1].toFixed(1) }).join(", "))
    console.log("BENCH by provider (ms a round): " + by.map(function(b) { return b[0] + " " + b[1].toFixed(0) }).join(", "))
    Qt.quit()
  }
}
