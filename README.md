# Nodi

A command bar for Omarchy: press a key, type, press Enter. It opens apps and
windows, runs anything in Omarchy's menu, answers sums and conversions,
and finds emoji, clipboard entries, files and more.

Nodi (நொடி, said NO-dee) is Tamil for an instant: the time a snap of the
fingers takes, which is how long it should take to find anything.

![Nodi opened empty: the apps, actions and toggles you use most](docs/home.png)

<table>
<tr>
<td><img src="docs/themes.png" alt="Themes, with the selected one's preview beside the list"></td>
<td><img src="docs/ask.png" alt="A quick answer from Claude"></td>
</tr>
<tr>
<td><img src="docs/files.png" alt="A file's details and first lines"></td>
<td><img src="docs/clipboard.png" alt="Clipboard history, the whole entry beside the list"></td>
</tr>
</table>

## Install

```sh
omarchy plugin add https://github.com/itsgg/omarchy-nodi --enable
```

Super+Period opens it; set `"hotkey"` in
`~/.config/omarchy/extensions/nodi.json` for another key. A key something
else holds is left alone, and a notification says so. To open it with
text already typed:
`omarchy-shell shell toggle io.github.itsgg.nodi '{"query": ":"}'`.

## Use

| Type | For |
|---|---|
| `chromium`, `lsd`, `chromium new window` | An app, by name or its letters, or one of its actions |
| `w `, `w chromium` | An open window, or the ones of an app |
| `screenshot`, `dns`, `restart shell`, `install zed` | Anything in Omarchy's menu, your own entries included |
| `gaps`, `dnd`, `stay awake`, `wifi` | Toggles, with their state |
| `vol 60`, `bright off`, `remind 15 tea` | Volume, brightness and reminders |
| `theme tokyo`, `font jet`, `power profile` | Themes, fonts and power profiles |
| `version`, `omarchy ` | Omarchy's own commands |
| `full screen`, `keys ` | Keybindings, by what they do |
| `> htop` | A command, in a terminal |
| `12*8 + 15%`, `5 km to mi`, `100 usd to eur`, `3pm to tokyo` | Answers |
| `:fire`, `cb`, `f `, `find report`, `~/Downloads/` | Emoji, clipboard, recent files, files, folders |
| `kill chromium`, `ports`, `services` | Processes, listening ports, user services |
| `h github`, `prs`, `tmux`, `ssh `, `man ls` | Browser history, pull requests, tmux, SSH hosts, man pages |
| `uuid`, `b64 hello`, `epoch`, `#ff5722` | Small developer tools |
| `ask why is the sky blue`, or Tab | A quick answer from Claude; needs [Claude Code](https://claude.com/claude-code) installed and signed in |
| `?` | Help, with every example answered live |

Enter runs the selected row, Ctrl+K shows its other actions (an alias, a
favourite, a hotkey, hide), Ctrl+1 to Ctrl+9 run a row directly, Tab fills
in, Esc closes, or first steps back from Ctrl+K, a prompt or a help topic. A row you pick for a query comes first for
it after a pick or two. Logging out, rebooting, clearing a history and
quitting a process you did not name ask for a second Enter. Opened empty, Nodi shows your favourites, what you run most
and your reminders.

## Configure

`nodi.json` (type `nodi settings` to open it) overrides
[`config.default.json`](config.default.json) and applies when saved. A file
that does not parse changes nothing, and a notification says why.

```jsonc
{
  "hotkey": "SUPER + SPACE",
  "currency": { "home": "INR", "favorites": ["USD", "EUR"] },
  "time": { "home": "Asia/Kolkata", "zones": ["UTC", "America/New_York"] },
  // Merged with the default keywords; "disabled": true removes one.
  "keywords": [
    { "keyword": "g", "title": "Search DuckDuckGo", "open": "https://duckduckgo.com/?q={q}" },
    { "keyword": "say", "title": "Notify", "run": "notify-send \"$1\"" },
    { "keyword": "tr", "title": "Translate",
      "open": "https://translate.google.com/?sl=auto&tl={argument name=\"to\"}&text={argument name=\"text\"}" }
  ],
  "snippets": [
    { "keyword": "sig", "name": "Signature", "text": "Regards,\nGanesh" },
    { "keyword": "mt", "name": "Meeting", "text": "Meet {argument name=\"who\"} at {argument name=\"when\" default=\"3pm\"}" }
  ],
  // A few words from Claude for apps with no description of their own.
  "apps": { "describe": true }
}
```

With that, `g omarchy` searches DuckDuckGo, `say hello` posts a
notification, `tr ta good morning` translates into Tamil, `sig` pastes a
signature and `mt Ravi 4pm` a filled-in sentence (Enter pastes it where
you were, Ctrl+Enter copies it). Placeholders, in `open` and in snippets:
`{q}` or `{argument name="..." default="..."}` for the words typed after
the keyword (the last one takes the rest), `{clipboard}`, `{date}`,
`{time}` (with `format="d MMM yyyy"` and `offset="+1d"`) and `{uuid}`. In
`run`, what you type is the command's `$1`, never written into its text, so
use it as a script would: `"$1"`, quoted, and kept out of arithmetic such
as `$((...))`, where bash evaluates what it holds. A `run` written with
`{q}` says to write `"$1"` instead, and runs nothing.

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
and `currentDirectoryPath` sets where it runs. `scripts.dirs` lists more
folders. The same header with `@raycast.` works, so
scripts from [raycast/script-commands](https://github.com/raycast/script-commands)
run as they are.

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
in `providers` wins: by default your `keywords`, then filters, then
answers (below), then Nodi's own prefixes (`w`, `kill`, `cb`), so pick a
word of its own. It prints one
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
`paste`, and `confirm`, `risk` and `undoable` as a row has them. At most
50 rows; a line that is not such an object is skipped. While a run is on
its way, the last rows stay.

A row or action with `"undoable": true` and an `exec` action is run by
Nodi itself, which reads what it prints. If its last line is
`{"undo": {"exec": ["my-notes", "restore", "meeting"], "title": "Restore the meeting note"}}`,
that command is offered as a row for ten minutes: first on the empty bar,
and found by its title or by `undo`; Enter twice runs it. Such an action
is a command that does its work and ends: it runs in the filter's
environment, not your session's whole one (no `DISPLAY`, `EDITOR` or
`GDK_SCALE`, for one), and is ended after two minutes, so it is no way to
open a window. If it fails, a notification says why. The offer lasts
while the shell runs, not across a restart.

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
It runs for two minutes at most (`timeoutMs`, up to 600000) and may print
120 KB. What it prints shows a word at a time, at its spaces, so text
with no spaces (Chinese, a long URL) shows once it ends. Write each piece as you have it: a program whose output is
buffered when it goes into a pipe (Python's, for one) shows nothing until
it flushes. Escape while it answers stops it, the program and what it
started, and so does closing the bar. Once it has ended, Enter pastes the
answer where you were, Ctrl+Enter copies it, and Ask again asks it again;
if it fails, the last line it wrote to stderr says why.

Other settings: `fallbacks` (what a query nothing answers offers),
`ask.model` (the Claude model for `ask` and app descriptions, `haiku` by
default), and
`providers` (what Nodi searches, in order). A list you set replaces the default one, so start from
`config.default.json`; only `keywords` merge.

## From a terminal

`bin/nodi` in the plugin's folder is a command for scripts and
terminals; link it onto your PATH once:

```sh
ln -s ~/.config/omarchy/plugins/io.github.itsgg.nodi/bin/nodi ~/.local/bin/nodi
```

`nodi` opens the bar, `nodi cb` opens it with `cb` typed (`nodi -- run`
types a word the command itself would take), and `nodi run <key>` runs a
row by its key as its hotkey would; Ctrl+K's Copy deeplink shows a row's
key. A row that asks before it runs is refused there. `nodi pick` shows
the lines it reads from stdin as rows and prints the one you choose, as it
was read:

```sh
choice=$(printf '%s\n' Lock Suspend Reboot | nodi pick --placeholder Power)
```

With `--json`, each line is an object as a script filter prints one
(`title`, `subtitle`, `icon`, `image`, `badge`, `preview`); Enter only
chooses, so an `action` is not read. It exits 0 with a choice, 1 when the
bar closes without one, and 2 when Nodi cannot be reached.

## What it touches

- It starts programs the way Omarchy's menu does: through a login shell,
  with arguments that are never read as shell.
- It goes online for exchange rates (open.er-api.com, once a day, or every
  ten minutes while that fails), for `prs` (through `gh`), and for Claude,
  through Claude Code's `claude` command, under `ask` and, if turned on, to describe
  apps. That Claude session has no tools, no MCP servers and none of your
  Claude settings, and saves nothing.
- It writes to `~/.cache/nodi/` and `~/.local/state/nodi/prefs.json`. It
  binds its hotkey in the running Hyprland and edits no config file.
- It uses what Omarchy ships. Wi-Fi state needs `nmcli`, browser history
  `sqlite3`, and pull requests a signed-in `gh`.

## Develop

```sh
make check     # tests, lint, compile, tests in Quickshell, renders, hygiene, manifest, validate
make reload    # install, clear Quickshell's cache, restart the shell
make shots     # the card drawn offscreen, as PNGs in shots/
make bench     # how long a keystroke takes
```

A provider in `providers/` returns rows; `lib/Run.js` alone turns a row
into a command. [PLAN.md](PLAN.md) says why it is built this way.

## Credit

The calculator, units, currency, time, emoji, process, window and app
matching are ported from Saikomantisu's
[omarchy-commandbar](https://github.com/Saikomantisu/omarchy-commandbar)
(MIT), with their tests.

## License

MIT
