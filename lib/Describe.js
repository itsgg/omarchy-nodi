.pragma library

// A few words on what an app is for, written by a model for the apps whose
// desktop entry says nothing of it: Omarchy's web apps give their own name
// as their comment, its TUIs give none, and a tarball app like REAPER often
// only its name. Asked once per app, in one batch, and kept in
// ~/.cache/nodi/app-descriptions.json; an app is asked again only when its
// name or its command changes. Off unless "apps": { "describe": true } is
// set in nodi.json, since it sends the apps' names, sites and programs to
// the model.
//
// Only the name, a web app's host and a program's name leave the machine:
// never a URL's path (Slack's carries a workspace id) or a command's
// arguments.

// The apps Omarchy installs itself (/usr/share/omarchy/applications, 14 on
// 2026-10-04 without a comment), described here so every Omarchy user
// has them without a model: by a web app's host or by the program run, so
// a copy of the same app made with omarchy-webapp-install matches too.
var KNOWN = {
  "site:launchpad.37signals.com": "Projects and team chat",
  "site:discord.com": "Chat and voice calls",
  "site:contacts.google.com": "Address book",
  "site:maps.google.com": "Maps and directions",
  "site:messages.google.com": "Text messages from your phone",
  "site:photos.google.com": "Photo library",
  "site:web.whatsapp.com": "Messages and calls",
  "site:x.com": "Social network",
  "site:youtube.com": "Videos",
  "program:omarchy-webapp-handler-hey": "Email",
  "program:omarchy-webapp-handler-zoom": "Video meetings",
  "program:dua": "Disk usage explorer",
  "program:omarchy-launch-docker-tui": "Docker containers",
  "program:imv": "Browse images"
}

var MAX = 60            // the longest description kept
var BATCH = 40          // apps asked in one call

var SYSTEM = "You write short subtitles for apps in a desktop launcher. Plain ASCII."

var ASK = "Describe each desktop app below in 2 to 5 plain words: what it is for, as a launcher's subtitle "
  + "(for example \"Streaming films and series\", \"Team chat\", \"Disk usage explorer\"). Do not repeat the app's name. "
  + "Use only what the name, site and program tell you; if you are not sure what an app is, give \"\" for it. "
  + "Plain ASCII. Answer with one JSON object mapping each id to its description, nothing else, "
  + "for example {\"a\": \"Team chat\", \"b\": \"\"}."

// What tells two versions of an app apart: a renamed app or a new command
// is asked about again.
function fingerprint(app) {
  return String(app.name || "") + "\n" + String(app.exec || "")
}

// The host of a web app's site, as lib/../providers/apps.js reads it, or "".
function site(exec) {
  var m = String(exec || "").trim().match(/^(?:\S*\/)?omarchy-launch-webapp\s+["']?(https?:\/\/[^\s"']+)/i)
  if (!m) return ""
  var rest = m[1].replace(/^[a-z][a-z0-9+.-]*:\/\//i, "").split(/[\/?#]/)[0]
  rest = rest.slice(rest.lastIndexOf("@") + 1)
  return (rest.charAt(0) === "[" ? rest.slice(0, rest.indexOf("]") + 1) : rest.split(":")[0]).toLowerCase().replace(/^www\./, "")
}

// The program an Exec line runs, by name only: the one after a terminal's
// -e and a `bash -c "`, else the first word, without its directory.
function program(exec) {
  var words = String(exec || "").replace(/["']/g, " ").trim().split(/\s+/)
  var at = words.indexOf("-e")
  if (/^(?:\S*\/)?xdg-terminal-exec$/.test(words[0]) && at !== -1) words = words.slice(at + 1)
  if (/^(?:\S*\/)?(?:ba|z|da)?sh$/.test(words[0]) && words[1] === "-c") words = words.slice(2)
  while (words.length && /^(?:\S*\/)?env$|^[A-Za-z_][A-Za-z0-9_]*=/.test(words[0])) words.shift()
  return String(words[0] || "").split("/").pop().replace(/[^A-Za-z0-9._+-]/g, "").slice(0, 40)
}

// The apps to ask about: those `needs(app)` says have nothing better, not
// yet described as they are now.
function wanted(apps, known, needs) {
  var out = []
  for (var i = 0; i < apps.length && out.length < BATCH; i++) {
    var app = apps[i]
    if (!needs(app) || builtIn(app)) continue
    var k = own(known, app.id)
    if (k && k["for"] === fingerprint(app)) continue
    var item = { id: String(app.id), name: String(app.name || app.id) }
    var host = site(app.exec)
    if (host) item.site = host
    else {
      var prog = program(app.exec)
      if (prog) item.program = prog
    }
    if (app.terminal || /^(?:\S*\/)?xdg-terminal-exec\b/.test(String(app.exec || "").trim())) item.terminal = true
    out.push({ app: app, item: item })
  }
  return out
}

// The command that asks: a login shell for the user's PATH and Claude's own
// credentials, in `dir`, Ask's own (so no project's local settings apply);
// no tools, no MCP servers, no settings, hooks or memory, nothing saved.
// The request is one argument.
function argv(model, list, dir) {
  var request = ASK + "\n\n" + JSON.stringify(list.map(function(w) { return w.item }))
  return ["bash", "-lc", 'cd -- "$1" && shift && exec claude "$@"', "nodi-describe", String(dir),
          "-p", "--output-format", "text", "--model", String(model || "haiku"),
          "--tools", "", "--strict-mcp-config", "--setting-sources", "local",
          "--settings", '{"alwaysThinkingEnabled":false}', "--no-session-persistence", "--safe-mode",
          "--system-prompt", SYSTEM, request]
}

function own(obj, key) { return obj && Object.prototype.hasOwnProperty.call(obj, key) ? obj[key] : undefined }

// The answer read into { id: { for, text } } for the apps asked about; an
// app the model gave "" or nothing usable for is kept with "", so it is not
// asked again until it changes.
function parse(text, list) {
  var s = String(text || "")
  var start = s.indexOf("{")
  var end = s.lastIndexOf("}")
  var got = null
  if (start !== -1 && end > start) {
    try { got = JSON.parse(s.slice(start, end + 1)) } catch (e) { got = null }
  }
  if (!got || typeof got !== "object" || Array.isArray(got)) return null
  // An answer keyed by anything but the ids asked (names, a wrapper object)
  // is a failed ask, tried again later, not a batch of empty answers kept
  // for good (Fable 2026-10-04).
  var any = false
  for (var j = 0; j < list.length; j++) if (own(got, list[j].item.id) !== undefined) any = true
  if (!any) return null
  var out = Object.create(null)
  for (var i = 0; i < list.length; i++) {
    var w = list[i]
    var said = own(got, w.item.id)
    var clean = typeof said === "string" ? said.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().replace(/[.,;:]+$/, "") : ""
    if (clean.length > MAX || clean.toLowerCase() === String(w.app.name || "").toLowerCase()) clean = ""
    out[w.item.id] = { "for": fingerprint(w.app), text: clean }
  }
  return out
}

// The kept descriptions from the cache file's text.
function load(text) {
  var out = Object.create(null)
  try {
    var data = JSON.parse(text)
    for (var id in data) {
      var e = data[id]
      if (e && typeof e["for"] === "string" && typeof e.text === "string") out[id] = { "for": e["for"], text: e.text.slice(0, MAX) }
    }
  } catch (err) {}
  return out
}

function merged(known, fresh) {
  var out = Object.create(null)
  for (var a in known) out[a] = known[a]
  for (var b in fresh) out[b] = fresh[b]
  return out
}

function serialize(known) {
  var plain = {}
  for (var id in known) plain[id] = known[id]
  return JSON.stringify(plain, null, 1) + "\n"
}

// What Nodi knows of an app without asking: Omarchy's own apps.
function builtIn(app) {
  var host = site(app.exec)
  return own(KNOWN, host ? "site:" + host : "program:" + program(app.exec)) || ""
}

// The description of `app` as it is now, or "": Omarchy's own first, then
// what the model wrote for it.
function of(known, app) {
  var b = builtIn(app)
  if (b) return b
  var k = own(known, app.id)
  return k && k["for"] === fingerprint(app) ? k.text : ""
}
