.pragma library
.import "Jsonc.js" as Jsonc
.import "Contrib.js" as Contrib

// The user's nodi.json over config.default.json. A file that does not
// parse never takes effect: the last good one stays and Nodi says why,
// so a typo cannot move the hotkey (the 2026-10-02 review, F4).

// { config, error }: the user's settings from the file's text, or why not.
// An empty or missing file is no settings, not an error.
function read(text) {
  var parsed
  try { parsed = Jsonc.parse(text || "") } catch (e) {
    var where = ""
    try { where = Jsonc.locate(text) } catch (deep) {}   // nesting past the stack: the engine's words
    return { config: null, error: where || String(e && e.message ? e.message : e).replace(/^SyntaxError:\s*/, "") }
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return { config: null, error: "not an object of settings" }
  return { config: parsed, error: "" }
}

// Settings merge key by key, the user's over the default's. `keywords` merge
// by keyword (F7): a user entry replaces the default of its keyword, adds a
// new one, or with "disabled": true removes it.
// A filter or answer that names one of contrib/ (lib/Contrib.js) is made
// whole from the plugin's own folder.
function merge(defaults, user, pluginDir, env) {
  var out = Jsonc.merge(defaults || {}, user || {})
  if (user && Array.isArray(user.keywords)) out.keywords = keywords(defaults ? defaults.keywords : [], user.keywords)
  out.filters = filters(Contrib.resolve(out.filters, "filters", pluginDir), env)
  out.answers = Contrib.resolve(out.answers, "answers", pluginDir)
  out.home = homeSources(out.home, env)
  return out
}

var MAX_HOME_SOURCES = 16

function expandedPath(value, env) {
  if (typeof value !== "string" || !value || value.length > 4096 || /[\u0000-\u001f\u007f-\u009f]/.test(value)) return ""
  var home = String(env && env.home || "")
  var runtime = String(env && env.runtimeDir || "")
  var path = value
  if (path === "~" || path.indexOf("~/") === 0) {
    if (!home) return ""
    path = home + path.slice(1)
  }
  if (/^(?:\$\{HOME\}|\$HOME)(?=\/|$)/.test(path)) {
    if (!home) return ""
    path = path.replace(/^(?:\$\{HOME\}|\$HOME)(?=\/|$)/, home)
  }
  if (/^(?:\$\{XDG_RUNTIME_DIR\}|\$XDG_RUNTIME_DIR)(?=\/|$)/.test(path)) {
    if (!runtime) return ""
    path = path.replace(/^(?:\$\{XDG_RUNTIME_DIR\}|\$XDG_RUNTIME_DIR)(?=\/|$)/, runtime)
  }
  return path.charAt(0) === "/" && path.indexOf("$") === -1 ? path : ""
}

function commandValid(command) {
  return Array.isArray(command) && command.length > 0 && command.every(function(a) { return typeof a === "string" })
    && command[0] !== "" && command[0].charAt(0) !== "-"
}

function socketPath(value, env) {
  var path = expandedPath(value, env)
  if (!path || path.length > 4096 || path.charAt(path.length - 1) === "/" || /(?:^|\/)\.{1,2}(?:\/|$)/.test(path)) return ""
  return path
}

// Configured external row sources have one transport. Socket paths are
// expanded once from the trusted settings environment and then carried as
// fixed absolute paths; query text can never choose one.
function filters(value, env) {
  if (!Array.isArray(value)) return []
  var out = []
  for (var i = 0; i < value.length; i++) {
    var f = value[i]
    if (!f || typeof f !== "object" || Array.isArray(f)) continue
    var command = commandValid(f.command)
    var socket = socketPath(f.socket, env)
    if ((command ? 1 : 0) + (socket ? 1 : 0) !== 1) {
      // Keep unresolved contrib declarations for Contrib's diagnostics and
      // stable config shape; providers still cannot run one without a
      // command. Every directly configured source is validated here.
      if (typeof f.contrib === "string" && f.socket === undefined && f.command === undefined) out.push(f)
      continue
    }
    var c = {}
    for (var k in f) if (Object.prototype.hasOwnProperty.call(f, k) && k !== "socket") c[k] = f[k]
    if (socket) {
      delete c.command
      c.socket = socket
      var timeout = typeof f.timeoutMs === "number" && isFinite(f.timeoutMs) ? Math.floor(f.timeoutMs) : 3000
      var max = typeof f.max === "number" && isFinite(f.max) ? Math.floor(f.max) : 50
      c.timeoutMs = Math.max(500, Math.min(10000, timeout))
      c.max = Math.max(1, Math.min(1000, max))
    }
    out.push(c)
  }
  return out
}

function homeSources(value, env) {
  if (!Array.isArray(value)) return []
  var out = []
  var seen = Object.create(null)
  for (var i = 0; i < value.length && out.length < MAX_HOME_SOURCES; i++) {
    var s = value[i]
    if (!s || typeof s !== "object" || Array.isArray(s) || typeof s.id !== "string"
        || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(s.id) || seen[s.id]) continue
    var file = expandedPath(s.file, env)
    if (!file) continue
    var max = typeof s.max === "number" && isFinite(s.max) ? Math.floor(s.max) : 8
    var priority = typeof s.priority === "number" && isFinite(s.priority) ? s.priority : 0
    var title = typeof s.title === "string" ? s.title.replace(/[\u0000-\u001f\u007f-\u009f]+/g, " ").trim().slice(0, 100) : ""
    seen[s.id] = true
    var normalized = {
      id: s.id,
      file: file,
      title: title || s.id,
      max: Math.max(1, Math.min(100, max)),
      priority: Math.max(-1000, Math.min(1000, priority)),
      trustedActions: s.trustedActions === true
    }
    if (typeof s.icon === "string" && s.icon.length <= 4096)
      normalized.icon = s.icon
    out.push(normalized)
  }
  return out
}

function keywords(base, mine) {
  var byWord = Object.create(null)
  var order = []
  var add = function(list) {
    for (var i = 0; i < (list || []).length; i++) {
      var k = list[i]
      if (!k || typeof k !== "object" || !k.keyword) continue
      var word = String(k.keyword).toLowerCase()
      if (!(word in byWord)) order.push(word)
      byWord[word] = k
    }
  }
  add(Array.isArray(base) ? base : [])
  add(mine)
  return order.filter(function(w) { return byWord[w].disabled !== true }).map(function(w) { return byWord[w] })
}
