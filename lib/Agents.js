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
// not speak ACP (the research of 2026-10-07).

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
// left a broken tree that passed for installed).
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
var LAUNCH = 'set -u'
  + "\n" + 'out=67108864 line=4194304'
  + "\n" + 'bounded() {'
  + "\n" + '  exec 2> >(exec /usr/bin/stdbuf -oL /usr/bin/fold -b -w 65536 >&2)'
  + "\n" + '  exec > >({ /usr/bin/stdbuf -o0 /usr/bin/head -c "$out"; [ "$(/usr/bin/head -c 1 | /usr/bin/wc -c)" = 0 ] || { echo "nodi: the agent wrote more than $out bytes, and was stopped" >&2; kill -TERM $$ 2>/dev/null; }; } | /usr/bin/stdbuf -oL /usr/bin/fold -b -w "$line")'
  + "\n" + '}'
  + "\n" + 'while :; do'
  + "\n" + '  case ${1-} in'
  + "\n" + '    --bounds)'
  + "\n" + '      out=$2 line=$3; shift 3 ;;'
  + "\n" + '    --which)'
  + "\n" + '      p=$(command -v "$3") || { echo "nodi: $3 is not installed, or not on the login PATH" >&2; exit 127; }'
  + "\n" + '      export "$2=$p"; shift 3 ;;'
  + "\n" + '    --file)'
  + "\n" + '      mkdir -p -- "$(dirname -- "$3")" && printf \'%s\\n\' "$4" > "$3" || { echo "nodi: could not write $3" >&2; exit 1; }'
  + "\n" + '      export "$2=$3"; shift 4 ;;'
  + "\n" + '    *) break ;;'
  + "\n" + '  esac'
  + "\n" + 'done'
  + "\n" + 'if [ "$1" = npm ]; then'
  + "\n" + '  dir=$2 lock=$3 pkg=$4 ver=$5 bin=$6; shift 6'
  + "\n" + '  installed() { [ -x "$dir/node_modules/.bin/$bin" ] && cmp -s -- "$lock/package-lock.json" "$dir/package-lock.json"; }'
  + "\n" + '  if ! installed; then'
  + "\n" + '    [ "${NODI_INSTALL-}" = 1 ] || { echo "nodi: $pkg@$ver is not installed" >&2; exit 75; }'
  + "\n" + '    command -v npm >/dev/null || { echo "nodi: Node.js and npm are needed for $pkg" >&2; exit 127; }'
  + "\n" + '    [ -f "$lock/package.json" ] && [ -f "$lock/package-lock.json" ] || { echo "nodi: no lockfile for $pkg in $lock" >&2; exit 1; }'
  + "\n" + '    echo "nodi: installing $pkg@$ver" >&2'
  + "\n" + '    mkdir -p -- "$(dirname -- "$dir")" && exec 9>"$dir.lock" && flock 9 || { echo "nodi: could not lock $dir" >&2; exit 1; }'
  + "\n" + '    if ! installed; then'
  + "\n" + '      rm -rf -- "$dir.part" && mkdir -p -- "$dir.part" && cp -- "$lock/package.json" "$lock/package-lock.json" "$dir.part/" || exit 1'
  + "\n" + '      npm ci --prefix "$dir.part" --ignore-scripts --omit=optional --no-audit --no-fund --loglevel=error >"$dir.log" 2>&1 &'
  + "\n" + '      npid=$!'
  + "\n" + '      trap \'kill "$npid" 2>/dev/null; exit 143\' TERM INT HUP'
  + "\n" + '      wait "$npid"; s=$?'
  + "\n" + '      trap - TERM INT HUP'
  + "\n" + '      [ $s -eq 0 ] || { echo "nodi: could not install $pkg@$ver: $(tail -n 1 "$dir.log")" >&2; exit $s; }'
  + "\n" + '      rm -rf -- "$dir" && mv -- "$dir.part" "$dir" || exit 1'
  + "\n" + '    fi'
  + "\n" + '    exec 9>&-'
  + "\n" + '  fi'
  + "\n" + '  echo "nodi: adapter ready" >&2'
  + "\n" + '  bounded'
  + "\n" + '  exec "$dir/node_modules/.bin/$bin" "$@"'
  + "\n" + 'fi'
  + "\n" + 'shift; bounded; exec "$@"'

// Each agent Ask knows:
//   name                      what the bar calls it
//   npm: { package, version, bin }  an adapter, installed once; else
//   command: [...]            the agent itself, by name
//   which: { VAR: program }   his own program's path, in VAR
//   defaultModel              the model when nodi.json names none
//   env(model, instructions, servers)  variables for the agent
//   file(model, instructions, servers): { VAR, name, content }  a
//                             settings file in Nodi's data directory,
//                             its path in VAR
//   meta(instructions, model, acts)  _meta for session/new
//   instructs                 the instructions go in env or meta; else
//                             they go with the first prompt
//   mode                      the session mode Ask asks for after
//                             session/new, by its id: the agent fails to
//                             start without it
//   modelInMeta               the model goes in env or meta; else it is
//                             chosen from the agent's config options
// `servers` are the names of the MCP servers given with session/new.
var AGENTS = {
  claude: {
    name: "Claude",
    // Anthropic's Agent SDK under ACP (github.com/agentclientprotocol/
    // claude-agent-acp, 0.86.0 of 2026-10-05), run on his own `claude`.
    npm: { package: "@agentclientprotocol/claude-agent-acp", version: "0.86.0", bin: "claude-agent-acp" },
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
    meta: function(instructions, model, acts) {
      return { systemPrompt: instructions,
               claudeCode: { options: { model: model, tools: [], settingSources: [], strictMcpConfig: true,
                                        allowedTools: acts ? ["mcp__" + AskTools.SERVER + "__search"] : [],
                                        persistSession: false, thinking: { type: "disabled" },
                                        settings: { alwaysThinkingEnabled: false },
                                        allowDangerouslySkipPermissions: false } } }
    }
  },
  codex: {
    name: "Codex",
    // OpenAI's Codex under ACP (github.com/agentclientprotocol/codex-acp,
    // 2.1.1 of 2026-10-01), run on his own `codex`, with its existing
    // sign-in.
    npm: { package: "@agentclientprotocol/codex-acp", version: "2.1.1", bin: "codex-acp" },
    which: { CODEX_PATH: "codex" },
    instructs: true,
    modelInMeta: true,
    // Read-only, which asks before anything leaves it; no shell, no apps,
    // no web search, no AGENTS.md of a project; the instructions as its
    // developer instructions. Config overrides as `codex -c` takes them.
    env: function(model, instructions) {
      var config = { "developer_instructions": instructions, "web_search": "disabled", "project_doc_max_bytes": 0,
                     "features.shell_tool": false, "features.unified_exec": false, "features.apps": false }
      if (model) config.model = model
      return { INITIAL_AGENT_MODE: "read-only", CODEX_CONFIG: JSON.stringify(config) }
    }
  },
  gemini: {
    name: "Gemini",
    command: ["gemini", "--acp"],
    // System settings, which outrank his and a project's: no built-in tool
    // (an empty tools.core is an empty allowlist, Config.ts 3988-4000), no
    // MCP server but those given here, no GEMINI.md, no hooks.
    file: function(model, instructions, servers) {
      var s = { tools: { core: [] }, mcp: { allowed: servers }, context: { fileName: "NODI_NONE.md" }, hooksConfig: { enabled: false } }
      if (model) s.model = { name: model }
      return { VAR: "GEMINI_CLI_SYSTEM_SETTINGS_PATH", name: "gemini-settings.json", content: JSON.stringify(s) }
    },
    modelInMeta: true
  }
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
// adapter }, or null for an agent Ask cannot start. `adapter` names an npm
// adapter, "" for an agent started by its own command.
// The most the agent may write to Ask, in bytes: in all, and in one line.
var OUT_MAX = 67108864
var LINE_MAX = 4194304

function spec(id, dataDir, model, instructions, servers, adaptersDir) {
  var own = custom(id)
  if (own) return { id: own.name, name: own.name, argv: ["/usr/bin/bash", "-lc", LAUNCH, "nodi-agent", "--bounds", String(OUT_MAX), String(LINE_MAX), "exec"].concat(own.command),
                    env: own.env, model: String(model || ""), instructs: false, mode: "", modelInMeta: false, meta: null, adapter: "" }
  var a = AGENTS[String(id || "")]
  if (!a || typeof id !== "string" || !Object.prototype.hasOwnProperty.call(AGENTS, id)) return null
  var m = String(model || a.defaultModel || "")
  var names = Array.isArray(servers) ? servers : []
  var text = String(instructions || "")
  var argv = ["/usr/bin/bash", "-lc", LAUNCH, "nodi-agent", "--bounds", String(OUT_MAX), String(LINE_MAX)]
  for (var v in a.which || {}) argv.push("--which", v, a.which[v])
  if (a.file) {
    var f = a.file(m, text, names)
    argv.push("--file", f.VAR, String(dataDir) + "/" + f.name, f.content)
  }
  if (a.npm) argv = argv.concat(["npm", String(dataDir) + "/agents/" + a.npm.package.replace(/[^A-Za-z0-9._-]+/g, "_") + "@" + a.npm.version,
                                 String(adaptersDir || "") + "/" + a.npm.bin, a.npm.package, a.npm.version, a.npm.bin])
  else argv = argv.concat(["exec"]).concat(a.command)
  return { id: String(id), name: a.name, argv: argv, env: a.env ? a.env(m, text, names) : {}, model: m,
           instructs: !!a.instructs, mode: a.mode || "", modelInMeta: !!a.modelInMeta,
           meta: a.meta ? function(acts) { return a.meta(text, m, acts) } : null,
           adapter: a.npm ? a.npm.package + " " + a.npm.version : "" }
}

// The agent Ask holds: the one nodi.json names (a name, or his own as an
// object), else Omarchy's default coding agent when Ask knows it, else
// Claude.
function chosen(configured, omarchyDefault) {
  if (configured && typeof configured === "object") return configured
  var c = String(configured || "").trim()
  if (c) return c
  var d = String(omarchyDefault || "").trim()
  return Object.prototype.hasOwnProperty.call(AGENTS, d) ? d : "claude"
}

function known() { return Object.keys(AGENTS) }
