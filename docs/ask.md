# Ask

`ask` puts a question to a coding agent and shows its answer beside the
list as the agent writes it. Nodi talks to the agent over the
[Agent Client Protocol](https://agentclientprotocol.com) (ACP), the one
Zed and JetBrains use, so the bar works the same with each agent it can
hold. It uses the agent's own sign-in and your plan with it, and keeps no
key of its own.

## Which agent

Ask remembers the agent chosen from an Ask row's Ctrl+K actions. Without
that choice it uses `"ask": { "agent": ... }` in `nodi.json`, then
Omarchy's default coding agent (`omarchy default agent`) when Nodi can
hold it, else Claude. The actions show only enabled agents whose command
is installed. Installed means the command can start, not that its account
is signed in; an agent can ask you to sign in when first used.

| Agent | What it needs | Its tool boundary |
|---|---|---|
| `claude` | Claude Code, signed in; Node.js 22 or newer | **Managed strict.** Claude's ACP adapter, `@agentclientprotocol/claude-agent-acp` 0.86.0, runs your own `claude` with only the MCP servers supplied for this Ask session. Claude Code's built-in tools, inherited settings, CLAUDE.md and memory are off; nothing is saved. Nodi refuses startup when the runtime cannot prove that boundary. |
| `codex` | Codex, signed in to Nodi's private profile; Node.js 20 or newer | **Unmanaged.** Codex uses a private profile and strict settings, but Nodi cannot disable Codex's built-in tools. Codex may use them. Its pinned runner checks the executable/app-server version and Nodi action origins. |
| `opencode` | OpenCode | **Unmanaged.** Its native `opencode acp`. Nodi can require permission for what the agent asks through ACP, but cannot turn off anything OpenCode performs without asking. |
| `pi` | Pi, Node.js 22 or newer | **No Nodi actions.** [`pi-acp` 0.0.34](https://github.com/svkozak/pi-acp) runs your own `pi` through Nodi's wrapper. Tools, MCP, context files, skills and prompt templates are off; user-installed extensions remain available. |
| `agy` | Agy, with its own account and configuration; Node.js 22 or newer | **No Nodi actions.** The pinned [`google-antigravity-acp` 2.0.1](https://github.com/sibbl/google-antigravity-acp) adapter runs your own `agy` through Nodi's wrapper in plan mode and its sandbox. It receives no bar actions or configured MCP servers. Agy can still use its own read tools and globally configured MCP servers without asking Nodi. |

The first question you ask with Claude, Codex, Pi or Agy installs its
adapter once into `~/.local/share/nodi/agents`: about 60 MB for Claude's,
and a minute or so, while the bar says so. Until then the row that asks
says its Enter installs it; typing `ask ` installs nothing. What installs
is the tree in Nodi's `lib/adapters/<adapter>/package-lock.json`, through
`npm ci --ignore-scripts`: every package at the version the lock names
and checked against its hash, none of their install scripts run. A tree
installed from another lock is not run, and the next question installs
it again.

Add another ACP agent under `ask.agents`; its ID appears beside the
built-ins:

```jsonc
"ask": {
  "agents": [
    { "id": "helper", "name": "Helper", "command": ["helper", "acp"], "env": { "HELPER_MODE": "bar" } }
  ]
}
```

Custom ACP agents are **unmanaged**. Nodi cannot turn such an agent's own
tools off: the bar shows each thing it asks about, as below, and what it
does without asking is its own.
The older form, putting that object directly in `ask.agent`, still works.

`"models": { "pi": "provider/model", "codex": "model-name" }` picks a model for
each agent. The older `"model"` applies only to the configured default
agent; Claude uses `haiku` unless set (`sonnet`, `opus`), and the others
use their own default. The retired `gemini` agent ID resolves to `agy`;
`ask.models.agy` is used when set, otherwise `ask.models.gemini` remains
Agy's legacy model fallback.

## Asking

An available agent can be named for one question: `claude why ...`,
`codex review ...`, `opencode explain ...`, `pi compare ...`, `agy ...`,
or a configured custom agent's ID. This does not change the remembered
default; use an Ask row's Ctrl+K actions to do that. An unavailable agent
does not claim its name as a command.

`ask why is the sky blue`, then Enter: the answer's pane opens beside
the list at once, saying what the agent is doing (starting, searching
the bar, thinking) beside a turning 󰦖 until its words come, and the
answer fills it as the agent writes it. Then Enter pastes it where you were, Ctrl+Enter
copies it, "Continue in your agent" opens Omarchy's default coding agent
(`omarchy-agent`) with no prompt and the question on the clipboard to
paste in it, and "Ask again" asks it again. Tab on a query nothing else fills in writes `ask ` before it, for
Enter to ask, and a query nothing answers offers to ask it: Enter on that
row asks at once, and selecting it, by the keys or the pointer, starts
the agent as typing `ask ` does.

It is a conversation: a question asked within ten minutes of the last
answer follows it, across closes of the bar, and the pane shows the turns
before it above its answer; later, or after "New question", the agent
starts afresh. "Continue in your agent" copies the whole conversation, each
question and answer, to paste. The session starts as you type
`ask `, so it is warm by the time you press Enter, and ends after thirty
minutes with no question.

### Agent interactions

When an ACP agent advertises them, Ask also supports its interactive
features:

- `ask /` lists the agent's current commands. Commands offered after an
  answer follow Paste, Copy, and Continue; a command that needs input opens
  bounded fields before it is sent.
- Plans appear as status-marked, non-executable blocks in the answer pane.
- A form request supports bounded text, multiline text, boolean, number,
  integer, and enum fields. Submit sends their structured values; Cancel,
  Esc, or closing the bar refuses the request. Clipboard input uses the
  same 64 KiB, two-second read as the main field.
- Actions attached to the final answer are bound to that answer. Commands
  run directly only when safe; executable actions show their immutable
  command and wait for confirmation.
- Saved sessions are listed and resumed only when the agent advertises
  `session/list` and `session/resume`. "New question" closes the old ACP
  session and opens another on the warm agent process when `session/close`
  is available; older agents use the existing process restart fallback.
- Opening an HTTP, HTTPS, or mail link from an Ask answer reports success
  to that same agent session and turn. Local and file links are neither
  opened nor reported.

Unknown interaction types are ignored or cancelled, and commands, plans,
actions, fields, session summaries, and metadata all have fixed limits.
They are cleared when their process, session, or turn changes.

### When it fails

A question that fails says why. Without a configured fallback, Enter asks
it again. `"fallbackAgent": "pi"` offers "Ask Pi instead" first; choosing it
switches agent, preserves the question in the field and starts nothing until
you press Enter. `"fallback": "fr"` can also name the keyword of one of your
[answers](extend.md#answers); that streamed answer remains available after
the agent fallback and outranks "Ask again" when the agent hit a limit (its
plan's, a rate, its credit). The earlier turns and selected text go with a
streamed fallback. A picture cannot: the fallback is told that the failed
question's window picture is unavailable.

### Signing in

An agent that needs you signed in says so as its session starts: the bar
shows the agent's request, Enter starts its own way of signing in, and
Esc does not. Agents use the account and sign-in their own commands keep,
except Codex, whose isolated profile needs its own sign-in:

```sh
CODEX_HOME="$HOME/.local/share/nodi/profiles/codex" codex login
```

### About what you were looking at

With text selected in the window you came from, "Ask about the
selection" sends the text along. "Ask about this window" sends a picture
of the window you came from, made by `grim` of that window alone, so the
bar is never in it; the picture stays in the conversation, and its cost
in every question, until it starts afresh. An agent that takes no
pictures is told it could not be sent.

### The agent acting through the bar

Unless the selected agent is answer-only, it can receive two of Nodi's
tools: `search` for the bar's rows, and `run` to propose one. For an
obvious action the agent calls `run({query})` directly. Nodi ranks the
same rows as the bar and can propose only the top match: it never skips
an unusable top match for a lower one. No match or an unusable top match
returns a tool error. When the agent genuinely needs to inspect
alternatives, it calls `search`, then `run({key})` with a key from that
search in the same question.

When it resolves to a runnable row, either form of `run` produces one
Nodi permission card with the exact command and its risk. The call waits
there: Enter executes its immutable proposal once, while Esc or closing
the bar refuses it. The agent then receives a structured `executed`,
`refused`, `failed` or `unknown` result with the proposal ID, row key and
title. So `ask lock my screen` can reach the Lock card in one tool call;
the agent can do nothing through the bar that the bar cannot.
`"ask": { "actions": false }` keeps it to answers.

While that call waits, its relay joins up to 16 exact retransmissions to
the same outcome without making another card or shell call. Exact means
the same JSON value for the full request and the same typed ID: object-key
order and insignificant whitespace do not matter, while arrays, own keys
(including `__proto__`), values and JSON types do. A changed request that
reuses the ID is rejected, as is a differently typed ID; a seventeenth
waiting retransmission receives a bounded-overflow error.

For strict Claude and built-in Codex, Nodi also requires trusted adapter
metadata tying the provider's tool-call ID, provider turn, ACP session,
server and input to this exact question. The later MCP relay must carry
the same runtime call ID. Missing, changed, replayed or old-turn origins
are refused before a card is made.

OpenCode and custom unmanaged ACP agents may not provide trustworthy
server identity in their permission metadata. For those agents, Nodi uses
the weaker boundary it can authenticate: the action MCP relay must carry
this session's exact private token and channel and arrive during the
current visible Nodi turn. Such a call still always creates Nodi's own
action card and runs only after Enter. Closing the bar or ending the
session rejects it. An ACP permission with only a matching display title
is treated as an ordinary tool permission, so an adapter may show that
permission before Nodi's separate action card.

Any other tool the agent asks to use shows the same way, with what it is
given: Enter allows that one call, Esc refuses it. Nodi never answers
"always", so the agent asks again the next time. What was refused is
said at the end of the answer, "(Refused: Run command)", so words the
agent wrote before asking ("I'll run it") do not read as done.

MCP servers you name, in Claude Code's own format, are its too, except
for answer-only Pi and Agy:

```jsonc
"ask": { "mcpServers": { "github": { "command": "github-mcp-server", "args": ["stdio"] } } }
```

Each call one of them would make shows in the bar with what it is given,
and runs only on your Enter.

## Selected and copied text

Select text, or copy it, and open the bar: for two minutes from when the
bar first sees it, its first
row names it ("Copied: git push"). Enter on that row types `copied ` and
lists what can be done with the text: Fix spelling and grammar,
Rewrite..., Translate to English (or your `"translate"` language), Change
case..., a Google search for it, Summarize, Explain.
Words after it narrow them. While the text is fresh, `fix`, `translate`
and the rest find the same rows by name.

The agent's answer pastes over the selection, which the window still
holds, or at the cursor for copied text; Ctrl+Enter copies it instead.
`rewrite shorter` rewrites it as asked, and Rewrite... offers ready ones.
`case` changes its case at once, without the agent: UPPER CASE, lower
case, Title Case, Sentence case, snake_case, kebab-case, camelCase.

## Translate

`tr ta good morning` or `good morning in french`: a translation by the
agent, which Enter pastes. `"translate": { "language": "Tamil" }` sets
where Translate on selected text goes (English unless set).

### What goes with each question

When you choose an Ask, and only then, Nodi sends the agent a small
note beside the question, in the `_meta.nodi` field of the prompt, and
the question itself is the same with or without it:

```json
{ "version": 1, "purpose": "ask",
  "window": { "class": "foot", "title": "project", "workspace": 3, "pid": 4211, "cwd": "/home/user/project" },
  "selection": { "text": "selected text", "source": "primary", "ageMs": 4000 } }
```

- `purpose` is what the row you chose is for (`ask`, `fix`, `translate`,
  `summarize`, `explain`, `rewrite`).
- `window` describes the window you came from: its class, its title
  (300 characters), its workspace number, its process id, and `cwd`, the
  directory that process is in, which Nodi reads from `/proc` once as
  you choose the Ask, in at most a second. It is left out when that read
  fails, the process has gone, or the directory has been deleted. It is
  the window's directory, not the one the agent runs in.
- `selection` is there only for an action on the selected or copied
  text, and holds the very text the question carries (65,536 characters
  at most), whether it was the selection or the clipboard, and how long
  ago Nodi first saw it.

A field Nodi does not know is left out. Nothing is read in the
background, and an Ask you only type, without choosing it, sends nothing.
The note is information: it gives the agent no way to act. An agent that
ignores `_meta` loses nothing.

## What the agent is given

What you ask it; the text, or the picture and the title of the window,
you ask about; the note above; Nodi's instructions for it; and the rows
its searches of the bar return. It runs in `~/.cache/nodi/ask`, an empty directory, and
is offered no files and no terminal of Nodi's. For Claude and Agy, the
table above says what of the agent's own is turned off; Codex's listed
settings are best-effort because its final built-in router is unobservable. The
session ends with the conversation, after thirty minutes with no
question. [What it touches](privacy.md) has the whole list.

It starts with none of the shell's environment but your session's
(home, PATH, locale, the XDG folders, Wayland and D-Bus), a proxy and
certificates if you set them, and the variables the three agents read
their sign-in and provider from (`ANTHROPIC_*`, `CLAUDE_CONFIG_DIR`,
Bedrock's and Vertex's, `OPENAI_API_KEY`, `CODEX_HOME`, `GEMINI_API_KEY`,
`GOOGLE_*`). It starts in a login shell, so your profile then adds what
it sets, as a terminal would. Name any other it needs:

```jsonc
"ask": { "environment": ["MY_PROXY_TOKEN"] }
```

An answer holds a million characters at most: past it the turn is
cancelled, anything the agent asks for in it refused, and the answer
says it was cut. A line the agent writes is broken at 4 MB, and an agent
that writes over 64 MB of answers and messages in one session is
stopped.
