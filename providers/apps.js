.pragma library
.import "../lib/Match.js" as Match
.import "../lib/Run.js" as Run
.import "../lib/Score.js" as Score
.import "../lib/Describe.js" as Describe
.import "../lib/WindowClass.js" as WindowClass

// Launch installed applications. Nodi.qml keeps a snapshot of the visible
// desktop entries in ctx.apps:
//   [{ id, name, generic, comment, keywords, icon, wmclass, actions: [{ index, name }], exec, terminal }]
// and how often each row was run lifts it, through lib/Score.js.
//
//   firefox, term, vsc (acronym), frfx (letters in order), brave new window
// Ported from omarchy-commandbar (Saikomantisu, MIT); ranking is Nodi's.

var LIMIT = 6
var ACTIONS = 3
var VERB = /^(?:open|launch|start|run)\s+(\S.*)$/

// What people call common apps beyond what their desktop entries say,
// matched as keywords, by desktop id in lower case (ROADMAP 40): written
// once and read, for the apps Omarchy installs and the ones most desktops
// have. A user's own app is described by Describe.js, if asked.
var KEYWORDS = {
  "com.github.pintaproject.pinta": ["photo editor", "paint", "image editing"],
  "org.gnome.nautilus": ["file manager", "explorer", "folders", "finder"],
  "org.gnome.evince": ["pdf", "pdf viewer", "document reader"],
  "org.gnome.diskutility": ["disk manager", "partitions", "format drive"],
  "org.kde.kdenlive": ["video editing", "edit video"],
  "com.obsproject.studio": ["screen recording", "streaming", "record screen"],
  "mpv": ["video player", "movies"],
  "localsend": ["airdrop"],
  "org.inkscape.inkscape": ["svg", "illustrator"],
  "org.kde.krita": ["painting", "drawing"],
  "blender": ["3d", "modeling", "animation"],
  "audacity": ["audio editor", "record audio"],
  "libreoffice-writer": ["word", "docx"],
  "libreoffice-calc": ["excel", "xlsx"],
  "libreoffice-impress": ["powerpoint", "slides", "pptx"],
  "spotify": ["music"],
  "btop": ["task manager", "processes", "activity monitor"],
  "1password": ["passwords"],
  "obsidian": ["notes", "markdown", "knowledge base"],
  "com.github.xournalpp.xournalpp": ["handwriting", "annotate pdf"],
  "omacalc": ["calc"],
  "chromium": ["web browser", "web"],
  "foot": ["console", "shell"],
  "nvim": ["vim", "code editor"],
  "whatsapp": ["chat", "messages"],
  "telegram": ["chat", "messages"],
  "discord": ["chat", "voice chat"],
  "slack": ["chat", "work chat"],
  "gmail": ["email", "mail", "inbox"],
  "google calendar": ["calendar", "meetings"],
  "youtube": ["videos"],
  "x": ["twitter"],
  "system-config-printer": ["printer", "printers"],
  "dev.tensaku.tensaku": ["annotate screenshot"]
}

function keywordsOf(app) {
  var id = String(app.id || "").toLowerCase()
  return Object.prototype.hasOwnProperty.call(KEYWORDS, id) ? KEYWORDS[id] : []
}

// Whether the whole query names an app by its words (keyword or better): a
// description that has the verb ("Free and Open Source", OBS's comment)
// keeps no verb (Fable 2026-10-05).
function anyApp(q, known) {
  var named = Score.ORDER.indexOf("keyword")
  for (var i = 0; i < known.length; i++) {
    var t = Score.tier(q, known[i])
    if (t && Score.ORDER.indexOf(t) <= named) return true
  }
  return false
}

// What an app's entry says of it: its generic name or its comment, unless
// that only repeats the name, as every web app Omarchy installs does
// (Comment=<name>, omarchy-webapp-install); "" when it says nothing.
function given(app) {
  var name = String(app.name || "").trim().toLowerCase()
  var said = [app.generic, app.comment]
  for (var i = 0; i < said.length; i++) {
    var text = String(said[i] || "").trim()
    if (text && text.toLowerCase() !== name) return text
  }
  return ""
}

// What a row says under an app's name: what its entry says, else a few
// words from lib/Describe.js (Omarchy's own apps, or what a model wrote)
// with a web app's site or that it runs in a terminal; without them, the
// site or the terminal alone.
function about(app, descriptions) {
  var own = given(app)
  if (own) return own
  var exec = String(app.exec || "").trim()
  var words = Describe.of(descriptions || {}, app)
  var site = Describe.site(exec)
  if (site) return (words || "Web app") + ", " + site
  if (/^(?:\S*\/)?omarchy-(launch-webapp|webapp-handler-)/.test(exec)) return words ? words + ", web app" : "Web app"
  if (app.terminal || /^(?:\S*\/)?xdg-terminal-exec\b/.test(exec)) return words ? words + ", terminal app" : "Terminal app"
  return words || "Application"
}

// An app a model may be asked to describe: its entry says nothing of it.
function undescribed(app) { return given(app) === "" }

// What an app is described by, matched as its description: what its row
// says under the name, and its entry's comment where the row shows the
// generic name instead ("organize files" finds Files, "handwritten notes"
// Xournal++; Q 4, ROADMAP 35). Not the "Application" a row says when
// nothing describes it, nor a comment that only repeats the name.
function describedAs(app, descriptions) {
  var name = String(app.name || "").trim().toLowerCase()
  var shown = about(app, descriptions)
  var comment = String(app.comment || "").trim()
  var out = shown === "Application" ? [] : [shown]
  if (comment && comment.toLowerCase() !== name && comment !== shown) out.push(comment)
  return out.join(" ")
}

// What an app is matched on: the generic name ("Terminal") names an app up
// to a whole-word match; the id and the keywords are keywords; what its
// row says is its description.
function fields(app, descriptions) {
  return Score.prepare({
    name: app.name,
    generic: app.generic,
    keywords: [String(app.id || "").replace(/[._-]+/g, " ")].concat(app.keywords || [], keywordsOf(app)),
    description: describedAs(app, descriptions),
    letters: true
  })
}

// Worked out once per list of apps and of descriptions, not on every
// keystroke (tools/bench.sh).
var fieldsCache = { apps: null, descriptions: null, fields: null }

function fieldsOf(apps, descriptions) {
  if (fieldsCache.apps !== apps || fieldsCache.descriptions !== descriptions)
    fieldsCache = { apps: apps, descriptions: descriptions, fields: apps.map(function(a) { return fields(a, descriptions) }) }
  return fieldsCache.fields
}

// How well the query names this app (a tier of lib/Score.js), "" for none.
function tier(app, q) {
  return Score.tier(q, fields(app))
}

// A number for windows.js to compare: 0 for no match, higher better.
function rank(app, q, qw) {
  var t = tier(app, q)
  return t ? Score.TIER[t] + 40 : 0
}

// Apps with a window open say "Open new": Enter on their window row (from
// the windows provider, ranked just above) switches instead.
function runningOf(windows) {
  var running = {}
  var classes = []
  for (var w = 0; w < windows.length; w++) {
    var c = String(windows[w].cls).toLowerCase()
    if (!running[c]) classes.push(c)
    running[c] = true
  }
  return function(app) {
    return running[app.id.toLowerCase()] || (app.wmclass && running[app.wmclass.toLowerCase()])
      || running[app.id.toLowerCase().split(".").pop()]
      || classes.some(function(c) { return WindowClass.webAppOwns(app, c) })
  }
}

function appRow(app, tier, isRunning, descriptions) {
  return {
    key: "app:" + app.id,
    title: app.name,
    subtitle: about(app, descriptions),
    image: app.icon,
    tier: tier,
    kind: "app",
    copy: "",
    actionLabel: isRunning(app) ? "Open new" : "Open",
    run: Run.app(app.id),
    actions: (app.actions || []).map(function(act) { return { label: act.name, icon: "󰖯", run: Run.app(app.id, act.index) } })
  }
}

// Keyed and run by the action's id where it has one, so a saved action is
// the same action after the entry is updated, never the one now at its old
// place (codex 2026-10-05); by its place only where it has no id.
function actionRow(app, action, tier, extra) {
  var row = { key: "app:" + app.id + ":" + (action.id ? "#" + action.id : action.index), title: action.name, subtitle: app.name, image: app.icon,
              tier: tier, kind: "app", copy: "", run: Run.app(app.id, action.index, action.id || undefined) }
  for (var k in extra) row[k] = extra[k]
  return row
}

var provider = {
  id: "apps",
  name: "Apps",
  icon: "󰀻",
  help: [
    { id: "apps", title: "Open an app", about: "Type part of an app's name, its initials, or what it does",
      examples: ["firefox", "term", "brave new window"] }
  ],
  match: function(query, ctx) {
    var q = Match.normalise(query)
    var apps = ctx.apps || []
    if (!q || apps.length === 0) return []
    // "open spotify": a verb in front of a name, when the whole names no
    // app (Q L16, ROADMAP 41). "Open" and the rest are kept where an app
    // is named by them all.
    var verb = q.match(VERB)
    var stripped = !!verb && !anyApp(q, fieldsOf(apps, ctx.descriptions))
    if (stripped) q = verb[1]
    var qw = Match.words(q)
    if (qw.length === 0) return []
    var history = ctx.history || {}
    var nowMs = ctx.now().getTime()

    var isRunning = runningOf(ctx.windows || [])

    var hits = []
    var known = fieldsOf(apps, ctx.descriptions)
    for (var i = 0; i < apps.length; i++) {
      var t = Score.tier(q, known[i])
      if (t) hits.push({ app: apps[i], t: t, s: Score.score(t, "app", Score.habit(history["app:" + apps[i].id], nowMs)) })
    }

    // "brave new window": the app's name, then one of its actions.
    var actionHits = []
    if (qw.length > 1) {
      for (var a = 0; a < apps.length; a++) {
        var app = apps[a]
        var nameWords = Match.words(app.name)
        var lead = 0
        while (lead < qw.length && lead < nameWords.length && nameWords[lead].indexOf(qw[lead]) === 0) lead++
        if (lead === 0 || lead === qw.length) continue
        var rest = qw.slice(lead)
        var actions = app.actions || []
        for (var k = 0; k < actions.length; k++) {
          if (Match.prefixesAll(rest, Match.words(actions[k].name))) actionHits.push({ app: app, action: actions[k] })
        }
      }
    }

    hits.sort(function(x, y) { return y.s - x.s || x.app.name.localeCompare(y.app.name) })

    var out = []
    for (var j = 0; j < actionHits.length; j++) {
      var ah = actionHits[j]
      // Named by the app and the action: as well named as an app by its words.
      out.push(actionRow(ah.app, ah.action, "words", { offset: 0.5 - j * 0.01 }))
    }

    for (var n = 0; n < hits.length && n < LIMIT; n++) {
      var hit = hits[n]
      var appActions = hit.app.actions || []
      out.push(appRow(hit.app, hit.t, isRunning, ctx.descriptions))

      // A near-exact hit also offers its actions (New Window, New Private
      // Window) right under it, so a second window is one arrow key away.
      if (n === 0 && (hit.t === "exact" || hit.t === "prefix") && q.length >= 3 && actionHits.length === 0) {
        for (var m = 0; m < appActions.length && m < ACTIONS; m++)
          out.push(actionRow(hit.app, appActions[m], hit.t, { habitKey: "app:" + hit.app.id, offset: -0.005 - m * 0.001 }))
      }
    }
    // Each row's fit is the name's, without the verb (lib/Rows.js; Fable
    // 2026-10-05: "start obs" lost the tie "obs" breaks).
    if (stripped) for (var f = 0; f < out.length; f++) out[f].fitQuery = q
    return out
  },
  // A saved row as it is now: "app:<id>", "app:<id>:#<action id>", or
  // "app:<id>:<action index>" for an action with no id; an id may hold a
  // colon, so the whole is tried as an id first.
  resolve: function(key, ctx, saved) {
    var k = String(key)
    if (k.indexOf("app:") !== 0) return null
    var apps = ctx.apps || []
    var byId = function(id) { for (var i = 0; i < apps.length; i++) if (apps[i].id === id) return apps[i]; return null }
    var whole = byId(k.slice(4))
    if (whole) return appRow(whole, "exact", runningOf(ctx.windows || []), ctx.descriptions)
    var m = k.match(/^app:(.+):(#.+|\d+)$/)
    var app = m ? byId(m[1]) : null
    var actions = app ? app.actions || [] : []
    for (var a = 0; a < actions.length; a++) {
      var named = m[2].charAt(0) === "#" ? actions[a].id === m[2].slice(1) : !actions[a].id && String(actions[a].index) === m[2]
      if (named) return actionRow(app, actions[a], "exact", {})
    }
    // Saved before actions had ids, by place: found again by the name it
    // had when saved, under the key it was saved with, and run by its id
    // from then on (Fable 2026-10-05). lib/History.js replayable keeps the
    // old place from being run when the name is not found.
    if (/^\d+$/.test(m[2]) && saved && saved.title) {
      for (var b = 0; b < actions.length; b++) {
        if (actions[b].id && actions[b].name === saved.title) {
          var again = actionRow(app, actions[b], "exact", {})
          again.key = k
          return again
        }
      }
    }
    return null
  }
}
