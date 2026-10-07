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
function merge(defaults, user, pluginDir) {
  var out = Jsonc.merge(defaults || {}, user || {})
  if (user && Array.isArray(user.keywords)) out.keywords = keywords(defaults ? defaults.keywords : [], user.keywords)
  out.filters = Contrib.resolve(out.filters, "filters", pluginDir)
  out.answers = Contrib.resolve(out.answers, "answers", pluginDir)
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
