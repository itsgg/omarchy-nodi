import QtQuick
import Quickshell
import Quickshell.Io
import "../.."
import "../../lib/Prefs.js" as Prefs

// The real Nodi action and open routing around Ask's registry. This catches
// bindings or action verbs that unit tests of Agents/Rows cannot.
Item {
  id: test
  signal done(bool ok, string report)
  property var failures: []
  readonly property string base: (Quickshell.env("XDG_RUNTIME_DIR") || "/tmp") + "/nodi-agents-route-" + Date.now()
  readonly property string fake: String(Qt.resolvedUrl("fake-agent.py")).replace(/^file:\/\//, "")

  Nodi { id: nodi }

  function check(ok, what) { if (!ok) test.failures.push(what) }
  function configure() {
    nodi.defaultConfig = {
      providers: ["system", "ask"],
      fallbacks: [],
      ask: {
        agent: "alpha",
        agents: [
          { id: "alpha", name: "Alpha", command: [test.base + "/alpha"] },
          { id: "beta", name: "Beta", command: [test.base + "/beta"] }
        ]
      }
    }
    nodi.userConfig = ({})
    nodi.prefs = Prefs.withAskAgent(Prefs.empty(), "beta")
    test.checkActionResolution()
  }

  function checkActionResolution() {
    if (typeof nodi.askSnapshot !== "function" || typeof nodi.askResolve !== "function") {
      test.failures.push("Nodi has no immutable action resolver")
      return
    }
    var exploratory = nodi.agentRows("volume")
    test.check(exploratory.length >= 2 && exploratory[0].key === "volume:5"
               && exploratory[1].key === "volume:-5",
               "exploratory volume search lost its runnable rows: " + JSON.stringify(exploratory))
    var volume = nodi.askResolve("query", "volume", "turn-direct")
    test.check(volume.ok === false && !volume.snapshot && /cannot run/i.test(volume.error || ""),
               "direct volume substituted a lower runnable row: " + JSON.stringify(volume))
    var help = nodi.askResolve("query", "?", "turn-direct")
    test.check(help.ok === false && /help/i.test(help.error || ""),
               "a help top row was not explicitly rejected: " + JSON.stringify(help))
    var owned = nodi.askResolve("query", "ask firefox", "turn-direct")
    test.check(owned.ok === false && /Nodi/i.test(owned.error || ""),
               "a Nodi-owned top row was not explicitly rejected: " + JSON.stringify(owned))
    var runnable = nodi.askResolve("query", "volume up", "turn-direct")
    test.check(runnable.ok && runnable.snapshot.key === "volume:5",
               "a normal runnable top row did not resolve: " + JSON.stringify(runnable))
    var typed = nodi.askCheckRow({
      key: "danger", title: "Danger", confirmWord: "ERASE",
      run: { kind: "exec", argv: ["/usr/bin/test-action", "danger"] }
    })
    test.check(/typed word/i.test(typed), "a typed-word row was not rejected: " + typed)
    var row = {
      key: "menu:system.lock", title: "Lock", subtitle: "System", risk: "",
      confirmWord: "", toggle: "locked", remember: true, undoable: true,
      run: { kind: "exec", argv: ["/usr/bin/test-action", "first"] }
    }
    nodi.askRows = ({ turn: "turn-1", rows: ({ "menu:system.lock": row }) })
    var resolved = nodi.askResolve("key", "menu:system.lock", "turn-1")
    test.check(resolved.ok && resolved.snapshot.key === "menu:system.lock",
               "the searched key did not resolve: " + JSON.stringify(resolved))
    row.run.argv[1] = "second"
    if (resolved.ok) {
      test.check(resolved.snapshot.run.argv.join(" ") === "/usr/bin/test-action first",
                 "the action snapshot followed the live row")
      test.check(resolved.snapshot.rememberKey === "menu:system.lock"
                 && resolved.snapshot.history && resolved.snapshot.undoable === true,
                 "the action snapshot omitted commit data: " + JSON.stringify(resolved.snapshot))
    }
    var stale = nodi.askResolve("key", "menu:system.lock", "turn-2")
    test.check(stale.ok === false, "a stale turn resolved search rows")
    var rejected = nodi.askCommit({
      key: "bad", title: "Bad", run: { kind: "not-a-run" },
      toggle: "", rememberKey: "", history: null, undoable: false
    })
    test.check(rejected.status === "failed" && rejected.key === "bad"
               && rejected.title === "Bad" && rejected.message,
               "a rejected execute was reported as success: " + JSON.stringify(rejected))
  }

  function start() {
    setup.command = ["/usr/bin/bash", "-c", 'mkdir -p "$1"; ln -sf "$2" "$1/alpha"', "nodi-agents-route", test.base, test.fake]
    setup.running = true
    deadline.start()
  }

  Process {
    id: setup
    onExited: {
      test.configure()
      var alpha = nodi.askAgents.filter(function(a) { return a.id === "alpha" })[0]
      test.check(alpha && alpha.available === false,
                 "an unprobed agent appeared available: " + JSON.stringify(alpha))
      test.check(!nodi.selectAskAgent("alpha"), "an unprobed non-current agent was selectable")
      firstProbe.start()
    }
  }

  Timer {
    id: firstProbe
    interval: 50
    repeat: true
    property int ticks: 0
    onTriggered: {
      if ((nodi.agentAvailability.alpha !== true || nodi.agentAvailability.beta !== false) && ++ticks < 100) return
      stop()
      test.check(nodi.resolvedAgent === "alpha", "the unavailable remembered beta did not fall back: " + nodi.resolvedAgent)
      settled.start()
    }
  }

  Timer {
    id: settled
    interval: 500
    onTriggered: {
      test.check(nodi.agentAvailability.beta === false, "beta changed before the open reprobe")
      installBeta.command = ["/usr/bin/ln", "-sf", test.fake, test.base + "/beta"]
      installBeta.running = true
    }
  }

  Process {
    id: installBeta
    onExited: {
      // Opening is the established reprobe cadence. Alpha is available, so
      // the old current-only condition skipped the newly installed beta.
      nodi.open("{}")
      recovered.start()
    }
  }

  Timer {
    id: recovered
    interval: 50
    repeat: true
    property int ticks: 0
    onTriggered: {
      if (nodi.resolvedAgent !== "beta" && ++ticks < 40) return
      stop()
      test.check(nodi.agentAvailability.beta === true, "open did not refresh beta availability")
      test.check(nodi.resolvedAgent === "beta", "remembered beta did not recover after install: " + nodi.resolvedAgent)
      removeAlpha.running = true
    }
  }

  Process {
    id: removeAlpha
    command: ["/usr/bin/rm", "-f", "--", test.base + "/alpha"]
    onExited: {
      nodi.open("{}")
      removed.start()
    }
  }

  Timer {
    id: removed
    interval: 50
    repeat: true
    property int ticks: 0
    onTriggered: {
      if (nodi.agentAvailability.alpha !== false && ++ticks < 40) return
      stop()
      test.check(nodi.agentAvailability.alpha === false, "open did not notice removed non-current alpha")
      restoreAlpha.command = ["/usr/bin/ln", "-sf", test.fake, test.base + "/alpha"]
      restoreAlpha.running = true
    }
  }

  Process {
    id: restoreAlpha
    onExited: {
      nodi.open("{}")
      restored.start()
    }
  }

  Timer {
    id: restored
    interval: 50
    repeat: true
    property int ticks: 0
    onTriggered: {
      if (nodi.agentAvailability.alpha !== true && ++ticks < 40) return
      stop()
      test.check(nodi.agentAvailability.alpha === true, "open did not notice restored non-current alpha")
      nodi.input.text = "alpha say ok"
      nodi.doNodi({ nodi: "askAs", data: { id: "alpha", question: "say ok" } })
      directDone.start()
    }
  }

  Timer {
    id: directDone
    interval: 10
    repeat: true
    property int ticks: 0
    onTriggered: {
      var ask = nodi.services().ask
      if (ask.phase !== "done" && ++ticks < 500) return
      stop()
      test.check(ask.phase === "done" && ask.agentId === "alpha",
                 "the direct Alpha turn did not finish on Alpha: " + JSON.stringify(ask))
      test.check(nodi.askOn && nodi.askShown === "ok",
                 "the direct Alpha answer was not shown in the pane")
      test.check(nodi.resolvedAgent === "beta" && nodi.prefs.askAgent === "beta",
                 "the one-shot Alpha prefix changed the remembered default")
      nodi.input.text = "ask say a lot"
      test.check(nodi.directAskAgent === "" && nodi.effectiveAskAgent === "beta",
                 "leaving the direct query did not restore the remembered agent")
      startQuestion.start()
    }
  }

  Timer {
    id: startQuestion
    interval: 0
    onTriggered: {
      nodi.doNodi({ nodi: "ask" })
      active.start()
    }
  }

  Timer {
    id: active
    interval: 10
    repeat: true
    property int ticks: 0
    onTriggered: {
      if (nodi.services().ask.phase !== "streaming" && ++ticks < 500) return
      stop()
      test.check(nodi.services().ask.phase === "streaming", "the beta turn never became active: " + nodi.services().ask.phase)
      nodi.input.text = "ask keep these words"
      nodi.shotAsk = ({ question: "pending capture", message: "pending capture", context: "window" })
      routePalette.start()
    }
  }

  Timer {
    id: routePalette
    interval: 0
    onTriggered: {
      // Keep this integration test in memory: it verifies savePrefs routing
      // without touching the developer's real state file.
      nodi.prefsLoaded = false
      nodi.cacheReady = false
      nodi.paletteRow = ({ key: "ask:wait", remember: false })
      nodi.paletteAll = [{ label: "Use Alpha", nodi: "askAgent", data: { id: "alpha" }, disabled: false }]
      nodi.paletteActions = nodi.paletteAll
      nodi.paletteOpen = true
      nodi.runPaletteAction(0)
      switched.start()
    }
  }

  Timer {
    id: switched
    interval: 50
    onTriggered: {
      var ask = nodi.services().ask
      test.check(nodi.input.text === "ask keep these words", "palette switch changed the field: " + nodi.input.text)
      test.check(nodi.prefs.askAgent === "alpha", "palette switch did not save alpha: " + nodi.prefs.askAgent)
      test.check(nodi.resolvedAgent === "alpha", "palette switch did not resolve alpha: " + nodi.resolvedAgent)
      test.check(!nodi.paletteOpen, "palette stayed open")
      test.check(nodi.shotAsk === null, "palette switch left a pending screenshot question")
      test.check(ask.phase === "idle" && ask.question === "" && ask.message === "",
                 "palette switch sent or kept the old turn: " + ask.phase + "/" + ask.question + "/" + ask.message)
      nodi.agentAvailability = ({ alpha: true, beta: false })
      nodi.prefs = Prefs.withAskAgent(nodi.prefs, "beta")
      nodi.askRows = ({ turn: "kept", rows: ({ "menu:kept": { key: "menu:kept" } }) })
      nodi.selectAskAgent("alpha")
      test.check(!!nodi.askRows.rows["menu:kept"], "selecting the current agent cleared its action rows")
      test.check(nodi.prefs.askAgent === "alpha", "selecting the current fallback did not remember it")
      nodi.agentAvailability = ({ alpha: true, beta: true, agy: true })
      test.check(nodi.selectAskAgent("gemini"), "a legacy Gemini selection was rejected")
      test.check(nodi.prefs.askAgent === "agy", "a legacy Gemini selection was not persisted as Agy")
      test.check(nodi.resolvedAgentId === "agy", "a legacy Gemini selection did not resolve to Agy")
      fallback.start()
    }
  }

  Timer {
    id: fallback
    interval: 0
    onTriggered: {
      // As providers/ask.js's fallbackAgent row reaches Nodi: prepare its
      // effective message for the newly selected agent, but do not send.
      nodi.doNodi({ nodi: "askAgentFallback", data: {
        id: "beta", question: "fallback question", message: "say a lot", context: "selection"
      } })
      fallbackIdle.start()
    }
  }

  Timer {
    id: fallbackIdle
    interval: 200
    onTriggered: {
      var ask = nodi.services().ask
      test.check(nodi.resolvedAgent === "beta" && nodi.prefs.askAgent === "beta", "fallback did not switch to beta")
      test.check(nodi.input.text === "ask fallback question", "fallback field: " + nodi.input.text)
      test.check(ask.phase === "idle" && ask.question === "fallback question"
                 && ask.message === "say a lot" && ask.context === "selection",
                 "fallback did not stay prepared: " + JSON.stringify(ask))
      // This is the Enter route. Streaming proves Ask reused "say a lot";
      // the displayed "fallback question" takes another fake-agent path.
      nodi.doNodi({ nodi: "ask" })
      fallbackSent.start()
    }
  }

  Timer {
    id: fallbackSent
    interval: 10
    repeat: true
    property int ticks: 0
    onTriggered: {
      if (nodi.services().ask.phase !== "streaming" && ++ticks < 500) return
      stop()
      test.check(nodi.services().ask.phase === "streaming", "Enter did not send the prepared effective message: " + nodi.services().ask.phase)
      // Availability can change the resolved agent without a palette action.
      // The old session must not remain active under the new agent's name.
      removeBetaForAvailability.running = true
    }
  }

  Process {
    id: removeBetaForAvailability
    command: ["/usr/bin/rm", "-f", "--", test.base + "/beta"]
    onExited: {
      nodi.agentAvailability = ({ alpha: true, beta: false })
      availabilitySwitched.start()
    }
  }

  Timer {
    id: availabilitySwitched
    interval: 50
    onTriggered: {
      var ask = nodi.services().ask
      test.check(nodi.resolvedAgent === "alpha", "availability change did not resolve alpha: " + nodi.resolvedAgent)
      test.check(ask.phase === "idle" && ask.question === "" && ask.message === "",
                 "availability change kept the old turn: " + ask.phase + "/" + ask.question + "/" + ask.message)
      nodi.dismiss()
      cleanup.running = true
    }
  }

  Process {
    id: cleanup
    command: ["/usr/bin/rm", "-rf", "--", test.base]
    onExited: {
      deadline.stop()
      test.done(test.failures.length === 0, test.failures.join("; "))
    }
  }

  Timer {
    id: deadline
    interval: 15000
    onTriggered: {
      test.failures.push("timed out: availability " + JSON.stringify(nodi.agentAvailability) + ", resolved " + nodi.resolvedAgent)
      cleanup.running = true
    }
  }
}
