# What it finds

Every kind of row Nodi has, each with examples to type: the same topics
and examples `?` shows in the bar, written here from the same code
(`make docs-check` holds it to it), without the answers the bar works
out live. A topic for a
script filter or an answer of yours shows in `?` too, once you add one.

How a row comes first: by how well its name fits what you typed (the
whole name, its start, the start of each word, its initials, its letters
in order, a typo or a plural), then by how often and how lately you ran
it, and by what you picked before for the same words. A word in front of
a row's kind narrows to it: `w` for windows, `cb` for the clipboard,
`f` for files, `>` for a command, `?` for help.

<!-- nodi:generated topics -->
### Yours

Aliases, hotkeys, favourites, hidden rows and window rules.

- `?mine`: Aliases, hotkeys, favourites, hidden rows and window rules

### Open an app

Type part of an app's name, its initials, or what it does.

- `chromium`
- `term`
- `chromium new window`

### Switch window

Type an app or a window title. w and a space lists them all.

- `w `: Every other open window, most recent first
- `w github`: Windows with github in the title
- `chromium`: Chromium's windows first, then Chromium to open a new one

### Omarchy menu

Every action in Omarchy's menu, yours included, by name.

- `screenshot`
- `dns`: Setup > Network > DNS, with the current one marked
- `settings`: Everything under Setup
- `install zed`: Installers answer only when asked, and only for what is not installed

### Toggles

Omarchy's toggles, each with its state.

- `gaps`: Window Gaps, ON or OFF
- `dnd`: Notifications, ON or OFF
- `stay awake`

### Calculator

Sums, percentages, powers, sqrt and pi.

- `12*8 + 15%`
- `sqrt(2) * pi`
- `15% of 200`
- `5!`
- `=`: The answers copied before

### Units

Length, weight, temperature, volume, speed, data and time.

- `5 km to mi`
- `72f`
- `5 ft 11 in to cm`
- `2 cups in ml`
- `1 tb in gib`

### Currency

Daily exchange rates, saved for offline use.

- `100 usd to eur`
- `$50`
- `50 eur`

### Time zones

The time anywhere, or a time converted between zones.

- `time`
- `time in tokyo`
- `3pm to new york`

### Dates

Days until a date, days between two, and weekdays.

- `days until dec 25`
- `today + 45 days`
- `next friday`

### Emoji

A colon and a word. Enter types the emoji into your app.

- `:`: Start an emoji search
- `:fire`
- `emoji party`

### Kill a process

Quit an app, or every process it started.

- `kill `: Your processes, busiest first
- `kill chrome`: Quits every chrome process
- `kill -9 node`: Force quit, for an app that hangs

### Volume, brightness, reminders, themes

Levels, reminders and themes by name.

- `volume 60`: Through Omarchy's own volume command and OSD
- `bright -10`: The focused display
- `remind 15 call mom`: A notification in 15 minutes
- `theme `: Every theme, the current one marked
- `bluetooth`: Bluetooth, ON or OFF

### Clipboard

What you copied, newest first. Enter pastes it.

- `cb `: Everything, newest first; pinned ones on top
- `cb github`: Entries with github in them
- `cb img`: Images only; also url, color, text
- `cb text img`: The word img itself
- `cb invoice`: Images with that word in them too
- `cb clear`: Empties the history, after a second Enter

### Files

Recent files by name, any file under home, and any folder by its path.

- `f `: Recent files, newest first
- `f report`: Recent files with report in the name
- `find report`: Every file under home with report in its name
- `find img cat`: Images only; also doc, video, audio, dir
- `in budget`: Files in ~/Documents, or the folders you set, that hold the word
- `~/`: Your home folder; Tab goes into a folder

### Developer tools

UUIDs, Base64, Unix time and colours.

- `uuid`: A new UUID v4 each time
- `b64 hello`
- `b64 aGVsbG8=`
- `epoch`: Now, in seconds and milliseconds
- `#ff5722`

### Snippets

Text you paste often, with placeholders, set in nodi.json.

- `snip `: Every snippet

### Scripts

Executable files in ~/.config/omarchy/nodi/scripts with a @nodi header.

- `scripts `: Every script found

### Script filters

Programs of yours that turn what you type after a keyword into rows, set in nodi.json.

- `?filters`: Each one's keyword is in nodi.json under filters

### Answers

Programs of yours that answer a question on Enter, streamed into the pane, set in nodi.json.

- `?answers`: Each one's keyword is in nodi.json under answers

### Undo

What an action of yours said would take it back, for ten minutes after it ran.

- `undo`: Every undo still on offer

### Ask

A quick answer from your coding agent; Enter pastes it, Ctrl+Enter copies it.

- `ask `: Then a question, and Enter
- `list open ports`: Tab, where there is nothing to fill in, asks it

### Selection

Text you selected before opening the bar: fixed, rewritten, translated, its case changed, searched; pasted over it.

- `fix`: Text selected in the last two minutes, its spelling and grammar fixed
- `rewrite shorter`: Rewritten as you ask
- `case `: UPPER, lower, Title Case, snake_case...
- `translate`

### Translate

Text to another language, by your agent; Enter pastes it.

- `tr ta good morning`: To Tamil, by its code or its name
- `good morning in french`
- `tr tamil`: The text you selected

### Run a command

A command line, in a terminal or without one.

- `> htop`: Opens in Omarchy's floating terminal
- `> notify-send hi`: Ctrl+K runs it without a terminal

### Fonts and power profiles

Set the font or the power profile, the current one marked.

- `font `: Every monospace font
- `power profile`
- `performance`

### The desktop, live

Media, audio devices, Bluetooth, Wi-Fi and battery.

- `pause`
- `output`
- `bluetooth `
- `wifi `
- `battery`

### Notifications

The recent ones by what they said; Enter does what clicking it did.

- `notifications`

### Developer

Projects, sessions, hosts, pages, ports, services, history, bookmarks, pull requests.

- `nodi`: A project by its folder's name
- `tmux`
- `ssh `
- `man ls`
- `tldr tar`
- `ports`
- `services`
- `h github`
- `prs`
- `bm `
- `github.com`: A site, opened as typed

### Plugins

Other plugins' panels, overlays and menus, opened by name.

- `plugin`: Every one that opens

### Saved desktops

Which app is on which workspace, saved by a name and opened again.

- `save desktop work`: The apps on your workspaces now
- `desktop`: Every one saved
- `forget desktop work`

### Coding agents

Claude Code's and Codex's limits, and their sessions running in a terminal.

- `usage`: Each limit's share used, and when it resets
- `agents`: Enter focuses the session's terminal

### Calendar

Your next meeting first, Enter joining it; from an iCal address set in nodi.json.

- `cal `: The next eight days
- `cal standup`: Events that hold the word

### File dialogs

Over a Save or Open dialog, folders lead; Enter types the path in.

- `downloads`: Over a file dialog: the folder, typed in
- `~/Documents/`: Its folders, each typed in

### Notes

One dated line at a time, in a Markdown file; found again by its words.

- `note call the bank`: Adds a dated line
- `notes bank`: The lines that hold it, newest first

### Packages

Arch's repositories and the AUR by name; Enter installs in a terminal.

- `pkg zed`: The repositories first, then the AUR

### Dictionary

A word's senses from Wiktionary, English first; Enter copies one.

- `define serendipity`
- `define வணக்கம்`: Any language Wiktionary has

### Tray menus

What each app in the tray offers in its menu, by its words or the app's name.

- `tray`: Every entry of every tray menu

### This window

The window the bar opened over: its text, a screenshot, its folder, another workspace.

- `window text`: Its text, read and shown here
- `screenshot window`
- `move 3`: To workspace 3
- `move 100 200`: A floating window's place; size 1280 720 its size
- `next window`: The app's next one; give it a hotkey

### Omarchy commands

Every command of Omarchy's command center.

- `omarchy `: The whole catalog, the menu's own commands included
- `capture text`: OCR a region of the screen
- `omarchy theme set`: Fills in > omarchy theme set, for the theme's name

### Keybindings

Every keybinding by what it does, its keys beside it.

- `keys `: Every keybinding
- `full screen`: Runs it, and shows the keys

### Keywords

Your shortcuts, set in nodi.json.

- `g `: Search Google. Opens google.com
- `yt `: Search YouTube. Opens youtube.com
- `gh `: Search GitHub. Opens github.com
- `wiki `: Wikipedia. Opens en.wikipedia.org
<!-- /nodi:generated -->
