.pragma library

// The run contract: what a row does on Enter, and the only place in Nodi that
// turns that into a command. Providers describe; this builds.
//
//   exec    { argv }              the argv, nothing interpreted
//   shell   { script, args? }     bash -c on text the user or Omarchy wrote:
//                                 a keyword's `run`, a menu `action`; data
//                                 for it goes in `args`, read as "$1"...
//   app     { id, action?, actionId? }  a desktop entry, launched as Omarchy
//                                 does; an action by its place, and by the
//                                 id its [Desktop Action] section gives it
//   window  { address }           focus a Hyprland window (hex address only)
//   open    { target }            xdg-open a URL or an absolute path
//   summon  { id, payload? }      open a shell plugin with a JSON payload
//   copy    { text }              put text on the clipboard
//
// Data never becomes shell text. Where a step needs bash (a fallback, two
// steps in order), the script is a constant here and the data arrives as its
// positional arguments.

var KINDS = ["exec", "shell", "app", "window", "open", "summon", "copy"]

var HEX_ADDRESS = /^0x[0-9a-fA-F]+$/
var PLUGIN_ID = /^[A-Za-z0-9][A-Za-z0-9._-]*$/
// A desktop file's name without .desktop. Omarchy's web apps put spaces in
// theirs ("Google Calendar"), which is safe here: the id reaches gtk-launch
// as one argument. No slash, so it names a file in the search path, and no
// control character, C1 included (Fable 2026-10-04).
var DESKTOP_ID = /^[A-Za-z0-9][^\/\x00-\x1f\x7f-\x9f]*$/

// Focus a window: the Lua dispatcher first, then the classic one, so the same
// row works on Hyprland before and after its Lua config.
var FOCUS_SCRIPT = 'hyprctl dispatch "hl.dsp.focus({ window = \\"address:$1\\" })" >/dev/null 2>&1'
  + ' || hyprctl dispatch focuswindow "address:$1" >/dev/null 2>&1'

// Bring a window to the workspace you are on, then focus it.
var BRING_SCRIPT = 'hyprctl dispatch "hl.dsp.window.move({ window = \\"address:$1\\", workspace = \\"$2\\", follow = false })" >/dev/null 2>&1'
  + ' && hyprctl dispatch "hl.dsp.focus({ window = \\"address:$1\\" })" >/dev/null 2>&1'

// Focus the window a paste is for, then the paste (ROADMAP 69, X 20): the
// bar's close gives the focus back to the window it opened over, but not
// when the pointer or an app took it meanwhile, and the keys of a paste
// go where the focus is.
var FOCUS_FIRST = 'a=$1; shift; hyprctl dispatch "hl.dsp.focus({ window = \\"address:$a\\" })" >/dev/null 2>&1 || hyprctl dispatch focuswindow "address:$a" >/dev/null 2>&1; exec "$@"'

// The programs that type into the focused window: Omarchy's pastes, never
// their copy-only form.
var PASTERS = { "omarchy-menu-emoji-insert": true, "omarchy-clipboard-paste-text": true, "omarchy-clipboard-paste-file": true }

function pastes(run) {
  if (!run) return false
  if (run.kind === "shell") return run.paste === true
  return run.kind === "exec" && Array.isArray(run.argv) && PASTERS[run.argv[0]] === true && run.argv.indexOf("--copy-only") === -1
}

// A shell run that types into the focused window, marked so (a snippet
// with its cursor moved back, "Type it out", a paste in sequence): it is
// a paste too (Sonnet 2026-10-07: these escaped the focus).
function pasting(run) {
  if (!run || run.kind !== "shell") return run
  var c = { kind: "shell", script: run.script, paste: true }
  if (run.args !== undefined) c.args = run.args
  return c
}

// A paste's command with the window it is for focused first; any other
// command, or no window known, as it is.
function focusFirst(run, argv, address) {
  if (!pastes(run) || !Array.isArray(argv) || !HEX_ADDRESS.test(String(address || ""))) return argv
  return ["/usr/bin/bash", "-c", FOCUS_FIRST, "nodi-paste", String(address)].concat(argv)
}

function isString(v) { return typeof v === "string" }

// "" when the run is well formed, else why not. Rows with a bad run are shown
// without one, so a provider bug costs an action, never a wrong command.
function problem(run) {
  if (!run || typeof run !== "object") return "no run"
  switch (run.kind) {
  case "exec":
    if (!Array.isArray(run.argv) || run.argv.length === 0) return "exec needs argv"
    for (var i = 0; i < run.argv.length; i++) if (!isString(run.argv[i])) return "argv must be strings"
    if (!run.argv[0]) return "empty program"
    // exec would take it as an option of its own (Akshi's check 2026-10-05).
    if (run.argv[0].charAt(0) === "-") return "program looks like an option"
    return ""
  case "shell":
    if (!isString(run.script) || !run.script.trim()) return "shell needs a script"
    if (run.args !== undefined && (!Array.isArray(run.args) || run.args.some(function(a) { return !isString(a) }))) return "shell args must be strings"
    return ""
  case "app":
    if (!isString(run.id) || !DESKTOP_ID.test(run.id)) return "bad desktop id"
    if (run.action !== undefined && run.action !== null && !(run.action >= 0 && Math.floor(run.action) === run.action)) return "bad action index"
    if (run.actionId !== undefined && (typeof run.actionId !== "string" || !run.actionId)) return "bad action id"
    return ""
  case "window":
    return isString(run.address) && HEX_ADDRESS.test(run.address) ? "" : "window address must be hex"
  case "open":
    if (!isString(run.target) || !run.target) return "open needs a target"
    if (run.target[0] === "-") return "target looks like an option"
    return /^[a-z][a-z0-9+.-]*:/i.test(run.target) || run.target[0] === "/" ? "" : "target must be a URL or an absolute path"
  case "summon":
    return isString(run.id) && PLUGIN_ID.test(run.id) ? "" : "bad plugin id"
  case "copy":
    return isString(run.text) && run.text !== "" ? "" : "copy needs text"
  default:
    return "unknown kind " + String(run.kind)
  }
}

function valid(run) { return problem(run) === "" }

// Everything starts the way Omarchy's menu starts things (Util.execArgv and
// Util.execDetached in the shell's Commons): under a login shell, so the
// user's PATH and session reach what is launched, and argv through the
// constant `exec "$@"`, so the arguments stay positional and are never
// re-read as shell.
function login(argv) { return ["bash", "-lc", 'exec "$@"', "nodi"].concat(argv) }

// A command or a script, watched (X 4, ROADMAP 53): run as before, its
// stderr's last 4 KB kept, and if it exits non-zero having said why, a
// notification "<title> failed" with that line. An exit by a signal (128
// and up: closed, Ctrl+C) or a failure that says nothing is quiet, so a
// toggle's ordinary non-zero exit is no alarm. The pipe is opened with
// `exec {fd}>`, so `$!` is its reader and can be waited for (a `2> >(...)`
// leaves `$!` unset, and the line was read before it was written; Fable
// 2026-10-05); the command gets it as stderr and not as another fd. If a
// child it left keeps stderr open past a second, nothing is said. The
// title and the command stay positional, never read as shell. The file is
// opened here and its reader given the descriptor: given the path, it
// opened it after the `rm -f` below on a fast command under load, and an
// empty file was left behind (4 in 1200 runs measured, 2026-10-06).
var WATCH = [
  "t=$1; shift",
  "e=$(mktemp \"${XDG_RUNTIME_DIR:-/tmp}/nodi-err.XXXXXX\") || exec \"$@\"",
  "exec {o}>\"$e\"",
  "exec {fd}> >(tail -c 4096 >&$o)",
  "tp=$!",
  "exec {o}>&-",
  "\"$@\" 2>&$fd {fd}>&-; rc=$?",
  "exec {fd}>&-",
  "if [ \"$rc\" -ne 0 ] && [ \"$rc\" -lt 128 ]; then",
  "  for i in 1 2 3 4 5 6 7 8 9 10; do kill -0 \"$tp\" 2>/dev/null || break; sleep 0.1; done",
  "  if ! kill -0 \"$tp\" 2>/dev/null; then",
  "    line=$(tr -d \"\\r\" < \"$e\" | sed -n \"/[^[:space:]]/h; \\${x;p}\")",
  "    line=${line:0:200}",
  "    [ -n \"$line\" ] && notify-send -a Nodi -- \"$t failed\" \"$line\"",
  "  fi",
  "fi",
  "rm -f -- \"$e\"",
  "exit \"$rc\""
].join("\n")

function watched(title, argv) { return ["bash", "-lc", WATCH, "nodi", String(title || "Nodi")].concat(argv) }

// The argv to start. `appAction(id, index)` returns the parsed Exec of a
// desktop action (only Quickshell's DesktopEntries knows it), given the
// action's place and, when the run names one, its id, which must still
// name that action (an entry updated since may have moved or dropped it).
// With `title`, a command or a script is watched for failing (watched).
// `focus`: the window a paste is for (focusFirst), focused before it.
function command(run, appAction, title, focus) {
  if (!valid(run)) return null
  switch (run.kind) {
  case "exec":
    return focusFirst(run, title ? watched(title, run.argv) : login(run.argv), focus)
  case "shell":
    var script = ["bash", "-lc", run.script, "nodi"].concat(run.args || [])
    return focusFirst(run, title ? watched(title, script) : script, focus)
  case "app":
    if (run.action !== undefined && run.action !== null) {
      var cmd = appAction ? appAction(run.id, run.action, run.actionId) : null
      if (!Array.isArray(cmd) || cmd.length === 0) return null
      return login(["uwsm-app", "--"].concat(cmd.map(String)))
    }
    return login(["uwsm-app", "--", "gtk-launch", run.id + ".desktop"])
  case "window":
    return ["bash", "-c", FOCUS_SCRIPT, "nodi-focus", run.address]
  case "open":
    return login(["xdg-open", run.target])
  case "summon":
    var payload = run.payload === undefined ? {} : run.payload
    return login(["omarchy-shell", "shell", "summon", run.id, typeof payload === "string" ? payload : JSON.stringify(payload)])
  case "copy":
    return login(["wl-copy", "--", run.text])
  }
  return null
}

// A word as a shell would read it back: as it is when it holds nothing a
// shell treats specially, else in single quotes.
function quote(word) {
  var s = String(word)
  return /^[A-Za-z0-9_\/.,:=@%+-]+$/.test(s) ? s : "'" + s.replace(/'/g, "'\\''") + "'"
}

// The command a run starts, as text for the pane to show before it runs
// (a row that asks first, lib/Pane.js): the argv as a shell would read it
// back, a script with its arguments under it. What it runs, not the login
// shell command() wraps it in.
function describe(run) {
  if (!valid(run)) return ""
  switch (run.kind) {
  case "exec": return run.argv.map(quote).join(" ")
  case "shell": return run.script + (run.args && run.args.length ? "\n\n" + run.args.map(function(a, i) { return "$" + (i + 1) + " = " + quote(a) }).join("\n") : "")
  case "app": return "gtk-launch " + quote(run.id + ".desktop") + (run.action !== undefined && run.action !== null ? " (action " + run.action + ")" : "")
  case "window": return "Focus the window at " + run.address
  case "open": return "xdg-open " + quote(run.target)
  case "summon": return "omarchy-shell shell summon " + quote(run.id) + " " + quote(typeof run.payload === "string" ? run.payload : JSON.stringify(run.payload === undefined ? {} : run.payload))
  case "copy": return "Copy to the clipboard:\n" + run.text
  }
  return ""
}

// What Enter does, said in the footer.
function verb(run) {
  if (!run) return ""
  switch (run.kind) {
  case "app": return "Open"
  case "window": return "Switch"
  case "open": return "Open"
  case "summon": return "Open"
  case "copy": return "Copy"
  default: return "Run"
  }
}

// ---------------------------------------------------------------- builders

function exec(argv) { return { kind: "exec", argv: argv } }
function shell(script, args) { return args ? { kind: "shell", script: script, args: args } : { kind: "shell", script: script } }
function copy(text) { return { kind: "copy", text: String(text) } }
function open(target) { return { kind: "open", target: target } }
function focus(address) { return { kind: "window", address: address } }
function app(id, action, actionId) {
  if (action === undefined) return { kind: "app", id: id }
  return actionId ? { kind: "app", id: id, action: action, actionId: actionId } : { kind: "app", id: id, action: action }
}
function summon(id, payload) { return { kind: "summon", id: id, payload: payload } }

// Window actions beyond focus. The address is checked again here because
// these are built from a row, not from Hyprland.
function closeWindow(address) {
  if (!HEX_ADDRESS.test(String(address))) return null
  return exec(["hyprctl", "dispatch", 'hl.dsp.window.close({ window = "address:' + address + '" })'])
}

function floatWindow(address) {
  if (!HEX_ADDRESS.test(String(address))) return null
  return exec(["hyprctl", "dispatch", 'hl.dsp.window.float({ window = "address:' + address + '", action = "toggle" })'])
}

// The workspace is a positive id or a selector by name; the name goes into
// a Lua string in BRING_SCRIPT, so no quote or backslash gets through.
var WORKSPACE = /^([1-9]\d*|(name|special):[A-Za-z0-9 _.@+-]+)$/

function bringWindow(address, workspaceId) {
  if (!HEX_ADDRESS.test(String(address)) || !WORKSPACE.test(String(workspaceId))) return null
  return exec(["bash", "-c", BRING_SCRIPT, "nodi-bring", String(address), String(workspaceId)])
}
