.pragma library
.import "../lib/Run.js" as Run
.import "../lib/Match.js" as Match
.import "../lib/Score.js" as Score
.import "../lib/Placeholders.js" as Placeholders

// Script commands: executable files in a folder, described by a header of
// `@nodi.` lines. Raycast's script commands use the same keys under
// `@raycast.`, which is read too, so the scripts in raycast/script-commands
// work as they are; a key given both ways takes the first.
//
//   #!/bin/bash
//   # @nodi.title Copy Git Branch
//   # @nodi.mode silent
//   # @nodi.packageName Developer
//   # @nodi.icon 🌿
//   # @nodi.argument1 { "type": "text", "placeholder": "repo", "optional": true }
//   # @nodi.needsConfirmation false
//
// Found by title, or by file name as a keyword ("copy-git-branch ~/x").
// Modes: silent and compact run without a window and post the last line
// of output as a notification (or the error, if the script fails);
// fullOutput runs in Omarchy's floating terminal; inline shows the first
// line of output as the row's subtitle, read again after refreshTime
// (at least 10 s). Arguments: text and dropdown; up to three, one word
// each with the last taking the rest, as snippets take theirs. A password
// argument is not taken: the bar's field shows what is typed and Nodi
// remembers queries. The script runs in its own folder, or in
// currentDirectoryPath, under a login shell, its arguments never re-read
// as shell.

var MODES = { silent: true, compact: true, fullOutput: true, inline: true }

function tilde(path, home) { return home && path.indexOf(home + "/") === 0 ? "~" + path.slice(home.length) : path }
function expand(path, home) { return /^~(\/|$)/.test(path) && home ? home + path.slice(1) : path }

// The folders to read, from settings: ["~/.config/omarchy/nodi/scripts"].
function dirs(settings, home) {
  var list = settings && Array.isArray(settings.dirs) ? settings.dirs : ["~/.config/omarchy/nodi/scripts"]
  return list.filter(function(d) { return typeof d === "string" && d && d.indexOf("\n") === -1 }).map(function(d) { return expand(d, home) })
}

// The header lines found in the scripts: "path\0# @nodi.key value" (or
// @raycast.key) a line. One entry per script with a title and a known mode, in the
// order found.
function parseScripts(text) {
  var byPath = Object.create(null)
  var order = []
  var lines = String(text || "").split("\n")
  for (var i = 0; i < lines.length; i++) {
    var nul = lines[i].indexOf("\u0000")
    if (nul <= 0) continue
    var path = lines[i].slice(0, nul)
    var m = lines[i].slice(nul + 1).match(/@(?:nodi|raycast)\.([A-Za-z0-9]+)[ \t]+(.*?)\s*$/)
    if (!m) continue
    if (!(path in byPath)) { byPath[path] = {}; order.push(path) }
    if (!(m[1] in byPath[path])) byPath[path][m[1]] = m[2]
  }
  var out = []
  for (var j = 0; j < order.length; j++) {
    var h = byPath[order[j]]
    if (!h.title || !MODES[h.mode]) continue
    var file = order[j].split("/").pop()
    var args = []
    // A number left out below a declared one keeps its place, passed empty,
    // so argument3 is still the script's $3 (agy 2026-10-03).
    var last = h.argument3 ? 3 : h.argument2 ? 2 : h.argument1 ? 1 : 0
    for (var n = 1; n <= last; n++) {
      if (!h["argument" + n]) { args.push({ type: "gap", placeholder: "", optional: true, percentEncoded: false, data: [] }); continue }
      try {
        var a = JSON.parse(h["argument" + n])
        // JSON but no object (null, a list, a number) is as invalid as no
        // JSON: dropped, it moved the next argument into its place (codex
        // 2026-10-04).
        if (!a || typeof a !== "object" || Array.isArray(a)) throw "not an object"
        args.push({ type: String(a.type || "text"), placeholder: String(a.placeholder || "argument " + n),
                                                     optional: a.optional === true, percentEncoded: a.percentEncoded === true,
                                                     data: Array.isArray(a.data) ? a.data : [] })
      } catch (e) { args.push({ type: "invalid", placeholder: "argument " + n, optional: false, percentEncoded: false, data: [] }) }
    }
    var refresh = String(h.refreshTime || "").match(/^(\d+)\s*([smhd])$/)
    var unit = refresh ? { s: 1000, m: 60000, h: 3600000, d: 86400000 }[refresh[2]] : 0
    out.push({
      path: order[j],
      keyword: file.replace(/\.[^.]*$/, "").toLowerCase().replace(/[^a-z0-9._-]/g, "") || "",
      title: h.title,
      mode: h.mode,
      packageName: h.packageName || "",
      description: h.description || "",
      icon: h.icon || "",
      cwd: h.currentDirectoryPath || "",
      confirm: h.needsConfirmation === "true",
      refreshMs: refresh ? Math.max(10000, Number(refresh[1]) * unit) : 5 * 60000,
      args: args
    })
  }
  return out
}

// An emoji or a short symbol from the icon line; a path or a URL is not
// one the row can draw.
function glyph(icon) {
  var s = String(icon || "")
  return s && s.length <= 4 && !/[\/.:]/.test(s) ? s : ""
}

// The values for a script's arguments from what was typed: { values,
// missing: [placeholders], refused: why it cannot take them here }.
function argumentsFor(script, typed) {
  var out = { values: [], missing: [], refused: "" }
  if (script.args.length === 0) return out
  var asked = script.args.filter(function(a) { return a.type !== "gap" })
  var given = Placeholders.split(typed, asked.length)
  for (var i = 0, g = 0; i < script.args.length; i++) {
    var a = script.args[i]
    if (a.type === "gap") { out.values.push(""); continue }
    if (a.type === "password") { out.refused = "asks for a password, which the bar would show"; return out }
    if (a.type === "invalid") { out.refused = "argument " + (i + 1) + " is not valid JSON"; return out }
    var v = g < given.length ? given[g] : ""
    g++
    if (a.type === "dropdown" && v) {
      var pick = null
      for (var d = 0; d < a.data.length; d++) {
        var o = a.data[d] || {}
        if (String(o.title || "").toLowerCase() === v.toLowerCase() || String(o.value || "").toLowerCase() === v.toLowerCase()) pick = String(o.value)
      }
      if (pick === null) { out.missing.push(a.placeholder + " (" + a.data.map(function(o) { return o && o.title }).join(", ") + ")"); v = "" }
      else v = pick
    }
    if (!v && !a.optional) out.missing.push(a.placeholder)
    out.values.push(a.percentEncoded ? encodeURIComponent(v) : v)
  }
  // An optional argument left empty is passed as "", as Raycast passes it.
  return out
}

// Run without a window; the last line of output, or the failure, as a
// notification. $1 the title, $2 the folder, then the script and its
// arguments, none of them read as shell. A folder that cannot be entered
// stops it: run where Nodi was, a script's relative paths were someone
// else's files (codex 2026-10-04).
var QUIET = 'title=$1; cd -- "$2" 2>/dev/null || { notify-send -a Nodi -u critical -- "$title failed" "Cannot enter $2"; exit 0; }; '
          + 'shift 2; out=$("$@" 2>&1); code=$?; last=$(printf "%s" "$out" | tail -n 1); '
          + 'if [ "$code" -eq 0 ]; then [ -n "$last" ] && notify-send -a Nodi -- "$title" "$last"; '
          + 'else notify-send -a Nodi -u critical -- "$title failed" "${last:-exit $code}"; fi; true'

// In Omarchy's floating terminal, held open until a key, as `> command`.
var LOUD = 'cd -- "$1" 2>/dev/null || { echo "Cannot enter $1"; omarchy-show-done; exit 1; }; '
         + 'shift; omarchy-show-logo 2>/dev/null; "$@"; code=$?; [ "$code" -ne 130 ] && omarchy-show-done; exit "$code"'

function folderOf(script, home) {
  return script.cwd ? expand(script.cwd, home) : script.path.replace(/\/[^\/]*$/, "") || "/"
}

function quiet(script, values, home) { return Run.shell(QUIET, [script.title, folderOf(script, home), script.path].concat(values)) }

function loud(script, values, home) {
  return Run.exec(["uwsm-app", "--", "xdg-terminal-exec", "--app-id=org.omarchy.terminal", "--title=" + script.title,
                   "-e", "bash", "-c", LOUD, "nodi", folderOf(script, home), script.path].concat(values))
}

function scriptsOf(ctx) {
  var home = String(ctx.home || "")
  var got = ctx.request ? ctx.request("scripts", dirs(ctx.settings, home).join("\n")) : { state: "pending" }
  return Array.isArray(got.value) ? got.value : []
}

// "hello <name> [tone]": the hint line's pattern for a script's arguments.
function pattern(script) {
  if (!script.keyword) return ""
  var asked = script.args.filter(function(a) { return a.type !== "gap" })
  if (asked.length === 0) return ""
  return script.keyword + " " + asked.map(function(a) {
    var n = a.placeholder + (a.type === "dropdown" && a.data.length ? ": " + a.data.map(function(o) { return o && o.title }).join("|") : "")
    return a.optional ? "[" + n + "]" : "<" + n + ">"
  }).join(" ")
}

function row(script, typed, ctx, extra) {
  var home = String(ctx.home || "")
  var icon = glyph(script.icon) || "󰆍"
  var out = { key: "script:" + script.path, title: script.title, icon: icon, group: "Scripts", remember: script.args.length === 0,
              subtitle: script.description || script.packageName || tilde(script.path, home), copy: "",
              actions: [
                { label: "Run in a terminal", icon: "󰆍", run: null },
                { label: "Open in your editor", icon: "󰨞", run: Run.exec(["omarchy-launch-editor", script.path]) },
                { label: "Copy the path", icon: "󰆏", run: Run.copy(script.path) }
              ] }
  out.hint = pattern(script)
  var args = argumentsFor(script, typed)
  if (args.refused) {
    // Not run in the bar: the field shows what is typed (a password), or
    // the header's argument is not JSON.
    out.badge = "Not run"
    out.subtitle = /password/.test(args.refused) ? "Password argument" : "Invalid argument"
    out.actions.shift()
    out.remember = false
    return extend(out, extra)
  }
  if (args.missing.length > 0) {
    out.complete = script.keyword ? script.keyword + " " : ""
    out.actions.shift()
    out.remember = false
    return extend(out, extra)
  }
  out.actions[0].run = loud(script, args.values, home)
  // One that asks twice asks from Ctrl+K too, and is never run to fill its
  // row (codex 2026-10-04).
  out.actions[0].confirm = script.confirm
  if (script.mode === "inline" && script.args.length === 0 && !script.confirm) {
    var got = ctx.request ? ctx.request("script-output", JSON.stringify([folderOf(script, home), script.path, script.refreshMs])) : { state: "pending" }
    var line = typeof got.value === "string" ? got.value : ""
    out.subtitle = line || (got.state === "error" ? "Failed: " + (got.error || "no output") : got.value === undefined ? "Running..." : "(no output)")
    out.copy = line
  }
  out.run = script.mode === "fullOutput" ? loud(script, args.values, home) : quiet(script, args.values, home)
  if (script.mode === "fullOutput") out.actions.shift()
  out.actionLabel = "Run"
  out.confirm = script.confirm
  if (args.values.length > 0) out.remember = false
  return extend(out, extra)
}

function extend(row, extra) {
  for (var k in extra) row[k] = extra[k]
  return row
}

// For Engine's fallbacks: a script that takes exactly one text argument,
// run on what nothing else answered.
function fallbacks(text, ctx) {
  return scriptsOf(ctx).filter(function(s) { return s.args.length === 1 && s.args[0].type === "text" })
    .map(function(s) { return row(s, text, ctx, { key: "fallback:script:" + s.path, title: s.title + ": " + text }) })
    .filter(function(r) { return !!r.run })
}

var provider = {
  id: "scripts",
  name: "Scripts",
  icon: "󰆍",
  sources: {
    // The headers of every executable file in the folders (one per line of
    // the parameter), read without running anything: the first 64 lines,
    // at most 16 KB, of each, where the header lives, so a large
    // file without one costs nothing (agy 2026-10-03).
    scripts: {
      argv: function(param) {
        return ["/usr/bin/bash", "-c",
          'for d in "$@"; do [ -d "$d" ] || continue; find -L "$d" -maxdepth 1 -type f -perm -u+x ! -name ".*" ! -name "*\n*" -print0; done'
          + ' | while IFS= read -r -d "" f; do head -c 16384 -- "$f" | head -n 64 | grep -a -e "@nodi\\." -e "@raycast\\."'
          + ' | while IFS= read -r line; do printf "%s\\0%s\\n" "$f" "$line"; done; done 2>/dev/null; true',
          "nodi"].concat(String(param || "").split("\n").filter(Boolean))
      },
      parse: parseScripts,
      maxAgeMs: 5000,
      timeoutMs: 3000
    },
    // An inline script's output: [folder, path, refreshMs] as JSON.
    "script-output": {
      argv: function(param) {
        var p = JSON.parse(param)
        return ["/usr/bin/bash", "-lc", 'cd -- "$1" 2>/dev/null || exit 1; exec "$2"', "nodi", String(p[0]), String(p[1])]
      },
      parse: function(text, ok) {
        if (!ok) throw "the script failed"
        var lines = String(text).split("\n").filter(function(l) { return l.trim() !== "" })
        return lines.length ? lines[0] : ""
      },
      maxAgeMs: function(param) { try { return JSON.parse(param)[2] } catch (e) { return 60000 } },
      retryMs: 10000,
      timeoutMs: 10000,
      maxBytes: 65536,
      // Each script on its own Reader: one that hangs holds back no other.
      concurrent: true
    }
  },
  modes: [{ pattern: /^\s*scripts?(\s|$)/i, label: "Scripts", icon: "󰆍", exclusive: true }],
  commands: [
    { title: "Script commands", keywords: "scripts script commands raycast run", text: "Your scripts, by their @nodi header", complete: "scripts " }
  ],
  help: [
    { id: "scripts", title: "Scripts", icon: "󰆍", about: "Executable files in ~/.config/omarchy/nodi/scripts with a @nodi header",
      examples: [{ q: "scripts ", note: "Every script found" }] }
  ],
  match: function(query, ctx) {
    var all = scriptsOf(ctx)
    var listing = String(query).match(/^\s*scripts?(?:\s+(.*))?$/i)
    if (listing) {
      if (all.length === 0) {
        var where = dirs(ctx.settings, String(ctx.home || "")).map(function(d) { return tilde(d, String(ctx.home || "")) }).join(", ")
        return [{ title: "No scripts found", subtitle: "Put executable files with a @nodi.title line in " + where, score: 50, copy: "", remember: false }]
      }
      var words = Match.normalise(listing[1]).split(" ").filter(Boolean)
      var out = []
      for (var i = 0; i < all.length; i++) {
        var hay = Match.folded([all[i].title, all[i].packageName, all[i].keyword, all[i].description].join(" "))
        if (words.some(function(w) { return hay.indexOf(w) === -1 })) continue
        out.push(row(all[i], "", ctx, { score: 97 - out.length * 0.01 }))
      }
      return out
    }
    var text = String(query).replace(/^\s+/, "")
    var space = text.search(/\s/)
    var word = (space === -1 ? text : text.slice(0, space)).toLowerCase()
    var rest = space === -1 ? "" : text.slice(space).trim()
    var q = text.trim()
    var rows = []
    for (var j = 0; j < all.length; j++) {
      var s = all[j]
      if (s.keyword && word === s.keyword && (rest === "" || s.args.length > 0)) {
        rows.push(row(s, rest, ctx, { tier: "exact", kind: "action" }))
        continue
      }
      if (!q) continue
      var t = Score.tier(q, { name: s.title, whole: true, aliases: s.keyword ? [s.keyword.replace(/[._-]+/g, " ")] : [],
                              keywords: [s.packageName, "script"], description: s.description })
      if (t) rows.push(row(s, "", ctx, { tier: t, kind: "action" }))
    }
    return rows
  }
}
