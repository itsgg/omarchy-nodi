.pragma library
.import "../lib/Run.js" as Run
.import "../lib/Score.js" as Score

// Coding agents (ROADMAP 61, L 11). `usage` answers from the records
// Omarchy's agents widget keeps (~/.local/state/omarchy/agents/usage, one
// a tool, written by omarchy-agent-usage-update): each limit's share used
// and when it resets; the empty bar shows an agent's highest one at 80%
// or more. `agents` lists the Claude Code and Codex sessions running in a
// terminal (in tmux too, the terminal its client runs in), the most
// recently busy first, each with the last thing you asked it (Claude
// Code's own transcript), Enter focusing its terminal. One with no window
// is left out, as are runs for a single answer (claude -p, an SDK run),
// Codex's other subcommands, and Akshi's (his ruling: its agents wait for
// its rewrite).

var ICON = "󰚩"
var SHOW_AT = 0.8

// The usage records as they are, one JSON object a line.
var USAGE = 'd="$HOME/.local/state/omarchy/agents/usage"; for f in "$d"/*.json; do [ -f "$f" ] && jq -c . "$f" 2>/dev/null; done; exit 0'

// Each claude or codex process with a terminal window up its parent
// chain (through tmux to the terminal its client runs in): its arguments,
// how Claude Code says it was started, and its own transcript, named by
// the record Claude Code keeps of each process (~/.claude/sessions/<pid>
// .json; the newest transcript in a folder was another session's, Sonnet
// 2026-10-06): the last thing asked and when it was last written. Which
// of them are sessions, isSession decides.
var SESSIONS = 'declare -A parent win pane client'
  + "\n" + 'while read -r p pp; do parent[$p]=$pp; done < <(ps -eo pid=,ppid=)'
  + "\n" + 'while IFS=$\'\\x1f\' read -r p a c t; do win[$p]="$a"$\'\\x1f\'"$c"$\'\\x1f\'"$t"; done < <(hyprctl clients -j | jq -r \'.[] | [(.pid | tostring), .address, .class, .title] | join("\\u001f")\')'
  + "\n" + 'if command -v tmux >/dev/null; then'
  + "\n" + '  while read -r p n; do pane[$p]=$n; done < <(tmux list-panes -a -F \'#{pane_pid} #{session_name}\' 2>/dev/null)'
  + "\n" + '  while read -r p n; do client[$n]=$p; done < <(tmux list-clients -F \'#{client_pid} #{session_name}\' 2>/dev/null)'
  + "\n" + 'fi'
  + "\n" + 'for d in /proc/[0-9]*; do'
  + "\n" + '  pid=${d#/proc/}; { mapfile -d \'\' -t argv < "$d/cmdline"; } 2>/dev/null || continue; [ "${#argv[@]}" -gt 0 ] || continue'
  + "\n" + '  tool=${argv[0]##*/}; [ "$tool" = claude ] || [ "$tool" = codex ] || continue'
  + "\n" + '  cwd=$(readlink "$d/cwd") || continue'
  + "\n" + '  w=""; q=$pid'
  + "\n" + '  for _ in $(seq 1 40); do'
  + "\n" + '    [ -n "${win[$q]:-}" ] && { w=${win[$q]}; break; }'
  + "\n" + '    if [ -n "${pane[$q]:-}" ] && [ -n "${client[${pane[$q]}]:-}" ]; then q=${client[${pane[$q]}]}; continue; fi'
  + "\n" + '    q=${parent[$q]:-1}; [ "$q" -le 1 ] && break'
  + "\n" + '  done'
  + "\n" + '  [ -n "$w" ] || continue'
  + "\n" + '  said=""; at=0; entry=""; rec="$HOME/.claude/sessions/$pid.json"'
  + "\n" + '  if [ "$tool" = claude ] && [ -f "$rec" ]; then'
  + "\n" + '    entry=$(jq -r \'.entrypoint // empty\' "$rec" 2>/dev/null)'
  + "\n" + '    id=$(jq -r \'.sessionId // empty\' "$rec" 2>/dev/null); rcwd=$(jq -r \'.cwd // empty\' "$rec" 2>/dev/null)'
  + "\n" + '    f="$HOME/.claude/projects/$(printf "%s" "${rcwd:-$cwd}" | sed \'s#[^A-Za-z0-9]#-#g\')/$id.jsonl"'
  + "\n" + '    if [ "${entry:-cli}" = cli ] && [ -n "$id" ] && [ -f "$f" ]; then'
  + "\n" + '      at=$(stat -c %Y "$f")'
  + "\n" + '      said=$(tac "$f" | jq -r \'select(.type == "user" and (.isMeta | not) and (.message.content | type) == "string") | .message.content | select(startswith("<") | not)\' 2>/dev/null | head -n1 | cut -c1-200)'
  + "\n" + '    fi'
  + "\n" + '  fi'
  + "\n" + '  IFS=$\'\\x1f\' read -r wa wc wt <<< "$w"'
  + "\n" + '  jq -cn --arg tool "$tool" --arg pid "$pid" --arg cwd "$cwd" --arg address "$wa" --arg cls "$wc" --arg title "$wt" --arg said "$said" --argjson at "${at:-0}" --arg entry "$entry" \'{tool: $tool, pid: $pid, cwd: $cwd, address: $address, cls: $cls, title: $title, said: $said, at: $at, entrypoint: $entry, argv: $ARGS.positional}\' --args -- "${argv[@]:1}"'
  + "\n" + 'done; exit 0'

// Codex subcommands that are no session; `codex -p work` is a profile.
var CODEX_NOT = { exec: true, e: true, "app-server": true, mcp: true, "mcp-server": true, proto: true, debug: true, login: true, logout: true,
                  apply: true, a: true, completion: true, cloud: true, sandbox: true }

// Codex's flags that take a value, so the word after one is no subcommand.
var CODEX_VALUED = { "-m": true, "--model": true, "-p": true, "--profile": true, "-c": true, "--config": true, "-C": true, "--cd": true,
                     "-s": true, "--sandbox": true, "-a": true, "--ask-for-approval": true, "-i": true, "--image": true }

// Whether a process the script found is a session to list: no run for a
// single answer (claude -p, an SDK run), no other codex subcommand, by
// its own arguments only, never words of a prompt (Sonnet 2026-10-06:
// "fix the exec path" was left out); and none of Akshi's (his ruling).
function isSession(c, home) {
  var argv = Array.isArray(c.argv) ? c.argv.map(String) : []
  if (c.tool === "claude") {
    if (argv.indexOf("-p") !== -1 || argv.indexOf("--print") !== -1) return false
    if (c.entrypoint && c.entrypoint !== "cli") return false
  } else if (c.tool === "codex") {
    // Its subcommand is its first word that is no flag or a flag's value
    // (`codex --yolo exec ...`; Sonnet 2026-10-06).
    var i = 0
    while (i < argv.length && argv[i].charAt(0) === "-") i += CODEX_VALUED[argv[i]] ? 2 : 1
    if (i < argv.length && Object.prototype.hasOwnProperty.call(CODEX_NOT, argv[i])) return false
  } else return false
  var cwd = String(c.cwd || "") + "/"
  var h = String(home || "/nonexistent")
  return [h + "/Akshi/", h + "/.local/state/akshi/", h + "/.local/share/akshi/"].every(function(a) { return cwd.indexOf(a) !== 0 })
}

function lines(text) {
  var out = []
  var all = String(text || "").split("\n")
  for (var i = 0; i < all.length; i++) {
    if (!all[i].trim()) continue
    try { var o = JSON.parse(all[i]); if (o && typeof o === "object") out.push(o) } catch (e) {}
  }
  return out
}

// Each record's limits: [{ tool, name, label, share, resetsAt }].
function limitsOf(records) {
  var out = []
  for (var i = 0; i < records.length; i++) {
    var r = records[i]
    if (!r || !Array.isArray(r.limits)) continue
    for (var k = 0; k < r.limits.length; k++) {
      var l = r.limits[k]
      if (!l || typeof l.percent !== "number" || !(l.percent >= 0)) continue
      out.push({ tool: String(r.id || ""), name: String(r.name || r.id || "An agent"), label: String(l.title || l.label || "limit"),
                 share: Math.min(1, l.percent), resetsAt: typeof l.resetsAt === "string" ? Date.parse(l.resetsAt) : NaN })
    }
  }
  return out
}

function pad(n) { return (n < 10 ? "0" : "") + n }

var DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

// "resets in 3 h 12 min, at 01:00", past a day "resets on Thu 8 Oct at
// 01:30", and a record older than its reset says so.
function resets(at, nowMs) {
  if (!(at > 0)) return ""
  var d = new Date(at)
  var clock = pad(d.getHours()) + ":" + pad(d.getMinutes())
  if (at <= nowMs) return "reset at " + clock + "; the record is older"
  var mins = Math.round((at - nowMs) / 60000)
  if (mins >= 24 * 60) return "resets on " + DAYS[d.getDay()] + " " + d.getDate() + " " + MONTHS[d.getMonth()] + " at " + clock
  var h = Math.floor(mins / 60), m = mins % 60
  return "resets in " + (h ? h + " h" + (m ? " " : "") : "") + (m || !h ? m + " min" : "") + ", at " + clock
}

function limitRow(l, nowMs, extra) {
  var pct = Math.round(l.share * 100)
  var row = { key: "agents:limit:" + l.tool + ":" + l.label, title: l.name + ": " + pct + "% of " + l.label, subtitle: resets(l.resetsAt, nowMs),
              badge: pct + "%", badgeTone: l.share >= SHOW_AT ? "on" : "", icon: ICON, copy: "", remember: false }
  for (var k in extra) row[k] = extra[k]
  return row
}

// The empty bar: each agent's highest limit at 80% or more. It only
// looks; the bar reads the records with its other reads at an open.
function homeRows(ctx) {
  var got = ctx.request ? ctx.request("agent-usage", "", { fetch: false }) : null
  var list = got && Array.isArray(got.value) ? limitsOf(got.value) : []
  var nowMs = (ctx.now ? ctx.now() : new Date()).getTime()
  var top = {}
  for (var i = 0; i < list.length; i++) if (list[i].share >= SHOW_AT && (!top[list[i].tool] || list[i].share > top[list[i].tool].share)) top[list[i].tool] = list[i]
  var out = []
  for (var t in top) out.push(limitRow(top[t], nowMs, { group: "Agents", score: 45 - out.length }))
  return out
}

var USAGE_WORDS = /^\s*(usage|limits?|quotas?)\s*$/i
var AGENTS_WORDS = /^\s*(agents|sessions|agent sessions)\s*$/i

var provider = {
  id: "agents",
  name: "Agents",
  icon: ICON,
  sources: {
    "agent-usage": { argv: function() { return ["/usr/bin/bash", "-c", USAGE] }, parse: function(text, ok) { if (!ok) throw "the usage records could not be read"; return lines(text) },
                     maxAgeMs: 60000, retryMs: 60000, timeoutMs: 5000, maxBytes: 1048576 },
    "agent-sessions": { argv: function() { return ["/usr/bin/bash", "-c", SESSIONS] }, parse: function(text, ok) { if (!ok) throw "the sessions could not be read"; return lines(text) },
                        maxAgeMs: 5000, retryMs: 10000, timeoutMs: 8000, maxBytes: 1048576 }
  },
  commands: [
    { title: "Agent usage", keywords: "usage limits quota claude codex agents", text: "How much of each coding agent's limits is used", complete: "usage" },
    { title: "Agent sessions", keywords: "agents sessions claude codex running", text: "The coding agents running in a terminal", complete: "agents" }
  ],
  help: [
    { id: "agents", title: "Coding agents", icon: ICON, about: "Claude Code's and Codex's limits, and their sessions running in a terminal",
      examples: [{ q: "usage", note: "Each limit's share used, and when it resets" }, { q: "agents", note: "Enter focuses the session's terminal" }] }
  ],
  match: function(query, ctx) {
    var q = String(query || "")
    var nowMs = (ctx.now ? ctx.now() : new Date()).getTime()
    if (USAGE_WORDS.test(q)) {
      var got = ctx.request ? ctx.request("agent-usage") : { state: "pending" }
      if (!Array.isArray(got.value)) return [{ title: got.state === "error" ? "The usage records could not be read" : "Reading the usage records...", score: 40, copy: "", remember: false }]
      var all = limitsOf(got.value)
      if (!all.length) return [{ title: "No usage recorded", subtitle: "Omarchy's agents widget keeps it, for Claude Code and Codex", score: 40, copy: "", remember: false }]
      return all.map(function(l, i) { return limitRow(l, nowMs, { score: 97 - i * 0.01, group: l.name }) })
    }
    if (AGENTS_WORDS.test(q)) {
      var s = ctx.request ? ctx.request("agent-sessions") : { state: "pending" }
      if (!Array.isArray(s.value)) return [{ title: s.state === "error" ? "The sessions could not be read" : "Looking for agent sessions...", score: 40, copy: "", remember: false }]
      var list = s.value.filter(function(x) { return /^0x[0-9a-fA-F]+$/.test(String(x.address || "")) && isSession(x, ctx.home) })
      if (!list.length) return [{ title: "No agent session in a terminal", subtitle: "Claude Code and Codex, run in a terminal window", score: 40, copy: "", remember: false }]
      list.sort(function(a, b) { return (b.at || 0) - (a.at || 0) })
      return list.map(function(x, i) {
        var where = String(x.cwd || "").replace(new RegExp("^" + String(ctx.home || "/nonexistent").replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "(?=/|$)"), "~")
        return { key: "agents:session:" + x.pid, title: (x.tool === "codex" ? "Codex" : "Claude Code") + " in " + where,
                 subtitle: x.said ? "\"" + x.said + "\"" : String(x.title || ""), icon: ICON, run: Run.focus(String(x.address)),
                 score: 97 - i * 0.01, copy: "", remember: false, group: "Agent sessions" }
      })
    }
    return []
  }
}
