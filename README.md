# Nodi

A command bar for [Omarchy](https://omarchy.org). Press Super+Period, type,
press Enter.

![Nodi opened empty](docs/home.png)

Nodi (நொடி) is Tamil for an instant.

## Features

- Apps, windows, and everything in Omarchy's menu, with each toggle's state
- Sums, units, currency, time zones and dates as you type
- Clipboard history, files with a preview of each, emoji
- Favourites, aliases, hotkeys and window rules from Ctrl+K
- Answers from Claude, Codex, Gemini or your own agent, over ACP, and
  fixes or translations of the text you selected
- Your own commands, script filters and answers

## Requirements

Omarchy 4. For `ask` and the actions on selected text, a coding agent,
signed in: [Claude Code](https://claude.com/claude-code) with Node.js 22
and npm by default, or Codex or Gemini CLI ([Ask](docs/ask.md)). The
first question installs Claude's or Codex's ACP adapter from npm, at the
versions `lib/adapters` locks, with no install scripts.

## Install

```sh
omarchy plugin add https://github.com/itsgg/omarchy-nodi --enable
```

Update with `omarchy plugin update io.github.itsgg.nodi`.

## Remove

```sh
omarchy plugin remove io.github.itsgg.nodi
```

That releases its hotkey and the hotkeys you gave rows, turns off the
window rules you set from Ctrl+K, and stops Ask's agent. A key another
binding shares stays until Hyprland reloads, as releasing it would
release both. What it keeps of yours stays until you delete it: your
settings
(`~/.config/omarchy/extensions/nodi.json`), what you set on rows
(`~/.local/state/nodi`), its caches (`~/.cache/nodi`) and Ask's agent
adapters (`~/.local/share/nodi`, about 80 MB once Claude and Codex have
been asked):

```sh
rm -rf ~/.config/omarchy/extensions/nodi.json ~/.local/state/nodi ~/.cache/nodi ~/.local/share/nodi
```

Pasting the clipboard in sequence and sending a pinned text leave a few
files in `$XDG_RUNTIME_DIR` (`nodi-sequence`, `nodi-share.*.txt`), which
go at logout.

## Usage

| Type | To |
|---|---|
| `chrom` | open an app |
| `w git` | switch to a window |
| `screenshot`, `gaps` | run a menu action, flip a toggle |
| `12*8 + 15%`, `5 km to mi` | get an answer |
| `cb invoice` | find a clipboard entry |
| `find report` | find a file |
| `ask why is the sky blue` | ask your agent |
| `?` | see everything it does |

Enter runs the selected row, Ctrl+K shows its other actions, Esc closes.

## Documentation

The [guide](docs/README.md) covers every key, action and setting,
extending Nodi, and what it reads and sends.

## Development

```sh
make check    # what CI runs, and more
make reload   # install this tree and restart the shell
```

[PLAN.md](PLAN.md) explains the design; [CHANGELOG.md](CHANGELOG.md)
lists the releases.

## Credits

The calculator, units, currency, time zones, dates, emoji, processes and
the matching of windows and apps began as ports from Saikomantisu's
[Command Bar](https://github.com/Saikomantisu/omarchy-commandbar) (MIT),
whose copyright [LICENSE](LICENSE) carries too.

## License

[MIT](LICENSE)
