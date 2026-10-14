.pragma library
.import "AskTools.js" as AskTools

// The agents Ask can hold, over ACP (components/Ask.qml, ROADMAP 84), by
// the names Omarchy gives them (omarchy-default-agent): how each is
// started, and what it is given so that it answers as Ask needs, its own
// tools off where it allows that, and each tool it keeps asked about.
// Omarchy's others are not here: Cursor read /etc/hostname for a question
// without asking, in its ask mode and its agent mode, and in neither saw
// the bar's tools (cursor-agent 2026.10.01, tests/qml/AgentsLiveTest.qml,
// 2026-10-07); Copilot runs its tools without asking since 1.0.81
// (github/copilot-cli #4537, open 2026-09-04); omp, Hermes, pi and
// OpenClaw cannot turn their shell off for one session; Crush and Muse do
// not speak ACP (the research of 2026-10-07). Pi is held answer-only by
// its shipped command wrapper below; Agy is held in plan+sandbox mode.

// How an agent is started, in a login shell for his PATH and the agent's
// own sign-in. An adapter from npm is installed once into Nodi's data
// directory, and run from there: the tree lib/adapters/<name>/package-lock.json
// names, every package at its version and checked against its integrity
// hash (`npm ci`), none of their install scripts run, so what runs is the
// tree reviewed with this commit and not what the registry resolves on the
// day (the marketplace's review, 2026-10-09). A tree whose lock is not the
// shipped one is installed again. `--omit=optional` leaves out the agent a
// package bundles, as his own is used, its path found on his PATH and given
// in a variable. A start installs only when NODI_INSTALL=1, which Ask sets
// for a question asked, never while one is typed; else it ends at once with
// 75, saying so; a start that runs it says "nodi: adapter ready" first,
// installed now or before, so that Ask's rows stop saying an Enter will
// install it (components/Ask.qml). The lock is compared, not the tree
// beside it: what can write Nodi's data directory can write his profile
// too, and the check is for a tree installed from another lock. A
// settings file the agent is pointed at is written first.
// One install at a time, under a lock that an npm left running also holds,
// as it inherits it. A start that waits for the lock says it is installing,
// so it has an install's time. One ended mid-install (a restart, a changed
// nodi.json) stops its npm; the next waits for any still running, then
// installs afresh (Fable 2026-10-07: a second npm into the same directory
// left a broken tree that passed for installed). Once one is in place, the
// same adapter's other versions, their trees and their logs, go, each
// only when its own lock is free, as an install of it holds it (codex's
// review, 2026-10-09): each pin moved left the last one behind, 61 MB for
// Claude's (2026-10-09).
// What the agent writes is bounded before the shell reads it (the
// marketplace's review asks it of a helper held open, 2026-09-12), by the
// arguments of --bounds, which spec() gives as OUT_MAX and LINE_MAX, so
// nothing in the environment, nodi.json's or a profile's, moves them: a
// line of stdout past LINE_MAX bytes (4 MB) is broken there, which no
// message parses, so Quickshell never holds more of one; stderr's lines at
// 64 KB, of which Ask keeps the last three; and past OUT_MAX bytes (64 MB)
// of stdout the agent is sent TERM, saying so ($$ in the filter is the
// shell that became the agent). Each filter flushes as it writes: a line
// at a time.
//   [--bounds out line] [--which VAR program]... [--file VAR path content]...
//   then "exec" and the command, or "npm" dir lockdir package version bin
//   and its arguments.
// --check, first, only asks whether the adapter is in place: "nodi:
// adapter ready" and 0 if it is, 75 if not, as a start would say; it
// writes no file, looks up no program, installs nothing whatever
// NODI_INSTALL says, and starts nothing. An argument, not a variable, and
// run without a login shell (checkArgv), so no profile can turn a check
// into an install (Cursor's review, 2026-10-10). Ask runs it at its load,
// so the rows stop saying an Enter installs what is installed (they said
// so after every shell restart until a warm start).
// Under umask 077: what the agent writes is his alone. Codex keeps each
// conversation in ~/.codex/sessions, 0644 in 0755 folders under the
// shell's umask, Ask's questions and selections with it (2026-10-10, after
// the marketplace's review); the adapter's tree is installed so too.
var LAUNCH = 'set -u; umask 077'
  + "\n" + 'out=67108864 line=4194304 check=0'
  + "\n" + '[ "${1-}" = --check ] && { check=1; shift; }'
  + "\n" + 'bounded() {'
  + "\n" + '  exec 2> >(exec /usr/bin/stdbuf -oL /usr/bin/fold -b -w 65536 >&2)'
  + "\n" + '  exec > >({ /usr/bin/stdbuf -o0 /usr/bin/head -c "$out"; [ "$(/usr/bin/head -c 1 | /usr/bin/wc -c)" = 0 ] || { echo "nodi: the agent wrote more than $out bytes, and was stopped" >&2; kill -TERM $$ 2>/dev/null; }; } | /usr/bin/stdbuf -oL /usr/bin/fold -b -w "$line")'
  + "\n" + '}'
  + "\n" + 'while :; do'
  + "\n" + '  case ${1-} in'
  + "\n" + '    --bounds)'
  + "\n" + '      out=$2 line=$3; shift 3 ;;'
  + "\n" + '    --which)'
  + "\n" + '      [ "$check" = 1 ] && { shift 3; continue; }'
  + "\n" + '      p=$(command -v "$3") || { echo "nodi: $3 is not installed, or not on the login PATH" >&2; exit 127; }'
  + "\n" + '      export "$2=$p"; shift 3 ;;'
  + "\n" + '    --file)'
  + "\n" + '      [ "$check" = 1 ] && { shift 4; continue; }'
  + "\n" + '      mkdir -p -- "$(dirname -- "$3")" && t=$(mktemp -- "$3.XXXXXX") && printf \'%s\\n\' "$4" > "$t" && mv -fT -- "$t" "$3" || { rm -f -- "${t-}"; echo "nodi: could not write $3" >&2; exit 1; }'
  + "\n" + '      export "$2=$3"; shift 4 ;;'
  + "\n" + '    *) break ;;'
  + "\n" + '  esac'
  + "\n" + 'done'
  + "\n" + 'if [ "$1" = npm ]; then'
  + "\n" + '  dir=$2 lock=$3 pkg=$4 ver=$5 bin=$6; shift 6'
  + "\n" + '  runner=; if [ "${1-}" = --nodi-runner ]; then runner=$2; shift 2; fi'
  + "\n" + '  installed() { [ -x "$dir/node_modules/.bin/$bin" ] && cmp -s -- "$lock/package-lock.json" "$dir/package-lock.json"; }'
  + "\n" + '  if ! installed; then'
  + "\n" + '    [ "$check" = 0 ] && [ "${NODI_INSTALL-}" = 1 ] || { echo "nodi: $pkg@$ver is not installed" >&2; exit 75; }'
  + "\n" + '    command -v npm >/dev/null || { echo "nodi: Node.js and npm are needed for $pkg" >&2; exit 127; }'
  + "\n" + '    [ -f "$lock/package.json" ] && [ -f "$lock/package-lock.json" ] || { echo "nodi: no lockfile for $pkg in $lock" >&2; exit 1; }'
  + "\n" + '    echo "nodi: installing $pkg@$ver" >&2'
  + "\n" + '    mkdir -p -- "$(dirname -- "$dir")" && exec 9>"$dir.lock" && flock 9 || { echo "nodi: could not lock $dir" >&2; exit 1; }'
  + "\n" + '    if ! installed; then'
  + "\n" + '      rm -rf -- "$dir.part" && mkdir -p -- "$dir.part" && cp -- "$lock/package.json" "$lock/package-lock.json" "$dir.part/" || exit 1'
  + "\n" + '      npm ci --prefix "$dir.part" --ignore-scripts --omit=optional --no-audit --no-fund --loglevel=error >"$dir.part/.install.log" 2>&1 &'
  + "\n" + '      npid=$!'
  + "\n" + '      trap \'kill "$npid" 2>/dev/null; exit 143\' TERM INT HUP'
  + "\n" + '      wait "$npid"; s=$?'
  + "\n" + '      trap - TERM INT HUP'
  + "\n" + '      mv -fT -- "$dir.part/.install.log" "$dir.log" 2>/dev/null'
  + "\n" + '      [ $s -eq 0 ] || { echo "nodi: could not install $pkg@$ver: $(tail -n 1 "$dir.log")" >&2; exit $s; }'
  + "\n" + '      rm -rf -- "$dir" && mv -T -- "$dir.part" "$dir" || exit 1'
  + "\n" + '      for o in "${dir%@*}"@*; do case $o in "$dir" | "$dir".* | *.lock | *.log | *.part) continue ;; esac; [ -d "$o" ] && flock -n "$o.lock" true 2>/dev/null && rm -rf -- "$o" "$o.part" "$o.log" "$o.lock"; done'
  + "\n" + '    fi'
  + "\n" + '    exec 9>&-'
  + "\n" + '  fi'
  + "\n" + '  echo "nodi: adapter ready" >&2'
  + "\n" + '  [ "$check" = 1 ] && exit 0'
  + "\n" + '  bounded'
  + "\n" + '  [ -z "$runner" ] || exec "$runner" "$dir" "$@"'
  + "\n" + '  exec "$dir/node_modules/.bin/$bin" "$@"'
  + "\n" + 'fi'
  + "\n" + '[ "$check" = 1 ] && exit 0'
  + "\n" + 'shift; bounded; exec "$@"'

// Each agent Ask knows:
//   name                      what the bar calls it
//   npm: { package, version, bin, lock, args, runner, wrapper }  an adapter,
//                             installed once, with an optional lock-folder
//                             name (the binary name otherwise), fixed argv
//                             and trusted local adapter runner
//                             wrapper ({ file, env } puts its path in an
//                             environment variable; { file, option } gives
//                             its path as that adapter option); else
//   command: [...]            the agent itself, by name
//   which: { VAR: program }   his own program's path, in VAR
//   policy                    strict, answer-only, or unmanaged
//   enforcement               how that policy is enforced for this adapter
//   capabilities.actions      whether Ask may give Nodi actions and MCP
//                             servers (false for answer-only agents or when
//                             explicitly disabled)
//   defaultModel              the model when nodi.json names none
//   env(model, instructions, servers)  variables for the agent
//   file(model, instructions, servers, workDir):
//                             { VAR, name|path, content }, a settings file
//                             in Nodi's data directory or at its exact path,
//                             its path in VAR
//   meta(instructions, model, acts, actionServer)  _meta for session/new
//   instructs                 the instructions go in env or meta; else
//                             they go with the first prompt
//   mode                      the session mode Ask asks for after
//                             session/new, by its id: the agent fails to
//                             start without it
//   modelInMeta               the model goes in env or meta; else it is
//                             chosen from the agent's config options
// `servers` are the names of the MCP servers given with session/new.
var STRICT = "strict"
var ANSWER_ONLY = "answer-only"
var UNMANAGED = "unmanaged"

var AGENTS = {
  claude: {
    name: "Claude",
    policy: STRICT,
    enforcement: "strict adapter settings disable built-in tools, inherited settings, memory, and unsupplied MCP servers",
    // Anthropic's Agent SDK under ACP (github.com/agentclientprotocol/
    // claude-agent-acp, 0.86.0 of 2026-10-05), run on his own `claude`.
    npm: { package: "@agentclientprotocol/claude-agent-acp", version: "0.86.0", bin: "claude-agent-acp",
           runner: "claude-agent-acp-trusted.mjs" },
    which: { CLAUDE_CODE_EXECUTABLE: "claude" },
    defaultModel: "haiku",
    instructs: true,
    modelInMeta: true,
    // Neither his CLAUDE.md nor auto memory; ANTHROPIC_MODEL as well as the
    // option, as a model in his settings.json outranks the option
    // (claude-agent-acp #1056, open since 2026-08-31).
    env: function(model) {
      return { CLAUDE_CODE_DISABLE_CLAUDE_MDS: "1", CLAUDE_CODE_DISABLE_AUTO_MEMORY: "1", ANTHROPIC_MODEL: model }
    },
    // The system prompt replaces Claude Code's own; the options are spread
    // over the adapter's: no built-in tool (Claude Code runs some read-only
    // shell commands without asking), none of his settings, MCP servers
    // only those given here, nothing saved, no thinking, and no way to
    // bypass the questions. The bar's search runs without one; its run
    // asks, and so does every tool of a server he named.
    meta: function(instructions, model, acts, actionServer) {
      return { systemPrompt: instructions, nodiActionServer: acts && actionServer ? actionServer : "",
               claudeCode: { options: { model: model, tools: [], settingSources: [], strictMcpConfig: true,
                                        allowedTools: acts && actionServer ? ["mcp__" + actionServer + "__search"] : [],
                                        persistSession: false, thinking: { type: "disabled" },
                                        settings: { alwaysThinkingEnabled: false },
                                        allowDangerouslySkipPermissions: false } } }
    }
  },
  codex: {
    name: "Codex",
    policy: UNMANAGED,
    enforcement: "a private CODEX_HOME and strict settings are used, but Nodi cannot disable Codex's built-in tools; Codex may use them",
    // OpenAI's Codex under ACP (github.com/agentclientprotocol/codex-acp,
    // 2.1.1 of 2026-10-01), run on his own `codex`, with Nodi's private
    // profile sign-in.
    npm: { package: "@agentclientprotocol/codex-acp", version: "2.1.1", bin: "codex-acp",
           runner: "codex-acp-trusted.mjs" },
    which: { NODI_CODEX_COMMAND: "codex" },
    instructs: true,
    modelInMeta: true,
    // Best-effort read-only defense: ask Codex for no shell, apps, web
    // search, skills or project instructions, and use these instructions
    // as its developer instructions. Stock Codex does not expose the final
    // built-in router, so these settings are not an attested tool boundary.
    env: function(model, instructions, servers, dataDir, adaptersDir) {
      var isolated = "Do not use or mention Codex skills, project instructions, or built-in tools. Use only MCP tools supplied for this session."
      var config = { "developer_instructions": isolated + "\n\n" + instructions, "web_search": "disabled", "project_doc_max_bytes": 0,
                     features: { apps: false, web_search_request: false,
                                 shell_tool: false, unified_exec: false, skill_search: false,
                                 hooks: false, browser_use: false, computer_use: false, image_generation: false,
                                 multi_agent: false, code_mode_host: false,
                                 plugins: false, skip_host_skill_discovery: true } }
      if (model) config.model = model
      return { INITIAL_AGENT_MODE: "read-only", CODEX_CONFIG: JSON.stringify(config),
               CODEX_PATH: String(adaptersDir || "") + "/codex-acp/codex-isolated",
               NODI_CODEX_HOME: String(dataDir || "") + "/profiles/codex" }
    },
    // Let the action server finish starting before the adapter samples its
    // diagnostic MCP catalog. This timeout does not attest the final router.
    meta: function(instructions, model, acts, actionServer) {
      return { mcpStartupAwaitTimeoutMs: 15000,
               nodiActionServer: acts && actionServer ? actionServer : "" }
    }
  },
  opencode: {
    name: "OpenCode",
    policy: UNMANAGED,
    enforcement: "unmanaged ACP agent; Nodi guards only its own proposed actions",
    command: ["opencode", "acp"]
  },
  pi: {
    name: "Pi",
    policy: ANSWER_ONLY,
    enforcement: "answer-only command wrapper disables tools, MCP, context files, skills, and prompt templates",
    npm: { package: "pi-acp", version: "0.0.34", bin: "pi-acp",
           wrapper: { env: "PI_ACP_PI_COMMAND", file: "pi-answer-only" } },
    which: { NODI_PI_COMMAND: "pi" },
    // pi-acp otherwise scans and emits context/skill names itself even when
    // Pi was started with their discovery disabled. A local setting in
    // Nodi's empty work directory quiets that adapter inventory without
    // replacing Pi's global settings or disabling user-installed extensions.
    file: function(model, instructions, servers, workDir) {
      return workDir ? { VAR: "NODI_PI_SETTINGS", path: String(workDir) + "/.pi/settings.json",
                         content: '{"quietStartup":true}' } : null
    },
    capabilities: { actions: false }
  },
  agy: {
    name: "Agy",
    policy: ANSWER_ONLY,
    enforcement: "answer-only command wrapper forces plan mode and sandboxing",
    npm: { package: "google-antigravity-acp", version: "2.0.1", bin: "google-antigravity-acp", lock: "agy-acp",
           args: ["--no-skip-permissions"],
           wrapper: { option: "--binary-path", file: "agy-answer-only" } },
    which: { NODI_AGY_COMMAND: "agy" },
    // Agy has no no-tools mode and can run its own reads and global MCP
    // servers without an ACP permission request even in plan+sandbox mode.
    // Nodi gives it no bar actions and no configured MCP servers.
    capabilities: { actions: false }
  }
}

var SAFE_ID = /^[a-z][a-z0-9_-]{0,31}$/

function safeId(id) {
  return typeof id === "string" && SAFE_ID.test(id) ? id : ""
}

var RETIRED = { gemini: "agy" }

function canonicalId(id) {
  var key = safeId(id)
  return key && Object.prototype.hasOwnProperty.call(RETIRED, key) ? RETIRED[key] : key
}

function policy(id, registered) {
  var key = typeof id === "string" ? canonicalId(id) : ""
  var builtin = key && Object.prototype.hasOwnProperty.call(AGENTS, key) ? AGENTS[key] : null
  if (builtin) return builtin.policy
  return UNMANAGED
}

// Built-ins followed by valid custom definitions. A malformed custom entry,
// a duplicate, or an attempt to replace a built-in is ignored as a whole.
function registry(ask) {
  var out = []
  var seen = Object.create(null)
  for (var retired in RETIRED) seen[retired] = true
  var ids = Object.keys(AGENTS)
  for (var i = 0; i < ids.length; i++) {
    var id = ids[i]
    var builtin = AGENTS[id]
    out.push({ id: id, name: builtin.name, builtin: true })
    seen[id] = true
  }
  var list = ask && Array.isArray(ask.agents) ? ask.agents : []
  for (var n = 0; n < list.length; n++) {
    var c = list[n]
    if (!c || typeof c !== "object" || Array.isArray(c)) continue
    var cid = safeId(c.id)
    var name = typeof c.name === "string" ? c.name.trim() : ""
    var cmd = c.command
    if (!cid || seen[cid] || !name || !Array.isArray(cmd) || !cmd.length
        || !cmd.every(function(x) { return typeof x === "string" }) || !cmd[0]) continue
    var env = {}
    var given = c.env
    var valid = given === undefined || (given && typeof given === "object" && !Array.isArray(given))
    for (var k in given || {}) {
      if (!Object.prototype.hasOwnProperty.call(given, k)) continue
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(k) || typeof given[k] !== "string") { valid = false; break }
      env[k] = given[k]
    }
    if (!valid) continue
    out.push({ id: cid, name: name, command: cmd.slice(), env: env, builtin: false })
    seen[cid] = true
  }
  return out
}

function byId(list, id) {
  var key = canonicalId(id)
  for (var i = 0; key && Array.isArray(list) && i < list.length; i++)
    if (list[i] && list[i].id === key) return list[i]
  return null
}

function disabledReason(id) {
  var key = typeof id === "string" ? canonicalId(id) : ""
  var a = key && Object.prototype.hasOwnProperty.call(AGENTS, key) ? AGENTS[key] : null
  return a && typeof a.disabled === "string" ? a.disabled : ""
}

// pi-acp projects Pi's transient retry and routing notices as agent text.
// Those notices are progress, not the answer.
function answerText(id, text) {
  var s = String(text || "")
  if (id === "pi" && (/^[a-z][a-z0-9_-]*: .+ cooling for .+, rerouting$/i.test(s)
      || /^Retrying \(attempt \d+\/\d+, waiting [^)]+\)\.\.\.$/.test(s)
      || s === "Retry finished, resuming.")) return ""
  return s
}

// What Ask sends as the first prompt's instruction block (components/Ask.qml
// flush), after AskTools.instructions. Agy otherwise inspects the
// workspace headlessly, auto-denies commands, and the adapter returns an
// empty turn under --no-skip-permissions.
var AGY_NO_TOOLS = "Do not use any tools or inspect the workspace; answer only from your own knowledge."

function firstPromptInstructions(id, instructions) {
  var base = String(instructions || "")
  return canonicalId(id) === "agy" ? base + "\n\n" + AGY_NO_TOOLS : base
}

// What Nodi may offer this agent. Built-ins opt out explicitly; custom
// agents retain the established action behavior.
function capabilities(id, registered) {
  var key = typeof id === "string" ? canonicalId(id) : ""
  var a = key && Object.prototype.hasOwnProperty.call(AGENTS, key) ? AGENTS[key] : null
  if (!a && Array.isArray(registered)) {
    var found = byId(registered, id)
    if (found && found.builtin) a = AGENTS[found.id]
  }
  return { actions: policy(id, registered) !== ANSWER_ONLY
                    && !(a && a.capabilities && a.capabilities.actions === false) }
}

// An agent of his own, as nodi.json names it: { name, command: [program,
// args...], env: { VAR: value } }, started as its command says (any ACP
// agent Ask has no recipe for). Nodi cannot turn its own tools off: what
// it asks about is shown in the bar, and nothing more. Null when it is not
// that shape.
function custom(c) {
  if (!c || typeof c !== "object" || Array.isArray(c)) return null
  var cmd = c.command
  if (!Array.isArray(cmd) || !cmd.length || !cmd.every(function(x) { return typeof x === "string" }) || !cmd[0]) return null
  var env = {}
  var given = c.env && typeof c.env === "object" && !Array.isArray(c.env) ? c.env : {}
  for (var k in given) if (Object.prototype.hasOwnProperty.call(given, k) && /^[A-Za-z_][A-Za-z0-9_]*$/.test(k)) env[k] = String(given[k])
  return { name: typeof c.name === "string" && c.name.trim() ? c.name.trim() : cmd[0].replace(/^.*\//, ""), command: cmd, env: env }
}

// What starts the agent `id` (a name Ask knows, or his own, custom()),
// given Nodi's data directory, the model asked for, the instructions, the
// MCP servers' names and where the adapters' lockfiles are (lib/adapters):
// { id, name, argv, env, meta(acts), instructs, mode, model, modelInMeta,
// adapter, policy, enforcement }, or null for an agent Ask cannot start.
// `adapter` names an npm adapter, "" for an agent started by its own command.
// The most the agent may write to Ask, in bytes: in all, and in one line.
var OUT_MAX = 67108864
var LINE_MAX = 4194304

function spec(id, dataDir, model, instructions, servers, adaptersDir, registered, workDir) {
  var own = custom(id)
  if (own) return { id: own.name, name: own.name, argv: ["/usr/bin/bash", "-lc", LAUNCH, "nodi-agent", "--bounds", String(OUT_MAX), String(LINE_MAX), "exec"].concat(own.command),
                    env: own.env, model: String(model || ""), instructs: false, mode: "", modelInMeta: false, meta: null, adapter: "",
                    policy: UNMANAGED, enforcement: "unmanaged ACP agent; Nodi guards only its own proposed actions",
                    capabilities: capabilities(id, registered) }
  var cid = typeof id === "string" ? canonicalId(id) : ""
  var a = cid && Object.prototype.hasOwnProperty.call(AGENTS, cid) ? AGENTS[cid] : null
  if ((!a || typeof id !== "string" || !cid) && Array.isArray(registered)) {
    var found = byId(registered, id)
    if (found && !found.builtin) a = { name: found.name, command: found.command, env: function() { return found.env } }
  }
  if (!a || a.disabled) return null
  var m = String(model || a.defaultModel || "")
  var names = Array.isArray(servers) ? servers : []
  var text = String(instructions || "")
  var argv = ["/usr/bin/bash", "-lc", LAUNCH, "nodi-agent", "--bounds", String(OUT_MAX), String(LINE_MAX)]
  for (var v in a.which || {}) argv.push("--which", v, a.which[v])
  if (a.file) {
    var f = a.file(m, text, names, workDir)
    if (f) argv.push("--file", f.VAR, f.path || String(dataDir) + "/" + f.name, f.content)
  }
  var lockDir = a.npm ? String(adaptersDir || "") + "/" + (a.npm.lock || a.npm.bin) : ""
  var wrapper = a.npm && a.npm.wrapper ? lockDir + "/" + a.npm.wrapper.file : ""
  var adapterArgs = a.npm && Array.isArray(a.npm.args) ? a.npm.args.slice() : []
  if (a.npm && a.npm.runner) adapterArgs = ["--nodi-runner", lockDir + "/" + a.npm.runner].concat(adapterArgs)
  if (wrapper && a.npm.wrapper.option) adapterArgs = [a.npm.wrapper.option, wrapper].concat(adapterArgs)
  if (a.npm) argv = argv.concat(["npm", String(dataDir) + "/agents/" + a.npm.package.replace(/[^A-Za-z0-9._-]+/g, "_") + "@" + a.npm.version,
                                 lockDir, a.npm.package, a.npm.version, a.npm.bin],
                                adapterArgs)
  else argv = argv.concat(["exec"]).concat(a.command)
  var env = a.env ? a.env(m, text, names, dataDir, adaptersDir) : {}
  if (wrapper && a.npm.wrapper.env) env[a.npm.wrapper.env] = wrapper
  return { id: cid, name: a.name, argv: argv, env: env, model: m,
           instructs: !!a.instructs, mode: a.mode || "", modelInMeta: !!a.modelInMeta,
           meta: a.meta ? function(acts, actionServer) { return a.meta(text, m, acts, actionServer) } : null,
           adapter: a.npm ? a.npm.package + " " + a.npm.version : "",
           policy: policy(cid, registered),
           enforcement: a.enforcement || "unmanaged ACP agent; Nodi guards only its own proposed actions",
           capabilities: capabilities(cid, registered) }
}

// The check of a start's adapter (LAUNCH --check): the same arguments,
// "--check" first, under a shell that reads no profile; null for an argv
// that is not the launch script's.
function checkArgv(argv) {
  var a = Array.isArray(argv) ? argv : []
  if (a.length < 4 || a[0] !== "/usr/bin/bash" || a[1] !== "-lc" || a[2] !== LAUNCH) return null
  return ["/usr/bin/bash", "-c", LAUNCH, a[3], "--check"].concat(a.slice(4))
}

// What stops the agent at `pid` when Ask goes (the plugin disabled or
// removed, the shell stopping), which takes its own timer with it: TERM,
// then KILL after `seconds` (3) if the same process still runs, known by
// its start time, so a pid taken since by another is never killed (codex's
// review, 2026-10-09: an agent that ignores TERM outlived Nodi).
var STOP_SCRIPT = 'p=$1; at() { local s; s=$(cat "/proc/$p/stat" 2>/dev/null) || return 1; s=${s##*) }; set -- $s; echo "${20}"; }'
  + "\n" + 'st=$(at) || exit 0; kill -TERM "$p" 2>/dev/null; sleep "$2"; [ "$(at)" = "$st" ] && kill -KILL "$p" 2>/dev/null; exit 0'

function stopArgv(pid, seconds) {
  var n = Number(pid)
  if (!(n > 1) || Math.floor(n) !== n) return null
  return ["/usr/bin/bash", "-c", STOP_SCRIPT, "nodi-stop", String(n), String(seconds === undefined ? 3 : seconds)]
}

// The agent Ask holds: the one nodi.json names (a name, or his own as an
// object), else Omarchy's default coding agent when Ask knows it, else
// Claude.
function chosen(configured, omarchyDefault, remembered, registered, availability) {
  var list = Array.isArray(registered) ? registered : registry({})
  var selectable = function(id) { return !!byId(list, id) && !disabledReason(id) }
  var memory = canonicalId(remembered)
  if (memory && selectable(memory) && (!availability || availability[memory] !== false)) return memory
  if (configured && typeof configured === "object") return configured
  var c = canonicalId(String(configured || "").trim())
  if (c && selectable(c)) return c
  var d = canonicalId(String(omarchyDefault || "").trim())
  return selectable(d) ? d : "claude"
}

function known() { return Object.keys(AGENTS) }

// The model belonging to `id`. A per-agent model wins. The legacy model is
// attached to the configured agent, or to Omarchy's supported default (and
// ultimately Claude) when no agent is configured; it does not follow memory.
function modelFor(id, ask, omarchyDefault, registered) {
  var cfg = ask && typeof ask === "object" ? ask : {}
  var models = cfg.models && typeof cfg.models === "object" && !Array.isArray(cfg.models) ? cfg.models : {}
  var key = typeof id === "string" ? canonicalId(id) : ""
  if (key && Object.prototype.hasOwnProperty.call(models, key) && typeof models[key] === "string") return models[key]
  if (key === "agy" && Object.prototype.hasOwnProperty.call(models, "gemini")
      && typeof models.gemini === "string") return models.gemini
  var configured = cfg.agent && typeof cfg.agent === "object" ? cfg.agent
    : chosen(cfg.agent, omarchyDefault, "", registered)
  var matches = configured && typeof configured === "object" ? id === configured : key === canonicalId(configured)
  if (matches && typeof cfg.model === "string") return cfg.model
  var builtin = key && Object.prototype.hasOwnProperty.call(AGENTS, key) ? AGENTS[key] : null
  return String((builtin && builtin.defaultModel) || "")
}

// The program `id` (a name Ask knows, or his own) needs on his login PATH,
// to say before an Enter that it is not there: Claude Code's `claude`,
// `codex`, `agy`, or his own command's first word; "" when none is known.
function program(id, registered) {
  var own = custom(id)
  if (own) return own.command[0]
  var key = typeof id === "string" ? canonicalId(id) : ""
  var a = key && Object.prototype.hasOwnProperty.call(AGENTS, key) ? AGENTS[key] : null
  if (!a && Array.isArray(registered)) {
    var found = byId(registered, id)
    if (found && !found.builtin) return found.command[0]
  }
  if (!a) return ""
  for (var v in a.which || {}) return a.which[v]
  return a.command ? a.command[0] : ""
}

function shellWord(value) {
  return "'" + String(value).replace(/'/g, "'\\''") + "'"
}

// What a terminal sign-in must run. Codex's empty private profile cannot use
// the normal command's rotating ChatGPT refresh token.
function signInCommand(id, dataDir, registered) {
  var key = typeof id === "string" ? canonicalId(id) : ""
  if (key === "codex")
    return "CODEX_HOME=" + shellWord(String(dataDir || "") + "/profiles/codex") + " codex login"
  return program(id, registered) || key
}
