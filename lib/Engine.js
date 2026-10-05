.pragma library
.import "../providers/index.js" as Registry
.import "Rows.js" as Rows
.import "Match.js" as Match
.import "Score.js" as Score
.import "Run.js" as Run
.import "Toggles.js" as Toggles
.import "Prefs.js" as Prefs
.import "../providers/keywords.js" as Keywords
.import "../providers/scripts.js" as Scripts

// Runs the enabled providers over a query and returns ranked rows, grouped:
// `section` is set on the first row of each group, and `hero` on a top row
// that is a direct answer (a sum, a conversion).
//
// A provider may declare modes, prefixes that change what the bar is doing:
//   modes: [{ pattern: /^\s*kill(\s|$)/i, label: "Processes", icon: "...", exclusive: true }]
// The first enabled provider whose mode matches puts its chip in the search
// field; an exclusive mode also owns the query, so no other provider answers
// "kill chrome" or ":fire". A provider that has no answer for it returns
// nothing, and then every provider runs: "volume control" and "file manager"
// still find the apps of those names.

// ---------------------------------------------------------------- formatting

// Copy text: no grouping separators, so it pastes cleanly into anything.
function plain(n) { return String(n) }

function format(n) {
  if (typeof n !== "number" || !isFinite(n)) return String(n)
  var abs = Math.abs(n)
  if (abs !== 0 && (abs >= 1e15 || abs < 1e-6)) return n.toPrecision(6).replace(/\.?0+e/, "e")
  var s = String(n)
  if (/e/.test(s)) s = n.toFixed(12).replace(/\.?0+$/, "")
  var neg = s[0] === "-"
  if (neg) s = s.slice(1)
  var parts = s.split(".")
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",")
  return (neg ? "-" : "") + parts.join(".")
}

var MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

function formatDate(unixSeconds) {
  var d = new Date(unixSeconds * 1000)
  return d.getDate() + " " + MON[d.getMonth()] + " " + d.getFullYear()
}

// ---------------------------------------------------------------- providers

function providers() { return Registry.all }

// The enabled providers in the config's order, worked out once per list:
// asked several times a keystroke, it was an eighth of one (tools/bench.sh).
// Callers read the array and never change it.
var enabledCache = { enabled: null, list: null }

function enabledProviders(config) {
  var enabled = (config && config.providers) || []
  if (enabledCache.enabled === enabled) return enabledCache.list
  var out = []
  for (var order = 0; order < enabled.length; order++) {
    for (var i = 0; i < Registry.all.length; i++) {
      if (Registry.all[i].id === enabled[order]) { out.push(Registry.all[i]); break }
    }
  }
  enabledCache = { enabled: enabled, list: out }
  return out
}

// What a provider sees: its own config section, every service the shell
// handed in (apps, windows, rates, menu, toggle states...) and the helpers.
function contextFor(p, config, services) {
  var ctx = {}
  for (var k in services) ctx[k] = services[k]
  ctx.settings = config ? config[p.id] : undefined
  ctx.config = config || {}
  ctx.now = services.now || function() { return new Date() }
  ctx.format = format
  ctx.plain = plain
  ctx.formatDate = formatDate
  return ctx
}

// ---------------------------------------------------------------- modes

// Each enabled provider's modes, worked out once per config: keywords and
// snippets make a pattern per entry, and every keystroke asked twice (run
// and mode).
var modesCache = { config: null, list: null }

function modesOf(config) {
  if (config && modesCache.config === config) return modesCache.list
  var list = enabledProviders(config)
  var out = []
  for (var i = 0; i < list.length; i++) {
    var modes = list[i].modes
    if (typeof modes === "function") {
      try { modes = modes(config ? config[list[i].id] : undefined, config) } catch (e) { modes = [] }
    }
    out.push({ provider: list[i], modes: modes || [] })
  }
  modesCache = { config: config, list: out }
  return out
}

function matchMode(query, config) {
  var q = String(query || "")
  var list = modesOf(config)
  for (var i = 0; i < list.length; i++) {
    var modes = list[i].modes
    for (var j = 0; j < modes.length; j++) {
      var m = modes[j]
      if (m && m.pattern && m.pattern.test(q)) return { provider: list[i].provider, label: m.label, icon: m.icon || list[i].provider.icon || "", exclusive: !!m.exclusive, hint: m.hint || "" }
    }
  }
  return null
}

// The chip in the search field: "Help", "Emoji", "Search Google"...
function mode(query, config) {
  var q = String(query || "")
  if (/^\s*\?/.test(q)) {
    var topic = helpTopicTitle(q.replace(/^\s*\?/, ""), config, {})
    return { label: topic ? "Help: " + topic : "Help", icon: "󰋖" }
  }
  var m = matchMode(q, config)
  return m ? { label: m.label, icon: m.icon, hint: m.hint } : null
}

// ---------------------------------------------------------------- help
//
// "?" is a small help browser driven by the query:
//   ?          one row per topic
//   ?units     that topic's examples, each with its live answer
//   ?money     examples from every topic that match the words
// Providers describe themselves with `help`: [{ id, title, about, icon?,
// examples: ["5 km to mi", { q: "kill ", note: "..." }, { q: "brave", hint: "..." }] }]
// (or a function of ctx returning that).

var HELP_ORDER = ["apps", "windows", "omarchy", "toggles", "calc", "units", "currency", "time", "dates", "emoji", "kill", "system", "clipboard", "files", "devtools"]

function helpTopics(config, services) {
  var topics = []
  var list = enabledProviders(config)
  for (var i = 0; i < list.length; i++) {
    var p = list[i]
    var entries = p.help
    if (typeof entries === "function") {
      try { entries = entries(contextFor(p, config, services)) }
      catch (e) { console.warn("nodi: help for " + p.id + " failed: " + e); entries = [] }
    }
    // The provider's command keywords make its topics findable by the words
    // people use for them ("?money" finds Currency).
    var keywords = ""
    var cmds = p.commands
    if (typeof cmds === "function") {
      try { cmds = cmds(contextFor(p, config, services)) } catch (e2) { cmds = [] }
    }
    for (var c = 0; cmds && c < cmds.length; c++) keywords += " " + (cmds[c].keywords || "")
    for (var j = 0; entries && j < entries.length; j++) {
      var h = entries[j]
      var examples = (h.examples || []).map(function(x) { return typeof x === "string" ? { q: x } : x })
      topics.push({ id: h.id || p.id, title: h.title || p.name, about: h.about || "", icon: h.icon || p.icon || "", examples: examples, keywords: keywords })
    }
  }
  topics.push(SHORTCUTS)
  function rank(t) {
    var n = HELP_ORDER.indexOf(t.id)
    return t.id === "keywords" ? 1000 : t.id === "shortcuts" ? -1 : (n === -1 ? 500 : n)
  }
  return topics.sort(function(a, b) { return rank(a) - rank(b) })
}

// Nodi's own keys, first in help: nothing else says them in the bar.
var SHORTCUTS = { id: "shortcuts", title: "Keys", icon: "󰌌", about: "What each key does in Nodi", keywords: "keys keyboard shortcuts scroll page",
  examples: [
    { key: "Enter", does: "Run the row; a second Enter where it asks" },
    { key: "Ctrl Enter", does: "Copy what the row holds" },
    { key: "Ctrl K", does: "The row's other actions" },
    { key: "Tab", does: "Fill the row in, or ask Claude" },
    { key: "Ctrl 1-9", does: "Run one of the first nine rows" },
    { key: "󰁝 󰁅  Ctrl N P", does: "Move in the list" },
    { key: "PgUp PgDn", does: "A page of the list" },
    { key: "Shift 󰁝 󰁅", does: "Scroll the pane beside the list" },
    { key: "Shift PgUp PgDn", does: "A page of the pane" },
    { key: "Ctrl D U", does: "Half a page of the pane, while one is up" },
    { key: "Esc", does: "Clear, then close" }
  ] }

// What an example answers right now: "3.1069 mi", "Firefox". Requests only
// look at what is held, so browsing help never fetches rates or lists
// processes.
function preview(q, config, services) {
  var quiet = {}
  for (var k in services) quiet[k] = services[k]
  quiet.request = services.request ? function(name, param) { return services.request(name, param, { fetch: false }) } : null
  var rows = run(q, config, quiet)
  var top = rows[0]
  if (!top || top.help || !(top.copy || top.run)) return ""
  return (top.provider === "emoji" ? top.icon + " " : "") + top.title
}

function helpRow(fields) {
  var row = { provider: "help", providerName: "Help", icon: "", iconFont: "", image: "", swatch: "", title: "", subtitle: "",
              badge: "", badgeTone: "", confirm: false, toggle: "", copy: "", run: null, complete: "", select: false,
              actionLabel: "", actions: [], score: 0, group: "Help", help: true, key: "" }
  for (var k in fields) row[k] = fields[k]
  if (!row.key) row.key = "help:" + row.title
  return row
}

function exampleRow(topic, ex, config, services) {
  // A key of Nodi's own: what it does, the key beside it; nothing to fill in.
  if (ex.key) return helpRow({ icon: topic.icon, title: ex.does, badge: ex.key, group: topic.title, helpTopic: topic.id, key: "help:key:" + ex.key })
  var answer = ex.note ? "" : preview(ex.q, config, services)
  return helpRow({
    icon: topic.icon,
    title: ex.q.trim() || ex.q,
    subtitle: ex.note || (answer ? "= " + answer : (ex.hint || "")),
    complete: ex.q,
    // An example with a live answer comes in selected, so typing replaces
    // it; a mode prefix ("w ", ":") leaves the cursor at the end.
    select: !ex.note && /\S$/.test(ex.q),
    actionLabel: "Fill in",
    group: topic.title,
    helpTopic: topic.id
  })
}

function help(text, config, services) {
  var topics = helpTopics(config, services)
  var t = String(text || "").trim().toLowerCase()
  var rows = []
  var i, j

  if (!t) {
    for (i = 0; i < topics.length; i++) {
      // Examples, not a sentence about them (item 25).
      var shown = topics[i].examples.slice(0, 3).map(function(x) { return String(x.key || x.q).trim() }).filter(function(q) { return q })
      rows.push(helpRow({ icon: topics[i].icon, title: topics[i].title, subtitle: shown.length ? shown.join(", ") : topics[i].about,
                          complete: "?" + topics[i].id, actionLabel: "Show" }))
    }
    rows = group(rows)
    if (rows.length > 0) rows[0].section = ""   // the chip already says Help
    return rows
  }

  for (i = 0; i < topics.length; i++) {
    if (topics[i].id === t) {
      for (j = 0; j < topics[i].examples.length; j++) rows.push(exampleRow(topics[i], topics[i].examples[j], config, services))
      return group(rows)
    }
  }

  // Search: every word has to start a word of the topic or the example.
  var qw = Match.words(t)
  for (i = 0; i < topics.length; i++) {
    var topic = topics[i]
    var topicText = Match.words(topic.id + " " + topic.title + " " + topic.about + " " + topic.keywords)
    for (j = 0; j < topic.examples.length; j++) {
      var ex = topic.examples[j]
      if (Match.prefixesAll(qw, topicText.concat(Match.words((ex.q || ex.key || "") + " " + (ex.note || ex.does || "")))))
        rows.push(exampleRow(topic, ex, config, services))
    }
  }
  if (rows.length === 0)
    return [helpRow({ icon: "󰋖", title: "No topic matches \"" + t + "\"", subtitle: "Esc: all topics", section: "" })]
  return group(rows)
}

function helpTopicTitle(text, config, services) {
  var t = String(text || "").trim().toLowerCase()
  var topics = helpTopics(config, services)
  for (var i = 0; i < topics.length; i++) if (topics[i].id === t) return topics[i].title
  return ""
}

// ---------------------------------------------------------------- commands
//
// Every feature is findable from the search box: providers list `commands`
// (array, or function of ctx), and a query whose words start the command's
// title or keywords shows it ("emo" finds Search emoji). They rank below
// real answers, so "2+2" still leads with 4.

// Where your settings live: keywords, snippets, the hotkey, the providers.
function settingsPath(home) { return String(home || "") + "/.config/omarchy/extensions/nodi.json" }

function builtinCommands(services) {
  var out = [
    { title: "Show everything", keywords: "help commands list all features show", text: "Every feature and keyword, with examples", complete: "?", icon: "󰋖" }
  ]
  if (services && services.home)
    out.push({ title: "Nodi settings", keywords: "nodi settings config configure preferences nodi.json keywords snippets hotkey edit",
               text: "nodi.json in your editor", icon: "󰒓", kind: "setting", run: Run.exec(["omarchy-launch-editor", settingsPath(services.home)]) })
  return out
}

function commandRows(query, config, services, existing) {
  var q = Match.normalise(query)
  var qw = Match.words(q)
  if (q.length < 2 || qw.length === 0) return []
  var memory = memoryOf(services, query)

  var seen = {}
  for (var e = 0; e < existing.length; e++) seen[existing[e].provider + "|" + existing[e].title.replace(/\.\.\.$/, "").toLowerCase()] = true

  var sources = enabledProviders(config).map(function(p) { return { p: p, list: p.commands } })
  sources.push({ p: { id: "nodi", name: "Nodi", icon: "󰋖" }, list: builtinCommands(services) })

  var rows = []
  for (var i = 0; i < sources.length; i++) {
    var p = sources[i].p
    var list = sources[i].list
    if (typeof list === "function") {
      try { list = list(contextFor(p, config, services)) }
      catch (err) { console.warn("nodi: commands for " + p.id + " failed: " + err); list = [] }
    }
    for (var j = 0; list && j < list.length; j++) {
      var c = list[j]
      var t = Score.tier(q, { name: c.title, keywords: c.keywords || "" })
      if (!t || t === "fuzzy") continue
      if (seen[p.id + "|" + c.title.replace(/\.\.\.$/, "").toLowerCase()]) continue        // the provider already answered it
      if (c.complete && Match.normalise(c.complete) === q) continue    // already in that mode
      rows.push(Rows.normalize({
        key: "command:" + p.id + ":" + c.title,
        icon: c.icon || p.icon || "",
        title: c.title,
        subtitle: c.text || p.name,
        group: "Commands",
        copy: "",
        run: c.run || null,
        complete: c.complete || "",
        select: !!c.select,
        remember: c.remember !== false,
        // A hint fills the query in; any app or action named as well ranks
        // above it (lib/Score.js, kind "hint").
        tier: t,
        kind: c.kind || (c.run ? "action" : "hint")
      }, p, i, j, memory))
    }
  }
  return rows
}

// ---------------------------------------------------------------- run

function memoryOf(services, query) {
  return { history: services.history || {}, picks: services.picks || {}, query: Match.normalise(query || ""),
           now: (services.now ? services.now() : new Date()).getTime() }
}

function collect(list, q, config, services) {
  var memory = memoryOf(services, q)
  var rows = []
  for (var order = 0; order < list.length; order++) {
    var p = list[order]
    var results
    try {
      results = p.match(q, contextFor(p, config, services)) || []
    } catch (e) {
      console.warn("nodi: provider " + p.id + " failed: " + e)
      continue
    }
    for (var r = 0; r < results.length; r++) rows.push(Rows.normalize(results[r], p, order, rows.length, memory))
  }
  return rows
}

// What an empty bar shows: the rows run most, most recently (from the
// snapshots history keeps), then today's reminders. Raycast and PowerToys
// open on the same: a home, not a blank.
var HOME_LIMIT = 8

// A saved row (a favourite, an alias, a hotkey, a recent or hidden one) as
// its provider gives it now: a provider with `resolve(key, ctx)` rebuilds
// the row from its key, so a renamed app or a changed description shows as
// it is, the way GNOME's dash and Vicinae keep favourites by id. Null when
// no provider answers the key with a row that runs; the snapshot stands.
function resolve(key, s, config, services) {
  var id = s && s.provider
  var list = enabledProviders(config)
  for (var i = 0; i < list.length; i++) {
    var p = list[i]
    if (p.id !== id || typeof p.resolve !== "function") continue
    var raw
    try { raw = p.resolve(key, contextFor(p, config, services), s) }
    catch (e) { console.warn("nodi: resolve for " + p.id + " failed: " + e); return null }
    if (!raw) return null
    var row = Rows.normalize(raw, p, i, 0)
    return row.key === key && row.run ? row : null
  }
  return null
}

// A row from a snapshot (lib/History.js), as the home, an alias and the
// hidden list show one: the row as it is now when its provider can say,
// else the snapshot with its run checked again and a toggle's state as it
// is now.
function snapshotRow(key, s, group, score, config, services, seq) {
  var live = resolve(key, s, config, services)
  if (live) {
    live.group = group
    live.score = score
    live.order = 0
    live.seq = seq
    // A saved row stays one: Ctrl+K can still unsave, hide or rebind it
    // when its provider would not remember it now (a snippet given a
    // placeholder since). The home has no pane and no argument line, as
    // before (Fable 2026-10-04).
    live.remember = true
    live.preview = null
    live.hint = ""
    return live
  }
  var row = { key: key, title: s.title, subtitle: s.subtitle, icon: s.icon, iconFont: s.iconFont, image: s.image,
              kind: s.kind || "item", score: score, copy: "", run: s.run, confirm: s.confirm, confirmWord: s.confirmWord, risk: s.risk,
              actionLabel: s.actionLabel, toggle: s.toggle, group: group }
  if (s.toggle) {
    var b = Toggles.badge((services.toggleStates || {})[s.toggle])
    row.badge = b.text
    row.badgeTone = b.tone
  }
  return Rows.normalize(row, { id: s.provider || "recent", name: group }, 0, seq)
}

function home(config, services) {
  var rows = []
  var history = services.history || {}
  var prefs = services.prefs || null
  var nowMs = (services.now ? services.now() : new Date()).getTime()
  // Favourites first, then what is run most; nothing hidden.
  var favs = prefs ? prefs.favourites : []
  for (var f = 0; f < favs.length; f++) {
    var fr = snapshotRow(favs[f].key, favs[f].s, "Favourites", 200 - f, config, services, rows.length)
    if (fr.run && !Prefs.isHidden(prefs, fr.key)) rows.push(fr)
  }
  var keys = Object.keys(history).filter(function(k) { return history[k].s && !Prefs.isFavourite(prefs, k) && !Prefs.isHidden(prefs, k) })
  keys.sort(function(a, b) { return Score.frecency(history[b], nowMs) - Score.frecency(history[a], nowMs) })
  // Counted on their own: a hidden favourite is not shown, so it cannot
  // stand for a recent row (codex 2026-10-04).
  var recent = 0
  for (var i = 0; i < keys.length && recent < HOME_LIMIT; i++) {
    var n = snapshotRow(keys[i], history[keys[i]].s, "Recent", 100 - rows.length, config, services, rows.length)
    if (n.run) { rows.push(n); recent++ }
  }
  var reminders = Array.isArray(services.reminders) ? services.reminders : []
  for (var r = 0; r < reminders.length && r < 5; r++) {
    var m = reminders[r]
    rows.push(Rows.normalize({ key: "reminder:" + (m.unit || r), title: String(m.label || "Reminder"),
      subtitle: "In " + String(m.remaining || "") + (m.atTime ? ", at " + m.atTime : ""), icon: "󰂚", score: 50 - r,
      copy: "", remember: false, group: "Reminders", run: Run.exec(["omarchy-reminder", "show"]) },
      { id: "system", name: "Reminders" }, 1, rows.length))
  }
  return group(rows)
}

// While an alias is being made for `row`: the one row Enter saves it with.
function aliasPrompt(typed, row) {
  var word = Prefs.normalise(typed)
  return [Rows.normalize({
    key: "nodi:alias", title: word || "Alias", subtitle: "Alias for " + row.title, icon: "󰌌", score: 100, copy: "",
    hint: "<word> for " + row.title,
    nodi: word ? "saveAlias" : "", actionLabel: word ? "Save" : "", remember: false, group: "Alias"
  }, { id: "nodi", name: "Alias" }, 0, 0)]
}

// While a row waits for its confirm word (`w`: { title, word, run, risk }):
// the one row, which runs only once the word is typed as given.
function wordPrompt(typed, w) {
  var right = String(typed).trim() === w.word
  return [Rows.normalize({
    key: "nodi:word", title: right ? "Run " + w.title : "Type " + w.word + " to run " + w.title,
    subtitle: w.risk || Run.describe(w.run).split("\n")[0], icon: "󰀦", score: 100, copy: "",
    hint: w.word, nodi: right ? "runWord" : "", actionLabel: right ? "Run" : "", remember: false, group: "Confirm"
  }, { id: "nodi", name: "Confirm" }, 0, 0)]
}

// While a hotkey is being set for `row`: one row that says what to press,
// or what holds the chord just pressed.
function hotkeyPrompt(row, note) {
  return [Rows.normalize({
    key: "nodi:hotkey", title: note ? note + "; press other keys" : "Press the keys for " + row.title,
    subtitle: row.subtitle, icon: "󰌌", score: 100, copy: "", remember: false, group: "Hotkey"
  }, { id: "nodi", name: "Hotkey" }, 0, 0)]
}

// When nothing answers a query: what can still be done with the words,
// in the order "fallbacks" gives (research 2). "keywords": every keyword
// that takes one argument, run on the query; "scripts": each script command
// that takes one text argument, run on it (not in the default list); "find": the files under home named so;
// "ask": the question for Claude (providers/ask.js).
function fallbackRows(q, config, services) {
  var text = String(q).trim()
  var order = Array.isArray(config.fallbacks) ? config.fallbacks : ["keywords", "find"]
  var raw = []
  for (var i = 0; i < order.length; i++) {
    if (order[i] === "keywords") {
      var cmds = Keywords.list(config.keywords).filter(Keywords.fallsBack)
      for (var k = 0; k < cmds.length; k++) {
        var run = Keywords.build(cmds[k], text)
        raw.push({ key: "fallback:" + cmds[k].keyword, title: (cmds[k].title || cmds[k].keyword) + ": " + text,
                   subtitle: Keywords.describe(run, cmds[k]), icon: cmds[k].icon || (cmds[k].open ? "󰖟" : "󰆍"),
                   copy: text, run: run, remember: false })
      }
    } else if (order[i] === "scripts") {
      raw = raw.concat(Scripts.fallbacks(text, contextFor(Scripts.provider, config, services)))
    } else if (order[i] === "find") {
      raw.push({ key: "fallback:find", title: "Find files named " + text, subtitle: "Files under home", icon: "󰍉",
                 copy: "", complete: "find " + text, remember: false })
    } else if (order[i] === "ask") {
      // Fills `ask` in, so asking takes a second Enter, never a mistyped app's.
      raw.push({ key: "fallback:ask", title: "Ask: " + text, subtitle: "Claude", icon: "󰚩",
                 copy: "", complete: "ask " + text, remember: false })
    }
  }
  return raw.map(function(r, n) {
    r.score = 50 - n * 0.01
    r.group = "Search instead"
    return Rows.normalize(r, { id: "fallback", name: "Search instead" }, 0, n)
  })
}

// The rows you hid, each shown again by Enter.
function hiddenRows(prefs, config, services) {
  return group(prefs.hidden.map(function(h, i) {
    var r = snapshotRow(h.key, h.s, "Hidden", 100 - i, config, services, i)
    r.nodi = "show"
    r.actionLabel = "Show again"
    r.confirm = false
    return r
  }))
}

function run(query, config, services) {
  var q = String(query || "")
  services = services || {}
  var prefs = services.prefs || null
  if (!q.trim()) return home(config, services)
  if (/^\s*\?/.test(q)) return help(q.replace(/^\s*\?/, ""), config, services)
  if (prefs && prefs.hidden.length > 0 && /^\s*hidden\s*$/i.test(q)) return hiddenRows(prefs, config, services)

  var owner = matchMode(q, config)
  var owned = !!(owner && owner.exclusive)
  var rows = collect(owned ? [owner.provider] : enabledProviders(config), q, config, services)
  if (owned && rows.length === 0) {
    owned = false
    rows = collect(enabledProviders(config), q, config, services)
  }
  if (!owned) rows = rows.concat(commandRows(q, config, services, rows))

  if (prefs) rows = rows.filter(function(r) { return !Prefs.isHidden(prefs, r.key) })
  if (rows.length === 0 && !owned && !(prefs && Prefs.aliasFor(prefs, q))) rows = fallbackRows(q, config, services)

  if (prefs) {
    // Your alias, typed whole, names its row first, made from its snapshot
    // when no provider answers the alias itself.
    var alias = Prefs.aliasFor(prefs, q)
    if (alias && !Prefs.isHidden(prefs, alias.key)) {
      var top = rows.filter(function(r) { return r.key === alias.key })[0] || snapshotRow(alias.key, alias.s, "Alias", 0, config, services, 0)
      top.score = rows.reduce(function(m, r) { return Math.max(m, r.score) }, 0) + 1000
      rows = [top].concat(rows.filter(function(r) { return r !== top && r.key !== alias.key }))
    }
  }

  rows.sort(function(a, b) {
    if (b.score !== a.score) return b.score - a.score
    if (a.order !== b.order) return a.order - b.order
    return a.seq - b.seq
  })
  return group(rows)
}

// What the empty field suggests: one example per open, of a provider that
// is on, so the placeholder teaches a feature at a time and never one that
// is off (his pick, 2026-10-04). tests/js/answers.test.mjs checks each is
// answered by its own provider. None may do harm on Enter: "kill chrome"
// quit six headless browsers a service kept, unasked (Fable 2026-10-04).
var EXAMPLES = [
  { provider: "currency", q: "100 usd to eur" },
  { provider: "emoji", q: ":fire" },
  { provider: "time", q: "time in tokyo" },
  { provider: "menu", q: "dark mode" },
  { provider: "clipboard", q: "cb" },
  { provider: "units", q: "5 km in miles" },
  { provider: "dev", q: "ports" },
  { provider: "system", q: "vol 40" },
  { provider: "math", q: "15% of 240" },
  { provider: "devtools", q: "uuid" }
]

function placeholder(config, n) {
  var on = Object.create(null)
  var list = enabledProviders(config)
  for (var i = 0; i < list.length; i++) on[list[i].id] = true
  var ok = EXAMPLES.filter(function(e) { return on[e.provider] })
  if (ok.length === 0) return "Search"
  var k = Math.floor(Number(n) || 0)
  return "Search, or try \"" + ok[((k % ok.length) + ok.length) % ok.length].q + "\""
}

// Providers whose top row is the answer itself, shown large.
var ANSWERS = { math: true, currency: true, units: true, time: true }

// Keeps each group together, in the order of its best row, and labels the
// first row of each. A hero answer stands on its own, so the rest of its
// group gets its own label underneath.
function group(rows) {
  var order = []
  var byGroup = Object.create(null)    // a group may be named "constructor"
  for (var i = 0; i < rows.length; i++) {
    var g = rows[i].group || rows[i].providerName
    if (!byGroup[g]) { byGroup[g] = []; order.push(g) }
    byGroup[g].push(rows[i])
  }
  var out = []
  for (var o = 0; o < order.length; o++) {
    for (var j = 0; j < byGroup[order[o]].length; j++) {
      var row = byGroup[order[o]][j]
      // A header only over a group of more than one row (his look, item 24).
      row.section = j === 0 && byGroup[order[o]].length > 1 ? order[o] : ""
      row.hero = false
      out.push(row)
    }
  }
  if (out.length > 0 && ANSWERS[out[0].provider] && out[0].copy) {
    out[0].hero = true
    out[0].section = ""
    // Only for the hero's own group: a row of another group is not labelled
    // with the hero's name (Fable 2026-10-04).
    if (out.length > 1 && !out[1].section && out[1].group === out[0].group) out[1].section = out[0].group
  }
  return out
}
