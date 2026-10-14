import QtQuick
import Quickshell
import Quickshell.Io
import "../../components"

// components/Ask.qml over ACP (ROADMAP 84) with the bar's rows as the
// agent's tools (ROADMAP 44), against a stand-in agent (fake-agent.py) that
// starts the bar's tool server, bin/nodi mcp --ask, which reaches this
// instance's IPC through a stand-in omarchy-shell (fake-omarchy). One session: a search, another tool shown and
// refused, a made-up key refused unshown, a second run refused while the
// first waits, the first allowed by him and run once, a run called unasked
// shown in the bar and refused. Another that exits while a run waits, and
// one recycled while a run waits, then asked again. One whose allowed run
// closes the bar: the next run is refused. One about the selection, twice;
// one with a picture; an agent that takes no system prompt and no picture;
// one that needs him signed in first. No model is asked. Run by
// tools/qs-test.sh inside Quickshell.
Item {
  id: test
  signal done(bool ok, string report)
  property var phases: []
  property var ran: []
  property var failures: []
  property int proposals: 0
  property int remaining: 30
  property int carriedCalls: 0
  property int rawCalls: 0
  Carried { id: carried }
  readonly property string fake: String(Qt.resolvedUrl("fake-agent.py")).replace(/^file:\/\//, "")
  readonly property string nodi: String(Qt.resolvedUrl("../../bin/nodi")).replace(/^file:\/\//, "")
  readonly property string dir: Quickshell.env("XDG_RUNTIME_DIR") || "/tmp"
  // bin/nodi's omarchy-shell, a stand-in that reaches this instance.
  readonly property var toolEnv: ({ OMARCHY_PATH: String(Qt.resolvedUrl("fake-omarchy")).replace(/^file:\/\//, ""), NODI_TEST_SHELL: Quickshell.shellDir, NODI_TEST_TARGET: "nodiAskTest" })
  readonly property var sessions: [ask, identityActivity, searchPath, closeBeforeEnter, closeBeforeDelivery, mailboxLost, outcomes, oldTurn, dying, recycled, closing, selected, picture, closedBar, forgetful, lateAgain, named, plain, signIn, signHang, signWarm, installed, consent, own75, readyThenFails, flood, switcher, switchPending, closed, named2]

  function finished() {
    if (test.remaining <= 0) return
    if (--test.remaining > 0) return
    deadline.stop()
    if (test.rawCalls !== 0 || test.carriedCalls === 0) test.failures.push("messages in IPC arguments: " + test.rawCalls + " raw, " + test.carriedCalls + " carried")
    test.done(test.failures.length === 0, test.failures.join("; "))
  }

  // What `nodi mcp --ask` reaches in the shell (Nodi.qml askMcp), with the
  // one argument the facade passes: the session its token names.
  IpcHandler {
    target: "nodiAskTest"
    function askMcp(carriedArg: string): string {
      // As Nodi.qml reads it: carried in a file, never the message itself
      // in the argument (the marketplace's review, 2026-10-10).
      if (carriedArg.indexOf("@file:") === 0) test.carriedCalls++; else test.rawCalls++
      var arg = carried.read(carriedArg)
      if (arg === null) return "unknown"
      var token = ""
      try { token = JSON.parse(arg).token } catch (e) {}
      for (var i = 0; i < test.sessions.length; i++) if (test.sessions[i].token === token) return test.sessions[i].serveCall(arg)
      return test.sessions[0].serveCall(arg)
    }
  }

  Ask {
    id: ask
    acts: true
    program: [test.fake, "claude"]
    workDir: test.dir
    toolServer: test.nodi
    toolEnv: test.toolEnv
    property int searchCalls: 0
    property int runCalls: 0
    property int commitCalls: 0
    property var liveRow: ({ key: "menu:system.lock", title: "Lock", subtitle: "System", kind: "action",
                             run: { kind: "exec", argv: ["/usr/bin/test-action", "first"] } })
    property string duplicateTicket: ""
    searcher: function(q, turnId) { searchCalls++; return [] }
    resolver: function(kind, value, turnId) {
      runCalls++
      return kind === "query" && value === "lock"
        ? { ok: true, snapshot: liveRow } : { ok: false, error: "No matching row" }
    }
    committer: function(snapshot) {
      commitCalls++
      test.ran.push(snapshot.run.argv.join(" "))
      return { status: "executed", key: snapshot.key, title: snapshot.title }
    }
    // What the bar says it waits on, in order (the pane, the row).
    property var statuses: []
    Component.onCompleted: statuses = [status]
    onStatusChanged: if (statuses[statuses.length - 1] !== status) statuses.push(status)
    onPhaseChanged: {
      test.phases.push(phase)
      if (phase === "proposing") {
        test.proposals++
        var p = ask.proposal
        if (!p || !p.snapshot || p.snapshot.key !== "menu:system.lock") test.failures.push("wrong top match: " + JSON.stringify(p))
        else if (p.snapshot.run.argv.join(" ") !== "/usr/bin/test-action first")
          test.failures.push("mutable or wrong command: " + JSON.stringify(p.snapshot.run))
        if (test.ran.length !== 0) test.failures.push("ran before he allowed it")
        // A duplicate ID joins this lifecycle. A distinct call with no
        // permission-bound origin is rejected before registration, and a
        // stale session cannot make another card.
        var same = ask.serve(ask.token, ask.channel, JSON.stringify({
          jsonrpc: "2.0", id: "direct", method: "tools/call",
          params: { name: "run", arguments: { query: "lock" } }
        }))
        try { ask.duplicateTicket = JSON.parse(same).nodiPending || "" } catch (e) {}
        var other = ask.serve(ask.token, ask.channel, JSON.stringify({
          jsonrpc: "2.0", id: "concurrent", method: "tools/call",
          params: { name: "run", arguments: { query: "lock" } }
        }))
        try {
          var otherTicket = JSON.parse(other).nodiPending || ""
          var busy = otherTicket ? ask.pollToolResponse(otherTicket) : JSON.parse(other)
          var busyText = busy.result && busy.result.content ? busy.result.content[0].text : ""
          if (!busy.result || !busy.result.isError || !/origin|permission/i.test(busyText)
              || ask.actionBook.requests["string:concurrent"] !== undefined)
            test.failures.push("a missing origin was registered: " + JSON.stringify(busy))
        } catch (e2) { test.failures.push("bad concurrent response: " + other) }
        var stale = JSON.parse(ask.serve("old-session", ask.channel, JSON.stringify({
          jsonrpc: "2.0", id: "stale", method: "tools/call",
          params: { name: "run", arguments: { query: "lock" } }
        })))
        if (!stale.error || test.ran.length !== 0) test.failures.push("stale session reached the action")
        ask.liveRow.run.argv[1] = "second"
        answerLater.start()
      }
      if (phase !== "done" && phase !== "error") return
      if (phase === "error") test.failures.push("error: " + ask.error)
      if (ask.answer !== "ok") test.failures.push("the stand-in said: " + JSON.stringify(ask.answer))
      if (JSON.stringify(test.ran) !== JSON.stringify(["/usr/bin/test-action first"])) test.failures.push("ran " + JSON.stringify(test.ran))
      if (test.proposals !== 1 || ask.commitCalls !== 1) test.failures.push("proposals/commits " + test.proposals + "/" + ask.commitCalls)
      if (ask.runCalls !== 1 || ask.searchCalls !== 0) test.failures.push("not one-step: " + ask.runCalls + "/" + ask.searchCalls)
      if (ask.duplicateTicket) {
        var duplicate = ask.pollToolResponse(ask.duplicateTicket)
        var duplicateText = duplicate.result && duplicate.result.content ? duplicate.result.content[0].text : ""
        if (!/"status":"executed"/.test(duplicateText)) test.failures.push("pending duplicate did not replay: " + JSON.stringify(duplicate))
      } else test.failures.push("duplicate request did not get a ticket")
      var said = ask.statuses.join(" | ")
      if (!/^Starting Claude \| Asking Claude \|/.test(said + " |")) test.failures.push("what it said it waits on: " + said)
      test.finished()
    }
  }

  Timer {
    id: answerLater
    interval: 300
    onTriggered: ask.allow()
  }

  // Only trusted metadata for this session's dynamic server is privileged.
  // Action phases own status over read calls, and a stale read completion
  // cannot erase the newer operation.
  Ask {
    id: identityActivity
    acts: true
    program: [test.fake, "claude"]
    workDir: test.dir
    toolServer: test.nodi
    toolEnv: test.toolEnv
    property var proposalKinds: []
    property var activities: []
    property string staleSnapshot: ""
    property bool staleReadPreserved: false
    property bool staleCheckScheduled: false
    property bool sawResolving: false
    property bool sawExecuting: false
    property var visibleStatuses: []
    onStatusChanged: if (visibleStatuses[visibleStatuses.length - 1] !== status)
      visibleStatuses.push(status)
    onActivityChanged: {
      activities.push(activity)
      if (activity === "Using Read current" && !staleCheckScheduled) {
        staleCheckScheduled = true
        var operations = Object.keys(readActivities)
        for (var i = 0; i < operations.length; i++) {
          var op = operations[i]
          if (readActivities[op].text !== "Using Read old") continue
          ;(function(oldOperation) {
            Qt.callLater(function() {
              agentSays({ sessionId: sessionId, update: {
                sessionUpdate: "tool_call_update", toolCallId: oldOperation, status: "completed"
              } })
              staleSnapshot = JSON.stringify(readActivities)
              staleReadPreserved = activity === "Using Read current"
            })
          })(op)
          break
        }
      }
    }
    resolver: function(kind, value, turnId) {
      sawResolving = activity === "Resolving a bar action"
      return { ok: true, snapshot: { key: "menu:system.lock", title: "Lock",
        run: { kind: "exec", argv: ["/usr/bin/test-action", "identity"] } } }
    }
    committer: function(snapshot) {
      sawExecuting = activity === "Running a bar action"
      return { status: "executed", key: snapshot.key, title: snapshot.title }
    }
    onPhaseChanged: {
      if (phase === "proposing") {
        proposalKinds.push(proposal ? proposal.kind : "")
        if (proposal && proposal.kind === "action") {
          if (activity !== "Waiting for confirmation")
            test.failures.push("confirmation lost action status: " + activity)
          Qt.callLater(identityActivity.allow)
        } else {
          Qt.callLater(identityActivity.deny)
        }
        return
      }
      if (phase !== "done" && phase !== "error") return
      var actionStatuses = ["Resolving a bar action", "Waiting for confirmation", "Running a bar action"]
      var at = -1
      for (var i = 0; i < actionStatuses.length; i++) {
        at = visibleStatuses.indexOf(actionStatuses[i], at + 1)
        if (at < 0) break
      }
      var invalidBinding = false
      for (var bi = 0; bi < runBindings.length; bi++)
        if (!runBindings[bi].callId || !runBindings[bi].operation)
          invalidBinding = true
      if (phase !== "done" || answer.indexOf("activity-check") !== 0
          || JSON.stringify(proposalKinds) !== JSON.stringify(["permission", "permission", "permission", "action"])
          || invalidBinding
          || !sawResolving || !sawExecuting || !staleReadPreserved || at < 0
          || visibleStatuses.indexOf("Using Read old") < 0
          || visibleStatuses.indexOf("Using Read current") < 0)
        test.failures.push("identity/activity: " + phase + "/" + JSON.stringify(answer) + "/"
          + JSON.stringify(proposalKinds) + "/" + sawResolving + "/" + sawExecuting
          + "/" + staleReadPreserved + "/" + staleSnapshot + "/" + JSON.stringify(activities)
          + "/" + JSON.stringify(visibleStatuses))
      test.finished()
    }
  }

  // Validation and pre-proposal failures make no card and leave the turn
  // free for the exploratory search -> run({key}) path. Escape executes
  // nothing.
  Ask {
    id: searchPath
    acts: true
    program: [test.fake, "claude"]
    workDir: test.dir
    toolServer: test.nodi
    toolEnv: test.toolEnv
    property int searches: 0
    property int resolves: 0
    property int commits: 0
    property int proposals: 0
    searcher: function(q, turnId) {
      searches++
      return [{ key: "menu:system.lock", title: "Lock", subtitle: "System", kind: "action", asks: "" }]
    }
    resolver: function(kind, value, turnId) {
      resolves++
      if (kind === "query" && value === "missing") return { ok: false, error: "No matching row" }
      if (kind === "query" && value === "volume")
        return { ok: false, error: "That top-ranked Volume row cannot run here" }
      if (kind === "key" && value === "menu:system.lock")
        return { ok: true, snapshot: { key: value, title: "Lock", subtitle: "System",
          run: { kind: "exec", argv: ["/usr/bin/test-action", "searched"] } } }
      return { ok: false, error: "No matching row" }
    }
    committer: function(snapshot) { commits++; return { status: "executed" } }
    onPhaseChanged: {
      if (phase === "proposing") {
        proposals++
        if (!proposal || proposal.snapshot.key !== "menu:system.lock")
          test.failures.push("searched key proposed wrongly: " + JSON.stringify(proposal))
        Qt.callLater(function() { searchPath.deny(); searchPath.allow() })
        return
      }
      if (phase !== "done" && phase !== "error") return
      if (phase !== "done" || answer !== "ok" || proposals !== 1 || commits !== 0 || searches !== 1 || resolves !== 3)
        test.failures.push("search path: " + phase + "/" + answer + "/" + proposals + "/" + commits + "/" + searches + "/" + resolves)
      test.finished()
    }
  }

  // Closing wins before Enter and refuses only the uncommitted proposal.
  Ask {
    id: closeBeforeEnter
    acts: true
    program: [test.fake, "claude"]
    workDir: test.dir
    toolServer: test.nodi
    toolEnv: test.toolEnv
    property int commits: 0
    resolver: function(kind, value, turnId) {
      return { ok: true, snapshot: { key: "menu:system.lock", title: "Lock", subtitle: "System",
        run: { kind: "exec", argv: ["/usr/bin/test-action", "closed"] } } }
    }
    committer: function(snapshot) { commits++; return { status: "executed" } }
    onPhaseChanged: {
      if (phase === "proposing") {
        Qt.callLater(function() { closeBeforeEnter.hidden(); closeBeforeEnter.allow() })
        return
      }
      if (phase !== "done" && phase !== "error") return
      if (phase !== "done" || answer !== "ok" || commits !== 0)
        test.failures.push("close/Enter race: " + phase + "/" + answer + "/" + commits)
      test.finished()
    }
  }

  // The permission belongs to the old open state. Closing before its
  // asynchronous MCP delivery must reject it without making a card.
  Ask {
    id: closeBeforeDelivery
    acts: true
    program: [test.fake, "claude"]
    workDir: test.dir
    toolServer: test.nodi
    toolEnv: test.toolEnv
    property int proposals: 0
    property int commits: 0
    property bool barClosed: false
    property bool deliveryRejected: false
    property var deliveryResponse: null
    resolver: function(kind, value, turnId) {
      return { ok: true, snapshot: { key: "menu:system.lock", title: "Lock",
        run: { kind: "exec", argv: ["/usr/bin/test-action", "late-close"] } } }
    }
    committer: function(snapshot) { commits++; return { status: "executed" } }
    function deliverAfterClose() {
      barClosed = true
      shown = false
      hidden()
      var control = JSON.parse(serve(token, channel, JSON.stringify({
        jsonrpc: "2.0", id: "closed-delivery", method: "tools/call",
        params: { name: "run", arguments: { query: "lock" } }
      })))
      var response = pollToolResponse(control.nodiPending || "")
      deliveryResponse = response
      var text = response.result && response.result.content ? response.result.content[0].text : ""
      deliveryRejected = !!response.result && response.result.isError === true && /closed/i.test(text)
      if (proposal) deny()
    }
    onPhaseChanged: {
      if (phase === "proposing") { proposals++; Qt.callLater(closeBeforeDelivery.deny); return }
      if (phase !== "done" && phase !== "error") return
      if (phase !== "done" || proposals !== 0 || commits !== 0 || !deliveryRejected)
        test.failures.push("closed delivery proposed/executed: " + phase + "/" + proposals + "/" + commits + "/" + barClosed + "/" + deliveryRejected + "/" + JSON.stringify(answer) + "/" + JSON.stringify(deliveryResponse))
      test.finished()
    }
  }

  // The action CAS is insufficient when Task 3's mailbox has already
  // terminalized the request. Enter must not execute after that loss.
  Ask {
    id: mailboxLost
    acts: true
    program: [test.fake, "claude"]
    workDir: test.dir
    toolServer: test.nodi
    toolEnv: test.toolEnv
    property int commits: 0
    resolver: function(kind, value, turnId) {
      return { ok: true, snapshot: { key: "menu:system.lock", title: "Lock",
        run: { kind: "exec", argv: ["/usr/bin/test-action", "mailbox"] } } }
    }
    committer: function(snapshot) { commits++; return { status: "executed" } }
    onPhaseChanged: {
      if (phase === "proposing") {
        var p = proposal
        completeToolResponse(p.requestId, JSON.stringify(actionResponse(p.requestId, {
          status: "refused", proposalId: p.id, key: p.snapshot.key, title: p.snapshot.title
        }, false)))
        Qt.callLater(mailboxLost.allow)
        return
      }
      if (phase !== "done" && phase !== "error") return
      if (phase !== "done" || answer !== "ok" || commits !== 0)
        test.failures.push("terminal mailbox executed: " + phase + "/" + answer + "/" + commits)
      test.finished()
    }
  }

  // Known dispatch rejection is failed; a thrown committer is unknown.
  Ask {
    id: outcomes
    acts: true
    program: [test.fake, "claude"]
    workDir: test.dir
    toolServer: test.nodi
    toolEnv: test.toolEnv
    property int round: 0
    resolver: function(kind, value, turnId) {
      return { ok: true, snapshot: { key: "menu:system.lock", title: "Lock",
        run: { kind: "exec", argv: ["/usr/bin/test-action", round ? "throws" : "fails"] } } }
    }
    committer: function(snapshot) {
      if (round === 0) return { status: "failed", key: snapshot.key, title: snapshot.title, message: "dispatch rejected" }
      throw new Error("dispatch threw")
    }
    onPhaseChanged: {
      if (phase === "proposing") { Qt.callLater(outcomes.allow); return }
      if (phase !== "done" && phase !== "error") return
      if (phase !== "done" || answer !== "ok")
        test.failures.push("structured outcome round " + round + ": " + phase + "/" + answer + "/" + error)
      if (++round === 1) { Qt.callLater(function() { outcomes.send("commit throws") }); return }
      test.finished()
    }
  }

  // A terminal request ID replays across turns. Separately, a unique call
  // delivered after the turn that permitted it is stale and never resolves.
  Ask {
    id: oldTurn
    acts: true
    program: [test.fake, "claude"]
    workDir: test.dir
    toolServer: test.nodi
    toolEnv: test.toolEnv
    property int resolves: 0
    property int commits: 0
    property int round: 0
    resolver: function(kind, value, turnId) {
      resolves++
      if (value === "missing") return { ok: false, error: "No matching row" }
      return { ok: true, snapshot: { key: "menu:system.lock", title: "Lock",
        run: { kind: "exec", argv: ["/usr/bin/test-action", "stale"] } } }
    }
    committer: function(snapshot) { commits++; return { status: "executed" } }
    onPhaseChanged: {
      if (phase === "proposing") {
        test.failures.push("old-turn replay made a card")
        Qt.callLater(oldTurn.deny)
        return
      }
      if (phase !== "done" && phase !== "error") return
      if (phase !== "done" || answer !== "ok") test.failures.push("old-turn round " + round + ": " + phase + "/" + answer + "/" + error)
      round++
      if (round === 1) { Qt.callLater(function() { oldTurn.send("old turn replay again") }); return }
      if (round === 2) { Qt.callLater(function() { oldTurn.send("bind old turn") }); return }
      if (round === 3) { Qt.callLater(function() { oldTurn.send("deliver old turn") }); return }
      if (resolves !== 1 || commits !== 0) test.failures.push("old-turn replay resolved/executed: " + resolves + "/" + commits)
      test.finished()
    }
  }

  Ask {
    id: dying
    acts: true
    program: [test.fake, "claude"]
    workDir: test.dir
    toolServer: test.nodi
    toolEnv: test.toolEnv
    property string failedToken: ""
    property string failedChannel: ""
    property string failedTicket: ""
    resolver: function(kind, value, turnId) {
      return { ok: true, snapshot: { key: "menu:system.lock", title: "Lock",
        run: { kind: "exec", argv: ["/usr/bin/test-action", "dying"] } } }
    }
    committer: function(snapshot) {
      test.failures.push("the dead session executed")
      return { status: "executed" }
    }
    function deliverBeforeExit() {
      failedToken = token
      failedChannel = channel
      var control = JSON.parse(serve(token, channel, JSON.stringify({
        jsonrpc: "2.0", id: "exit-run", method: "tools/call",
        params: { name: "run", arguments: { query: "lock" } }
      })))
      failedTicket = control.nodiPending || ""
    }
    onPhaseChanged: {
      if (phase === "proposing") {
        return
      }
      if (phase !== "error" && phase !== "done") return
      if (phase !== "error" || !/exit 3/.test(dying.error)) test.failures.push("a session that exits while a run waits: " + phase + " " + dying.error)
      if (dying.proposal !== null) test.failures.push("its run still waits after it exited")
      var raw = failedTicket ? serveCall(JSON.stringify({
        token: failedToken, channel: failedChannel, op: "poll", ticket: failedTicket
      })) : ""
      try {
        var response = JSON.parse(raw)
        var outcome = JSON.parse(response.result.content[0].text)
        if (outcome.status !== "refused" && outcome.status !== "unknown")
          test.failures.push("failed-session poll outcome: " + JSON.stringify(response))
      } catch (e) {
        test.failures.push("failed-session ticket was lost: " + JSON.stringify(raw))
      }
      test.finished()
    }
  }

  Ask {
    id: recycled
    acts: true
    program: [test.fake, "claude"]
    workDir: test.dir
    toolServer: test.nodi
    toolEnv: test.toolEnv
    resolver: function(kind, value, turnId) {
      return { ok: true, snapshot: { key: "menu:system.lock", title: "Lock",
        run: { kind: "exec", argv: ["/usr/bin/test-action", "recycled"] } } }
    }
    committer: function(snapshot) {
      test.failures.push("the recycled session executed")
      return { status: "executed" }
    }
    property bool again: false
    property string recycledToken: ""
    property string recycledChannel: ""
    property string recycledTicket: ""
    onPhaseChanged: {
      if (phase === "proposing" && !recycled.again) {
        recycled.again = true
        recycled.recycledToken = recycled.token
        recycled.recycledChannel = recycled.channel
        var tickets = Object.keys(recycled.toolResponses)
        recycled.recycledTicket = tickets.length ? tickets[0] : ""
        recycled.recycle()
        if (recycled.proposal !== null || recycled.phase !== "idle") test.failures.push("recycled with a run waiting: " + recycled.phase)
        recycled.send("say ok")
        return
      }
      if (phase !== "error" && phase !== "done") return
      if (phase !== "done" || recycled.answer !== "ok") test.failures.push("asked again after a recycle: " + phase + " " + recycled.error + recycled.answer)
      var poll = JSON.stringify({
        token: recycled.recycledToken, channel: recycled.recycledChannel,
        op: "poll", ticket: recycled.recycledTicket
      })
      var raw = recycled.recycledTicket ? recycled.serveCall(poll) : ""
      try {
        var response = JSON.parse(raw)
        var outcome = JSON.parse(response.result.content[0].text)
        if (outcome.status !== "refused")
          test.failures.push("recycled-session poll outcome: " + JSON.stringify(response))
      } catch (e) {
        test.failures.push("recycled-session ticket was lost: " + JSON.stringify(raw))
      }
      if (recycled.serveCall(poll) !== "")
        test.failures.push("recycled-session credentials survived terminal retrieval")
      test.finished()
    }
  }

  Ask {
    id: closing
    acts: true
    program: [test.fake, "claude"]
    workDir: test.dir
    toolServer: test.nodi
    toolEnv: test.toolEnv
    property bool ran: false
    property int proposals: 0
    resolver: function(kind, value, turnId) {
      return { ok: true, snapshot: { key: "menu:system.lock", title: "Lock",
        run: { kind: "exec", argv: ["/usr/bin/test-action", "closing"] } } }
    }
    // As Nodi.execute: close happens inside commit, after the CAS has won.
    // That close must not claim the committed action was stopped.
    committer: function(snapshot) {
      closing.ran = true
      closing.shown = false
      closing.hidden()
      return { status: "executed", key: snapshot.key, title: snapshot.title }
    }
    onPhaseChanged: {
      if (phase === "proposing") { closing.proposals++; Qt.callLater(closing.allow); return }
      if (phase !== "error" && phase !== "done") return
      if (!closing.ran || closing.proposals !== 1 || phase !== "done" || closing.answer !== "ok")
        test.failures.push("the bar closed in the run: " + closing.ran + " " + closing.proposals + " " + phase + " " + closing.error + closing.answer)
      test.finished()
    }
  }

  Ask {
    id: selected
    acts: true
    program: [test.fake, "claude"]
    workDir: test.dir
    toolServer: test.nodi
    toolEnv: test.toolEnv
    property int round: 0
    onPhaseChanged: {
      if (phase !== "error" && phase !== "done") return
      if (phase !== "done" || selected.answer !== "ok") test.failures.push("about the selection, round " + selected.round + ": " + phase + " " + selected.error + selected.answer)
      if (selected.question !== "Fix the spelling and grammar of the selection" || selected.context !== "selection")
        test.failures.push("shown as " + JSON.stringify([selected.question, selected.context]))
      if (++selected.round === 1) { Qt.callLater(function() { selected.send("Fix the spelling and grammar of the selection") }); return }
      test.finished()
    }
  }

  // A question with the window's picture (ROADMAP 43).
  Ask {
    id: picture
    acts: true
    program: [test.fake, "claude"]
    workDir: test.dir
    toolServer: test.nodi
    toolEnv: test.toolEnv
    onPhaseChanged: {
      if (phase !== "error" && phase !== "done") return
      if (phase !== "done" || picture.answer !== "ok") test.failures.push("with a picture: " + phase + " " + picture.error + picture.answer)
      test.finished()
    }
  }

  // The bar closed: a run the agent asks for is refused, never left waiting.
  Ask {
    id: closedBar
    acts: true
    shown: false
    program: [test.fake, "claude"]
    workDir: test.dir
    toolServer: test.nodi
    toolEnv: test.toolEnv
    onPhaseChanged: {
      if (phase === "proposing") test.failures.push("proposed while the bar is closed")
      if (phase !== "error" && phase !== "done") return
      if (phase !== "done" || closedBar.answer !== "ok") test.failures.push("closed bar: " + phase + " " + closedBar.error + closedBar.answer)
      test.finished()
    }
  }

  // Long after its last answer, a question starts afresh: the stand-in
  // answers "say ok" once a session, so the second is answered right only
  // by a fresh one.
  Ask {
    id: forgetful
    acts: true
    freshMs: 1
    program: [test.fake, "claude"]
    workDir: test.dir
    toolServer: test.nodi
    toolEnv: test.toolEnv
    property int round: 0
    onPhaseChanged: {
      if (phase !== "error" && phase !== "done") return
      if (phase !== "done" || forgetful.answer !== "ok") test.failures.push("afresh, round " + forgetful.round + ": " + phase + " " + forgetful.error + forgetful.answer)
      if (++forgetful.round === 1) { later.start(); return }
      test.finished()
    }
  }
  Timer { id: later; interval: 50; onTriggered: forgetful.send("say ok") }

  // Asked again long after, a question about the selection starts afresh
  // and still goes with its text (Fable 2026-10-06: the recycle forgot it).
  Ask {
    id: lateAgain
    acts: true
    freshMs: 1
    program: [test.fake, "claude"]
    workDir: test.dir
    toolServer: test.nodi
    toolEnv: test.toolEnv
    property int round: 0
    onPhaseChanged: {
      if (phase !== "error" && phase !== "done") return
      if (phase !== "done" || lateAgain.answer !== "ok") test.failures.push("asked again late, round " + lateAgain.round + ": " + phase + " " + lateAgain.error + lateAgain.answer)
      if (++lateAgain.round === 1) { againLater.start(); return }
      test.finished()
    }
  }
  Timer { id: againLater; interval: 50; onTriggered: lateAgain.send("Fix the spelling and grammar of the selection") }

  // A server he named (ROADMAP 49): its call waits for him, shown as a tool.
  Ask {
    id: named
    acts: true
    mcp: ({ shouter: { command: "shout" } })
    program: [test.fake, "claude"]
    workDir: test.dir
    toolServer: test.nodi
    toolEnv: test.toolEnv
    property bool asked: false
    onPhaseChanged: {
      if (phase === "proposing") {
        named.asked = !!named.proposal && named.proposal.kind === "permission" && named.proposal.title === "mcp__shouter__shout"
                      && named.proposal.key === "" && named.proposal.input.text === "hi"
        Qt.callLater(named.allow); return
      }
      if (phase !== "error" && phase !== "done") return
      if (!named.asked || phase !== "done" || named.answer !== "ok") test.failures.push("a named server: " + named.asked + " " + phase + " " + named.error + named.answer)
      test.finished()
    }
  }

  // An agent Ask has no _meta for (lib/Agents.js): the instructions go with
  // its first prompt, and a picture it does not take is said not to have
  // gone. Its name is its own.
  Ask {
    id: plain
    agent: "plain"
    acts: true
    program: [test.fake, "plain"]
    workDir: test.dir
    toolServer: test.nodi
    toolEnv: test.toolEnv
    property int round: 0
    onPhaseChanged: {
      if (phase !== "error" && phase !== "done") return
      if (phase !== "done" || plain.answer !== "ok") test.failures.push("a plain agent, round " + plain.round + ": " + phase + " " + plain.error + plain.answer)
      if (plain.agentName !== "Fake Agent") test.failures.push("named " + plain.agentName)
      if (++plain.round === 1) { Qt.callLater(function() { plain.send("plain question again") }); return }
      // The conversation's turns (2026-10-11): the first answer is one by
      // the second; a restarted session (a setting changed) has none, its
      // agent knowing nothing of them (2026-10-11).
      if (plain.round === 2) {
        if (plain.turns.length !== 1 || plain.turns[0].question !== "plain question"
            || plain.turns[0].message !== "plain question" || plain.turns[0].answer !== "ok")
          test.failures.push("the first answer is a turn by the second: " + JSON.stringify(plain.turns))
        // A new session's first question, as the first round's was: with a
        // picture this agent takes none of, so it says so.
        Qt.callLater(function() { plain.restart(); plain.send("plain question after a restart", undefined, undefined, { mediaType: "image/jpeg", data: "AAAA" }) })
        return
      }
      if (plain.turns.length !== 0) test.failures.push("a restarted session shows no turns from before it: " + JSON.stringify(plain.turns))
      test.finished()
    }
  }

  // An agent that needs him signed in: asked in the bar, then the session.
  Ask {
    id: signIn
    acts: true
    program: [test.fake, "claude", "auth"]
    workDir: test.dir
    toolServer: test.nodi
    toolEnv: test.toolEnv
    property bool asked: false
    onPhaseChanged: {
      if (phase === "proposing") {
        signIn.asked = !!signIn.proposal && signIn.proposal.kind === "auth" && signIn.proposal.method.id === "login"
        Qt.callLater(signIn.allow); return
      }
      if (phase !== "error" && phase !== "done") return
      if (!signIn.asked || phase !== "done" || signIn.answer !== "ok") test.failures.push("signing in: " + signIn.asked + " " + phase + " " + signIn.error + signIn.answer)
      test.finished()
    }
  }

  // A sign-in the agent never finishes: the question ends, it is not held
  // for ever (Fable 2026-10-07).
  Ask {
    id: signHang
    acts: true
    longMs: 1500
    program: [test.fake, "claude", "authhang"]
    workDir: test.dir
    toolServer: test.nodi
    toolEnv: test.toolEnv
    onPhaseChanged: {
      if (phase === "proposing") { Qt.callLater(signHang.allow); return }
      if (phase !== "error" && phase !== "done") return
      if (phase !== "error" || !/^Signing in to Claude did not finish/.test(signHang.error)) test.failures.push("a sign-in that hangs: " + phase + " " + signHang.error)
      test.finished()
    }
  }

  // A sign-in answered while he only typed `ask `: nothing waits after it,
  // and his question goes to the session it opened (Fable 2026-10-07).
  Ask {
    id: signWarm
    acts: true
    program: [test.fake, "claude", "auth"]
    workDir: test.dir
    toolServer: test.nodi
    toolEnv: test.toolEnv
    property bool allowed: false
    onPhaseChanged: {
      if (phase === "proposing" && !signWarm.allowed) {
        signWarm.allowed = true
        Qt.callLater(function() {
          signWarm.allow()
          if (signWarm.phase !== "idle") test.failures.push("after a sign-in with nothing asked: " + signWarm.phase)
          askLater.start()
        })
        return
      }
      if (phase !== "error" && phase !== "done") return
      if (phase !== "done" || signWarm.answer !== "ok") test.failures.push("asked after a sign-in: " + phase + " " + signWarm.error + signWarm.answer)
      test.finished()
    }
  }
  Timer { id: askLater; interval: 300; onTriggered: signWarm.send("say ok") }

  // An adapter that installed as the session started: the bar says so
  // until the agent is up, and then what it is doing (Fable 2026-10-07:
  // "Installing" stayed for the whole session); the rest of the start has
  // its own time, not what the install left of it (its second pass). The
  // stand-in installs for 3 s and answers session/new 2 s later, against
  // a 3.5 s start limit (Fable: a second's margin either way).
  Ask {
    id: installed
    acts: true
    startMs: 3500
    program: [test.fake, "claude", "installing"]
    workDir: test.dir
    toolServer: test.nodi
    toolEnv: test.toolEnv
    property bool sawInstall: false
    onStatusChanged: if (/^Installing fake@1/.test(status)) sawInstall = true
    onPhaseChanged: {
      if (phase !== "error" && phase !== "done") return
      if (phase !== "done" || installed.answer !== "ok" || !installed.sawInstall || installed.status !== "Asking Claude")
        test.failures.push("after an install: " + phase + " " + installed.sawInstall + " " + JSON.stringify(installed.status) + " " + installed.error + installed.answer)
      test.finished()
    }
  }

  // An adapter not yet installed (lib/Agents.js ends with 75 unless
  // NODI_INSTALL=1, and says "nodi: adapter ready" before it runs one):
  // before any start the rows say an Enter installs it; warmed while a
  // question is typed, nothing installs, nothing fails, and typing on
  // starts nothing more; the question asked installs it, is answered, and
  // the rows stop saying so.
  Ask {
    id: consent
    acts: true
    program: ["/usr/bin/bash", "-c", '[ "${NODI_INSTALL-}" = 1 ] || { echo "nodi: fake@1 is not installed" >&2; exit 75; }; echo "nodi: adapter ready" >&2; exec "$0" claude', test.fake]
    workDir: test.dir
    toolServer: test.nodi
    toolEnv: test.toolEnv
    property int starts: 0
    property bool typed: false
    onStartedChanged: {
      if (started) { starts++; return }
      if (typed || starts !== 1) return
      typed = true
      // Once its exit is handled, as a keystroke after it would be.
      Qt.callLater(function() {
        if (consent.phase !== "idle" || consent.error) test.failures.push("a warm with nothing installed failed: " + consent.phase + " " + consent.error)
        if (!consent.install) test.failures.push("after a warm that did not install, the rows no longer say an Enter installs")
        consent.warm()
        if (consent.starts !== 1) test.failures.push("typing on started " + consent.starts + " sessions")
        consent.send("say ok")
      })
    }
    onPhaseChanged: {
      if (phase !== "error" && phase !== "done") return
      if (phase !== "done" || answer !== "ok" || install !== "" || starts !== 2)
        test.failures.push("asked after a warm that did not install: " + phase + " " + error + answer + " install " + JSON.stringify(install) + " starts " + starts)
      test.finished()
    }
  }

  // An agent of the adapter's that exits 75 for its own reasons, not the
  // launch script's word for "not installed": a warm that ends so is not
  // taken for an adapter to install, and the question fails, saying why
  // (not "adapter ready", the launch script's word before it), started
  // once, not again and again.
  Ask {
    id: own75
    program: ["/usr/bin/bash", "-c", 'echo "nodi: adapter ready" >&2; echo "out of quota" >&2; exit 75']
    workDir: test.dir
    property int starts: 0
    onStartedChanged: {
      if (started) { starts++; return }
      if (starts !== 1) return
      Qt.callLater(function() {
        if (own75.notInstalled !== "") test.failures.push("an agent's own exit 75 was taken for an adapter not installed")
        own75.send("say ok")
      })
    }
    onPhaseChanged: {
      if (phase !== "error" && phase !== "done") return
      if (phase !== "error" || !/out of quota/.test(error) || starts !== 2)
        test.failures.push("an agent's own exit 75: " + phase + " " + JSON.stringify(error) + " starts " + starts)
      test.finished()
    }
  }

  // Installed, then the session fails: the rows do not go on saying an
  // Enter installs it.
  Ask {
    id: readyThenFails
    program: ["/usr/bin/bash", "-c", 'echo "nodi: adapter ready" >&2; echo "nodi: no session" >&2; exit 1']
    workDir: test.dir
    onPhaseChanged: {
      if (phase !== "error" && phase !== "done") return
      if (phase !== "error" || install !== "") test.failures.push("ready, then a failed session: " + phase + " install " + JSON.stringify(install))
      test.finished()
    }
  }

  // A long answer: cut at the most an answer holds, said so, the turn
  // cancelled, and nothing it says after kept.
  Ask {
    id: flood
    program: [test.fake, "claude"]
    workDir: test.dir
    answerMax: 1000
    onPhaseChanged: {
      if (phase !== "error" && phase !== "done") return
      var body = answer.split("\n\n(Cut here")[0]
      if (phase !== "done" || body.length !== 1000 || !/\(Cut here: the answer ran past 1000 characters\.\)$/.test(answer) || /x$/.test(answer))
        test.failures.push("a long answer: " + phase + " " + error + " length " + answer.length + " " + JSON.stringify(answer.slice(-60)))
      test.finished()
    }
  }

  // Choosing another registry agent: the active turn is cancelled, the old
  // session and conversation are cleared, and no question is sent.
  Ask {
    id: switcher
    program: [test.fake, "claude"]
    workDir: test.dir
    property bool switched: false
    property int starts: 0
    onStartedChanged: if (started) starts++
    onPhaseChanged: {
      if (phase !== "streaming" || switched) return
      switched = true
      turns = [{ question: "before", answer: "old" }]
      waits = ({ 99: "auth" })
      stage = "session"
      ending = true
      switchAway()
      if (phase !== "idle" || question !== "" || message !== "" || answer !== "" || turns.length !== 0 || pending !== null || turn !== null
          || Object.keys(waits).length !== 0 || stage !== "off")
        test.failures.push("switch left conversation state: " + phase + "/" + question + "/" + answer + "/" + turns.length)
      switchCheck.start()
    }
  }
  Timer {
    id: switchCheck
    interval: 300
    onTriggered: {
      if (switcher.phase !== "idle" || switcher.question !== "" || switcher.pending !== null)
        test.failures.push("switch sent implicitly: " + switcher.phase + "/" + switcher.question)
      if (switcher.starts !== 1 || switcher.stage !== "off")
        test.failures.push("switch warmed a replacement implicitly: " + switcher.starts + "/" + switcher.stage)
      if (switcher.ending)
        test.failures.push("switch left the failed session ending")
      test.finished()
    }
  }

  // Enter during the old process's shutdown queues the new question and
  // starts the replacement as soon as that old process exits.
  Ask {
    id: switchPending
    program: [test.fake, "claude"]
    workDir: test.dir
    property bool switched: false
    property int starts: 0
    onStartedChanged: if (started) starts++
    onPhaseChanged: {
      if (phase === "streaming" && !switched) {
        switched = true
        switchAway()
        send("say ok")
        switchPendingDeadline.start()
      } else if (phase === "done" && switched) {
        switchPendingDeadline.stop()
        if (answer !== "ok" || starts !== 2)
          test.failures.push("question during switch did not start the replacement: " + answer + "/" + starts)
        test.finished()
      }
    }
  }
  Timer {
    id: switchPendingDeadline
    interval: 5000
    onTriggered: {
      test.failures.push("question during switch stayed pending: " + switchPending.phase + "/" + switchPending.stage)
      test.finished()
    }
  }

  // The agent's environment: none of the shell's but what Ask names
  // (qs-test.sh exports NODI_TEST_INHERITED), the agent's own, and what
  // nodi.json adds by name.
  Ask {
    id: closed
    program: ["/usr/bin/bash", "-c", 'echo "nodi: inherited=${NODI_TEST_INHERITED-none} home=${HOME:+yes} path=${PATH:+yes} own=${CLAUDE_CODE_DISABLE_CLAUDE_MDS-none}" >&2; exit 1']
    workDir: test.dir
    onPhaseChanged: {
      if (phase !== "error" && phase !== "done") return
      if (error !== "Claude stopped: inherited=none home=yes path=yes own=1") test.failures.push("the agent's environment: " + JSON.stringify(error))
      test.finished()
    }
  }
  Ask {
    id: named2
    program: ["/usr/bin/bash", "-c", 'echo "nodi: inherited=${NODI_TEST_INHERITED-none}" >&2; exit 1']
    workDir: test.dir
    passed: ["NODI_TEST_INHERITED", "not a name"]
    onPhaseChanged: {
      if (phase !== "error" && phase !== "done") return
      if (error !== "Claude stopped: inherited=leak") test.failures.push("a variable nodi.json names: " + JSON.stringify(error))
      test.finished()
    }
  }

  function start() {
    actionMarkers.start()
    flood.send("say a lot")
    switcher.send("say a lot")
    switchPending.send("say a lot")
    closed.send("q")
    named2.send("q")
    if (!consent.install) test.failures.push("before any start, the rows do not say an Enter installs")
    consent.warm()
    own75.warm()
    readyThenFails.send("say ok")
    signHang.send("sign in first")
    installed.send("say ok")
    signWarm.warm()
    named.send("use the shouter")
    picture.send("What is in the picture?", "What is in the picture?", "window", { mediaType: "image/jpeg", data: "AAAA" })
    closedBar.send("while the bar is closed")
    forgetful.send("say ok")
    lateAgain.send("Fix the spelling and grammar of the selection",
                   "Fix the spelling and grammar of the text below. Reply with the result only.\n\n<text>\nteh\n</text>", "selection")
    closing.send("the bar closes in the run")
    selected.send("Fix the spelling and grammar of the selection",
                  "Fix the spelling and grammar of the text below. Reply with the result only.\n\n<text>\nteh\n</text>", "selection")
    identityActivity.send("identity and activity")
    ask.send("lock my screen")
    searchPath.send("search then run")
    closeBeforeEnter.send("bar closes before enter")
    closeBeforeDelivery.send("close before delivery")
    mailboxLost.send("mailbox already terminal")
    outcomes.send("commit fails")
    oldTurn.send("old turn replay")
    dying.send("exit while proposing")
    recycled.send("recycle while proposing")
    plain.send("plain question", "plain question", "window", { mediaType: "image/jpeg", data: "AAAA" })
    signIn.send("sign in first")
    deadline.start()
  }

  Timer {
    id: actionMarkers
    interval: 5
    repeat: true
    onTriggered: {
      if (!closeBeforeDelivery.barClosed && closeBeforeDelivery.answer.indexOf("bound") === 0)
        closeBeforeDelivery.deliverAfterClose()
      if (!dying.failedTicket && dying.answer.indexOf("bound-exit") === 0)
        dying.deliverBeforeExit()
      if (closeBeforeDelivery.barClosed && dying.failedTicket) stop()
    }
  }

  Timer {
    id: deadline
    interval: 30000
    onTriggered: test.done(false, "not finished: " + test.remaining + " left; phases " + test.phases.join(",") + "; "
      + test.sessions.map(function(s, i) { return i + ":" + s.phase + "/" + s.stage + "/" + s.error + "/" + s.answer + "/" + s.errTail }).join(" | ") + "; " + test.failures.join("; "))
  }
}
