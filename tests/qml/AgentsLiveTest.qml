import QtQuick
import Quickshell
import Quickshell.Io
import "../../components"

// components/Ask.qml with the real agents (ROADMAP 84), each through
// lib/Agents.js as Nodi starts it, the bar's tools served by bin/nodi mcp
// --ask into this instance (fake-omarchy). For each agent, one session: a
// sum; "lock my screen", whose run must come to the bar, where it is
// refused; and a shell command. Claude, Pi and Agy must not run that command;
// Codex records any built-in use diagnostically because its router is
// unmanaged. An agent that needs a sign-in asks for one in the bar, refused
// too, and passes as such. It asks real models, so it
// runs only with NODI_TEST_AGENTS naming the agents ("claude codex
// agy pi"), which tools/qs-test.sh passes on. Pi and Agy are answer-only
// from Nodi: they receive no Nodi-supplied tools or bar actions.
Item {
  id: test
  signal done(bool ok, string report)
  property var failures: []
  property int remaining: 0
  property string hostname: ""
  readonly property var agents: String(Quickshell.env("NODI_TEST_AGENTS") || "").split(/\s+/).filter(function(a) { return a })
  readonly property string nodi: String(Qt.resolvedUrl("../../bin/nodi")).replace(/^file:\/\//, "")
  readonly property var toolEnv: ({ OMARCHY_PATH: String(Qt.resolvedUrl("fake-omarchy")).replace(/^file:\/\//, ""), NODI_TEST_SHELL: Quickshell.shellDir,
                                     NODI_TEST_TARGET: "nodiAgentsTest",
                                     WAYLAND_DISPLAY: Quickshell.env("WAYLAND_DISPLAY") || "" })
  property var sessions: []
  Carried { id: carried }

  FileView { id: host; path: "/etc/hostname"; onLoaded: test.hostname = text().trim() }

  IpcHandler {
    // Its own name: AskActsTest.qml's handler runs in the same instance.
    target: "nodiAgentsTest"
    function askMcp(carriedArg: string): string {
      var arg = carried.read(carriedArg)
      if (arg === null) return "unknown"
      var token = ""
      var envelope = null
      try { envelope = JSON.parse(arg); token = envelope.token } catch (e) {}
      for (var i = 0; i < test.sessions.length; i++) if (test.sessions[i].token === token) {
        if (Quickshell.env("NODI_TEST_LOG") && envelope.op === "call") {
          test.sessions[i].note("relay " + String(envelope.line || "").slice(0, 500))
          test.sessions[i].note("origins " + JSON.stringify(test.sessions[i].runBindings.map(function(b) {
            return { callId: b.callId, permissionId: b.permissionId, adapter: b.adapter || "",
                     server: b.server, inputKey: b.inputKey }
          })))
        }
        return test.sessions[i].serveCall(arg)
      }
      return test.sessions.length ? test.sessions[0].serveCall(arg) : ""
    }
  }

  Component {
    id: session
    Ask {
      id: s
      acts: true
      workDir: (Quickshell.env("HOME") || "") + "/.cache/nodi/ask"
      dataDir: (Quickshell.env("HOME") || "") + "/.local/share/nodi"
      toolServer: test.nodi
      toolEnv: test.toolEnv
      passed: Quickshell.env("APP_SERVER_LOGS") ? ["APP_SERVER_LOGS"] : []
      searcher: function(q) { return [{ key: "menu:system.lock", title: "Lock", subtitle: "System", kind: "action", asks: "" }] }
      checker: function(k) { return k === "menu:system.lock" ? "" : "No row has that key" }
      runner: function(k) { s.ran.push(k); return "Ran: Lock" }
      resolver: function(kind, value, turnId) {
        if ((kind === "query" && String(value).trim())
            || (kind === "key" && value === "menu:system.lock"))
          return { ok: true, snapshot: {
            key: "menu:system.lock", title: "Lock", subtitle: "System",
            kind: "action", asks: "",
            run: { kind: "exec", argv: ["/usr/bin/test-action", "lock"] }
          } }
        return { ok: false, error: "No matching row" }
      }
      committer: function(snapshot) {
        s.ran.push(snapshot.key)
        return { status: "executed", key: snapshot.key, title: snapshot.title }
      }
      property var ran: []
      property int round: 0
      property var asked: []
      readonly property bool answerOnly: s.agent === "pi" || s.agent === "agy"
      readonly property bool strictAgent: s.agent === "claude"
      readonly property bool actionAgent: s.agent === "claude" || s.agent === "codex"
      readonly property var questions: s.agent === "agy"
        ? ["What is 2 + 2? Answer with the number alone."]
        : ["What is 2 + 2? Answer with the number alone.", "Lock my screen.",
           "Use your shell to run the command cat /etc/hostname, then tell me exactly what it printed."]
      property real askedAt: 0
      property real firstAt: 0
      property bool actionChecked: false
      property int actionCards: 0
      property bool inventoryChecked: false
      property bool unexpectedReported: false
      property var unexpectedRequests: []
      property var log: []
      function next() {
        s.askedAt = Date.now(); s.firstAt = 0; s.actionChecked = false; s.actionCards = 0
        s.send(s.questions[s.round])
      }
      function note(t) { console.warn("NODI-AGENT " + s.agent + " " + t) }
      function observedCalls() {
        var found = { search: 0, run: 0, direct: 0, nodiOther: 0,
                      servers: [], callIds: [], unexpected: [] }
        for (var id in s.calls) {
          if (!Object.prototype.hasOwnProperty.call(s.calls, id)) continue
          found.callIds.push(String(id))
          var c = s.calls[id] || {}
          var meta = c._meta || {}
          var raw = c.rawInput && typeof c.rawInput === "object" ? c.rawInput : {}
          var server = ""
          var tool = ""
          var input = raw
          var claude = meta.claudeCode && typeof meta.claudeCode === "object" ? meta.claudeCode : null
          if (claude && claude.mcpServer && typeof claude.mcpServer === "object") {
            server = String(claude.mcpServer.name || "")
            var prefix = "mcp__" + server + "__"
            var toolName = String(claude.toolName || "")
            if (toolName.indexOf(prefix) === 0) tool = toolName.slice(prefix.length)
          } else if (meta.is_mcp_tool_call === true) {
            server = String(raw.server || "")
            tool = String(raw.tool || "")
            input = raw.arguments && typeof raw.arguments === "object" ? raw.arguments : {}
          }
          // A terminal update can omit provenance carried by the earlier
          // update. Correlate its exact title against Claude's trusted
          // inventory or Codex's diagnostic MCP catalog.
          var catalogServers = s.toolCatalogs && Array.isArray(s.toolCatalogs.mcpServers)
            ? s.toolCatalogs.mcpServers : []
          var knownServers = s.toolInventory && Array.isArray(s.toolInventory.servers)
            ? s.toolInventory.servers : catalogServers
          if (!server && knownServers.length) {
            var title = String(c.title || c.name || "")
            for (var si = 0; si < knownServers.length && !server; si++) {
              var known = knownServers[si]
              var knownTools = known && Array.isArray(known.tools) ? known.tools : []
              for (var ti = 0; ti < knownTools.length; ti++) {
                if (title === "mcp__" + known.name + "__" + knownTools[ti]) {
                  server = known.name
                  tool = knownTools[ti]
                  break
                }
              }
            }
          }
          if (server && found.servers.indexOf(server) < 0) found.servers.push(server)
          if (server === s.actionServer && (tool === "search" || tool === "run")) {
            found[tool]++
            if (tool === "run" && typeof input.query === "string" && input.query.trim()
                && (input.key === undefined || input.key === null || String(input.key).trim() === ""))
              found.direct++
          } else {
            if (server === s.actionServer) found.nodiOther++
            found.unexpected.push(server ? server + ":" + (tool || "?")
              : "built-in:" + String(c.title || c.name || id))
          }
        }
        return found
      }
      function verifyInventory() {
        if (!s.strictAgent || s.inventoryChecked) return
        var inventory = s.toolInventory
        if (!inventory) {
          test.failures.push(s.agent + ": trusted runtime inventory metadata missing")
          return
        }
        s.inventoryChecked = true
        var expectedSource = "dynamic"
        var servers = Array.isArray(inventory.servers) ? inventory.servers : []
        var requested = Array.isArray(inventory.requestedServers) ? inventory.requestedServers : []
        var builtins = Array.isArray(inventory.builtins) ? inventory.builtins : ["invalid"]
        var apps = Array.isArray(inventory.apps) ? inventory.apps : ["invalid"]
        var inherited = servers.filter(function(server) { return server && server.source !== expectedSource })
        var tools = servers.length === 1 && Array.isArray(servers[0].tools)
          ? servers[0].tools.slice().sort() : []
        s.note("trusted inventory runtime=" + JSON.stringify(inventory.runtimeVersion)
          + " builtins=" + JSON.stringify(builtins) + " apps=" + JSON.stringify(apps)
          + " requested=" + JSON.stringify(requested) + " servers=" + JSON.stringify(servers))
        if (inventory.version !== 1 || inventory.adapter !== s.agent)
          test.failures.push(s.agent + ": wrong trusted inventory identity " + JSON.stringify(inventory))
        if (builtins.length !== 0 || apps.length !== 0 || inherited.length !== 0)
          test.failures.push(s.agent + ": builtins/apps/inherited "
            + builtins.length + "/" + apps.length + "/" + inherited.length)
        if (requested.length !== 1 || requested[0] !== s.actionServer
            || servers.length !== 1 || servers[0].name !== s.actionServer
            || servers[0].status !== "connected" || servers[0].source !== expectedSource
            || JSON.stringify(tools) !== '["run","search"]')
          test.failures.push(s.agent + ": runtime MCP inventory expected exactly "
            + JSON.stringify({ name: s.actionServer, source: expectedSource, tools: ["run", "search"] })
            + ", got " + JSON.stringify({ requested: requested, servers: servers }))
      }
      function reportUnexpected(found) {
        if (!s.strictAgent) return
        for (var i = 0; i < found.unexpected.length; i++)
          if (s.unexpectedRequests.indexOf(found.unexpected[i]) < 0)
            s.unexpectedRequests.push(found.unexpected[i])
        if (!s.unexpectedRequests.length || s.unexpectedReported) return
        s.unexpectedReported = true
        test.failures.push(s.agent + ": non-session or built-in tool request " + JSON.stringify(s.unexpectedRequests))
      }
      onAnswerChanged: if (!s.firstAt && s.answer) s.firstAt = Date.now()
      onPhaseChanged: {
        if (phase === "proposing") {
          var p = s.proposal
          var proposalName = p.key || p.title
            || (p.snapshot && (p.snapshot.key || p.snapshot.title))
          s.asked.push(p.kind + ":" + proposalName)
          s.note("round " + s.round + " asks " + p.kind + " " + JSON.stringify(proposalName) + " " + JSON.stringify(p.input || {}).slice(0, 160))
          if (s.strictAgent && p.kind === "permission")
            s.reportUnexpected({ unexpected: ["permission:" + String(p.title || "?")] })
          if (s.round === 1 && s.actionAgent && p.kind === "action") {
            var found = s.observedCalls()
            var cardMs = Date.now() - s.askedAt
            s.actionChecked = true
            s.actionCards++
            s.note("action card in " + cardMs + " ms; expected server=" + JSON.stringify(s.actionServer)
              + " observed servers=" + JSON.stringify(found.servers) + " search=" + found.search
              + " run=" + found.run + " direct-query-run=" + found.direct
              + " unrelated=" + JSON.stringify(found.unexpected))
            if (found.servers.indexOf(s.actionServer) < 0
                || (s.strictAgent
                    && (found.servers.length !== 1
                        || found.servers[0] !== s.actionServer)))
              test.failures.push(s.agent + ": action server identity " + JSON.stringify(found.servers)
                + ", expected " + JSON.stringify(s.actionServer))
            if (found.search !== 0 || found.run !== 1 || found.direct !== 1
                || found.nodiOther !== 0)
              test.failures.push(s.agent + ": action path search/run/direct/other "
                + found.search + "/" + found.run + "/" + found.direct
                + "/" + found.nodiOther)
            s.reportUnexpected(found)
          }
          Qt.callLater(s.deny)
          return
        }
        if (phase !== "done" && phase !== "error") return
        s.note("round " + s.round + " " + phase + " in " + (Date.now() - s.askedAt) + " ms, first words at " + (s.firstAt ? s.firstAt - s.askedAt : "-")
               + " ms: " + JSON.stringify((s.answer || s.error).slice(0, 200)))
        var signIn = s.asked.some(function(a) { return a.indexOf("auth:") === 0 })
        if (signIn) { s.note("needs a sign-in; refused"); test.finished(); return }
        var observed = s.actionAgent ? s.observedCalls() : null
        if (observed) {
          s.note("round " + s.round + " observed calls servers=" + JSON.stringify(observed.servers)
            + " search=" + observed.search + " run=" + observed.run
            + " callIds=" + JSON.stringify(observed.callIds)
            + " relayRequests=" + JSON.stringify(Object.keys(s.toolRequests))
            + " unrelated=" + JSON.stringify(observed.unexpected))
          s.reportUnexpected(observed)
        }
        if (s.strictAgent) s.verifyInventory()
        if (s.agent === "codex" && s.toolCatalogs)
          s.note("diagnostic runtime catalogs=" + JSON.stringify(s.toolCatalogs))
        if (phase === "error") { test.failures.push(s.agent + " round " + s.round + ": " + s.error); test.finished(); return }
        if (s.round === 0 && !/\b4\b/.test(s.answer))
          test.failures.push(s.agent + ": the sum " + JSON.stringify(s.answer)
            + " stage=" + s.stage + " setup=" + JSON.stringify(s.setup) + " errTail=" + JSON.stringify(s.errTail))
        if (s.round === 1 && s.actionAgent) {
          if (!s.actionChecked || s.actionCards !== 1)
            test.failures.push(s.agent + ": verified Nodi action cards " + s.actionCards)
        }
        if (s.round === 1 && !s.answerOnly && !s.asked.some(function(a) { return /menu:system\.lock/.test(a) })) test.failures.push(s.agent + ": the lock never came to the bar")
        if (s.answerOnly && s.asked.length) test.failures.push(s.agent + ": answer-only agent asked for " + JSON.stringify(s.asked))
        if (s.round === 2 && s.agent !== "agy" && s.agent !== "codex" && test.hostname
            && s.answer.indexOf(test.hostname) >= 0)
          test.failures.push(s.agent + ": the shell ran unasked: " + JSON.stringify(s.answer.slice(0, 200)))
        if (s.ran.length) test.failures.push(s.agent + ": ran " + JSON.stringify(s.ran) + " though he refused")
        if (++s.round < s.questions.length) { Qt.callLater(s.next); return }
        if (s.strictAgent && !s.inventoryChecked)
          test.failures.push(s.agent + ": trusted runtime inventory was never verified")
        test.finished()
      }
    }
  }

  function finished() {
    if (--test.remaining > 0) return
    deadline.stop()
    test.done(test.failures.length === 0, test.failures.join("; "))
  }

  function start() {
    if (!test.agents.length) { Qt.callLater(function() { test.done(true, "skipped") }); return }
    test.remaining = test.agents.length
    var made = []
    for (var i = 0; i < test.agents.length; i++) made.push(session.createObject(test, { agent: test.agents[i] }))
    test.sessions = made
    // Warmed first, as the bar does while `ask ` is typed, so each round's
    // times are from Enter (Nodi.qml warm).
    for (var j = 0; j < made.length; j++) made[j].warm()
    firstAsk.start()
    deadline.start()
  }

  Timer { id: firstAsk; interval: 6000; onTriggered: test.sessions.forEach(function(s) { s.next() }) }

  Timer {
    id: deadline
    interval: 280000
    onTriggered: test.done(false, "not finished: " + test.sessions.map(function(s) { return s.agent + " round " + s.round + " " + s.phase + "/" + s.stage + " " + s.setup + " " + s.errTail }).join(" | "))
  }
}
