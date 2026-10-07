# What it touches

Everything Nodi reads, writes, starts and sends, and when.

- It starts programs the way Omarchy's menu does: through a login shell,
  with arguments that are never read as shell. A paste focuses the window
  the bar opened over first, then types into it.
- A command a row runs that fails is reported in a notification, "<row>
  failed": a command of Nodi's own rows or a script filter's with the last
  line of errors it wrote (one that fails without a word, or a program
  you close, is not reported); a script command with its last line or its
  exit status; an action that can be undone with why it failed.
- `nodi mcp` runs only when an agent starts it, and runs a row only by
  `run`, which the agent's own permissions gate, or by your Enter.
- It sends what you type after `g`, `yt` or `wiki`, from the second letter,
  to DuckDuckGo's autocomplete (duckduckgo.com/ac) for suggestions; a
  keyword of yours does so only with `"suggest": true`.
- Under `pkg` it asks pacman and, through yay, the AUR; under `define`,
  Wiktionary (en.wiktionary.org's REST API) for the word typed.
- It goes online for exchange rates (open.er-api.com, once the service
  says its next rates are due, daily in practice, or every ten minutes
  while that fails), for `prs` (through `gh`), to describe apps, if
  turned on (through Claude Code's `claude` command), and under `ask`
  through the coding agent Ask holds ([Ask](ask.md)), which goes online
  itself. The first `ask ` typed with Claude or Codex installs that
  agent's ACP adapter from npm, once, into `~/.local/share/nodi/agents`; for Gemini,
  Nodi writes its settings for it to `~/.local/share/nodi/gemini-settings.json`.
  The agent's session runs in `~/.cache/nodi/ask`, is offered no files
  and no terminal of Nodi's, and has no MCP servers but the bar's and
  the ones you name under `"ask": { "mcpServers": ... }`; what of the
  agent's own tools and settings is turned off, [Ask](ask.md) says for
  each. A question within ten minutes of an answer follows it, and the
  session, the conversation with it, ends after thirty minutes with no
  question. The bar's tools are a search of the rows, and a run of one,
  which shows in the bar with its command and runs only on your Enter;
  anything else the agent asks to use shows there too. "Ask about this
  window" sends the agent a picture of the window you came from (`grim
  -T`, by its own buffer, so the bar is not in it), which stays in the
  conversation, and its cost in every question, until it starts afresh.
- Each time it opens it reads the text selected in the window you came
  from (`wl-paste --primary`) and the clipboard's text (never a password
  manager's), keeps them until it next opens, and sends one to the agent
  only when you pick one of the agent's rows on it.
- It writes to `~/.cache/nodi/` and `~/.local/state/nodi/prefs.json`,
  which holds what you set on rows (favourites, aliases, hotkeys, hidden
  rows and deeplinks, each with a copy of its row: its title and what it
  runs), the text of each clipboard entry you pin, the desktops
  you save (each app's desktop id, window class and workspace), the
  window rules you set, by window class, and which of the first opens'
  starters you have been through. A search under
  `cb` with words reads the text in each image of the history once, with
  Omarchy's `tesseract` (about 2 s an image, a few seconds at a time
  while that search is open), into `~/.cache/nodi/ocr/`; pasting in sequence
  keeps the history's texts in `$XDG_RUNTIME_DIR/nodi-sequence`, yours
  alone and gone at logout.
  Among the cache is how long its last 300 opens took (`opens.json`, read
  by `make opens`), with nothing of what was typed, and the last 1000 rows
  run from a query, the fallbacks picked when nothing matched among them
  (`picks-log.json`, read by `make picks`): the queries
  typed, the row's key and its place, and the keys of the first eight
  rows shown (a file's key holds its path), no titles; and the rows whose
  keys it has shown after a run (`taught.json`: the row's key, its keys,
  how many times and when). It binds its hotkey in the running Hyprland
  and edits no config file.
- At each open it reads the desktop's contrast and motion preferences
  (the portal's `org.freedesktop.appearance`, `gdbus`) and whether
  Hyprland animates (`hyprctl getoption animations:enabled`).
- It asks the shell for its plugins (`omarchy-shell shell listPlugins`)
  once an hour, when a search first needs them. While it is open it reads
  each tray app's menu and its submenus one level down, which asks the
  app to fill them in, as opening its menu in the tray does.
- Under `w` the pane shows the selected window, a picture Hyprland makes
  of that window alone (its toplevel export, through Quickshell), taken
  again each second while it shows and never saved.
- It reads the usage records Omarchy's agents widget keeps
  (`~/.local/state/omarchy/agents/usage`) at each open, and under `agents`
  the process list, tmux's clients, and for a Claude Code session the
  record it keeps of the process (`~/.claude/sessions`) and the end of
  its own transcript in `~/.claude/projects`, for the last thing you
  asked it.
- Opened over a file dialog, it reads the folders of your recent files
  (`~/.local/share/recently-used.xbel`), zoxide's list, your GTK
  bookmarks and XDG folders; Enter on a folder types it into that dialog
  with `wtype`, only once that dialog has the focus again.
- With a calendar set, it reads it when the shell starts, when your
  settings change and when the bar opens (every five minutes at most, a
  minute after a read that failed), fetching each iCal address again once
  its copy is ten minutes old and keeping that copy in `~/.cache/nodi/calendar/`
  (yours alone), and works out its next nine days with Python's standard
  library (`lib/ics.py`); the address goes to that program in its
  environment, which only you can read, never in its arguments.
- From a search's third letter it looks for files of that name under
  your home with fd (`"files": { "root": false }` turns that off), and
  under `in` for files that hold the words with ripgrep. For the selected
  file it reads its first 4 KB, coloured by bat, or makes a picture of a
  PDF's first page (pdftoppm) or a video's frame (ffmpegthumbnailer),
  kept in `~/.cache/nodi/thumbs/` and removed after a month unused, and
  reads the theme's `colors.toml` at each open for the colours.
- A program in `contrib/` runs only once you name it under `filters` or
  `answers`, and then as any of yours does: `issues` asks GitHub through
  `gh` when you type its keyword, again every five minutes at most;
  `wikipedia` asks Wikipedia and `weather` asks wttr.in on your Enter.
- It uses what Omarchy ships, but for the GitHub CLI: Wi-Fi state needs
  `nmcli`, browser history `sqlite3`, and pull requests and `issues` a
  signed-in `gh`, which you install.
