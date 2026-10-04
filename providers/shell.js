.pragma library
.import "../lib/Run.js" as Run

// The run mode: `> command` runs a command line, in Omarchy's floating
// terminal so its output and any question it asks are seen, or without one
// from Ctrl+K. The text is the person's own, typed here, and runs as their
// shell runs it (`shell` in lib/Run.js); nothing else feeds this mode.
//
//   > htop, > omarchy theme set "Tokyo Night", > git -C ~/Work/x pull

var provider = {
  id: "shell",
  name: "Run",
  icon: "󰆍",
  modes: [{ pattern: /^\s*>/, label: "Run", icon: "󰆍", exclusive: true, hint: "> <command line>" }],
  commands: [
    { title: "Run a command", keywords: "run shell command terminal execute", text: "> htop, > git status", complete: "> " }
  ],
  help: [
    { id: "run", title: "Run a command", icon: "󰆍", about: "A command line, in a terminal or without one",
      examples: [{ q: "> htop", note: "Opens in Omarchy's floating terminal" }, { q: "> notify-send hi", note: "Ctrl+K runs it without a terminal" }] }
  ],
  match: function(query, ctx) {
    var m = String(query).match(/^\s*>\s*(.*)$/)
    if (!m) return []
    var cmd = m[1].trim()
    if (!cmd) return [{ title: "A command line after >", subtitle: "Run", score: 40, copy: "" }]
    return [{
      key: "shell:" + cmd,
      // A command line names a moment, as a search does: never offered again
      // from the home on one Enter (Fable 2026-10-02).
      remember: false,
      title: cmd,
      subtitle: "In a terminal",
      icon: "󰆍",
      score: 98,
      copy: cmd,
      actionLabel: "Run",
      run: Run.exec(["omarchy-launch-floating-terminal-with-presentation", cmd]),
      actions: [{ label: "Run without a terminal", icon: "󰐊", run: Run.shell(cmd) }]
    }]
  }
}
