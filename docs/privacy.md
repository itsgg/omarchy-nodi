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
- File, clipboard, theme, app and extension images are decoded in a separate
  worker, one at a time. It reads regular files of at most 16 MB, with a
  768 MB address-space ceiling, three CPU seconds and a four-second deadline.
  Pictures above 16 million pixels are refused. The shell receives only a
  new PNG of at most 1000 pixels per side, containing pixel data without the
  original metadata. SVGs have no base URI for external file references.
  The image queue holds at most 64 requests and its memory cache at most
  128 entries or 24 MB. Unsupported tray image handles use the row's glyph.
  PDF and video preview workers and clipboard OCR also have memory, CPU,
  output-file and time limits. Reader error output is capped before it
  reaches the shell.
- Its notices are its own toast, a small popup at the top of the screen
  that no other program draws, and never a desktop notification:
  `notify-send` holds its words in its arguments, and Omarchy's
  notification host puts each popup's text in a program's arguments too.
  A script of Nodi's says one by writing its words to a file in a folder
  of `$XDG_RUNTIME_DIR` only you can read, and naming the file to the
  bar (`omarchy-shell shell call io.github.itsgg.nodi toast @file:...`).
- Files named under `"home"` are watched continuously in the shell
  process and parsed as bounded JSONL snapshots; opening the bar starts no
  source program. Reads are capped before bytes reach the shell. Nodi may
  keep stale display data through a missing, partial or invalid replacement,
  but removes its executable capabilities immediately. A source is
  display-only unless its config explicitly says `"trustedActions": true`.
  On each read of such a source, Nodi checks the same opened descriptor and
  its path before and after the read, requiring the same regular non-symlink
  file owned by the current user and writable by neither group nor world
  before accepting an executable action.
  Executable rows always show the exact command, ask before running and
  are not saved for replay. File ownership and mode do not stop another
  process running as the same user from changing the file; use a sandbox
  or policy fence around a trusted producer. Nodi cannot verify one.
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
  itself. The first question asked with Claude, Codex, Pi or Agy installs that
  agent's ACP adapter from npm, once, into `~/.local/share/nodi/agents`,
  as the lockfile in `lib/adapters` names it, with no install scripts.
  The agent's session runs in `~/.cache/nodi/ask` and is offered no files
  or terminal of Nodi's. Capable agents receive only the bar's MCP server
  and those you name under `"ask": { "mcpServers": ... }`; unmanaged
  OpenCode and custom agents may additionally load their own configuration
  and tools. Agy uses its own account and configuration; Nodi gives it no
  bar actions or configured MCP servers, but Agy can use its own read tools
  and globally configured MCP servers without Nodi approval. What of each
  agent's own tools and settings is turned off, [Ask](ask.md) says. A
  question within ten minutes of an answer follows it, and the
  session, the conversation with it, ends after thirty minutes with no
  question. The bar's tools are a search of the rows, and a run of one,
  which shows in the bar with its command and runs only on your Enter;
  anything else the agent asks to use shows there too. "Ask about this
  window" sends the agent a picture of the window you came from (`grim
  -T`, by its own buffer, so the bar is not in it), which stays in the
  conversation, and its cost in every question, until it starts afresh.
  An agent that advertises saved sessions may give Nodi up to 50 session
  IDs, titles, folders and update times; Nodi holds those summaries only
  in memory. Interactive form values go only back to that agent request,
  are bounded, and are not put in preferences or history. Opening an
  HTTP, HTTPS or mail link from an Ask answer reports that URL and whether
  it was dispatched to the same agent session and turn; local and file
  links are not reported.
- Codex under Ask uses a private profile at
  `~/.local/share/nodi/profiles/codex`, with its own sign-in. Nodi never
  copies the normal profile's rotating ChatGPT refresh token.
  [Troubleshooting](troubleshooting.md) gives the private sign-in command.
  Nodi supplies an empty config and `--strict-config` launch settings.
  Codex is unmanaged: Nodi cannot disable Codex's built-in tools, and Codex
  may use them. Its pinned runner checks the executable/app-server version
  and Nodi action origins.
  Claude's runner also binds an MCP action's SDK tool-use ID, provider
  turn, ACP session, dynamic server and input to the later direct relay;
  missing, changed or stale origins are refused. The opt-in live safety
  probe fails without that runtime evidence.
- Each time it opens it reads the text selected in the window you came
  from (`wl-paste --primary`) and the clipboard's text (never a password
  manager's), keeps them until it next opens, and sends one to the agent
  only when you pick one of the agent's rows on it, or to a streamed-answer
  fallback when you choose that row.
- When you choose an Ask, the agent is sent, beside the question, a note
  (`_meta.nodi`, [Ask](ask.md) shows it): what the row is for, the window
  you came from (class, title, workspace, process id, and the directory
  `/proc/<pid>/cwd` links to, read once as you choose, for a second at
  most, passed to the reader in its environment, not its command line,
  and left out if it fails or the window is no longer the one that process
  id was seen with), and, for an action on the selected or
  copied text, that text, how old it is, and whether it was the selection
  or the clipboard. Nothing is read before you choose, nothing goes in a
  command line, a log or a row's key, and the note is not kept with the
  conversation's summaries.
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
  are neither read nor shown. It also keeps the newest 50 streamed-answer
  conversations in `~/.local/state/nodi/conversations.json` so they can be
  reopened: each keyword, question and answer, but not the effective request
  that may contain selected text or an Ask transcript. Starting a new
  conversation sets the old one aside in that recent list; deleting the file
  clears the list. A search under
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
