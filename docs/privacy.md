# What it touches

Everything Nodi reads, writes, starts and sends, and when.

- It starts programs the way Omarchy's menu does: through a login shell,
  with arguments that are never read as shell. A paste focuses the window
  the bar opened over first, then types into it.
- Text that may be private never goes in a program's arguments, which
  any user of the machine can read in `/proc`: what it copies or pastes
  (a clipboard entry, the selection, a snippet, an answer), a note, the
  words of a search of files or packages, an `in` search, a `define`
  word or a suggestion's query, the words a keyword, a script filter, an
  answer or a script command of yours is given, a `>` command line, a
  saved desktop's name, the window's title a script filter is told of,
  the title of a row whose command it watches, and an agent session's
  last prompt, title and folder under `agents` go in the program's
  environment or its input, its own alone, and are unset before what it
  starts. A script filter or answer gets the query as its last argument
  too only when its entry says `"argument": true`, and a script command
  its arguments as `$1` ... only with `"scripts": { "arguments": true }`
  ([Extending](extend.md)). A `>` command run in a terminal reaches it in
  a file only you can read, which removes itself; the programs your
  command line starts have what you wrote as their arguments, as they
  would in a terminal.
- What `nodi` hands the running bar (a search, a row to run or describe,
  `nodi <query>`, a pick's placeholder, an agent's tool call or
  proposal) goes in a file only you can read (0600, in a 0700 folder
  under `$XDG_RUNTIME_DIR`, gone when the call ends, or a minute after
  `nodi <query>`, which the bar reads once Nodi has loaded), and only
  the file's path is an argument. A row you give a hotkey is bound to `nodi` with
  its keys (`hotkey:<keys>`), never with the row's key, which can be a
  file's path or a command.
- A web address it opens (a search, a meeting's link, a bookmark) reaches
  the browser by a page of Nodi's own, never as an argument: written for
  you alone (0600, in a 0700 folder under `$XDG_RUNTIME_DIR`), opened by
  its path in the browser that opens https, which it sends on to the
  address at once, and gone two minutes later. "Continue in your agent"
  opens your agent with no prompt, the question on the clipboard to paste.
  A file or folder it opens goes to `gio open` by its path, as an
  argument, as a file manager hands it on; so does an address that is not
  http(s), such as `mailto:`.
- It shows text as plain text: a title, a clipboard entry or a filter's
  row that holds HTML is shown as written, and an `<img>` in it fetches
  nothing.
- Its notices are its own toast, a small popup at the top of the screen
  that no other program draws, and never a desktop notification:
  `notify-send` holds its words in its arguments, and Omarchy's
  notification host puts each popup's text in a program's arguments too.
  A script of Nodi's says one by writing its words to a file in a folder
  of `$XDG_RUNTIME_DIR` only you can read, and naming the file to the
  bar (`omarchy-shell shell call io.github.itsgg.nodi toast @file:...`).
- A command a row runs that fails is reported in that toast, "<row>
  failed": a command of Nodi's own rows or a script filter's with the last
  line of errors it wrote (one that fails without a word, or a program
  you close, is not reported); a script command with its last line or its
  exit status; an action that can be undone with why it failed.
- `nodi mcp` runs only when an agent starts it, and runs a row only by
  `run`, which the agent's own permissions gate, or by your Enter. `run`
  takes only an app, a window, Omarchy's menu, the desktop's media,
  volume and brightness, a saved desktop or a plugin, and of those
  nothing that changes a setting or installs: Omarchy's Setup, Style,
  Install, Remove and Update, a toggle, a theme, the next background, a
  Bluetooth device, a Wi-Fi network, an audio device and a reminder's
  row run, as a keybinding's row and anything else do (a command line
  after `>` among them), only on your Enter. An agent's search, in the bar or through `nodi mcp`, starts none
  of your script filters or inline scripts.
- It sends what you type after `g`, `yt` or `wiki`, from the second letter,
  to DuckDuckGo's autocomplete (duckduckgo.com/ac) for suggestions; a
  keyword of yours does so only with `"suggest": true`.
- Under `pkg` it reads pacman's list of packages and matches it itself,
  and asks the AUR (aur.archlinux.org's RPC) for the longest word typed;
  under `define`, Wiktionary (en.wiktionary.org's REST API) for the word
  typed.
- What it downloads itself is bounded: over https only, following no
  redirect, and refused past a size (the rates 256 KB, a definition
  4 MB, the AUR's answer 4 MB, suggestions 64 KB, the weather and
  Wikipedia extensions 1 MB and 2 MB an answer); a calendar 20 MB,
  following a redirect only to https when the address is https, and at
  an `http://` address only when it is on this machine (`localhost`,
  `127.0.0.1`, `[::1]`).
- It goes online for exchange rates (open.er-api.com, once the service
  says its next rates are due, daily in practice, or every ten minutes
  while that fails), for `prs` (through `gh`), to describe apps, if
  turned on (through Claude Code's `claude` command), and under `ask`
  through the coding agent Ask holds ([Ask](ask.md)), which goes online
  itself. The first question asked with Claude or Codex installs that
  agent's ACP adapter from npm, once, into `~/.local/share/nodi/agents`,
  as the lockfile in `lib/adapters` names it, with no install scripts; for Gemini,
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
- Its folders, `~/.cache/nodi/`, `~/.local/state/nodi/` and
  `~/.local/share/nodi/`, are yours alone (0700), made so at each start
  and each open; a file it replaces is written beside it under a name of
  its own, then moved over it. Notes, screenshots and an agent's session
  write their files for you alone (0600, a folder they make 0700),
  whatever your umask; a notes file you made keeps its mode.
- It writes to `~/.cache/nodi/` and `~/.local/state/nodi/prefs.json`,
  which holds what you set on rows (favourites, aliases, hotkeys, hidden
  rows and deeplinks, each with a copy of its row: its title and what it
  runs), the text of each clipboard entry you pin, the desktops
  you save (each app's desktop id, window class and workspace), the
  window rules you set, by window class, and which of the first opens'
  starters you have been through; and to `~/.local/state/nodi/reminders.json`,
  the reminders you set, each one's words and when it is due, until it
  is said or you clear them. Omarchy's own reminders (`omarchy-reminder`)
  are neither read nor shown. A search under
  `cb` with words reads the text in each image of the history once, with
  Omarchy's `tesseract` (about 2 s an image, a few seconds at a time
  while that search is open), into `~/.cache/nodi/ocr/`; pasting in sequence
  keeps the history's texts in `$XDG_RUNTIME_DIR/nodi-sequence`, yours
  alone and gone at logout.
  Among the cache is how long its last 300 opens took (`opens.json`, read
  by `make opens`), with nothing of what was typed; with `"picks": true`
  only, the last 1000 rows run from a query, the fallbacks picked when
  nothing matched among them (`picks-log.json`, read by `make picks` and
  `make replay`; removed when your settings do not turn it on): the queries
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
