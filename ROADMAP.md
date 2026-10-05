# Nodi: the fix plan

Written 2026-10-02 from three Fable reports, kept in
`~/.local/share/nodi-research/`: a holistic review of Nodi on this machine's
real data (`review/FINDINGS.md`, cited as R, F, A, I, T), a study of Raycast,
Alfred, Vicinae, Walker, PowerToys and the Omarchy marketplace's launchers
(`features/FINDINGS.md`, cited as "research"), and a read-only map of what
this machine and Omarchy expose (`integrations/FINDINGS.md`, cited as
"integrations"). The goal is his: the best command bar for Omarchy.

Items run in order, one commit each, every diff reviewed by Fable before it
lands, `make check` green, the installed copy refreshed. An item is done when
its check passes; the check is named on the item.

## Phase A: a foundation that ranks the right row first

The review's verdict: the design is sound, the ranking is not. On real data
an Omarchy menu row beat the meant answer in one query in six, four README
examples failed, and `aud` then Enter restarted the audio stack instead of
opening Audacity.

1. **One scoring table.** Providers say how well the query names a row (a
   tier: exact, prefix, words, acronym, substring, keyword, description,
   context, fuzzy) and what the row is (a kind: answer, mode, window, app,
   action, toggle, item, submenu, setting, hint); `lib/Score.js` owns the
   numbers. Digits never match keywords; synonyms for Omarchy's rows (sleep,
   log out, power off, lock screen, manual); typos within one or two edits;
   choice rows (Defaults > Browser > Firefox) only when the query names
   their place; a submenu below its best matching child; hints below apps.
   R1 to R5, A1, research 1. Check: `tests/js/ranking.test.mjs`, 17 golden
   queries from the review, green.
2. **Learning.** Every row run is remembered by key with a decayed count
   (full for a week, half after a month), and which row was picked for which
   query, so the second `t` is the terminal you chose the first time. "Reset
   ranking" in Ctrl+K. Research (b)1, (c). Check: tests for decay, query
   memory and reset.
3. **A home.** An empty bar shows favourites, then recent and frequent rows,
   then today's reminders, instead of nothing. F1, research 13. Check: a
   test of the empty query.
4. **Rows that hold still.** The selected row keeps its place while the
   readers started on open land, as Spotlight promises. F2. Check: a Keys.js
   test (item 6).
5. **Config that fails loudly.** A typo in `nodi.json` keeps the last good
   config and says so, rather than moving the hotkey; `keywords` merge by
   keyword. F4, F7. Check: tests.
6. **A QML that can be tested and seen.** The surface out of `Nodi.qml`
   (`components/Card.qml`, `ResultRow.qml`, `ActionPalette.qml`,
   `Footer.qml`, `Look.qml`); keys as a pure function in `lib/Keys.js` with
   node tests (Kadhir's pattern); an offscreen render harness
   (`tools/render.sh`, Qt's offscreen platform, nothing on his screen) and
   `make shots`. A3, T3. Check: Keys tests, `make shots` writes PNGs.
7. **One async path.** `ctx.request(id, argv, parse)` with a pending row and
   a cache, replacing the three ad hoc hooks, so AI, commands and developer
   views do not each grow a fourth. The requested reads live in
   `components/Requests.qml`; what is read on every open (windows, toggles,
   themes, reminders) stays in `Nodi.qml`, where it is pushed, not asked
   for. A2. Check: tests, and `tests/qml/RequestsTest.qml` run inside
   Quickshell.

## Phase B: everything Omarchy has, searchable

8. **Every Omarchy command.** A provider over `omarchy commands --json`
   (367 routes, cached by `omarchy version`): summary as subtitle, args as a
   Tab hint, the 83 that need sudo opened in a terminal. Integrations 1, I2.
9. **Keybindings as rows.** Named by what they do, the chord beside them,
   Enter runs the bind's command (Omarchy's keybindings records). Integrations
   5, research 6.
10. **Apps as Omarchy's launcher has them.** Its launch OSD and its
    uninstall, through the same commands its AppLibrary runs; the library
    itself is handed only to plugins of the "menu" kind, which is Omarchy's
    menu's. Nodi already launches and hides as it does. I1.
11. **The menu's own lists.** Fonts and power profiles as rows, not "Open
    menu". I3.
12. **The desktop, live.** Through Quickshell's modules: media (play, pause,
    next, with the track), audio outputs and inputs, Bluetooth devices to
    connect with battery, Wi-Fi networks to join, battery and power profile
    as answers. Integrations 3, 4, 6, 7, 14.
13. **Windows and workspaces.** Layouts for the active window (center,
    maximize, halves, thirds, next monitor, pin, pop out), workspaces and the
    scratchpad, move window to. Research 10, integrations 9. Most came with
    item 9, as Omarchy's own keybindings (fullscreen, float, pop out,
    workspaces 1 to 10, next and previous, move, scratchpad); center and pin
    are rows of their own. Halves and thirds are left: they fit a floating
    window, not a tiling layout, and Hyprland's resize arguments could not
    be tried without moving his windows.
14. **Notifications.** History rows that re-run their action, DND, dismiss
    all. Integrations 8.
15. **Faster state.** Shell IPC where it beats a probe; the guard batch's
    pacman listing cached by the package database's mtime. I4, R17. The
    listing is cached and the readers run side by side (10 s to 2 s). IPC
    does not beat the batched toggle probe here: a call spawns `qs`, 60 to
    90 ms each, and the shell gives its first-party services in process to
    bar plugins only.

## Phase C: his bar

16. **Aliases, favourites, hide**, from Ctrl+K, kept in a file Nodi owns.
    Research 3.
17. **A hotkey for any row**, recorded from Ctrl+K and bound at runtime the
    way Nodi binds its own; "Copy deeplink". Research 4, 15.
18. **Fallback rows** when nothing matches: the keywords that take a query,
    Ask, file search. Research 2.
19. **Snippets and quicklinks** with placeholders (`{argument}`,
    `{clipboard}`, `{date}`), picked then pasted the way Omarchy pastes
    emoji. Research 7, integrations 11. `lib/Placeholders.js` serves both
    snippets (`providers/snippets.js`) and keyword links; `{cursor}` and
    `{selection}` are left out, since a paste cannot place the cursor and
    Wayland gives no selection to a bar that has focus. `nodi settings`
    opens nodi.json.
20. **Script commands** from a directory, Raycast's header understood
    (silent, compact, full output, inline, arguments). Research 8.
    `providers/scripts.js`; a source's age may now depend on its parameter,
    each inline script's refreshTime. Checked against five scripts from
    raycast/script-commands, headers only.
21. **Developer views**: projects (git repositories, zoxide, tmux sessions),
    Chromium history, ssh hosts, listening ports, user services, man and
    tldr, gh pull requests from a background cache. Research 11,
    integrations 10, 12. Each a source in `providers/dev.js`. A view taken
    by a word (`ports`, `services`, `h `, `prs`) needs the word whole or a
    space after it, so typing "print" never asks GitHub.

## Phase D: quick AI

22. **Ask.** Tab on any query, or `ask `, streams an answer from a held-open
    `claude` session into the bar; Enter pastes, Ctrl+Enter copies, Ctrl+K
    continues in a terminal (`omarchy agent prompt`); codex as the fallback.
    Measured here: 3.3 to 3.9 s to first text warm. Integrations 2, research
    5.

## Phase E: the look

23. **A look review from screenshots** (`make shots`, item 6), by Fable,
    against Omarchy's menu and his own Kadhir. Done 2026-10-04:
    `~/.local/share/nodi-research/look/FINDINGS.md`. His rulings the same
    day: the frost behind the card only, icon tiles kept at 48 px rows, a
    preview pane only when the selected row has one, Ctrl numbers in the
    badge slot; row corners as the menu's, "Insert" for an emoji, one
    label on an armed row. A second pass on type, contrast in five themes,
    surfaces and motion (`~/.local/share/nodi-research/look2/FINDINGS.md`,
    with `make themes`), and his rulings on it: titles at 14 px, the
    accent kept only where it reads at 4.5:1, app images inset to 22 px on
    the plate, the mode chip's corners capped at the theme's radius;
    global blur turned on in his Hyprland config, which Omarchy ships off.
24. **Kadhir's look**: frosted glass by a Hyprland layer rule set with the
    hotkey, a hairline border, 680 wide and 960 with a preview pane, the
    menu's selected border, a section header only where a group has more
    than one row, row numbers while Ctrl is held. R18. All six landed
    2026-10-04 (335e9b0, e2c94b8 and the selected border, drawn by the
    shell's own BorderOverlay from the theme's [menu] selected-border).
25. **Labels, not prose**: every explaining sentence on the surface becomes
    a label or an example, and an argument hint line under the field names
    what is being typed. F5, research (c). A row or a mode carries `hint`,
    its words as a pattern ("hello <name> [tone: Loud|Soft]", "volume
    <0-100> | +10 | -10 | mute"), shown under the field; rows say what
    they are; help topics show their examples; an armed row's badge is its
    one label.
26. **Preview pane**: files, images, clipboard entries, themes, snippets and
    answers. Research 9, R12. A row's `preview` (title, subtitle, labels,
    then text or a picture) shows in components/PreviewPane.qml beside the
    list, the card 960 wide while it does and 680 otherwise (his ruling):
    Ask's answer, a snippet's text, a clipboard entry, a theme's picture,
    an image file. A text file's first lines need a read and come next.

## Phase F: release

27. **Tests and truth**: Reader tests, a check that the installed copy is
    the repository's, README and PLAN read against the code. T1 to T5, I6.
    T1 and T2 were item 1's goldens on the real menu. The Requests test in
    Quickshell now covers output past the cap; `make installed` compares
    the copy with the tree and the shell's start with the copy; hygiene
    rule 4 holds every `execDetached` to Run.js or a named program; PLAN's
    shape, processes, state and verification were rewritten to the code.
28. **Codex over the whole** (owed since the first commit), then GitHub
    (public, `itsgg/omarchy-nodi`), then the marketplace on his word.

## Phase G: speed, and a measure of ranking

Phases G to L were written 2026-10-05 from four Opus reports in
`~/.local/share/nodi-research2/`: what other launchers shipped in 2025 and
2026 (`landscape/FINDINGS.md`, cited L), search quality and speed
(`quality/`, Q), extensions, AI and distribution (`ecosystem/`, E), and the
experience (`experience/`, X), numbers as in each report's ranked list. His
calls the same day, my recommendations taken ("do the best"): a group leads
by at most three rows, a kept query lasts two minutes, the selection bar
only where a theme's selection does not read, the calendar off until an ICS
link is set.

29. **A ranking harness.** `make rank` types each row's name a letter at a
    time (letters until it is first), ranks a fixed set of queries against
    the row each means, and counts the rows some queries show past the
    fallbacks (noise); a baseline file, and a diff on any ranking change.
    Q 1.
    Check: it reports today's "susp" and "lo c" defects.
    Done 2026-10-05: 70 of 100 queries first, apps first after a median
    of 2 letters and menu labels after 3. The corpus holds only what
    Omarchy ships: a first freeze carried his own bindings, which Fable
    found.
30. **The open, timed and cut.** Stamps for the key, the first ranking, the
    first frame and Hyprland's openlayer; then the held rows on the first
    frame and the ranking after it, a card-sized layer, and a window kept
    between opens if the layer protocol allows it. Q 6. Check: key to
    openlayer, 84 to 97 ms before (measured), measured after; no first
    frame larger than the card.
    The stamps landed 2026-10-05, kept as he uses the bar (`make opens`);
    the cuts wait for their numbers.
31. **The list updated in place**: a model diffed by row key instead of an
    array replaced on every keystroke. Q 5. Check: a bench of a
    keystroke's view cost, about 10.5 ms before.
32. **Windows from the live model**: Quickshell.Hyprland's toplevels
    instead of `hyprctl clients -j` after each open, so `w` has its
    windows at the first keystroke. X 18.

## Phase H: ranking

Each item is checked by item 29's harness: its own queries improve, and no
baseline query loses rank.

33. **Every script, accents folded.** NFD with the marks stripped; any
    letter above U+007F is a letter, without `\p{}` (Qt's engine fails it
    silently). Q 2, X 1. Check: Tamil, "beyonce", "muller"; the matcher's
    tests run in qml6 as well as node.
    Done 2026-10-05: the accent and script queries from 2 of 8 first to 8
    of 8, 76 of 100 in all; a keystroke in Qt still 9.4 ms at p95 with text
    past ASCII in the bench.
34. **Picks lift shorter queries**: a pick stored for "spotify" counts for
    "sp", weighted by how much of it was typed. Q 3.
    Done 2026-10-05: an app picked once by its whole name comes first
    after a median of 1 letter, 2 before (mean 3.5 to 1.4), which the
    harness now measures.
35. **The words a row shows are searched**: an app's comment and written
    description, a row's subtitle source. Q 4.
    Done 2026-10-05: the description queries from 2 of 8 first to 8 of 8,
    82 of 100 in all; noise from 25 rows to 17, as a word under three
    letters no longer names a row by its description alone.
36. **Typos on generic names and keywords**, kept under every clean match
    as Algolia ("typo count is the first criterion") and Meilisearch rank
    them, and ordered among themselves: a typo in the name, then one in
    the generic name or a keyword, then letters in order. Q 7 asked for a
    typo one step under its clean tier; its own source (Q T1) says
    otherwise, so this follows the source. A plural also tries its
    singular, as a keyword at best.
    Done 2026-10-05: "termnal" finds Foot, "browsr" Chromium (fourth,
    under three apps named Browser); no query lost rank.
37. **An fzf-style score inside each tier**: initials, camel case and
    letters in order for every row. Q 8. Check: "lo c", "wfi", "blth"; a
    keystroke's ranking still under a frame at p95 in Qt's engine (9.8 ms
    before, `make bench`).
38. **A decaying frecency** in place of counts. Q 9.
39. **A group leads by at most three rows** before a stronger row of the
    next one (his call). Q 10. Check: "susp" puts Suspend first.
40. **Keywords written once by the model**, beside the descriptions
    lib/Describe.js has it write. Q 11.
41. **A leading verb dropped** ("open", "launch", "start", "run"). Q 15.
42. **His own picks, logged and replayed**: each Enter's query as it was
    typed keystroke by keystroke, the rows shown and the row picked with
    its rank, kept on this machine; the harness replays them in order, so
    learning is tested as it accrues, and measures the letters to first
    after each pick of a row. Q 1 (H 1, H 5). The frontier's constants
    fitted to his picks (Q 14) need it.

## Phase I: AI and agents

43. **Ask continues**: follow-ups on the held session; "Ask again" and
    "New question" as Ctrl+K rows (Ctrl+R is the query history below, and
    Ctrl+N moves down); Ctrl+K "About this window" (a capture of the
    window it was opened over) and "About the selection". L 3.
44. **Ask acts through rows**: `nodi_search` and `nodi_run` over the
    session's permission channel, no other tools; a proposed row shows
    armed with its risk and exact command, Enter allows, Escape denies.
    E 1, 7.
45. **`nodi mcp`**, the bar as an MCP server: `search`, `run` (refusing
    rows that ask, as `nodi run` does) and `propose` (the bar opens on the
    row armed and returns Enter or Escape). E 3.
46. **Approval for headless agents**: a permission prompt tool in `nodi
    mcp` for `claude -p` runs. E 6.
47. **The selection as context**: `{selection}` in keywords and snippets,
    rows on a fresh selection (fix spelling, rewrite, translate, change
    case, search), the result pasted over it. Item 19's "Wayland gives no
    selection to a bar that has focus" was wrong: data-control serves the
    primary selection to an unfocused client (X 6, measured). L 2.
48. **Translation streamed into the pane**: `tr <language> <text>`, and
    `<text> in <language>`. L 8.
49. **MCP servers for Ask, opt-in**: servers he names in nodi.json, passed
    with `--strict-mcp-config`, every call confirmed as Ask's proposed rows
    are; off by default, since the README says Ask's session has no MCP
    servers. E 10.

## Phase J: daily verbs

50. **Query history on Ctrl+R** (Up wraps the list), and a kept query that
    lasts two minutes, then the home view (his call). L 1, 12; X 9.
51. **Readline keys in the field**: Ctrl+W, Ctrl+E, Ctrl+F, Ctrl+B. X 10.
52. **A Ctrl+K that is typed into**, grouped, its Manage group last, each
    action's chord on the right. X 7.
53. **A failed command says so**: its last stderr line in a notification,
    as scripts already have. X 4.
54. **Clipboard**: pins, type filters, images found by their text (OCR),
    paste in sequence, send to a device. L 4.
55. **URLs and bookmarks**: a typed domain opens; Chromium's bookmarks at
    root and under `bm`. L 5.
56. **Labels that remove a doubt**: the paste target's name, calculator
    history, Tab puts an answer into the field. L 6.
57. **Script filters, further**: a cached list mode ranked at root;
    autocomplete, match text, hidden data and rerun; multi-step filters
    and a rofi adapter. E 2, 4, 5; L 19.
58. **Other plugins' panels and the tray's menus as rows.** L 7.
59. **The window it was opened over**: screenshot it, read its text, a
    terminal in its directory, move, float, pin; capture results come back
    to the bar. X 5.
60. **Windows**: the next window of this app, typed move and size for a
    floating window, saved desktops. L 10.
61. **Agents' usage and sessions.** L 11.
62. **Placeholders**: `{cursor}` (arrow keys after the paste, which
    answers item 19's "a paste cannot place the cursor"), `{clipboard:N}`,
    `{snippet:name}`, random, a sum. L 13.
63. **Search suggestions** after a search keyword. L 14.
64. **Files**: names in root search, contents under `in`, type filters.
    L 16, Q 12.
65. **Packages and a dictionary.** L 20.
66. **A file chooser jump**: over a Save dialog, folders lead and Enter
    types the path in. L 18.
67. **Calendar**: the next meeting first, Enter joins; from an ICS link in
    nodi.json, off until one is set (his call). L 9.
68. **Notes in one line**: `note <text>` appends a dated line to a Markdown
    file set in nodi.json; `notes <words>` finds the line. L 17.
69. **Small fits**: Ask's "continue in a terminal" through
    `omarchy-agent-prompt`, so it follows Omarchy's default agent; a paste
    that focuses the window it came from first. X 20.

## Phase K: the experience

70. **On screen at every text size.** X 2. Check: renders at text size 20
    on 1536x960.
71. **A combobox to a screen reader**, the selection announced. X 3. Its
    tests run under their own runtime directory, never on his session's
    accessibility bus.
72. **A selection cue that reads**: a 2 px bar in the text colour where
    the accent was swapped away and the theme sets no selected border,
    and always under higher contrast (his call). X 8.
73. **Motion and contrast preferences** from the portal and Hyprland. X 12.
74. **Mouse**: right click opens Ctrl+K; the footer's keys click. X 14.
75. **`?mine`**: every alias, hotkey, favourite and hidden row. X 13.
76. **Right-to-left titles aligned left; an input method tested** in a
    scratch session, results following the composition. X 15, 16.
77. **Starter rows on a first open.** X 11.
78. **The window itself in the pane** for `w` rows. X 17.
79. **Window rules from Ctrl+K**, applied at runtime. X 19.

## Phase L: release

80. **Tags, a version in the manifest, a CHANGELOG.** E 8.
81. **`contrib/`**: filters and answers in the repository, off by default,
    never fetched. E 9.

## Frontier, after the above

Each an experiment with a measure before it stays: a model fallback over
the catalogue when nothing matches, toasts that teach the shortcut for what
was run by hand, ranking by context, the scoring constants fitted to his
own picks (on the log of item 42), Latin keys for Tamil titles, the
focused app's own menus over AT-SPI, and a query spoken through voxtype.
L 21, Q 13, Q 14, X (frontier).

## Not doing

A Raycast extension runtime (needs Node; Nodi is QML and JS with no npm),
text expansion anywhere (needs uinput and setcap), a local embedding model
(this laptop's prefill times), and Akshi rows until the Akshi rewrite lands.

From the 2026-10-05 reports: KRunner and GNOME search providers (one on
this machine), MCP tools as rows (their inputs are schemas written for
models), a store of extensions fetched from HEAD (it would escape the
marketplace's review), cloud sync (one machine), a settings window, double
click to run, and a password manager until `op` stops hanging with the
tray-only 1Password.
