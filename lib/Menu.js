.pragma library
.import "Jsonc.js" as Jsonc

// Omarchy's menu tree, read the way Omarchy's own menu reads it: the default
// file, then the user's extension file merged over it by id, dotted ids
// implying the tree. Nodi searches it; Omarchy stays the authority on what is
// in it, so a row Omarchy adds or removes in an update appears or goes here
// with no change to Nodi.
//
// `when:` and `checked:` are bash expressions. guardScript() batches all of
// them into one script, the approach of Omarchy's MenuModel.guardScript: the
// package and command checks that make up most guards are answered inside
// the batch rather than one process each.

function normalizeAliases(value) {
  if (Array.isArray(value)) return value.filter(function(v) { return typeof v === "string" && v }).map(String)
  if (typeof value === "string" && value) return [value]
  return []
}

function normalizeItem(id, raw) {
  var v = raw || {}
  var parent = v.parent
  if (parent === undefined || parent === null) parent = id.indexOf(".") >= 0 ? id.split(".").slice(0, -1).join(".") : "root"
  return {
    id: id,
    parent: String(parent),
    kind: v.action ? "action" : (v.target ? "link" : "menu"),
    icon: typeof v.icon === "string" ? v.icon : "",
    iconFont: typeof v.iconFont === "string" ? v.iconFont : "",
    label: typeof v.label === "string" && v.label ? v.label : id,
    title: typeof v.title === "string" ? v.title : "",
    target: typeof v.target === "string" ? v.target : "",
    description: typeof v.description === "string" ? v.description : "",
    action: typeof v.action === "string" ? v.action : "",
    provider: typeof v.provider === "string" ? v.provider : "",
    aliases: normalizeAliases(v.aliases),
    when: typeof v.when === "string" ? v.when : "",
    checked: typeof v.checked === "string" ? v.checked : ""
  }
}

// One file's entries as written, in file order: [{ id, raw }]. A file that
// does not parse yields nothing rather than a half-read menu.
function parseItems(text) {
  var parsed
  try { parsed = Jsonc.parse(text) } catch (e) { return [] }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return []
  var source = parsed.items && typeof parsed.items === "object" && !Array.isArray(parsed.items) ? parsed.items : parsed
  var out = []
  for (var id in source) {
    var entry = source[id]
    if (!id || id === "root" || !entry || typeof entry !== "object" || Array.isArray(entry)) continue
    out.push({ id: id, raw: entry })
  }
  return out
}

// Later sources override earlier ones, field by field as written, and the
// result is normalized once: a user entry that only renames a row keeps the
// row's action. (Omarchy's MenuModel normalizes before merging, so there the
// rename blanks the action; Nodi does not copy that.) A new id is appended.
// Maps keyed by menu ids have no prototype: an id is any string, and one
// named `constructor` or `__proto__` must be an item like any other.
function map() { return Object.create(null) }

function merge(sources) {
  var raws = map()
  var order = []
  for (var s = 0; s < sources.length; s++) {
    var list = sources[s] || []
    for (var i = 0; i < list.length; i++) {
      var entry = list[i]
      if (!entry || !entry.id) continue
      if (!raws[entry.id]) { raws[entry.id] = map(); order.push(entry.id) }
      for (var k in entry.raw) raws[entry.id][k] = entry.raw[k]
    }
  }
  var items = map()
  for (var n = 0; n < order.length; n++) items[order[n]] = normalizeItem(order[n], raws[order[n]])
  return { items: items, order: order }
}

// "Setup > Network > DNS": the labels above an item, nearest last.
function ancestors(items, id) {
  var out = []
  var guard = 0
  var current = items[id]
  while (current && current.parent && current.parent !== "root" && guard < 32) {
    current = items[current.parent]
    if (!current) break
    out.unshift(current)
    guard++
  }
  return out
}

function breadcrumb(items, id) {
  return ancestors(items, id).map(function(a) { return a.label }).join(" > ")
}

// An item is hidden when its own `when:` failed or any ancestor's did, as in
// Omarchy's menu, where a hidden submenu hides what is under it.
function visible(items, id, whenResults) {
  if (!whenResults) return true
  if (whenResults[id] === false) return false
  var list = ancestors(items, id)
  for (var i = 0; i < list.length; i++) if (whenResults[list[i].id] === false) return false
  return true
}

// ---------------------------------------------------------------- guards

// Commands whose output `checked:` expressions compare against. Each sibling
// row asks the same one, so the batch runs it once.
var READERS = [
  "omarchy-channel-current",
  "omarchy-default-agent",
  "omarchy-default-browser",
  "omarchy-default-editor",
  "omarchy-default-terminal",
  "omarchy-dns"
]

// Package and command presence, answered inside the batch from one pacman
// listing (provides included, since `pacman -Q vim` succeeds when gvim
// provides it). These shadow the real commands for this script only. The
// listing (`pacman -Qi` takes seconds on a busy machine) is kept in
// ~/.cache/nodi/packages-<mtime of the package database>, so it is built
// again only after an install, a removal or an upgrade (ROADMAP item 15).
var LISTING = "{ pacman -Qq; LC_ALL=C pacman -Qi | awk '/^[A-Za-z]/ { provides = ($0 ~ /^Provides/); sub(/^[^:]*: /, \"\") } provides && $0 != \"None\" { n = split($0, p, \" \"); for (i = 1; i <= n; i++) { sub(/[<>=].*/, \"\", p[i]); print p[i] } }'; } 2>/dev/null"

var PRELUDE = [
  "declare -A __nodi_pkgs=()",
  "__nodi_db=$(stat -c %Y /var/lib/pacman/local 2>/dev/null)",
  // Nodi's own cache folder, 0700 (Nodi.qml), whatever a profile sets.
  "__nodi_dir=\"$HOME/.cache/nodi\"",
  "__nodi_list=\"$__nodi_dir/packages-$__nodi_db\"",
  "if [[ -n $__nodi_db && ! -s $__nodi_list ]] && mkdir -p \"$__nodi_dir\" 2>/dev/null; then",
  "  if __nodi_t=$(mktemp \"$__nodi_list.XXXXXX\" 2>/dev/null); then " + LISTING + " >\"$__nodi_t\" && mv -fT -- \"$__nodi_t\" \"$__nodi_list\" || rm -f \"$__nodi_t\"; fi",
  "  find \"$__nodi_dir\" -maxdepth 1 -name 'packages-*' ! -name \"packages-$__nodi_db\" -delete 2>/dev/null",
  "fi",
  "__nodi_listing() { if [[ -n $__nodi_db && -s $__nodi_list ]]; then cat -- \"$__nodi_list\"; else " + LISTING + "; fi; }",
  "while IFS= read -r __nodi_p; do [[ -n $__nodi_p ]] && __nodi_pkgs[$__nodi_p]=1; done < <(__nodi_listing)",
  "__nodi_has() { [[ -n ${__nodi_pkgs[$1]-} ]] && return 0; [[ $1 == *[\\<\\>=]* ]] && { pacman -Q \"$1\" &>/dev/null; return; }; return 1; }",
  "omarchy-pkg-present() { local p; for p in \"$@\"; do __nodi_has \"$p\" || return 1; done; return 0; }",
  "omarchy-pkg-missing() { local p; for p in \"$@\"; do __nodi_has \"$p\" || return 0; done; return 1; }",
  "omarchy-cmd-present() { local c; for c in \"$@\"; do command -v \"$c\" &>/dev/null || return 1; done; return 0; }",
  "omarchy-cmd-missing() { local c; for c in \"$@\"; do command -v \"$c\" &>/dev/null || return 0; done; return 1; }"
].join("\n") + "\n"

function readerSlot(i) { return "${__nodi_read_" + i + "}" }

function substituteReaders(expression) {
  var out = expression
  for (var i = 0; i < READERS.length; i++) out = out.split("$(" + READERS[i] + ")").join(readerSlot(i))
  return out
}

// The script prints "<n>:<w|c>:<0|1>" per guard, n being the item's place in
// `order`. Ids never enter the script: a user menu can name an id anything.
function guardScript(merged) {
  var lines = ""
  var used = {}
  for (var n = 0; n < merged.order.length; n++) {
    var item = merged.items[merged.order[n]]
    if (!item) continue
    var guards = [["w", item.when], ["c", item.checked]]
    for (var g = 0; g < guards.length; g++) {
      if (!guards[g][1]) continue
      var expr = substituteReaders(guards[g][1])
      for (var r = 0; r < READERS.length; r++) if (expr.indexOf(readerSlot(r)) >= 0) used[r] = true
      // A subshell, so a guard that says `exit` ends itself and not the batch.
      lines += "if ( " + expr + "\n) >/dev/null 2>&1 </dev/null; then echo " + n + ":" + guards[g][0] + ":1; else echo " + n + ":" + guards[g][0] + ":0; fi\n"
    }
  }
  if (!lines) return ""
  // The readers run side by side, each into its own file, and are read
  // once all are done: one at a time they took three seconds.
  var start = "", collect = ""
  for (var i = 0; i < READERS.length; i++) {
    if (!used[i]) continue
    start += "  " + READERS[i] + " >\"$__nodi_rd/" + i + "\" 2>/dev/null &\n"
    collect += "  __nodi_read_" + i + "=$(cat -- \"$__nodi_rd/" + i + "\" 2>/dev/null)\n"
  }
  // The traps remove the directory when the Reader's deadline ends the
  // batch: TERM exits, which runs EXIT (a TERM trap alone would carry on).
  var readers = start ? "if __nodi_rd=$(mktemp -d 2>/dev/null); then\n  trap 'rm -rf -- \"$__nodi_rd\"' EXIT\n  trap 'exit 143' TERM\n" + start + "  wait\n" + collect + "  rm -rf -- \"$__nodi_rd\"\nfi\n" : ""
  return PRELUDE + readers + lines
}

function parseGuards(text, merged) {
  var when = map()
  var checked = map()
  var lines = String(text || "").split("\n")
  for (var i = 0; i < lines.length; i++) {
    var m = lines[i].match(/^(\d+):([wc]):([01])$/)
    if (!m) continue
    var id = merged.order[parseInt(m[1], 10)]
    if (!id) continue
    if (m[2] === "w") when[id] = m[3] === "1"
    else checked[id] = m[3] === "1"
  }
  return { when: when, checked: checked }
}
