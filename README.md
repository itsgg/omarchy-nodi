# Nodi

A command bar for Omarchy: press a key, type, press Enter. It opens apps and
windows, runs anything in Omarchy's menu, answers sums and conversions,
and finds emoji, clipboard entries, files and more. Nodi is Tamil for an
instant.

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
| `ask why is the sky blue`, or Tab | A quick answer from Claude |
| `?` | Help, with every example answered live |

Enter runs the selected row, Ctrl+K shows its other actions (an alias, a
favourite, a hotkey, hide), Ctrl+1 to Ctrl+9 run a row directly, Tab fills
in, Esc clears and then closes. A row you pick for a query comes first for
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
    { "keyword": "say", "title": "Notify", "run": "notify-send {q}" },
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
you were, Ctrl+Enter copies it). Placeholders:
`{q}` or `{argument name="..." default="..."}` for the words typed after
the keyword (the last one takes the rest), `{clipboard}`, `{date}`,
`{time}` (with `format="d MMM yyyy"` and `offset="+1d"`) and `{uuid}`. In
`run`, `{q}` reaches the command as one argument, never as shell.

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

Other settings: `fallbacks` (what a query nothing answers offers),
`ask.model` (`haiku` by default), and `providers` (what Nodi searches, in
order). A list you set replaces the default one, so start from
`config.default.json`; only `keywords` merge.

## What it touches

- It starts programs the way Omarchy's menu does: through a login shell,
  with arguments that are never read as shell.
- It goes online for exchange rates (open.er-api.com, once a day, or every
  ten minutes while that fails), for `prs` (through `gh`), and for Claude,
  through the `claude` command, under `ask` and, if turned on, to describe
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
