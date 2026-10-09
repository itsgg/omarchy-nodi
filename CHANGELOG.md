# Changelog

What changed in each version of Nodi, newest first. A version is a tag
(`v0.2.0`) and the `version` in `manifest.json`. `omarchy plugin update`
follows the main branch, not the tags: it shows the diff from the commit
you have and asks before pulling. ROADMAP.md has each item's detail.

## Unreleased

- A row run from the bar that has keys of its own (an Omarchy menu
  action's binding, a binding under `keys `, a hotkey you gave it) shows
  them in Omarchy's on-screen display as the bar closes, the first three
  times; `"teach": false` turns it off.
- When nothing matches, Enter on "Ask: ..." asks at once; Tab still only
  writes `ask ` before the query. Which fallback you pick is logged, by
  its key, for `make picks`.
- Claude's and Codex's ACP adapters install from lockfiles shipped in
  `lib/adapters` (`npm ci --ignore-scripts`), every package at a pinned
  version and hash, and only at the Enter that asks the first question;
  typing `ask ` no longer installs anything, and the row says its Enter
  will. An adapter installed before this is installed again once.
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
- Removing or disabling Nodi turns off the window rules set from
  Ctrl+K, releases a row's hotkey changed a moment before, and stops an
  agent that ignores TERM. The README says how to remove Nodi and what
  it leaves.
- `nodi mcp`'s `run` takes only rows whose command no word of the
  agent's reaches (apps, windows, Omarchy's menu and toggles, the
  desktop, saved desktops, keybindings, plugins; not a reminder); an agent
  proposes anything else, and it runs on your Enter. An agent's search
  starts none of your script filters or inline scripts.
- Downloads are bounded as the exchange rates were: definitions,
  suggestions and the weather and Wikipedia extensions over https only
  and refused past a size; a calendar served over https follows no
  redirect away from it.
- Nodi's folders in your home are yours alone (0700), and a file it
  replaces (a calendar's copy, the rates, the packages list, Gemini's
  settings) is written under a name of its own first, never one a link
  could stand at.
- Ctrl+B and Ctrl+F move a letter as you see one, an emoji or a Tamil
  letter whole; a query holding half of one no longer fails and leaves
  the last query's rows for Enter.
- A prefs.json that does not parse is said in a notification and never
  written over, so a hand edit's typo loses no alias, favourite, hotkey
  or rule; the bar reads the file again at each open, taking a hand
  edit or a fix.

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
