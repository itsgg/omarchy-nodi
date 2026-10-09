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

## License

[MIT](LICENSE)
