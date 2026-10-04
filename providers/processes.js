.pragma library
.import "../lib/Run.js" as Run
.import "../lib/Sources.js" as Sources

// Quit a running process. The user's own processes come from the
// "processes" source below through ctx.request, read again after 1.5 s:
//   [{ pid, rss (KiB), cpu (%), name, args }]
//
//   kill, kill chrome, kill -9 chrome
// Ported from omarchy-commandbar (Saikomantisu, MIT).

var LIMIT = 30

function megabytes(kib) {
  var mb = kib / 1024
  return mb >= 1024 ? (mb / 1024).toFixed(1) + " GB" : Math.round(mb) + " MB"
}

// Only pids reach the command, and only as digits.
function killRun(signal, pids) {
  var clean = pids.map(String).filter(function(p) { return /^\d+$/.test(p) })
  return clean.length > 0 ? Run.exec(["kill", signal].concat(clean)) : null
}

// Whether you named this process: its whole name, or the start of it from
// three letters on. One you did not (the busiest under "kill ", one whose
// arguments only mention the word, "c" for whatever starts with c) asks
// for a second Enter: "kill firefox" with no Firefox running found a shell
// that merely said it (Fable 2026-10-04).
function named(hit, needle) {
  return !!needle && (hit.r === 3 || (hit.r === 2 && needle.length >= 3))
}

var provider = {
  id: "processes",
  name: "Processes",
  icon: "󰅙",
  modes: [{ pattern: /^\s*kill(\s|$)/i, label: "Processes", icon: "󰅙", exclusive: true, hint: "kill [-9] <name or pid>" }],
  sources: {
    processes: {
      argv: function(param, env) { return ["/usr/bin/ps", "-u", env.user, "--no-headers", "-o", "pid=,rss=,pcpu=,comm:40=,args="] },
      parse: function(text) { return Sources.processes(text) },
      maxAgeMs: 1500,
      timeoutMs: 3000
    }
  },
  commands: [
    { title: "Kill a process", keywords: "kill quit process processes force end task manager", text: "Stop an app, or every process it started", complete: "kill " }
  ],
  help: [
    { id: "kill", title: "Kill a process", about: "Quit an app, or every process it started",
      examples: [{ q: "kill ", note: "Your processes, busiest first" }, { q: "kill chrome", note: "Quits every chrome process" },
                 { q: "kill -9 node", note: "Force quit, for an app that hangs" }] }
  ],
  match: function(query, ctx) {
    var m = String(query).match(/^\s*kill(?:\s+(-9|-KILL|--force))?(?:\s+(.*))?$/i)
    if (!m) return []
    var force = !!m[1]
    var needle = (m[2] || "").trim().toLowerCase()
    var got = ctx.request ? ctx.request("processes") : { state: "pending" }
    var list = got.value
    if (!list) return [{ title: got.state === "error" ? "Could not list your processes" : "Reading your processes...", subtitle: "Processes", score: 40, copy: "" }]

    var signal = force ? "-KILL" : "-TERM"
    var verb = force ? "Force quit" : "Quit"
    var hits = []
    for (var i = 0; i < list.length; i++) {
      var p = list[i]
      var name = String(p.name).toLowerCase()
      var r = !needle ? 1 : name === needle ? 3 : name.indexOf(needle) === 0 ? 2 : (name + " " + String(p.args).toLowerCase()).indexOf(needle) !== -1 ? 1 : 0
      if (r > 0) hits.push({ p: p, r: r })
    }
    if (hits.length === 0) return [{ title: needle ? "No process matches \"" + needle + "\"" : "No processes found", subtitle: "Processes", score: 40, copy: "" }]
    hits.sort(function(a, b) { return b.r - a.r || b.p.cpu - a.p.cpu || b.p.rss - a.p.rss })

    var out = []

    // Several processes with the name you typed (browsers, electron apps):
    // offer to quit them all at once.
    if (needle) {
      var group = hits.filter(function(h) { return String(h.p.name).toLowerCase() === String(hits[0].p.name).toLowerCase() })
      if (group.length > 1) {
        var rss = 0, pids = []
        for (var g = 0; g < group.length; g++) { rss += group[g].p.rss; pids.push(group[g].p.pid) }
        out.push({
          key: "kill:all:" + hits[0].p.name,
          title: verb + " all " + group.length + " \"" + hits[0].p.name + "\" processes",
          subtitle: megabytes(rss) + " total, pids " + pids.slice(0, 6).join(", ") + (pids.length > 6 ? "..." : ""),
          score: 97,
          copy: "",
          actionLabel: verb,
          // Named or not as the processes in it are (they share a name).
          confirm: !named(hits[0], needle),
          run: killRun(signal, pids),
          actions: force ? [] : [{ label: "Force quit all", icon: "󰚌", run: killRun("-KILL", pids) }]
        })
      }
    }

    for (var j = 0; j < hits.length && j < LIMIT; j++) {
      var proc = hits[j].p
      out.push({
        key: "kill:" + proc.pid,
        remember: false,
        title: verb + " " + proc.name,
        subtitle: "pid " + proc.pid + ", " + megabytes(proc.rss) + ", " + Number(proc.cpu).toFixed(1) + "% CPU, " + proc.args,
        score: 96 - j * 0.01,
        copy: String(proc.pid),
        actionLabel: verb,
        confirm: !named(hits[j], needle),
        run: killRun(signal, [proc.pid]),
        actions: force ? [] : [{ label: "Force quit", icon: "󰚌", run: killRun("-KILL", [proc.pid]) }]
      })
    }
    return out
  }
}
