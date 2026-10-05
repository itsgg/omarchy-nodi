.pragma library
.import "../lib/Match.js" as Match
.import "../lib/Run.js" as Run
.import "../lib/Score.js" as Score
.import "apps.js" as Apps

// Switch to an open window. Nodi.qml takes a snapshot of Hyprland's windows
// (hyprctl clients) each time it opens, in ctx.windows:
//   [{ address, cls, title, workspace, focus }]   focus 0 = most recent
//
//   brave: its open windows, most recently used first, above "open new"
//   netflix: the window whose title says so
//   w, w github: every window, or windows matching a filter
// Ported from omarchy-commandbar (Saikomantisu, MIT).

var LIMIT = 8

// The desktop entry a window belongs to, for its name and icon.
function appFor(win, apps) {
  var cls = String(win.cls).toLowerCase()
  for (var i = 0; i < apps.length; i++) {
    var a = apps[i]
    if (a.id.toLowerCase() === cls || (a.wmclass && a.wmclass.toLowerCase() === cls)) return a
  }
  // "com.mitchellh.ghostty" matches an entry whose id ends in "ghostty".
  var tail = cls.split(".").pop()
  for (var j = 0; j < apps.length; j++) {
    if (apps[j].id.toLowerCase().split(".").pop() === tail) return apps[j]
  }
  return null
}

function describe(win, apps) {
  var app = appFor(win, apps)
  // No desktop entry: "com.mitchellh.ghostty" reads as "Ghostty".
  var tail = String(win.cls).split(".").pop()
  var name = app ? app.name : tail.charAt(0).toUpperCase() + tail.slice(1)
  return {
    app: app,
    name: name,
    matchable: { id: win.cls, name: name, generic: app ? app.generic : "", keywords: app ? app.keywords : [] }
  }
}

// The windows that can be switched to, each with its app, its name and what
// it is matched on, worked out once per window list and app list: finding
// the app lower-cased every app's id for every window on every keystroke
// (tools/bench.sh).
var describedCache = { windows: null, apps: null, list: null, info: null }

function described(windows, apps) {
  if (describedCache.windows === windows && describedCache.apps === apps) return describedCache
  var list = windows.filter(function(w) {
    // Only addresses Hyprland gave us ever reach the dispatcher.
    return /^0x[0-9a-f]+$/i.test(w.address) && w.focus !== 0
  })
  var info = list.map(function(w) {
    var d = describe(w, apps)
    // By its app's own name or id, never its generic name: "term" opens a
    // terminal rather than switching to whichever terminal is open.
    d.fields = Score.prepare({ name: d.name, keywords: [String(w.cls).replace(/[._-]+/g, " ")] })
    return d
  })
  describedCache = { windows: windows, apps: apps, list: list, info: info }
  return describedCache
}

function where(win) {
  var ws = String(win.workspace || "")
  return ws.indexOf("special") === 0 ? "scratchpad" : "workspace " + ws
}

function row(win, d, rank) {
  var r = {
    key: "window:" + win.address,
    remember: false,
    title: win.title || d.name,
    subtitle: d.name + ", " + where(win),
    image: d.app ? d.app.icon : "",
    icon: "󰖯",
    copy: "",
    run: Run.focus(win.address)
  }
  for (var k in rank) r[k] = rank[k]
  return r
}

var NAMED = { exact: true, prefix: true, words: true, acronym: true, substring: true, keyword: true }

var provider = {
  id: "windows",
  // Its own order, by recency or place, stands over a closer title (lib/Rows.js).
  keepsOrder: true,
  name: "Windows",
  icon: "󰖯",
  modes: [{ pattern: /^\s*w\s/i, label: "Windows", icon: "󰖯", exclusive: true, hint: "w [app or title]" }],
  // The window that was active before the bar opened, which has the focus
  // again by the time these run. Omarchy binds no keys to them; the rest
  // (float, fullscreen, pop out, workspaces, scratchpad) are its
  // keybindings, which providers/keys.js makes rows.
  commands: [
    { title: "Switch window", keywords: "window windows switch focus open alt tab", text: "Go to an open window", complete: "w " },
    { title: "Center window", keywords: "center centre middle floating window", text: "A floating window, to the middle of the screen",
      run: Run.exec(["hyprctl", "dispatch", "hl.dsp.window.center()"]) },
    { title: "Pin window", keywords: "pin sticky all workspaces floating window", text: "A floating window, on every workspace",
      run: Run.exec(["hyprctl", "dispatch", "hl.dsp.window.pin()"]) }
  ],
  help: [
    { id: "windows", title: "Switch window", about: "Type an app or a window title. w and a space lists them all",
      examples: [{ q: "w ", note: "Every other open window, most recent first" },
                 { q: "w github", hint: "Windows with github in the title" },
                 { q: "brave", hint: "Brave's windows first, then Brave to open a new one" }] }
  ],
  match: function(query, ctx) {
    var known = described(ctx.windows || [], ctx.apps || [])
    var list = known.list
    var mode = String(query).match(/^\s*w\s(.*)$/i)
    var q = Match.normalise(mode ? mode[1] : query)
    var qw = Match.words(q)

    // "w" and "w filter": windows only, most recently used first.
    if (mode) {
      var picked = []
      for (var i = 0; i < list.length; i++) {
        var d = known.info[i]
        if (!q || Apps.rank(d.matchable, q, qw) > 0 || Match.prefixesAll(qw, Match.words(list[i].title))) picked.push({ w: list[i], d: d })
      }
      picked.sort(function(a, b) { return a.w.focus - b.w.focus })
      if (picked.length === 0) return [{ title: q ? "No window matches \"" + q + "\"" : "No other windows open", subtitle: "Windows", score: 40, copy: "" }]
      return picked.slice(0, LIMIT).map(function(p, n) { return row(p.w, p.d, { score: 97 - n * 0.01 }) })
    }

    if (!q || qw.length === 0) return []
    var out = []
    for (var j = 0; j < list.length; j++) {
      var win = list[j]
      var info = known.info[j]
      var t = Score.tier(q, info.fields)
      // Named by its app: a window row (kind "window") ranks just above the
      // same app's launch row at the same tier, so Enter switches and "open
      // new" is one arrow key down; the most recent window first.
      if (NAMED[t]) out.push(row(win, info, { tier: t, kind: "window", offset: -win.focus * 0.001 }))
      // Named by its title ("netflix"): as a keyword names a row.
      else if (q.length >= 3 && Match.prefixesAll(qw, Match.words(win.title))) out.push(row(win, info, { tier: "keyword", kind: "window", offset: -win.focus * 0.001 }))
    }
    // Ranked before the cut, so the most recent of many windows is kept.
    out.sort(function(a, b) { return (Score.score(b.tier, b.kind) + b.offset) - (Score.score(a.tier, a.kind) + a.offset) })
    return out.slice(0, LIMIT)
  }
}
