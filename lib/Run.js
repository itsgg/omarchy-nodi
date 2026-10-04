.pragma library

// The run contract: what a row does on Enter, and the only place in Nodi that
// turns that into a command. Providers describe; this builds.
//
//   exec    { argv }              the argv, nothing interpreted
//   shell   { script, args? }     bash -c on text the user or Omarchy wrote:
//                                 a keyword's `run`, a menu `action`; data
//                                 for it goes in `args`, read as "$1"...
//   app     { id, action? }       a desktop entry, launched as Omarchy does
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
    return ""
  case "shell":
    if (!isString(run.script) || !run.script.trim()) return "shell needs a script"
    if (run.args !== undefined && (!Array.isArray(run.args) || run.args.some(function(a) { return !isString(a) }))) return "shell args must be strings"
    return ""
  case "app":
    if (!isString(run.id) || !DESKTOP_ID.test(run.id)) return "bad desktop id"
    if (run.action !== undefined && run.action !== null && !(run.action >= 0 && Math.floor(run.action) === run.action)) return "bad action index"
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

// The argv to start. `appAction(id, index)` returns the parsed Exec of a
// desktop action (only Quickshell's DesktopEntries knows it).
function command(run, appAction) {
  if (!valid(run)) return null
  switch (run.kind) {
  case "exec":
    return login(run.argv)
  case "shell":
    return ["bash", "-lc", run.script, "nodi"].concat(run.args || [])
  case "app":
    if (run.action !== undefined && run.action !== null) {
      var cmd = appAction ? appAction(run.id, run.action) : null
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
function app(id, action) { return action === undefined ? { kind: "app", id: id } : { kind: "app", id: id, action: action } }
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
