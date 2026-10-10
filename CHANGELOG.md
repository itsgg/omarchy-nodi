# Changelog

What changed in each version of Nodi, newest first. A version is a tag
(`v0.2.0`) and the `version` in `manifest.json`. `omarchy plugin update`
follows the main branch, not the tags: it shows the diff from the commit
you have and asks before pulling. ROADMAP.md has each item's detail.

## Unreleased

Private text out of every argument (the marketplace's review, 2026-10-10)
- Ask's list of running agent sessions reads each one's last prompt,
  window title, folder and arguments into its JSON by jq's `$ENV`: the
  prompt was jq's argument, where another local user could read it in
  `/proc`.
- What `nodi` hands the bar (a search, a row to run or describe, an
  agent's proposal or tool call, `nodi <query>`, a pick's placeholder)
  goes in a file only you can read, in a 0700 folder under
  `$XDG_RUNTIME_DIR` that goes when the call ends; the argument names the
  file.
- A web address Nodi opens (a search, a meeting's link, a bookmark) goes
  to the browser by a page of Nodi's own, 0600 under `$XDG_RUNTIME_DIR`,
  that sends it on. The page is gone two minutes later.
- "Continue in your agent" opens the agent with no prompt and puts the
  question on the clipboard to paste: as a prompt it stayed in the
  agent's arguments for the whole session.
- A keyword's `run`, a saved desktop's name, a `>` command and a
  clipboard entry sent to a device reach their shell in its environment;
  a `>` command in a terminal runs from a 0600 file that removes itself.
  A file search's words reach rg as a pattern it reads, a preview's path
  its shell's environment, a path picked in a file dialog wtype's input,
  and the apps to describe Claude's input.
- `pkg` searches the repositories in the full list pacman prints,
  matched in Nodi, and the AUR through curl's `--variable`; the search
  through yay is gone. A row's "Installed" follows what is installed
  now.
- A hotkey given to a row runs `hotkey:<keys>`, looked up in prefs.json,
  never the row's key (a file's path, a command), and its description has
  no comma: Omarchy's keybinding records split at commas, and a file
  named `x,exec,touch PWNED #.pdf` with a hotkey became a runnable record.
- Text Nodi shows is plain text: a clipboard entry or a title holding
  `<img src=...>` was rich text, and Qt fetched the image.
- Notes, screenshots, an agent's session and Nodi's own folders are made
  0600 and 0700 whatever your umask is.
- A calendar at an `http://` address is refused unless it is on this
  machine, and so is a redirect from one to http elsewhere: its events
  came unencrypted.

Notices and reminders of Nodi's own (the marketplace's review, 2026-10-10)
- Nodi's notices (a row that failed, a script's last line, a screenshot
  saved, a settings error, a hotkey not bound) show in its own toast, a
  small popup at the top of the screen that goes after six seconds or at
  a click, never in a desktop notification: `notify-send` held their
  words in its arguments, and Omarchy's notification host puts each
  popup's text in a program's arguments, where another user of the
  machine could read them. A script of Nodi's hands the bar its words in
  a file only you can read (`omarchy-shell shell call
  io.github.itsgg.nodi toast @file:...`).
- `remind 15 call mom` is Nodi's own reminder, kept in
  `~/.local/state/nodi/reminders.json` and said in the toast when it is
  due, its words never in a command; one that came due while the shell
  was not running, or the machine slept, is said as late, with when.
  `reminders`, `reminders clear` (still a second Enter) and the empty
  bar's rows show Nodi's own, and the bar no longer asks
  `omarchy-reminder` at each open; reminders set with Omarchy's are no
  longer shown. A reminders.json with an error is left as it is, never
  written over, and the toast says so.

Changed: what you type stays out of programs' arguments, which any user
of the machine can read in /proc (the marketplace's review, 2026-10-10)
- A script filter or an answer gets the words in `NODI_QUERY` only. One
  that reads them as its last argument, Alfred's way, or a rofi script
  that reads the entry picked as `$1`, says `"argument": true` on its
  entry.
- A script command gets its arguments as `NODI_ARGUMENT1`,
  `NODI_ARGUMENT2` ...; a Raycast script reading `$1` runs as before with
  `"scripts": { "arguments": true }`. A `fullOutput` script's arguments
  reach its terminal in a private file, never the terminal's arguments.
- The weather and wikipedia extensions hand the place or the words to
  curl by `--variable` and to jq by `$ENV`.
- An agent's run at once (`nodi mcp`) no longer changes a setting or
  installs: Omarchy's Setup, Style, Install, Remove and Update, a toggle,
  a theme, the next background, a Bluetooth device, a Wi-Fi network or
  an audio device is proposed, and runs at your Enter, as every reminder
  row is and a keybinding's row, which runs whatever it is bound to.

Fixes, from every feature driven on a live Omarchy (2026-10-10)
- A file opens through `gio open`: Omarchy's nvim for text/plain is a
  terminal app, which `xdg-open` ran with no terminal, so nothing showed;
  and a Markdown file opens in what you set for Markdown.
- `tldr tar` waits for a key: its terminal closed as the page printed.
- An answer Ask's agent gave after you refused a tool ends with what was
  refused, "(Refused: Run command)", so "I'll run it" does not read as
  done.
- `output` lists the audio outputs, `mic` and `input` the inputs: a file
  named output stood over them.
- An Omarchy setting named exactly comes before a file of that name
  (`dns`), and the search under home leaves out go/pkg/mod,
  node_modules, site-packages and __pycache__.
- A status row ("Asking the AUR...") no longer holds the selection while
  the rows it waits for land above it.
- `f report`, `undo`, `desktop`, `forget desktop <name>` and `ssh ` say
  so when there is nothing, where unrelated rows stood; the calendar's
  help, with no calendar set, says how to set one.
- Help examples name Chromium, which Omarchy ships, not Firefox or Brave.
- Ask checks at the shell's start whether its adapter is installed: the
  rows no longer say an Enter installs one that is, after every restart.

## 0.4.0 (2026-10-09)

The bar
- A row run from the bar that has keys of its own (an Omarchy menu
  action's binding, a binding under `keys `, a hotkey you gave it) shows
  them in Omarchy's on-screen display as the bar closes, the first three
  times; `"teach": false` turns it off.
- When nothing matches, Enter on "Ask: ..." asks at once; Tab still only
  writes `ask ` before the query. With the agent Ask holds not installed
  (its program not on your login PATH), no Ask is offered, and `ask `
  says what is missing before an Enter.
- `in` searches `~/Documents` unless `"files": { "contents" }` names
  other folders; the default named a `~/Work` few have, and a search
  with none of its folders there says so.

Security and privacy
- Claude's and Codex's ACP adapters install from lockfiles shipped in
  `lib/adapters` (`npm ci --ignore-scripts`), every package at a pinned
  version and hash, and only at the Enter that asks the first question;
  typing `ask ` installs nothing, and the row says its Enter will. An
  adapter installed before this is installed again once, and an adapter
  installed at a new version removes its older ones.
- Private text is in no program's arguments, which every user can read:
  copies and pastes (clipboard entries, the selection, snippets,
  answers), notes, `in` searches, `define` words, suggestion queries,
  the window's title for script filters, and the titles of watched
  commands go through the environment. A paste types as Omarchy's emoji
  insert does, with the text on a pipe; a pinned text sent to a device
  is written to the runtime directory rather than `/tmp`.
- Ask's agent starts with a cleared environment: your session's
  variables, a proxy and certificates, and the agents' own sign-in and
  provider variables, plus any named under `"ask": { "environment" }`,
  then what your login profile sets. An answer is cut at a million
  characters, a line the agent writes at 4 MB, and an agent that writes
  over 64 MB to the bar in a session is stopped.
- `nodi mcp`'s `run` takes only rows whose command no word of the
  agent's reaches (apps, windows, Omarchy's menu and toggles, the
  desktop, saved desktops, keybindings, plugins; not a reminder); an
  agent proposes anything else, and it runs on your Enter. An agent's
  search starts none of your script filters or inline scripts.
- Downloads are bounded as the exchange rates were: definitions,
  suggestions and the weather and Wikipedia extensions over https only
  and refused past a size; a calendar served over https follows no
  redirect away from it.
- Nodi's folders in your home are yours alone (0700), and a file it
  replaces (a calendar's copy, the rates, the packages list, Gemini's
  settings) is written under a name of its own first, never one a link
  could stand at.
- The log of rows run from a query, with what was typed for each, and
  the fallbacks picked, is kept only with `"picks": true`, for working
  on Nodi's ranking.
- `nodi pick` refuses more than 8 MB of rows as it reads them; `nodi
  mcp` reads a message 16 MB at most, and Ask's tool server 64 KB, a
  longer one refused unread.

Fixed
- Removing or disabling Nodi turns off the window rules set from
  Ctrl+K, releases a row's hotkey changed a moment before, and stops an
  agent that ignores TERM.
- Ctrl+B and Ctrl+F move a letter as you see one, an emoji or a Tamil
  letter whole; a query holding half of one no longer fails and leaves
  the last query's rows for Enter.
- A prefs.json that does not parse is said in a notification and never
  written over, so a hand edit's typo loses no alias, favourite, hotkey
  or rule; the bar reads the file again at each open.
- A date typed as ISO writes it, 2026-10-09, answers with the date,
  not 2,007.

Documentation
- The README says how to remove Nodi and what it leaves, credits
  Saikomantisu's Command Bar, and the repository has a preview for the
  marketplace. The guide's example hotkey is one Omarchy leaves free,
  with how to give Nodi Super+Space.

## 0.3.0 (2026-10-07)

Ask
- Ask talks to a coding agent over the Agent Client Protocol: Claude,
  Codex or Gemini. It holds the one `"ask": { "agent" }` names, else
  Omarchy's default agent when that is one of the three, else Claude;
  or an agent of your own by its command. Claude and Codex run through
  their ACP adapters, which Nodi installs with npm the first time you
  type `ask `, so they need Node.js and npm (22 or newer for Claude's).
- The actions on selected text and Translate go to the same agent.
- Anything the agent asks to use, but the bar's own search, shows in the
  bar: Enter allows that one call, Esc refuses it, and Nodi never answers
  "always". A sign-in the agent needs is asked there too.
- `"ask": { "model" }` is the agent's own name for a model; unset, Claude
  keeps Haiku and the others their default. Describing apps
  (`"apps": { "describe": true }`) still uses Claude, with Ask's model
  only when Ask holds Claude.
- The answer's pane opens at the Enter that asks, saying what the agent
  is doing beside Omarchy's spinner (still under reduced motion) until
  its words come; a failure says why there.

Documentation
- A user guide in docs/: getting started, what it finds, keys, actions,
  settings, Ask, extending it, what it touches, and troubleshooting; the
  parts written from the code are checked against it in every check. The
  README is short. In help, "Developer" is "Developer tools", and "Yours"
  names window rules.

Fixed
- `nodi mcp` reaches the shell from an MCP client that clears the
  environment, as Codex does.
- Under load the card could show without its background, its icons
  spilling out, while it grew.
- A file's preview logged a binding loop when its read was due.

Development
- `make reload` stops the shell before it copies, refuses while a locker
  holds the screen, and fails if the shell does not start again.

## 0.2.0 (2026-10-07)

Searching
- Ranking measured against a frozen corpus of Omarchy's rows in every
  check (`make rank`): accents folded, typos and plurals, initials across
  words, a verb before an app's name, the words people use for Omarchy's
  rows; a row you picked comes first sooner, at the start of what you
  typed for it; use decays over time.
- Files by name in any search, by contents under `in`, one kind under
  `find img`; a typed site opens and your browser's bookmarks are found;
  search suggestions under `g`, `yt` and `wiki`.
- Escape closes the bar in one press, the query or not (it cleared the
  query first before), stepping back first out of Ctrl+K, a prompt or a
  help topic.
- Readline keys in the field (Ctrl+W, E, F, B), Ctrl+R for an earlier
  query, a closed bar reopening on what was typed for two minutes; the
  pane scrolled from the keyboard (Shift with the arrows or the page
  keys, Ctrl+D and Ctrl+U).
- `=` lists past answers, and Tab takes a sum's; a paste names where it
  lands ("Paste into Slack"); snippets take `{cursor}`, `{selection}`,
  an older clipboard entry and another snippet.

The empty bar
- The next meeting, from an iCal address you set, the text you just copied or
  selected as one row, an action's undo, folders first over a file
  dialog, and on a new install five rows that teach the bar.

Beside the list
- A file shown as itself: code coloured by its syntax in your theme's
  colours, a PDF's first page, a video's frame, a folder's entries.
- Under `w`, the window itself as it is now.
- Markdown from script filters and answers; the exact command and its risk
  before a row that asks runs.

Ctrl+K
- Typed into, grouped, each action's key on its right; everything you
  set on rows listed in `?mine`.
- On a window: always open its app on this workspace, or always float it,
  handed to Hyprland at once and again after a reload.
- A right click opens it; the footer's keys click.

More to search
- Clipboard pins, kinds, images by the text in them, a paste sequence,
  an entry sent to a device.
- Windows kept current from Quickshell's model; the window you came from
  (its text, a screenshot of it, its folder, moving it).
- Coding agents' limits and sessions, packages (`pkg`), a dictionary
  (`define`), notes, tray menus, other plugins' panels, saved desktops,
  undo for actions that say how.

Claude
- `ask` holds a conversation for ten minutes, about the selection or the
  window you came from; Claude searches the bar's rows and runs one only
  on your Enter; MCP servers you name, each call on your Enter.
- Selected or copied text fixed, rewritten, translated, cased or searched.

Extending
- Script filters (rows from a program's JSON lines, lists, steps, rofi
  scripts), answers (a program's answer streamed into the pane), and
  `contrib/`: Obsidian notes, GitHub issues, Docker containers,
  Wikipedia and the weather, off until named.
- `nodi` from a terminal (open, run a row, pick from a list) and
  `nodi mcp`, the bar as an MCP server for agents.

Look, speed and access
- From the key to the card on screen in 92 to 97 ms, measured, against
  184 ms before (a global shortcut, reads after the first frame); a
  shell start no longer stalls on Omarchy's command list (12 s of CPU
  before, 2.2 s now, as without Nodi).
- On screen at every text size; a selection cue that reads in every
  theme; the desktop's contrast and motion preferences; a screen reader
  hears a combobox and what changes; right-to-left titles aligned; results
  follow an input method's composition.

## 0.1.0 (2026-10-04)

The first public version (332b7e1): apps and windows, everything in
Omarchy's menu with each toggle's state, answers (sums, units, currency,
time), emoji, clipboard history, files, ports, user services, browser
history and pull requests, keywords, snippets and script commands,
reminders, and quick answers from Claude, opened by Super+Period. Ctrl+K
on a row: favourites first on the empty bar, aliases, hotkeys,
deeplinks, hidden rows; a pane beside the list for a row with more to
show.
