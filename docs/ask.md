# Ask

`ask` puts a question to a coding agent and shows its answer beside the
list as the agent writes it. Nodi talks to the agent over the
[Agent Client Protocol](https://agentclientprotocol.com) (ACP), the one
Zed and JetBrains use, so the bar works the same with each agent it can
hold. It uses the agent's own sign-in and your plan with it, and keeps no
key of its own.

## Which agent

Ask holds the agent `"ask": { "agent": ... }` names in `nodi.json`;
without it, Omarchy's default coding agent (`omarchy default agent`) when
Nodi can hold it, else Claude.

| Agent | What it needs | How it is kept to answering |
|---|---|---|
| `claude` | Claude Code, signed in; Node.js 22 or newer | Claude's ACP adapter, `@agentclientprotocol/claude-agent-acp` 0.86.0, run on your own `claude`. None of Claude Code's own tools, none of your settings, CLAUDE.md or memory; nothing saved. |
| `codex` | Codex, signed in; Node.js | Codex's ACP adapter, `@agentclientprotocol/codex-acp` 2.1.1, run on your own `codex`: read-only, its shell, apps and web search off, no project's AGENTS.md. |
| `gemini` | Gemini CLI | Nodi's own settings for it, over yours: none of its built-in tools, no MCP server but the bar's and those you name, no GEMINI.md, no hooks. |

The first question you ask with Claude or Codex installs its adapter,
once, into `~/.local/share/nodi/agents`: about 60 MB for Claude's, and a
minute or so, while the bar says so. Until then the row that asks says
its Enter installs it; typing `ask ` installs nothing. What installs is
the tree in Nodi's `lib/adapters/<adapter>/package-lock.json`, through
`npm ci --ignore-scripts`: every package at the version the lock names
and checked against its hash, none of their install scripts run. A tree
installed from another lock is not run, and the next question installs
it again.

Omarchy's other agents are not offered. Cursor's agent read a file for a
question without asking, and never saw the bar's tools (2026-10-07);
Copilot runs its tools without asking since 1.0.81; omp, Hermes, pi and
OpenClaw cannot turn their shell off for one session; Crush and Muse do
not speak ACP.

An agent of your own, any that speaks ACP, goes by its command:

```jsonc
"ask": { "agent": { "name": "Helper", "command": ["helper", "acp"], "env": { "HELPER_MODE": "bar" } } }
```

Nodi cannot turn such an agent's own tools off: the bar shows each thing
it asks about, as below, and what it does without asking is its own.

`"model"` picks the agent's model by the name the agent gives it:
`haiku` unless set for Claude (`sonnet`, `opus`), the agent's own
default for the others.

## Asking

`ask why is the sky blue`, then Enter: the answer's pane opens beside
the list at once, saying what the agent is doing (starting, searching
the bar, thinking) beside a turning 󰦖 until its words come, and the
answer fills it as the agent writes it. Then Enter pastes it where you were, Ctrl+Enter
copies it, "Continue in your agent" hands the question to Omarchy's
default coding agent (`omarchy-agent-prompt`), and "Ask again" asks it
again. Tab on a query nothing else fills in writes `ask ` before it, for
Enter to ask, and a query nothing answers offers to ask it: Enter on that
row asks at once, and selecting it, by the keys or the pointer, starts
the agent as typing `ask ` does.

It is a conversation: a question asked within ten minutes of the last
answer follows it, across closes of the bar; later, or after "New
question", the agent starts afresh. The session starts as you type
`ask `, so it is warm by the time you press Enter, and ends after thirty
minutes with no question.

### Signing in

An agent that needs you signed in says so as its session starts: the bar
shows "Sign in to Gemini: Log in with Google", Enter starts the agent's
own way of signing in (for Gemini, a page in your browser), and Esc does
not. Claude and Codex use the sign-in their own commands keep.

### About what you were looking at

With text selected in the window you came from, "Ask about the
selection" sends the text along. "Ask about this window" sends a picture
of the window you came from, made by `grim` of that window alone, so the
bar is never in it; the picture stays in the conversation, and its cost
in every question, until it starts afresh. An agent that takes no
pictures is told it could not be sent.

### The agent acting through the bar

The agent has two of Nodi's tools: a search of the bar's rows, and a run
of one. A search runs at once. A run shows in the bar first, with the
command it runs and its risk, and happens only on your Enter (Esc
refuses, and the agent is told). A run the agent calls without asking
first shows the same way, and the agent hears only that it was shown.
So `ask lock my screen` finds Lock and asks; the agent can do nothing
through the bar that the bar cannot.
`"ask": { "actions": false }` keeps it to answers.

Any other tool the agent asks to use shows the same way, with what it is
given: Enter allows that one call, Esc refuses it. Nodi never answers
"always", so the agent asks again the next time.

MCP servers you name, in Claude Code's own format, are its too:

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

## What the agent is given

What you ask it; the text, or the picture and the title of the window,
you ask about; Nodi's instructions for it; and the rows its searches of
the bar return. It runs in `~/.cache/nodi/ask`, an empty directory, and
is offered no files and no terminal of Nodi's. For Claude, Codex and
Gemini, the table above says what of the agent's own is turned off. The
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
