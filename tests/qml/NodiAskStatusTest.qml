import QtQuick
import Quickshell
import Quickshell.Io
import "../.."
import "../../lib/Prefs.js" as Prefs

// A waiting Ask row follows status-only startup transitions. In particular,
// becoming ready changes "Starting Alpha" to "Asking Alpha" before words,
// without a phase, activity or install change to refresh the rows.
//
// Then what Nodi tells the agent beside a question (lib/PromptContext.js), as
// an Ask is chosen: the window's class, title, workspace, pid and working
// directory, and the selection only when the action is about it and its text
// is in the message. The working directory is read when the Ask starts and
// left out when the read fails. The stand-in agent (fake-agent.py) answers
// with the _meta it was sent. One bar serves both: a second Nodi in the shell
// held up the timers of the tests running beside it.
Item {
  id: test
  signal done(bool ok, string report)
  property var failures: []
  property int step: 0
  property string pid: ""
  property string real: ""
  readonly property string base: (Quickshell.env("XDG_RUNTIME_DIR") || "/tmp") + "/nodi-ask-status-" + Date.now()
  readonly property string fake: String(Qt.resolvedUrl("fake-agent.py")).replace(/^file:\/\//, "")

  Nodi { id: nodi }

  function check(ok, what) { if (!ok) failures.push(what) }

  // The window list as a step needs it. The shell keeps nodi.windows from
  // Hyprland's own model, which a real session rewrites at any window event,
  // and an Ask checks it again as its read ends; so the step's list is set
  // again every millisecond while it runs.
  property var pinned: []
  function pinWindows(list) { test.pinned = list; nodi.windows = list }
  Timer { interval: 1; repeat: true; running: test.pinned.length > 0 && test.step < test.steps.length; onTriggered: nodi.windows = test.pinned }

  function window(extra) {
    return Object.assign({ address: "0xa", "class": "foot", title: "project", pid: test.pid, workspace: "3", stableId: "", monitor: -1, width: 0, floating: false }, extra || {})
  }

  // Each step: set the bar's state, choose the Ask, then read what the agent
  // was sent from its answer.
  readonly property var steps: [
    { name: "an action about the selection", q: "Fix the selection",
      go: function() {
        nodi.cameFrom = test.window()
        test.pinWindows([{ address: "0xa", workspaceId: 3, pid: Number(test.pid) }])
        nodi.selection = "teh"
        nodi.selectionSource = "selection"
        nodi.selectionSeenAt = Date.now() - 4000
        nodi.doNodi({ nodi: "askWith", ask: { question: "Fix the selection", message: "echo prompt context fix\n\n<text>\nteh\n</text>", context: "selection", purpose: "fix" } })
      },
      want: function(m) {
        test.check(m && m.version === 1 && m.purpose === "fix", "version and purpose: " + JSON.stringify(m))
        test.check(JSON.stringify(m.window) === JSON.stringify({ "class": "foot", cwd: test.real, pid: Number(test.pid), title: "project", workspace: 3 }), "the window: " + JSON.stringify(m.window))
        test.check(m.selection && m.selection.text === "teh" && m.selection.source === "primary" && m.selection.ageMs >= 4000 && m.selection.ageMs < 9000, "the selection: " + JSON.stringify(m.selection))
      } },
    { name: "a copy", q: "Explain the copied text",
      go: function() {
        nodi.selection = "copied words"
        nodi.selectionSource = "clipboard"
        nodi.copiedSeenAt = Date.now() - 100
        nodi.doNodi({ nodi: "askWith", ask: { question: "Explain the copied text", message: "echo prompt context explain\n\n<text>\ncopied words\n</text>", context: "copied", purpose: "explain" } })
      },
      want: function(m) {
        test.check(m.purpose === "explain" && m.selection && m.selection.source === "clipboard" && m.selection.text === "copied words", "a copy: " + JSON.stringify(m))
      } },
    { name: "an Ask that is not about the selection leaves it out", q: "echo prompt context plain",
      go: function() {
        nodi.selection = "secret words"
        nodi.selectionSource = "selection"
        nodi.input.text = "ask echo prompt context plain"
        nodi.doNodi({ nodi: "ask" })
      },
      want: function(m) {
        test.check(m.purpose === "ask" && m.window && m.window.cwd === test.real, "a plain ask: " + JSON.stringify(m))
        test.check(m.selection === undefined, "no selection beyond the action's own: " + JSON.stringify(m))
      } },
    { name: "a selection the message does not hold is left out", q: "Fix a text that is not there",
      go: function() {
        nodi.selection = "something else"
        nodi.selectionSource = "selection"
        nodi.doNodi({ nodi: "askWith", ask: { question: "Fix a text that is not there", message: "echo prompt context mismatch\n\n<text>\nteh\n</text>", context: "selection", purpose: "fix" } })
      },
      want: function(m) { test.check(m.selection === undefined && m.purpose === "fix", "text not in the message: " + JSON.stringify(m)) } },
    { name: "a source the context does not name is left out", q: "Fix a text of another source",
      go: function() {
        nodi.selection = "teh"
        nodi.selectionSource = "clipboard"
        nodi.doNodi({ nodi: "askWith", ask: { question: "Fix a text of another source", message: "echo prompt context source\n\n<text>\nteh\n</text>", context: "selection", purpose: "fix" } })
      },
      want: function(m) { test.check(m.selection === undefined, "another source: " + JSON.stringify(m)) } },
    { name: "a window picture's ask carries no selection", q: "What is in the window",
      go: function() {
        nodi.selection = "teh"
        nodi.selectionSource = "selection"
        nodi.doNodi({ nodi: "askWith", ask: { question: "What is in the window", message: "echo prompt context window teh", context: "window", purpose: "ask" } })
      },
      want: function(m) { test.check(m.selection === undefined && m.window && m.window.cwd === test.real, "window context: " + JSON.stringify(m)) } },
    { name: "a window that is gone: no working directory, the question still goes", q: "Where did it go",
      go: function() {
        nodi.cameFrom = test.window({ pid: "4194301" })
        test.pinWindows([{ address: "0xa", workspaceId: 3, pid: 4194301 }])
        nodi.doNodi({ nodi: "askWith", ask: { question: "Where did it go", message: "echo prompt context gone", context: "", purpose: "ask" } })
      },
      want: function(m) {
        test.check(m.window && m.window["class"] === "foot" && m.window.pid === 4194301 && m.window.cwd === undefined, "a vanished process: " + JSON.stringify(m))
      } },
    { name: "a window the list no longer holds has no working directory, though its pid is live", q: "Whose directory",
      go: function() {
        // The window closed and the list holds another window under that
        // pid, as after the number was taken: the live process is not the
        // window's, so its directory is not read.
        nodi.cameFrom = test.window()
        test.pinWindows([{ address: "0xb", workspaceId: 1, pid: Number(test.pid) }])
        nodi.doNodi({ nodi: "askWith", ask: { question: "Whose directory", message: "echo prompt context replaced", context: "", purpose: "ask" } })
      },
      want: function(m) {
        test.check(m.window && m.window["class"] === "foot" && m.window.cwd === undefined, "a replaced window: " + JSON.stringify(m))
        test.check(JSON.stringify(m).indexOf("0x") === -1, "no window address in the note: " + JSON.stringify(m))
      } },
    { name: "a window whose pid changed has no working directory", q: "Whose directory now",
      go: function() {
        nodi.cameFrom = test.window()
        test.pinWindows([{ address: "0xa", workspaceId: 3, pid: Number(test.pid) + 1 }])
        nodi.doNodi({ nodi: "askWith", ask: { question: "Whose directory now", message: "echo prompt context repid", context: "", purpose: "ask" } })
      },
      want: function(m) { test.check(m.window && m.window.cwd === undefined, "another pid for the address: " + JSON.stringify(m)) } },
    { name: "a window the list holds is read again", q: "Whose directory again",
      go: function() {
        nodi.cameFrom = test.window()
        test.pinWindows([{ address: "0xa", workspaceId: 3, pid: Number(test.pid) }])
        nodi.doNodi({ nodi: "askWith", ask: { question: "Whose directory again", message: "echo prompt context held", context: "", purpose: "ask" } })
      },
      want: function(m) { test.check(m.window && m.window.cwd === test.real, "the same window: " + JSON.stringify(m)) } },
    { name: "a window's picture is pending while the bar's window changes: the first window's context is sent", q: "echo prompt context pending",
      go: function() {
        nodi.cameFrom = test.window({ stableId: "deadbeef", width: 800 })
        test.pinWindows([{ address: "0xa", workspaceId: 3, pid: Number(test.pid) }])
        nodi.doNodi({ nodi: "askWindow", ask: { question: "echo prompt context pending", message: "echo prompt context pending", context: "window", purpose: "ask" } })
        // The capture is a program still running: the bar now knows another window.
        nodi.cameFrom = test.window({ address: "0xz", "class": "other", title: "other title", pid: "4194301", workspace: "9", stableId: "feedface" })
      },
      want: function(m) {
        test.check(m.window && m.window["class"] === "foot" && m.window.title === "project" && m.window.pid === Number(test.pid) && m.window.workspace === 3,
                   "the window the question was asked about: " + JSON.stringify(m))
        test.check(m.window && m.window.cwd === test.real, "its own directory, its address still in the list: " + JSON.stringify(m))
        test.check(JSON.stringify(m).indexOf("0x") === -1 && JSON.stringify(m).indexOf("other") === -1, "no address, nothing of the other window: " + JSON.stringify(m))
      } },
    { name: "a window gone from the list while its picture is pending has no working directory", q: "echo prompt context pending gone",
      go: function() {
        nodi.cameFrom = test.window({ stableId: "deadbeef", width: 800 })
        test.pinWindows([{ address: "0xa", workspaceId: 3, pid: Number(test.pid) }])
        nodi.doNodi({ nodi: "askWindow", ask: { question: "echo prompt context pending gone", message: "echo prompt context pending gone", context: "window", purpose: "ask" } })
        nodi.cameFrom = test.window({ address: "0xz", "class": "other", title: "other title", pid: String(Number(test.pid)), workspace: "9" })
        test.pinWindows([{ address: "0xz", workspaceId: 9, pid: Number(test.pid) }])
      },
      want: function(m) {
        test.check(m.window && m.window["class"] === "foot" && m.window.cwd === undefined, "the original window's context, no directory: " + JSON.stringify(m))
        test.check(JSON.stringify(m).indexOf("0x") === -1 && JSON.stringify(m).indexOf("other") === -1, "no address, nothing of the other window: " + JSON.stringify(m))
      } },
    { name: "no window at all: no window, the question still goes", q: "Alone in the bar",
      go: function() {
        nodi.cameFrom = test.window({ address: "", "class": "", title: "", pid: "", workspace: "" })
        nodi.doNodi({ nodi: "askWith", ask: { question: "Alone in the bar", message: "echo prompt context alone", context: "", purpose: "ask" } })
      },
      want: function(m) { test.check(m.window === undefined && m.version === 1, "no window: " + JSON.stringify(m)) } }
  ]

  function askRow() {
    for (var i = 0; i < nodi.results.length; i++)
      if (nodi.results[i].key === "ask:wait") return nodi.results[i]
    return null
  }

  function start() {
    setup.command = ["/usr/bin/bash", "-c",
      'mkdir -p "$1/work dir" && ln -sf "$2" "$1/alpha" && cd "$1/work dir" && { sleep 120 </dev/null >/dev/null 2>&1 & echo "$!"; readlink -f .; }',
      "nodi-ask-status", base, fake]
    setup.running = true
    deadline.start()
  }

  Process {
    id: setup
    stdout: StdioCollector { id: setupOut }
    onExited: {
      var lines = setupOut.text.split("\n")
      test.pid = lines[0]
      test.real = lines[1]
      nodi.defaultConfig = {
        providers: ["ask"],
        fallbacks: [],
        ask: {
          agent: "alpha",
          agents: [{ id: "alpha", name: "Alpha", command: [test.base + "/alpha", "plain", "installing"] }]
        }
      }
      nodi.userConfig = ({})
      nodi.prefs = Prefs.empty()
      nodi.agentAvailability = ({ alpha: true })
      nodi.open("{}")
      nodi.input.text = "ask wait before words"
      askNow.start()
    }
  }

  Timer {
    id: askNow
    interval: 0
    onTriggered: {
      nodi.doNodi({ nodi: "ask" })
      observe.start()
    }
  }

  Timer {
    id: observe
    interval: 20
    repeat: true
    property bool sawInstalling: false
    onTriggered: {
      var ask = nodi.services().ask
      if (/^Installing fake@1/.test(ask.status || "")) sawInstalling = true
      if (ask.phase === "waiting" && ask.status === "Asking Alpha") {
        stop()
        test.check(sawInstalling, "the fixture never crossed its setup-only status")
        var row = test.askRow()
        test.check(row && row.title === "Asking Alpha...",
                   "the row stayed stale while the pane said Asking Alpha: "
                   + JSON.stringify(row ? row.title : "no Ask row"))
        finish.start()
      }
    }
  }

  Timer {
    id: finish
    interval: 50
    repeat: true
    onTriggered: {
      if (nodi.services().ask.phase !== "done") return
      stop()
      context.start()
    }
  }

  Timer {
    id: context
    interval: 10
    onTriggered: {
      if (test.step >= test.steps.length) { cleanup.running = true; return }
      test.steps[test.step].go()
      poll.start()
    }
  }

  // The answer of the step's own question, once it is whole.
  Timer {
    id: poll
    interval: 30
    repeat: true
    onTriggered: {
      var ask = nodi.services().ask
      if (ask.phase === "error") {
        stop()
        test.failures.push(test.steps[test.step].name + ": " + ask.error)
        test.step = test.steps.length
        context.start()
        return
      }
      var key = test.steps[test.step].name
      if (ask.phase !== "done" || ask.question !== test.steps[test.step].q) return
      stop()
      var m = null
      try { m = JSON.parse(ask.answer) } catch (e) { test.failures.push(key + ": answer " + JSON.stringify(ask.answer)) }
      if (m === null) test.failures.push(key + ": no _meta was sent")
      else if (m && m.nodi) test.steps[test.step].want(m.nodi)
      else if (m) test.failures.push(key + ": _meta without nodi " + JSON.stringify(m))
      test.step++
      context.start()
    }
  }

  Process {
    id: cleanup
    command: ["/usr/bin/bash", "-c", 'kill "$2" 2>/dev/null; rm -rf -- "$1"', "nodi-ask-status", test.base, test.pid]
    onExited: {
      deadline.stop()
      test.done(test.failures.length === 0, test.failures.join("; "))
    }
  }

  Timer {
    id: deadline
    interval: 25000
    onTriggered: {
      var ask = nodi.services().ask
      test.failures.push("timed out at " + ask.phase + "/" + ask.status)
      cleanup.running = true
    }
  }
}
