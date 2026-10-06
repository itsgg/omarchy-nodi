.pragma library
.import "Run.js" as Run
.import "Prefs.js" as Prefs
.import "Score.js" as Score
.import "History.js" as History
.import "WindowClass.js" as WindowClass

// The row contract. A provider returns plain objects; normalize() gives every
// row the same fields so the UI never guesses.
//
//   title, subtitle      what the row says
//   icon, iconFont       a glyph, and the font it needs when not the menu's
//   image                an icon theme name or an absolute path, drawn instead
//   swatch               "#RRGGBB", a colour sample drawn instead
//   hint                 the words a row takes, shown under the field while
//                        it is selected: "hello <name> [tone]" (item 25)
//   preview              what the pane beside the list shows for the row:
//                        { title, subtitle, text, mono, image, labels }
//   imageFill            the image is a thumbnail (a theme's preview, a
//                        picture): it fills the tile, where an app's icon
//                        sits inset on the plate
//   badge, badgeTone     a short label at the right ("ON", "Current"), tone
//                        "on" for the accent colour, "" for plain
//   tier, kind           how well the query names the row, and what the row
//                        is (lib/Score.js); the score is worked out from them
//   score                for a row of an explicit mode only, a fixed number
//                        in place of tier and kind
//   remember             false for a row whose key names a moment, not a
//                        thing (a clipboard position, a pid, a window): it
//                        is not learned from and history does not lift it
//   habitKey, offset     whose history lifts the row (an app's action rows
//                        follow the app), and a fraction to order rows that
//                        tie (a submenu just under its best child)
//   run                  what Enter does (lib/Run.js)
//   copy                 what Enter copies when there is no run; defaults to
//                        the title, "" for a row that does nothing
//   complete, select     what Tab fills in, and whether it comes in selected
//   confirm              Enter arms the row and a second Enter runs it
//   confirmWord          instead, the word to type before it runs: Enter
//                        asks for it, and only that word, typed, runs the
//                        row (a confirm row; one to 40 characters, no space)
//   risk                 what running it may cost, in the provider's words,
//                        shown with the command in the pane
//   undoable             Nodi runs it and reads what it prints, whose last
//                        line may name its undo (lib/Undo.js); an exec run
//                        only, which must end within two minutes
//   showsCommand         its provider wants the exact command seen before
//                        anything of the row runs that asks first (a
//                        script filter's): the row's own run, or a Ctrl+K
//                        action's (lib/Pane.js)
//   toggle               the toggle id whose state Enter flips at once
//   actions              extra Ctrl+K actions: [{ label, icon, run, confirm }]
//   key                  identity for confirmation; defaults to provider:title
//   group                the section; defaults to the provider's name

function cleanActions(list) {
  var out = []
  if (!Array.isArray(list)) return out
  for (var i = 0; i < list.length; i++) {
    var a = list[i]
    if (!a || !a.label || !Run.valid(a.run)) continue
    var word = confirmWordOf(a.confirmWord)
    out.push({ label: String(a.label), icon: a.icon || "", run: a.run, confirm: !!a.confirm || !!word, confirmWord: word, risk: riskOf(a.risk),
               undoable: !!a.undoable && a.run.kind === "exec" })
  }
  return out
}

function confirmWordOf(w) { return typeof w === "string" && /^\S{1,40}$/.test(w) ? w : "" }
function riskOf(r) { return typeof r === "string" ? r.slice(0, 500) : "" }

// `memory` is { history: { key: { n, t } }, now: ms }; without it a row
// carries no habit.
function normalize(row, provider, order, seq, memory) {
  var run = row.run || null
  if (run && !Run.valid(run)) {
    console.warn("nodi: " + provider.id + " returned a bad run for \"" + row.title + "\": " + Run.problem(run))
    run = null
  }
  var key = String(row.key || (provider.id + ":" + (row.title || "")))
  var kind = row.kind || (typeof row.score === "number" ? "mode" : "item")
  var base = typeof row.score === "number" ? row.score : Score.score(row.tier || "", kind)
  var history = memory && memory.history ? memory.history : {}
  var remember = row.remember !== false
  var lift = memory && remember ? Score.habit(history[row.habitKey || key], memory.now) + Score.recall(memory.picks, memory.query, key, memory.now) : 0
  // Two rows found through the same typo: the shorter title is the closer
  // ("screnshot" is Screenshot before Screenshot of a Region).
  // Under 0.09, so with any habit it stays inside the 2 between tiers.
  if (Score.loose(row.tier)) lift -= Math.min(0.09, String(row.title || "").length * 0.002)
  // Among rows named as well, the one the query fits closer (Score.fit):
  // on a clean match only, and not where the provider orders its rows
  // itself (an answer's, a mode's, windows by recency; Fable 2026-10-05).
  if (row.tier && !Score.loose(row.tier) && kind !== "answer" && kind !== "mode" && !provider.keepsOrder && memory && memory.query)
    lift += Score.FIT_MAX * Score.fit(row.fitQuery || memory.query, row.title)
  return {
    key: key,
    kind: kind,
    tier: row.tier || "",
    remember: remember,
    provider: provider.id,
    providerName: provider.name,
    icon: row.icon || provider.icon || "",
    iconFont: row.iconFont || "",
    image: row.image || "",
    imageFill: !!row.imageFill,
    preview: row.preview && typeof row.preview === "object" ? row.preview : null,
    swatch: row.swatch || "",
    title: String(row.title || ""),
    subtitle: String(row.subtitle || ""),
    hint: row.hint ? String(row.hint) : "",
    badge: row.badge ? String(row.badge) : "",
    badgeTone: row.badgeTone || "",
    confirm: (!!row.confirm || !!confirmWordOf(row.confirmWord)) && !!run,
    confirmWord: run ? confirmWordOf(row.confirmWord) : "",
    risk: riskOf(row.risk),
    showsCommand: !!row.showsCommand,
    undoable: !!row.undoable && !!run && run.kind === "exec",
    toggle: row.toggle || "",
    copy: row.copy === undefined ? String(row.title || "") : String(row.copy),
    run: run,
    complete: row.complete || "",
    select: !!row.select,
    // A paste says where it lands (pasteTarget).
    actionLabel: row.actionLabel === "Paste" && memory && memory.pasteInto ? "Paste into " + memory.pasteInto : (row.actionLabel || ""),
    // Something Nodi does itself on Enter, not a command: "saveAlias",
    // "show" (lib/Prefs.js). Nodi.qml acts on it before the run.
    nodi: typeof row.nodi === "string" ? row.nodi : "",
    // What the query might not mean (a bare "main.cc" as a site): the
    // fallbacks still come under it (lib/Engine.js).
    guess: !!row.guess,
    // What "askWith" asks Claude: the question the bar shows, the message
    // the session gets, and what it is about ("selection" or none;
    // providers/selection.js, providers/translate.js).
    ask: row.ask && typeof row.ask === "object" ? { question: String(row.ask.question || ""), message: String(row.ask.message || ""),
                                                    context: String(row.ask.context || "") } : null,
    actions: cleanActions(row.actions),
    score: base + lift + (row.offset || 0),
    group: row.group || provider.name,
    order: order,
    seq: seq
  }
}

// An absolute path as a file URL, each part encoded: a name with "#" or "?"
// in it ("shot #2.png") read as a fragment or a query and never loaded
// (Fable 2026-10-04).
function fileUrl(path) {
  return "file://" + String(path).split("/").map(encodeURIComponent).join("/")
}

// A preview that names a read ({ source, param }) with what the read gave:
// size, time and type as labels, the text when it is text. `got` is what
// ctx.request answers; while it is pending the preview is its header.
function withRead(preview, got, formatTime) {
  var out = {}
  for (var k in preview) if (k !== "read") out[k] = preview[k]
  out.labels = [].concat(preview.labels || [])
  var v = got && got.value
  if (got && got.state === "error" && !v) { out.labels.push(["", "Cannot read it"]); return out }
  if (!v) return out
  out.labels.push(["Size", size(v.size)])
  if (v.modified) out.labels.push(["Modified", formatTime ? formatTime(v.modified * 1000) : new Date(v.modified * 1000).toISOString().slice(0, 16).replace("T", " ")])
  if (v.type) out.labels.push(["Type", v.type])
  if (v.text) { out.text = v.text; out.mono = true }
  return out
}

function size(bytes) {
  var n = Number(bytes) || 0
  if (n < 1024) return n + " B"
  if (n < 1024 * 1024) return (Math.round(n / 102.4) / 10) + " KB"
  return (Math.round(n / (1024 * 102.4)) / 10) + " MB"
}

// What Enter does to a row, for the footer: "Open", "Switch", "Copy".
function actionLabel(row) {
  if (!row) return ""
  if (row.actionLabel) return row.actionLabel
  if (row.run) return Run.verb(row.run)
  // It fills the field in; Enter on it again then does what it says.
  if (row.complete && !row.copy) return "Fill in"
  if (row.copy) return "Copy"
  return ""
}

// Where a paste lands, named as a row says it ("Paste into Chromium"): the
// window the bar opened over, by its app's name or its class made readable
// (WindowClass.nameForClass); "" when no window is known (ROADMAP 56).
function pasteTarget(win, apps) {
  var cls = String((win && win["class"]) || "")
  return cls ? WindowClass.nameForClass(cls, apps) : ""
}

// Tab fills the query in when that is something other than what Enter does.
function canComplete(row) {
  return !!row && !!row.complete && !!(row.run || row.copy)
}

function shorten(text, max) {
  var s = String(text || "").replace(/\s+/g, " ").trim()
  return s.length > max ? s.slice(0, max - 3) + "..." : s
}

// Ctrl+K: the row's own action first, then what its provider added, then
// what any row of its kind can do. Every entry carries a run that Enter
// would accept, so the palette and the row share one path.
// An action is a run, or a `nodi` verb Nodi does itself ("forget": reset
// this row's ranking).
function actionsFor(row, ctx) {
  var out = []
  var seen = Object.create(null)
  function add(label, icon, run, confirm, word, risk, undoable) {
    if (!run || !Run.valid(run) || seen[label]) return
    seen[label] = true
    out.push({ label: label, icon: icon || "", run: run, confirm: !!confirm || !!word, confirmWord: word || "", risk: risk || "",
               undoable: !!undoable && run.kind === "exec" })
  }
  // Nodi's own rows (an alias being saved, a hidden row shown again) have
  // the one action Enter takes.
  if (!row || row.nodi) return out
  if (row.run) add(actionLabel(row), row.icon, row.run, row.confirm, row.confirmWord, row.risk, row.undoable)
  for (var i = 0; i < row.actions.length; i++) {
    var x = row.actions[i]
    add(x.label, x.icon, x.run, x.confirm, x.confirmWord, x.risk, x.undoable)
  }

  if (row.run && row.run.kind === "window") {
    var ws = ctx && ctx.activeWorkspace !== undefined && ctx.activeWorkspace !== null ? ctx.activeWorkspace : null
    if (ws !== null) add("Bring to this workspace", "󰍹", Run.bringWindow(row.run.address, ws))
    add("Toggle floating", "󰉈", Run.floatWindow(row.run.address))
    add("Close window", "󰅙", Run.closeWindow(row.run.address))
  }
  if (row.run && row.run.kind === "app" && (row.run.action === undefined || row.run.action === null)) {
    add("Copy desktop id", "󰆏", Run.copy(row.run.id))
    // As Omarchy's launcher removes one: a web app, a TUI, a launcher of
    // your own, or the package, in Omarchy's floating terminal for sudo.
    // One it cannot remove says so, where the launcher's stays silent. To a
    // file, not a pipe: the package path's terminal inherits what it is
    // given and would hold a pipe open for its whole life, and a cancelled
    // sudo there is the terminal's to show, not a failure (Fable 2026-10-02).
    add("Uninstall", "󰆴", Run.exec(["bash", "-c",
      't=$(mktemp); omarchy-remove-launcher-entry "$1" "$2" >"$t" 2>&1; s=$?; out=$(cat "$t"); rm -f "$t"; '
      + '[ "$s" -eq 0 ] || [ -z "$out" ] || notify-send -a Nodi "Could not uninstall $2" "$out"',
      "nodi-uninstall", row.run.id, String(row.title || row.run.id)]), true)
  }
  if (row.copy && !(row.run && row.run.kind === "copy"))
    add("Copy " + shorten(row.copy, 40), "󰆏", Run.copy(row.copy))
  if (row.title && row.title !== row.copy && !(row.run && row.run.kind === "app"))
    add("Copy title", "󰆏", Run.copy(row.title))
  if (ctx && ctx.knows && ctx.knows(row.key)) out.push({ label: "Reset ranking", icon: "󰑓", nodi: "forget", confirm: false })
  // Yours to set on a row that can be run again from a snapshot (lib/Prefs.js);
  // a moment's row (a sum's answer, a kill) never is (lib/History.js).
  if (ctx && ctx.prefs && row.run && row.remember && !row.nodi && !History.moment({ provider: row.provider })) {
    out.push({ label: Prefs.isFavourite(ctx.prefs, row.key) ? "Remove from favourites" : "Add to favourites", icon: "\u2605", nodi: "favourite", confirm: false })
    out.push({ label: "Add alias", icon: "󰌌", nodi: "alias", confirm: false })
    // A row that asks twice gets no hotkey and no link, which would run it
    // at once (Fable 2026-10-02).
    var chord = Prefs.hotkeyOf(ctx.prefs, row.key)
    if (!row.confirm) {
      out.push({ label: chord ? "Change hotkey (" + chord + ")" : "Set hotkey", icon: "󰌌", nodi: "hotkey", confirm: false })
      out.push({ label: "Copy deeplink", icon: "󰆏", nodi: "link", confirm: false })
    }
    if (chord) out.push({ label: "Remove hotkey", icon: "󰌌", nodi: "unhotkey", confirm: false })
    var mine = Prefs.aliasesOf(ctx.prefs, row.key)
    for (var a = 0; a < mine.length; a++) out.push({ label: "Remove alias \"" + mine[a] + "\"", icon: "󰌌", nodi: "unalias", alias: mine[a], confirm: false })
    out.push({ label: "Hide", icon: "󰘓", nodi: "hide", confirm: false })
  }
  return out
}
