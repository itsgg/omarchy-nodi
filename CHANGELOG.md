# Changelog

What changed in each version of Nodi, newest first. A version is a tag
(`v0.2.0`) and the `version` in `manifest.json`. `omarchy plugin update`
follows the main branch, not the tags: it shows the diff from the commit
you have and asks before pulling. ROADMAP.md has each item's detail.

## Unreleased

Ask
- Ask talks to its agent over the Agent Client Protocol: Claude, Codex or
  Gemini, Omarchy's default agent unless `"ask": { "agent" }` names one,
  or an agent of your own by its command. Claude runs through its ACP
  adapter, which the first question installs with npm, so Ask with Claude
  needs Node.js 22 or newer.
- Anything the agent asks to use shows in the bar, one at a time, and is
  allowed once; a sign-in the agent needs is asked there too.
- `"ask": { "model" }` is the agent's own name for a model; unset, Claude
  keeps Haiku and the others their default.
- `nodi` reaches the shell from an MCP client that clears the
  environment, as Codex does.
- The answer's pane opens at the Enter that asks, saying what the agent
  is doing beside Omarchy's spinner until its words come; a failure
  says why there.

Fixed
- A file's preview logged a binding loop when its read was due.

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
