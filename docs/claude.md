# Claude

Nodi asks Claude through Claude Code's own `claude` command, so it needs
[Claude Code](https://claude.com/claude-code) installed and signed in; it
uses your Claude plan as Claude Code does, and keeps no key of its own.

## Ask

`ask why is the sky blue`, then Enter: the answer comes beside the list
as Claude writes it. Then Enter pastes it where you were, Ctrl+Enter
copies it, "Continue in your agent" hands the question to Omarchy's
default coding agent (`omarchy-agent-prompt`), and "Ask again" asks it
again. Tab on a query nothing else fills in writes `ask ` before it, for
Enter to ask, and a query nothing answers offers to ask it.

It is a conversation: a question asked within ten minutes of the last
answer follows it, across closes of the bar; later, or after "New
question", Claude starts afresh. The session starts as you type `ask `,
so it is warm by the time you press Enter, and ends after thirty minutes
with no question.

`"ask": { "model": "sonnet" }` picks the model (`haiku` unless set).

### About what you were looking at

With text selected in the window you came from, "Ask about the
selection" sends the text along. "Ask about this window" sends a picture
of the window you came from, made by `grim` of that window alone, so the
bar is never in it; the picture stays in the conversation, and its cost
in every question, until it starts afresh.

### Claude acting through the bar

Claude has none of Claude Code's own tools here, only two of Nodi's: a
search of the bar's rows, and a run of one. A search runs at once; a run
shows in the bar first, with the command it runs and its risk, and
happens only on your Enter (Esc refuses, and Claude is told). So
`ask lock my screen` finds Lock and asks; Claude can do nothing the bar
cannot. `"ask": { "actions": false }` keeps it to answers.

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

Claude's answer pastes over the selection, which the window still
holds, or at the cursor for copied text; Ctrl+Enter copies it instead.
`rewrite shorter` rewrites it as asked, and Rewrite... offers ready ones.
`case` changes its case at once, without Claude: UPPER CASE, lower case,
Title Case, Sentence case, snake_case, kebab-case, camelCase.

## Translate

`tr ta good morning` or `good morning in french`: a translation by
Claude, which Enter pastes. `"translate": { "language": "Tamil" }` sets
where Translate on selected text goes (English unless set).

## What Claude is given

What you ask it; the text, or the picture and the title of the window,
you ask about; Nodi's own instructions for it; and the rows its searches
of the bar return. The session has none of your Claude settings and none
of Claude Code's own tools, saves nothing, and ends with the
conversation after thirty minutes with no question. [What it touches](privacy.md) has the whole
list.
