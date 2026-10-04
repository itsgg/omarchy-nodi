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

## Not doing

A Raycast extension runtime (needs Node; Nodi is QML and JS with no npm),
text expansion anywhere (needs uinput and setcap), a local embedding model
(this laptop's prefill times), and Akshi rows until the Akshi rewrite lands.
