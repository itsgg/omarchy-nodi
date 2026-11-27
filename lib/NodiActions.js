.pragma library
.import "Prefs.js" as Prefs
.import "History.js" as History
.import "Pick.js" as Pick
.import "Conversations.js" as Conversations
.import "PromptContext.js" as PromptContext
.import "../providers/answers.js" as Answers

// Enter on a row whose action is Nodi's own (Nodi.qml doNodi): what it does,
// as a list of effects Nodi applies in order. `s` is what the bar holds as
// Enter lands:
//   { query, now, prefs, aliasRow, wordAsk, armedKey, selection, cameFrom,
//     answers (config.answers), conversations, pickSession, askBusy,
//     proposal (Ask's), shooting (a window picture on its way),
//     resultAction(index), answer: { message, keyword, question,
//     conversation }, screens() -> { focused, all } }
// An effect is one of
//   { do: "set", key, value }           a property of the bar's
//   { do: "text", text, cursor }        the field, the cursor to its end
//   { do: "recompute" }
//   { do: "call", on, fn, args, need, then }
// where a call is made on the bar, or on Ask ("ask"), the streamed answer
// ("answer"), the tray ("tray") or the window picture's reader ("shot");
// `need` ends the list when it returns nothing, and `then` runs only when
// it returns something.

function call(fn, args, extra) {
  var e = { do: "call", on: "", fn: fn, args: args || [] }
  for (var k in extra || {}) e[k] = extra[k]
  return e
}
function on(target, fn, args, extra) {
  var e = call(fn, args, extra)
  e.on = target
  return e
}
function set(key, value) { return { do: "set", key: key, value: value } }
function text(t, cursor) { return { do: "text", text: t, cursor: cursor === true } }
var RECOMPUTE = { do: "recompute" }

// The window's picture for an Ask about it: its ext-foreign-toplevel handle
// (grim -T), 1280 pixels wide at most, at its own monitor's scale, else the
// focused one's (Fable 2026-10-06: grim scales the window's buffer, which is
// its layout width times that scale).
function shotArgv(w, screens) {
  var mon = screens.focused
  var mons = screens.all || []
  for (var mi = 0; mi < mons.length; mi++) if (mons[mi].id === w.monitor) mon = mons[mi]
  var ms = mon && mon.lastIpcObject && Number(mon.lastIpcObject.scale) > 0 ? Number(mon.lastIpcObject.scale) : 1
  var px = w.width * ms
  var scale = px > 1280 ? (1280 / px).toFixed(3) : "1"
  return ["/usr/bin/bash", "-c", 'set -o pipefail; grim -T "$1" -s "$2" -t jpeg -q 80 - | base64 -w0', "nodi-shot", w.stableId, scale]
}

// A selection's text goes with an Ask about it in its own variable.
function selectionEnv(ask, selection) {
  return ask.context === "selection" && selection ? { NODI_SELECTION: selection } : {}
}

function decide(row, s) {
  var n = row.nodi
  if (n === "saveAlias" && s.aliasRow) {
    var next = Prefs.withAlias(s.prefs, s.query, s.aliasRow.key, History.snapshot(s.aliasRow))
    return (next ? [call("savePrefs", [next])] : []).concat([set("aliasRow", null), text(""), RECOMPUTE])
  }
  if (n === "show") return [call("savePrefs", [Prefs.shownRow(s.prefs, row.key)]), RECOMPUTE]
  if (n === "windowRule" && row.data)
    return [call("setWindowRule", [{ window: row.data.window, change: row.data.change }, row]), RECOMPUTE]
  if (n === "askAllow") {
    // Not in the first moment after it shows: an Enter pressed for the
    // row that was there runs nothing (Fable 2026-10-06).
    var shown = s.proposal ? s.now - (s.proposal.at || 0) : 0
    if (shown < 400) return []
    return [on("ask", "allow"), RECOMPUTE]
  }
  if (n === "askDeny") return [on("ask", "deny"), RECOMPUTE]
  if (n === "askCommand" && row.data) return [on("ask", "runCommand", [row.data.name, row.data.input]), RECOMPUTE]
  if (n === "askResume" && row.data)
    return [on("ask", "resumeRemote", [row.data.index], { then: [text("ask ", true)] }), RECOMPUTE]
  if (n === "askResult" && row.data) {
    var item = s.resultAction(row.data.index)
    if (!item) return []
    var action = item.action || {}
    var out = []
    if (action.exec !== undefined || action.copy !== undefined || action.paste !== undefined)
      out = [on("ask", "proposeResultAction", [row.data.index])]
    else if (action.open !== undefined)
      out = [call("openLink", [action.open, { ask: true, turn: item.turn }])]
    else if (action.query !== undefined)
      out = [text(String(action.query), true)]
    else if (action.prompt !== undefined)
      out = [text("ask " + String(action.prompt), true),
             call("dispatchAsk", [String(action.prompt), String(action.prompt), "", "ask"])]
    return out.concat([RECOMPUTE])
  }
  if (n === "askWith" && row.ask)
    return [call("dispatchAsk", [row.ask.question, row.ask.message, row.ask.context, row.ask.purpose,
                                 selectionEnv(row.ask, s.selection), undefined, row.ask.file]), RECOMPUTE]
  if (n === "askNew") {
    if (s.askBusy) return []
    var fresh = [on("ask", "recycle")]
    if (row.data && row.data.prefix) fresh.push(text(row.data.prefix + " ", true))
    else fresh.push(set("directAskAgent", ""), text("ask ", true))
    return fresh.concat([RECOMPUTE])
  }
  if (n === "askWindow" && row.ask) {
    var w = s.cameFrom
    if (s.askBusy || s.shooting || !w.stableId) return []
    return [set("askRows", { turn: "", rows: {} }), call("holdShotAsk", [row.ask]),
            on("shot", "run", [shotArgv(w, s.screens())]), text("ask " + row.ask.question, true), RECOMPUTE]
  }
  if (n === "ask") {
    var q = s.query.replace(/^\s*ask\s+/i, "").trim()
    return (q && !s.askBusy && !s.shooting ? [call("dispatchAsk", [q, q, "", "ask"])] : []).concat([RECOMPUTE])
  }
  if (n === "askAs" && row.data)
    return (!s.askBusy && !s.shooting
      ? [call("dispatchAsk", [row.data.question, row.data.question, "", "ask", undefined, undefined, undefined, row.data.id])]
      : []).concat([RECOMPUTE])
  if (n === "runWord" && s.wordAsk) {
    if (s.query.trim() !== s.wordAsk.word) return []
    var word = s.wordAsk
    // The query is what the row was picked for, not the word (Fable
    // 2026-10-05: typing "send" later lifted the row).
    return [set("wordAsk", null), text(word.query),
            call("execute", [word.run, word.toggle, word.key, word.snap, word.title, word.undoable])]
  }
  if (n === "undo") {
    // Enter twice: the empty bar opens on it, and one Enter there is too
    // easily the Enter for the row under it.
    if (s.armedKey !== row.key) return [set("armedKey", row.key)]
    return [set("armedKey", ""), call("runUndo", [row.key])]
  }
  if (n === "answer" || n === "answerFresh") {
    var retry = Answers.retryMessage(s.query, s.answers, s.answer)
    var spec = Answers.spec(s.query, s.answers, s.cameFrom, retry)
    if (!spec) return [RECOMPUTE]
    if (spec.keyword === "ask" || (PromptContext.hasMentions && PromptContext.hasMentions(spec.question)))
      return [call("dispatchAsk", [spec.question, retry || spec.question, "", "ask", undefined, undefined, undefined, undefined,
                                   n === "answerFresh", s.query])]
    spec.fresh = n === "answerFresh"
    return [on("answer", "start", [spec]), RECOMPUTE]
  }
  if (n === "askFallback" && row.data)
    // The failed question, asked of the answer "fallback" names: the field
    // on its keyword, so its rows and its pane are that answer's.
    return [text(row.data.keyword + " " + row.data.question, true), call("startFallbackAnswer", [row.data]), RECOMPUTE]
  if (n === "askAgentFallback" && row.data) {
    // Switch and preserve what the failed turn effectively sent, but keep
    // it idle: Enter on the prepared Ask row is the first thing that sends.
    var d = row.data
    if (d.direct)
      return [call("prepareDirectAsk", [d.id, d.question, d.message, d.context], { need: true }),
              text(d.id + " " + d.question, true), RECOMPUTE]
    return [call("selectAskAgent", [d.id], { need: true }), on("ask", "prepare", [d.question, d.message, d.context]),
            text("ask " + d.question, true), RECOMPUTE]
  }
  if (n === "answerResume" && row.data) {
    // A kept conversation, reopened in the pane: the field on its keyword,
    // a follow-up continuing it.
    var kept = Conversations.find(s.conversations, row.data.id)
    if (!kept) return []
    return [on("answer", "resume", [kept, Answers.freshFor(s.answers, kept.keyword)]), text(kept.keyword + " ", true), RECOMPUTE]
  }
  if (n === "answerChat" && row.data && row.data.run) {
    // Carried on in a terminal, for good: marked so it reopens there, and
    // let go here, its later turns being the terminal's.
    var moved = [set("conversations", Conversations.moved(s.conversations, row.data.id)), call("saveConversations")]
    if (s.answer.conversation === row.data.id) moved.push(on("answer", "reset"))
    return moved.concat([call("execute", [row.data.run, "", row.key, null, row.title, false])])
  }
  if (n === "answerNew") {
    // The conversation forgotten, the field left on its keyword for the
    // next question.
    var kw = s.answer.keyword
    return [on("answer", "reset")].concat(kw ? [text(kw + " ", true)] : [], [RECOMPUTE])
  }
  if (n === "filterNext" && row.next) return [call("stepInto", [row.next])]
  if (n === "filterDone") return [call("finish")]
  if (n === "saveDesktop" && row.data) {
    var saved = Prefs.withDesktop(s.prefs, row.data.name, row.data.apps, s.now)
    return (saved ? [call("savePrefs", [saved])] : []).concat([
      call("toast", ["Desktop \"" + row.data.name + "\" saved", row.subtitle]), call("finish")])
  }
  if (n === "remindSet" && row.data) return [call("setReminder", [row.data]), call("finish")]
  if (n === "remindClear") {
    // Enter twice, as Omarchy's own clear asked.
    if (s.armedKey !== row.key) return [set("armedKey", row.key)]
    return [set("armedKey", ""), call("clearReminders"), call("finish")]
  }
  if (n === "forgetDesktop" && row.data)
    return [call("savePrefs", [Prefs.withoutDesktop(s.prefs, row.data.name)]), text(""), RECOMPUTE]
  if (n === "tray")
    // As a click in the tray's own menu; the bar goes first, as for a run.
    return [on("tray", "trigger", [row.key], { then: [call("finish")] })]
  if (n === "pick" && s.pickSession) {
    var line = Pick.lineOf(row.key)
    if (line < 0) return []
    return [call("endPick", ["pick " + line]), call("dismiss")]
  }
  return [RECOMPUTE]
}
