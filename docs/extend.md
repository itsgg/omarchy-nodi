# Extending it

Three kinds of program give Nodi rows of your own, each written in any
language: script commands, script filters and answers. Some come with
Nodi, off until you name them. `nodi` works the bar from a terminal or a
script, and `nodi mcp` lets a coding agent use it. Keywords and snippets,
which need no program, are in [Settings](settings.md#keywords-and-snippets).

## Script commands

Script commands are executable files in `~/.config/omarchy/nodi/scripts`
with a header:

```bash
#!/bin/bash
# @nodi.title Greet
# @nodi.mode silent
# @nodi.argument1 { "type": "text", "placeholder": "name" }
echo "hello $1"
```

Saved as `greet`, `greet Ravi` runs it and shows its last line as a
notification. `fullOutput` runs it in a terminal instead, and `inline`
shows its output on its row; `needsConfirmation` asks for a second Enter
and `currentDirectoryPath` sets where it runs. `scripts.dirs` sets the
folders read, in place of this one: list it too to keep it. The same header with `@raycast.` works, so
scripts from [raycast/script-commands](https://github.com/raycast/script-commands)
run as they are.

## Script filters

A script filter is a program that turns what you type after a keyword
into rows, as you type:

```jsonc
"filters": [
  { "keyword": "n", "title": "Notes", "icon": "󰎞", "command": ["my-notes", "--nodi"] }
]
```

`n meet` runs `my-notes --nodi meet`: the words after the keyword, trimmed,
are the last argument (so a program must not read it as an option) and
`NODI_QUERY`. From your session it gets PATH, HOME, USER,
`XDG_RUNTIME_DIR`, `OMARCHY_PATH`, the Wayland, Hyprland and D-Bus
variables, and nothing else; LANG is `C.UTF-8`. It is told of the window
you came from, the one that had the focus when the bar opened:
`NODI_WINDOW_ADDRESS` (Hyprland's, `0x...`), `NODI_WINDOW_CLASS`,
`NODI_WINDOW_TITLE`, `NODI_WINDOW_PID` and `NODI_WINDOW_WORKSPACE`, each
empty when not known. It runs for 3 s at most
(`timeoutMs`, up to 10000), and each keystroke ends the run before it, the
program and what it started. Where two take the same word, the one earlier
in `providers` wins: by default your `keywords` and snippets, then
filters, then answers (below), then Nodi's own prefixes (`w`, `kill`,
`cb`); a script command gives way to a filter of its word. So pick a word
of its own. It prints one
JSON object a line, each a row; only `title` is required:

```json
{"title": "Meeting notes", "subtitle": "Monday", "icon": "󰎞", "image": "/abs/path.png", "badge": "3",
 "id": "notes/meeting", "action": {"exec": ["my-notes", "open", "meeting"]}, "confirm": true,
 "preview": "## Meeting notes\n\n- ship it", "actions": [{"title": "Copy link", "action": {"copy": "https://..."}}]}
```

`action` is one of `{"exec": [argv]}` (started through a login shell, its
arguments never read as shell), `{"open": "url or /path"}`,
`{"copy": "text"}`, `{"paste": "text"}` (into the window you were in) or
`{"query": "text"}` (fills the bar in). `confirm` asks before it runs:
`true` for a second Enter, or a word to type, such as `"send"` (up to 40
characters and no space; a longer word, or one with a space, is a second
Enter); any other value asks nothing. A row that asks
shows in the pane the exact command it runs, with `risk`, your words for
what it may cost, once Enter has armed it or its word is asked, and from
the start when it has no `preview`. It gets no hotkey or link, and
`nodi run` refuses it.
`preview` is Markdown for the pane beside the list, or `{"title",
"subtitle", "markdown"}`; pictures and HTML in it are shown as text, never
loaded. A row with an `id` is remembered and ranked like any other.
`actions` are what Ctrl+K offers, each with `exec`, `open`, `copy` or
`paste`, and `confirm`, `risk` and `undoable` as a row has them; one that
asks shows its command and risk while Ctrl+K is up. At most 50 rows (1,000 in a list, below); a
line that is not such an object is skipped. While a run is on its way, the
last rows stay. Fields are cut to a length: title 200 characters, subtitle
300, badge 24, icon 8, id 200, risk 500, preview 64 KB, and 12 actions.
Output past 1 MB (4 MB for a list or a step, below) is not cut: the run
fails ("could not answer"). Left out without a word: a filter whose
keyword has a space or whose program holds `=` or starts with `-`; and
from a row, which stays, an action that would not run (an `exec` whose
program starts with `-`, a copy or paste of nothing, an `open` that is
neither a URL nor an absolute path) and an image that is not an absolute
path.

A row may also carry `complete`, what Tab fills in (`"n meeting "`),
apart from its action, and `match`, more words it is found by in a list
or a step (below). A filter
with `"list": true` runs its program once, with `NODI_QUERY` empty and no
argument, and keeps the rows for `"refresh"` (`"10m"` unless set, 10 s at
least; the last rows stay while it runs again); what you type after its
keyword then finds them, ranked and learned from as every row is, with no
run on each keystroke. With `"root": true` too, up to three of them come
up in any search from the second letter, among the rest, when what is
typed names them as written (a typo finds them under the keyword only). `"rerun": "2s"` runs a filter that is no list again at that pace
while its rows show (half a second to a minute), for rows that change as
you watch; give such a row an `id`, or a change of its title makes it
another row, which loses a second Enter it waited for.

A row whose action is `{"next": "value"}` takes its filter a step on:
Enter runs the program again, once, with `NODI_PICK` the value,
`NODI_INFO` the row's `info` (never shown), `NODI_DATA` what the run
before printed as a line `{"data": "..."}`, `NODI_STEP` how many steps in,
and no query or argument; what you type then finds among its rows, and
Esc steps back. A step that prints no row has done its work, and the bar
closes. A step never runs twice by itself, since it may do what it says;
taken again, it runs again. `"format": "rofi"` runs a rofi script as rofi
does: first with no argument and `ROFI_RETV=0`, then, on Enter, with the
entry as its argument, `ROFI_RETV=1` (2 for what you typed, offered as a
row unless the script says `no-custom`), `ROFI_INFO` and `ROFI_DATA`. Its
entries' `icon`, `meta`, `info`, `display` and `nonselectable` are read,
and its `message` shows under the field.

A row or action with `"undoable": true` and an `exec` action is run by
Nodi itself, which reads what it prints. If its last line is
`{"undo": {"exec": ["my-notes", "restore", "meeting"], "title": "Restore the meeting note"}}`,
that command is offered as a row for ten minutes: first on the empty bar,
and found by its title or by `undo`; Enter twice runs it. Such an action
is a command that does its work and ends: it runs in the filter's
environment, not your session's whole one (no `DISPLAY`, `EDITOR` or
`GDK_SCALE`, for one), and is ended after two minutes, so it is no way to
open a window. If it fails, a notification says why, and no undo is
offered, whatever it printed. The undo itself runs as any action does, in
your session. The offer lasts while the shell runs, not across a restart.

## Answers

An answer is a program that answers a question you type after a keyword,
on Enter rather than as you type, and what it prints shows as Markdown in
the pane as it arrives:

```jsonc
"answers": [
  { "keyword": "a", "title": "Assistant", "icon": "󰚩", "command": ["my-ask", "--markdown"] }
]
```

`a why is it slow`, then Enter, runs `my-ask --markdown "why is it slow"`
with the same environment, argument and `NODI_QUERY` as a script filter.
It runs for two minutes at most (`timeoutMs`, from 1000 to 600000) and may print
120 KB. What it prints shows a word at a time, at its spaces, so text
with no spaces (Chinese, a long URL) shows once it ends. Write each piece as you have it: a program whose output is
buffered when it goes into a pipe (Python's, for one) shows nothing until
it flushes. Escape while it answers stops it, the program and what it
started, and so does closing the bar. Once it has ended, Enter pastes the
answer where you were, Ctrl+Enter copies it, and Ask again asks it again;
if it fails, the last line it wrote to stderr says why.

## Extensions that come with Nodi

Some come with Nodi, in [`contrib/`](../contrib/README.md), and are off
until named: `"filters": [{ "contrib": "obsidian" }]` gives `ob`, the
notes in your Obsidian vaults, and `issues` and `containers` give your
GitHub issues and Docker containers; `"answers": [{ "contrib": "weather" }]`
gives `weather chennai`, and `wikipedia` gives `wp`, an article's summary.
They are kept in this repository, never fetched; what you set on the
entry wins over theirs, all but the program it names.

## From a terminal

`bin/nodi` in the plugin's folder is a command for scripts and
terminals; link it onto your PATH once:

```sh
ln -s ~/.config/omarchy/plugins/io.github.itsgg.nodi/bin/nodi ~/.local/bin/nodi
```

`nodi` opens the bar, `nodi cb` opens it with `cb` typed (`nodi -- run`
types a word the command itself would take), and `nodi run <key>` runs a
row by its key as its hotkey would; Ctrl+K's Copy deeplink shows a row's
key. Nodi knows a row by its key once it has been run or saved, which a
script filter's row can be only with an `id`. A row that asks before it
runs is refused there. `nodi pick` shows
the lines it reads from stdin as rows and prints the one you choose, as it
was read:

```sh
choice=$(printf '%s\n' Lock Suspend Reboot | nodi pick --placeholder Power)
```

With `--json`, each line is an object as a script filter prints one
(`title`, `subtitle`, `icon`, `image`, `badge`, `preview`); Enter only
chooses, so an `action` is not read. A pick takes 5000 rows and 8 MB at
most. Every form exits 0 when done, 1 when a pick ends without a choice,
2 when Nodi refuses (an unknown row, a row that asks first, rows it could
not read), its function fails or the command is misused, 3 when Nodi cannot be reached (a
pick whose bar goes away while it waits ends as 1), and 4 when a newer
pick took the bar before this one was answered.

## For agents

`nodi mcp` is the bar as an MCP server on stdin and stdout, for Claude
Code or any other agent. Its tools: `search` the bar's rows (each with a
key, what it runs, and whether it asks first), `run` one by its key
(refusing a row that asks, as `nodi run` does, and any row but an app,
a window, Omarchy's menu and toggles, the desktop's media and devices,
a saved desktop, a keybinding or a plugin, whose commands no word of the
agent's reaches, and of those not a reminder; a search starts none of your script
filters or inline scripts), `propose` one (the bar
opens on it with its command; your Enter runs it, Escape refuses), and
`approve`, a permission prompt tool for a headless `claude -p`: the bar
shows the tool and its input, and your Enter allows it. A key a search
found runs as found for ten minutes; one question waits in the bar at a
time, and a newer one takes its place, the older answered "not asked".
A query or a key is 64 KB at most.

```sh
claude mcp add nodi -- nodi mcp
claude -p "..." --permission-prompt-tool mcp__nodi__approve
```
