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
    snippets (`providers/snippets.js`) and keyword links. `{cursor}` and
    `{selection}` were left out then, on the belief that a paste cannot
    place the cursor and that Wayland gives no selection to a bar that has
    focus; both were wrong (items 61 and 47). `nodi settings` opens
    nodi.json.
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
    Tried 2026-10-05 and not kept: a model that grows and shrinks at its
    end, each row reading its row by place, so new rows rebind the rows on
    screen. Measured offscreen with the research's own probe (Q L2), a
    swap took 6.14 ms with it and 5.87 without, a difference inside the
    probe's own spread (Fable's runs of the control alone gave 7.22 and
    10.84): no gain measured. The research's 2.3 ms came from a fixed pool
    of 12 rows that broke scrolling past them. Open: what in a row costs
    (text, images, bindings), measured with repeated runs before another
    try.
32. **Windows from the live model**: Quickshell.Hyprland's toplevels
    instead of `hyprctl clients -j` after each open, so `w` has its
    windows at the first keystroke. X 18.

    Done 2026-10-05: kept current between opens from Quickshell's model,
    asked again over Hyprland's socket on its window events, and read at
    the open for the first ranking; no `hyprctl` started on an open.
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
    letters in order for every row. Q 8. Check: "lo c", "wfi", "blth", and
    "susp" putting Suspend over the toggle that hides it (a shorter name
    at the same tier); a
    keystroke's ranking still under a frame at p95 in Qt's engine (9.8 ms
    before, `make bench`).
    Done 2026-10-05: Nodi's tiers kept, with a fit inside them (how much
    of the title the query covers, whole words more) and the initials of
    a query of several words; letters in order for any row from three
    letters, close together. Rows a provider orders itself (windows by
    recency, lists by place) keep that order. 88 of 100 queries first, 82
    before, no query or target worse; a keystroke in Qt at p95 13.2 ms
    against 14.6 for its parent, both measured under load from other
    sessions.
38. **A decaying frecency** in place of counts. Q 9.
    Done 2026-10-05: one use per row, plus one a run and halving every 30
    days, kept beside the count; habit grows with its log to 200, so 13
    runs and 900 differ, and 900 runs a year ago fall under 5 today. The
    home view now puts 3 runs today over 50 two hundred days ago. The
    harness, with no history, does not move.
39. **A group leads by at most three rows** before a stronger row of the
    next one (his call). Q 10. Check: the fourth row of a group waits for
    a stronger row of another (tests/js/ranking.test.mjs). "susp" is a
    near tie on score, not grouping (Q L13), and goes with item 37.
    Done 2026-10-05: on the search path only (help and the home view keep
    each group whole). Q L6's "ss" is unchanged, its menu group leading by
    two rows; "wa" moves one place down.
40. **Keywords written once by the model**, beside the descriptions
    lib/Describe.js has it write. Q 11.
    Done 2026-10-05, written once and read rather than asked of a model at
    each start: words for 45 of Omarchy's menu rows (providers/menu.js
    SYNONYMS) and 34 common apps by desktop id (providers/apps.js
    KEYWORDS), since the menu and those apps are the same on every
    Omarchy. A user's own apps are covered by what Describe.js writes for
    them, which item 35 made searchable. Of 20 queries in such words, 9
    were first before and 20 after; "airdrop" stays on LocalSend.
41. **A leading verb dropped** ("open", "launch", "start", "run"). Q 15.
    Done 2026-10-05: for apps, when the whole query names none; the verb
    queries 0 of 3 first to 3 of 3, 91 of 100 in all.
42. **His own picks, logged and replayed**: each Enter's query as it was
    typed keystroke by keystroke, the rows shown and the row picked with
    its rank, kept on this machine; the harness replays them in order, so
    learning is tested as it accrues, and measures the letters to first
    after each pick of a row. Q 1 (H 1, H 5). The frontier's constants
    fitted to his picks (Q 14) need it.

    The log landed 2026-10-05, kept as he uses the bar (`make picks`:
    first picks, the picked row's median place, letters typed). The
    replay landed 2026-10-06 (`make replay`, tools/rank/replay.mjs): his
    picks in order through today's ranking and History's learning, over
    this machine's lists, from no history; each row's place now and the
    letters to first before and after its pick. On his first 28: 24 of 26
    first (25 as logged), a median of 1 letter before and after.
## Phase I: AI and agents

43. **Ask continues**: follow-ups on the held session; "Ask again" and
    "New question" as Ctrl+K rows (Ctrl+R is the query history below, and
    Ctrl+N moves down); Ctrl+K "About this window" (a capture of the
    window it was opened over) and "About the selection". L 3.
    Done 2026-10-06: the held session is a conversation across closes: a
    question within ten minutes of the last answer follows it, and "New
    question" starts afresh, both rows under the answer rather than
    behind Ctrl+K; closing the bar refuses a run waiting on him, and a run
    Claude asks for while it is closed is refused, so no proposal waits
    unseen, and after Claude's run closes the bar, asking again lets it
    take the next step (item 44's request of several steps). Under a typed
    question, "Ask about the
    selection" sends the text fenced, and "Ask about this window" a
    picture of the window the bar opened over, taken from its own buffer
    by its ext-foreign-toplevel handle (`grim -T` with Hyprland's
    stableId, 1280 pixels wide at most), so the bar is not in it; the held
    session takes an image block (probed with Claude Code 2.1.289). "Ask
    again" was there; Ctrl+R stays the query history.
44. **Ask acts through rows**: `nodi_search` and `nodi_run` over the
    session's permission channel, no other tools; a proposed row shows
    armed with its risk and exact command, Enter allows, Escape denies.
    E 1, 7.
    Done 2026-10-06: the held session gets the bar's search and run as its
    only tools (no built-in tool), over the pipe it already reads; a search
    runs at once, a run shows in the bar with its command and risk and runs
    on his Enter, Escape refusing; a row that asks for a word, a key no
    search returned and a second run while one waits are refused with a
    reason, unshown; only the key he allowed runs, once, as Enter on the
    row runs it: the bar closes first, so a request of several steps ends
    at its first run. Real Claude Code 2.1.289 with Haiku: "lock my screen"
    searched, proposed Lock and ran it in 4.7 s. `"ask": { "actions":
    false }` turns it off.
45. **`nodi mcp`**, the bar as an MCP server: `search`, `run` (refusing
    rows that ask, as `nodi run` does) and `propose` (the bar opens on the
    row armed and returns Enter or Escape). E 3.
    Done 2026-10-06: bin/nodi `mcp`, JSON-RPC a line each way in bash and
    jq; the bar answers `search` (its rows for agents, the same Claude's
    Ask gets) and keeps the keys found, so `run` and `propose` can name
    them; `propose` shows the row through `nodi pick` and runs it on his
    Enter, a row that asks included (that Enter is its second). Claude
    Code 2.1.289 first sends MCP 2026-07-28's `server/discover`; Nodi says
    it has no such method and Claude Code falls back to `initialize`
    (probed). End to end with real Claude Code and a stand-in shell: it
    searched, and its Bash call went through `approve`. Fable's review
    (FIX FIRST) found a reply lost past 128 KB of input, rows a search
    listed and a run refused, and a pick left in the bar when the client
    went away; all fixed with tests.
46. **Approval for headless agents**: a permission prompt tool in `nodi
    mcp` for `claude -p` runs. E 6.
    Done 2026-10-06: `approve` takes Claude Code's `{tool_name, input,
    tool_use_id}`, shows the tool and what it acts on in the bar, and
    answers `{"behavior": "allow", "updatedInput": ...}` on Enter, else
    `{"behavior": "deny", "message": ...}`; both shapes probed with Claude
    Code 2.1.289 (a write allowed ran, a denied one is listed in
    permission_denials). A read-only shell command never asks.
47. **The selection as context**: `{selection}` in keywords and snippets,
    rows on a fresh selection (fix spelling, rewrite, translate, change
    case, search), the result pasted over it. Item 19's "Wayland gives no
    selection to a bar that has focus" was wrong: data-control serves the
    primary selection to an unfocused client (X 6, measured). L 2.
    Done 2026-10-06: the primary selection is read once an open, after the
    first frame; while it is fresh (two minutes from when it was first
    seen), five rows lead the empty bar (fix spelling and grammar,
    rewrite, translate to the language in nodi.json, change case, the
    first search keyword), and the same come by name ("fix", "uppercase",
    "summarize"), since a primary selection is nearly always there;
    `rewrite` and `case` take any selection.
    Claude's rows go to the held Ask session with the text fenced, the
    field showing the question; Enter on the answer pastes it over the
    selection. Cases change locally. `{selection}` fills in keyword links
    and snippets. Not yet tried on screen: whether every app keeps the
    selection highlighted when the bar closes, so the paste replaces it.
    Since, from his use: `rewrite ` alone offers ready rewrites (improve,
    shorter, more formal, friendlier, simpler), where it showed a hint row
    Enter did nothing on; text copied with Ctrl+C counts by the same two
    minutes, the newer of a fresh selection and a fresh copy leading (the
    copy on a tie), a copy's answer pasted at the cursor, and the bar's
    own copies never offered back; a search keyword typed alone searches
    that text, or opens the site when its words do not make the site;
    `tr ` and `b64 ` alone take the clipboard's text, whatever its age,
    when nothing is selected. A snippet that includes another fills it
    one level deep. Checked live on his bar: the home rows, Fix and its
    paste, the rewrite presets, a case paste, copied text, `tr`, `=` and
    Tab, sites, snippets with {cursor}, {selection} and {random}, the
    failed-command notice, Ctrl+W, Ctrl+R and the kept query. A sweep of every help example and fill-in, with and
    without text, leaves only rows that need words and say so on their
    hint line (a command keyword typed alone, `tr ` and `b64 ` with
    nothing selected or copied). Since 2026-10-07 one row leads the
    empty bar in place of the five, naming the text ("Copied: git
    push"); Enter on it types `copied ` (or `selected `), which lists
    every action on the text, words after it narrowing them (his pick:
    the five pushed Recent down after any copy).
48. **Translation streamed into the pane**: `tr <language> <text>`, and
    `<text> in <language>`. L 8.
    Done 2026-10-06: `tr` takes a language by code or name (a code that
    is an English word, "hi" or "no", only by name), else the one in
    nodi.json, then the text, or the selection when none is typed; at
    root, "<text> in <language>" by name only. Claude translates through
    the held Ask session, as the selection's rows do; a keyword "tr" of
    your own still comes first.
49. **MCP servers for Ask, opt-in**: servers he names in nodi.json, passed
    with `--strict-mcp-config`, every call confirmed as Ask's proposed rows
    are; off by default, since the README says Ask's session has no MCP
    servers. E 10.
    Done 2026-10-06: `"ask": { "mcpServers": {...} }` in Claude Code's own
    format, a plain name other than "nodi" with a command or a url; with
    Ask's actions on, the session gets them by --mcp-config (only them,
    --strict-mcp-config) and each call shows in the bar as "Allow
    <server>: <tool>" with its input in the pane, Enter allowing it, as a
    row is. --safe-mode turns every MCP server off, so with servers it
    goes and CLAUDE_CODE_DISABLE_CLAUDE_MDS and _AUTO_MEMORY keep his
    CLAUDE.md and memory out (probed with Claude Code 2.1.289: about
    2,700 input tokens, as in safe mode, against 8,000 without them).

## Phase J: daily verbs

50. **Query history on Ctrl+R** (Up wraps the list), and a kept query that
    lasts two minutes, then the home view (his call). L 1, 12; X 9.
    Done 2026-10-05: Ctrl+R from the queries picks were made for, newest
    first (months of them, not only the pick log's); a kept query lasts two
    minutes from the close, and a restart forgets it.
51. **Readline keys in the field**: Ctrl+W, Ctrl+E, Ctrl+F, Ctrl+B. X 10.
    Done 2026-10-05: Ctrl+W takes the word before the cursor, or the
    selection (the kept query is selected at an open); Ctrl+E to the end;
    Ctrl+F and Ctrl+B a letter. Ctrl+A stays select-all.
52. **A Ctrl+K that is typed into**, grouped, its Manage group last, each
    action's chord on the right. X 7.
    Done 2026-10-06: what is typed while Ctrl+K is up goes to a field of
    its own (the query waits as it was) and keeps the actions with a word
    starting so, by label or group; the row's own actions, then Copy,
    then Manage, Uninstall last, each group under its name; Enter, Ctrl
    Enter and new Ctrl+Shift chords (F favourite, A alias, D deeplink, H
    hide, P pin) on the right, and the chords work from the list too.
53. **A failed command says so**: its last stderr line in a notification,
    as scripts already have. X 4.
    Done 2026-10-05: a command or script a row runs is watched by a
    wrapper (lib/Run.js watched) that keeps its errors' last 4 KB and, on a
    non-zero exit that said why, notifies "<row> failed" with the last
    line; an exit by a signal, or a failure that says nothing (a toggle's
    ordinary exit), is quiet. Apps keep LaunchFeedback.
54. **Clipboard**: pins, type filters, images found by their text (OCR),
    paste in sequence, send to a device. L 4.
    Done 2026-10-06: Ctrl+K pins an entry, kept with what it holds (text
    up to 64 KB, an image by Omarchy's path) so it outlives the history,
    first under `cb`; `cb img`, `url`, `color`, `text` show one kind; a
    search with words reads each image's text once (tesseract, cached in
    ~/.cache/nodi/ocr, about 3 s of it a read, one read for all images)
    and finds it by that; "Paste the clipboard in
    sequence" pastes the newest text, then each older one on a press
    within 30 s, and takes a hotkey; "Send to a device" through
    omarchy-menu-share (LocalSend).
55. **URLs and bookmarks**: a typed domain opens; Chromium's bookmarks at
    root and under `bm`. L 5.
    Done 2026-10-05: a URL, a domain with a known ending, localhost or an
    IP opens as typed, over the rest; "notes.md" is no site, and a bare
    name with an ending file types share ("notes.org", "main.cc") is one
    under a recent file of that name or a window its title names, the
    fallbacks under it. Chromium,
    Brave or Chrome's bookmarks under `bm` and three at root, with their
    folders.
56. **Labels that remove a doubt**: the paste target's name, calculator
    history, Tab puts an answer into the field. L 6.
    Done 2026-10-05: a paste says where it lands ("Paste into Chromium",
    the app of the window the bar opened over); `=` alone lists the last
    20 answers copied, from what History keeps; Tab on a sum puts its
    answer in the field. Not "calc", which opens LibreOffice Calc.
57. **Script filters, further**: a cached list mode ranked at root;
    autocomplete, match text, hidden data and rerun; multi-step filters
    and a rofi adapter. E 2, 4, 5; L 19.
    First part done 2026-10-06: `"list": true` runs the program once and
    keeps its rows for `refresh` (10 minutes), found locally under the
    keyword and, with `"root": true`, three at most in any search, ranked
    with every row; a row's `complete` and `match`; `"rerun"` reads a
    filter's rows again at its pace while they show. Second part done
    2026-10-06: a row's `{"next": ...}` takes the filter a step on, the
    program run once with NODI_PICK, NODI_INFO (the row's hidden `info`),
    NODI_DATA and NODI_STEP, Escape a step back, a step that prints
    nothing closing the bar; `"format": "rofi"` runs rofi scripts as they
    are (ROFI_RETV, ROFI_INFO, ROFI_DATA, entry options, no-custom).
58. **Other plugins' panels and the tray's menus as rows.** L 7.
    First part done 2026-10-06: the shell's list of plugins, read once an
    hour, gives each enabled plugin of someone else's that opens (an
    overlay, a panel, a menu) a row by its name, which summons it with
    {}; Omarchy's own are left out, as its menu reaches them by name, and
    some want a payload. Second part done 2026-10-06: each tray app's
    menu, and its submenus one level down, read while the bar is open
    (components/Tray.qml), its entries rows ("Dropbox: Pause syncing"),
    a checked one marked ON; Enter is a click in that menu.
59. **The window it was opened over**: screenshot it, read its text, a
    terminal in its directory, move, float, pin; capture results come back
    to the bar. X 5.
    Done 2026-10-06: for the window the bar opened over, its text (read
    from its own buffer with grim -T and tesseract, copied, the bar
    opened again on it), a screenshot of it alone (saved and copied as
    Omarchy saves one), its folder in Files when a shell runs in it, and
    "move 3" to a workspace; "Text from a region" and "Pick a colour" end
    in the bar, not only the clipboard. A terminal in its folder, float,
    pin and full screen are Omarchy's own keybindings' rows already
    (Super+Return opens a terminal where the active one is).
60. **Windows**: the next window of this app, typed move and size for a
    floating window, saved desktops. L 10.
    Done 2026-10-06: "Next window of this app" (a row a hotkey can take,
    worked out when it runs: the active window's app, its windows in the
    order they sit, round); "move 100 200" and "size 1280 720" for the
    window the bar opened over when it floats, else a row saying to float
    it; "save desktop <name>" keeps each app and its numbered workspace
    in prefs.json, and "Open desktop <name>" starts each one with no
    window open on its workspace through Hyprland's exec rule (seen to
    land so through uwsm-app and gtk-launch), reading the desktop when it
    runs; "forget desktop <name>".
61. **Agents' usage and sessions.** L 11.
    Done 2026-10-06: `usage` answers from the records Omarchy's agents
    widget keeps, each limit's share and when it resets, and the empty bar
    shows an agent's highest limit at 80% or more; `agents` lists the
    Claude Code and Codex sessions running in a terminal (through tmux
    too), the most recently busy first, with the last prompt from the
    session's own transcript, Enter focusing the terminal. One with no
    window, a single answer (-p, an SDK run) and Codex's other
    subcommands are left out; his personal agent's were too, until it was
    uninstalled on 2026-10-07. Waiting sessions first
    needs a Notification hook outside Nodi, so it is not done.
62. **Placeholders**: `{cursor}` (arrow keys after the paste, which
    answers item 19's "a paste cannot place the cursor"), `{clipboard:N}`,
    `{snippet:name}`, random, a sum. L 13.
    Done 2026-10-05: `{cursor}` (Left keys after the paste, from its place
    to the end), `{clipboard offset="N"}`, `{snippet name="..."}` (one
    level, its own placeholders filled), `{random from=...}` or
    `min`/`max`, in Nodi's attribute syntax. A sum is left out: it would
    bring the calculator into the placeholder code.
63. **Search suggestions** after a search keyword. L 14.
    Done 2026-10-06: a keyword with `"suggest": true` (the built-in g, yt
    and wiki) offers, from the second letter, up to five searches
    DuckDuckGo's autocomplete suggests, under what is typed, which stays
    first; each keystroke ends the read before it.
64. **Files**: names in root search, contents under `in`, type filters.
    L 16, Q 12.
    Done 2026-10-06: from the third letter of any search, fd under home by
    the longest word, each name holding every word, three at most, under
    any app named as well, the web's searches staying under them (off
    with `"root": false`); `in <words>` by ripgrep in the folders under
    `"contents"` (~/Work and ~/Documents), the first line that holds
    them, 30 files in 2 s, never "in 2 weeks", a date; `find img|doc|
    video|audio|dir` and `f img` one kind.
65. **Packages and a dictionary.** L 20.
    Done 2026-10-06: `pkg <name>` lists pacman's repositories and then the
    AUR (yay), installed ones marked, Enter installing in Omarchy's
    terminal as its installers do (omarchy-pkg-add, -aur-add), an
    installed one's page on Enter and its removal in Ctrl+K after a second
    Enter; `define <word>` from Wiktionary's REST API (dictionaryapi.dev
    timed out or had none for common words), English first, then any
    language that has the word, a sense a row, Enter copying it.
66. **A file chooser jump**: over a Save dialog, folders lead and Enter
    types the path in. L 18.
    Done 2026-10-06: over the portal's file dialog, or a floating window
    titled as one, the empty bar leads with the folders of recent files
    (recently-used.xbel), zoxide's, GTK bookmarks and XDG folders, and a
    search's folders (these and fd's, a path's listing) type themselves
    in: Home, then the path, which in GTK 3's dialog (the portal's) goes
    in front of a Save's suggested name and opens an Open's location bar,
    tried on Xvfb with XTest keys; the dialog's own Enter is left to him.
67. **Calendar**: the next meeting first, Enter joins; from an ICS link in
    nodi.json, off until one is set (his call). L 9.
    Done 2026-10-06: `"calendar": { "ics": ... }` (one address or a list,
    "me" for declined invitations), read by lib/ics.py, Python's standard
    library only, which works out repeats, moved and cancelled occurrences
    and time zones (tzdata, then the feed's VTIMEZONE) and matched
    recurring-ical-events on about 9000 random occurrences around DST
    changes. A meeting under way or within the hour leads the empty bar
    and Enter joins it (Meet, Zoom, Teams and the like) or opens it in
    Google Calendar; `cal` lists the next eight days in order.
68. **Notes in one line**: `note <text>` appends a dated line to a Markdown
    file set in nodi.json; `notes <words>` finds the line. L 17.
    Done 2026-10-06: `note <text>` adds "- 2026-10-06 00:42 <text>" to
    `"notes": { "file": ... }`, ~/Documents/notes.md unless set, made if
    missing; `notes <words>` its lines holding every word, newest first,
    the lines around in the pane, Enter opening the file at the line in
    Omarchy's default editor (a terminal one at the line).
69. **Small fits**: Ask's "continue in a terminal" through
    `omarchy-agent-prompt`, so it follows Omarchy's default agent; a paste
    that focuses the window it came from first. X 20.
    Done 2026-10-06: "Continue in your agent" already ran
    omarchy-agent-prompt; a paste (Omarchy's paste commands, never their
    copy-only form) now focuses the window the bar opened over first, then
    types, so a pointer or an app that took the focus meanwhile does not
    take the paste.

## Phase K: the experience

70. **On screen at every text size.** X 2. Check: renders at text size 20
    on 1536x960.
    Done 2026-10-06: the results and Ctrl+K's actions take at most the
    screen under the card's top, less what the card takes besides them
    (Card.chrome); `make check` draws every scene at text size 20 on
    1536x960 and fails on any card that would run off it (before: eleven
    scenes, Ctrl+K by 255 px).
71. **A combobox to a screen reader**, the selection announced. X 3. Its
    tests run under their own runtime directory, never on his session's
    accessibility bus.
    Done 2026-10-06: the field a search edit named Nodi whose description
    is the selected row, the results and Ctrl+K's actions lists of list
    items with the selection marked, and announcements, polite and the
    last of a burst: the count and first row after typing, the row a move
    selects with its place, No match with the first fallback, an armed
    row's second Enter, Ctrl+K's actions, an answer as it ends. `make
    a11y` (in check) walks six scenes with AT-SPI on a private X server,
    D-Bus and accessibility bus under their own runtime directory.
72. **A selection cue that reads**: a 2 px bar in the text colour where
    the accent was swapped away and the theme sets no selected border,
    and always under higher contrast (his call). X 8.
    Done 2026-10-06: where the selected title is the colour of every other
    (the accent failed on the fill, as in 8 of the stock themes, or the
    theme's selected text is its text, as Kanagawa's) and the theme draws
    no selected border, a
    2 px bar in the text colour on the selected row's and action's left
    edge (Contrast.needsMark); Dark Knight, Tokyo Night and the like draw
    as before. Higher contrast turns it on everywhere once 73 reads it.
73. **Motion and contrast preferences** from the portal and Hyprland. X 12.
    Done 2026-10-06: at each open, the portal's org.freedesktop.appearance
    `contrast` and `reduced-motion` and Hyprland's animations:enabled
    (lib/Appearance.js, through a Reader); higher contrast marks the
    selected row in every theme (72's bar) and raises secondary text to
    7:1, reduced motion or animations off leaves the card's resizing
    unanimated, and Ask's spinner still (item 85, 2026-10-07). This
    portal serves contrast (0) and no reduced-motion.
74. **Mouse**: right click opens Ctrl+K; the footer's keys click. X 14.
    Done 2026-10-06: a right click selects the row and opens its actions,
    running nothing; each footer key (Enter, Ctrl K, Tab, Esc, the
    pane's scroll) is a button that presses that key through the
    keyboard's own handler. `make ui` (in check) clicks the real card
    under QtTest, offscreen, with the harness's FakeNodi.
75. **`?mine`**: every alias, hotkey, favourite and hidden row. X 13.
    Done 2026-10-06: `?mine` (and "Yours" in `?`, its line counting what
    there is) lists each saved row once, what is set on it under it
    ("Favourite, alias ff, hotkey SUPER + F"), Enter running it; the
    hidden ones after, Enter showing each again; Ctrl+K on one of yours
    changes what is set as on the row itself. Nothing set: how to set
    each. Second in `?`, after the keys; `?mi` finds it.
76. **Right-to-left titles aligned left; an input method tested** in a
    scratch session, results following the composition. X 15, 16.
    Done 2026-10-07: titles, subtitles, actions and the pane's heading are
    aligned left whatever their script (Arabic and Hebrew drew right
    before); the query is what is typed with the composition in it
    (Card.composed), so results follow an input method's preedit, not
    only its commit. `make ime` (in check) runs fcitx5 composing into the
    real card on a private X server and D-Bus, typed through XTest
    (tools/xkeys.py, by ctypes): U+0b85 composed, then committed as its
    character.
77. **Starter rows on a first open.** X 11.
    Done 2026-10-07: until the home has five rows of yours, it ends with
    what to try, five rows that teach by doing (an app by its name, `w `,
    `cb `, an answer as you type, Ctrl+K on a row), Enter filling each
    in. Each goes once what it teaches was reached by any way: windows,
    clips or an answer leading a list, Ctrl+K opened, an app in the
    history; kept in the prefs (`tried`) once each, since a window, a clip
    or a sum is never in the history. A first open was a bare field.
78. **The window itself in the pane** for `w` rows. X 17.
    Done 2026-10-07: under `w` the selected window is drawn beside the
    list as it is now (components/WindowShot.qml, Quickshell's
    ScreencopyView over Hyprland's toplevel export), one on another
    workspace too, a still taken again each second: live it cost the
    shell's thread about 8% of a core and Hyprland about 6% more, the
    still 0.4%. Found by name among other rows, a window has no pane, so
    typing an app's name keeps the card as it was; `"windows": {
    "preview": false }` turns it off. Tried on the live compositor in a
    surface no one could see or touch (the background layer at 1%
    opacity, no input region); the offscreen render (56-windows) shows
    its header only.
79. **Window rules from Ctrl+K**, applied at runtime. X 19.
    Done 2026-10-07: Ctrl+K on a window offers "Always open <app> on
    workspace N" (its numbered workspace) and "Always float <app>", or
    takes either back; kept by window class in the prefs and handed to
    Hyprland through `hyprctl eval` whole each time, after the prefs are
    read, after each config reload (which drops every rule) and after each
    change (lib/WindowRules.js): Hyprland keeps a table of Nodi's rule
    objects in its Lua state, a rule wanted is turned on or made, every
    other turned off, so a handover twice changes nothing and the last of
    two quick changes wins. Naming a rule again would add its effects
    again, so it is turned on and off by its object. ?mine lists them,
    Enter removing one. Tested in Lua against a stand-in written from
    Hyprland's source; tried on the live Hyprland with a throwaway class
    sent silently to special workspaces.

82. **Previews that show the file**: code and text coloured by syntax in
    the theme's colours, a PDF's first page, a video's frame, a folder's
    entries. His question, 2026-10-07 ("should we support syntax
    highlighting in files preview, and show image preview etc").
    Done 2026-10-07: bat, which Omarchy installs, colours the first 4 KB
    with its `ansi` theme, the terminal's sixteen colours, which
    lib/Ansi.js makes the theme's own from its colors.toml (named, as
    Omarchy's themes are, or numbered), so code follows a theme switch
    as the terminal does; about 40 ms a file. A PDF's first page
    (pdftoppm) and a video's frame (ffmpegthumbnailer) are made once as
    JPEG into ~/.cache/nodi/thumbs, by path, size and time (a page took
    130 ms, 19 ms after); a folder lists 200 entries, folders first.
    Pictures were already shown as themselves.

## Phase L: release

80. **Tags, a version in the manifest, a CHANGELOG.** E 8.
    Done 2026-10-07: CHANGELOG.md says what each version brought, newest
    first; manifest.json says 0.2.0, and tools/check-manifest.mjs (in
    check and CI) fails when the two differ, so no bump goes without its
    notes. Tags v0.1.0 (332b7e1, the first public commit) and v0.2.0.
    `omarchy plugin update` follows main, not the tags: it shows the diff
    and asks before pulling. The marketplace still waits for his word
    (item 28).
81. **`contrib/`**: filters and answers in the repository, off by default,
    never fetched. E 9.
    Done 2026-10-07: `"filters": [{ "contrib": "obsidian" }]` names one,
    and lib/Contrib.js fills in its program in the plugin's own folder,
    keyword, title and icon, the entry's own fields winning and its
    `args` handed on; an unknown name runs nothing. Five, none doing
    what Nodi does itself (a first set of projects, ssh and tldr was
    thrown away on finding providers/dev.js had all three): `obsidian`
    (vault notes with their first lines; 367 in 104 ms here, kept under
    900 KB), `issues` (GitHub issues assigned to you), `containers`
    (Docker: logs, start, stop asked twice), and the answers `wikipedia`
    and `weather`. Each is tested on a home of its own with stand-ins
    for gh, docker and curl, its rows through Nodi's own filter parser.

83. **A user guide, held to the code.** His ask, 2026-10-07: "create a
    grounded user documentation for the project".
    Done 2026-10-07: docs/ has nine pages (getting started, what it
    finds, keys, actions, settings, Claude, extending it, what it
    touches, troubleshooting); the README keeps the overview and links
    them. tools/docs.mjs writes every help topic, every key and every
    default setting from the code into them, and `make docs-check` (in
    check and CI) fails where a generated part says other than the code
    or is missing, a link or a heading is not there, a `make` target is
    not one, the settings page names a setting Nodi does not have, or
    prose has a long dash, an arrow, a curly quote, an ellipsis or a
    middle dot. Hand-written pages were each checked against the code by
    a reviewer; the README is the overview, the rest moved here.

84. **Ask over ACP: Claude, Codex, Gemini, or an agent of his own.** His
    asks, 2026-10-07: "we have to support other coding agents as well,
    should we consider zed's agent control protocol for it?", whether
    Claude could move to ACP as well, given his own agent was coming
    later, and "web research and do it properly".
    Done 2026-10-07: Ask speaks ACP v1 (lib/Acp.js, schema v1.24.1) to
    the agent lib/Agents.js starts, and the stream-json path is gone.
    Claude runs through claude-agent-acp 0.86.0 on his own `claude`;
    against the path it replaces, two questions cost the same input
    tokens (1364 and 1412) and the first words came within 100 ms
    (spike, 2026-10-07). Codex runs through codex-acp 2.1.1, read-only
    with its shell, apps and web search off; Gemini with Nodi's system
    settings, which register none of its built-in tools. An adapter
    installs from npm once, pinned. The agent is nodi.json's, else
    Omarchy's default agent, else Claude; one of his own goes by its
    command (when it lands). The bar's tools reach the agent as
    `nodi mcp --ask`, which hands each message to Ask in the shell; a
    run is the row he allowed through the agent's question, or else
    shown in the bar for his Enter. Every other tool the agent asks
    about shows in the bar, answered once, never "always"; a sign-in it
    needs is asked there too. Left out, with reasons in lib/Agents.js:
    Cursor (read /etc/hostname unasked in both its modes, live test),
    Copilot, omp, Hermes, pi, OpenClaw, Crush, Muse. Tested by a
    stand-in agent through bin/nodi's relay and a stand-in for the
    shell's facade that takes its one argument, as the facade does
    (tests/qml/AskActsTest.qml; the first version passed two, which the
    facade refuses, found by Fable's review), and, with
    NODI_TEST_AGENTS, the real agents (AgentsLiveTest.qml). An adapter
    installs under a lock, its npm stopped with the start that began it.
    Not run past their start here: Codex (his workspace is out of
    credits) and Gemini (not signed in). Research in
    ~/.local/share/nodi-research/acp2.

85. **Ask's pane from the Enter that asks.** His report, 2026-10-07:
    "there is a delay after I press enter, shouldn't we open the window
    state and do a proper loader state etc that is consistent with UI/UX
    pattern and omarchy". Measured with the session warm, as the bar
    warms it: first words 0.7 to 0.8 s after Enter, 2.0 s for a question
    that searches the bar first; the pane opened only at the first word.
    Done 2026-10-07: the pane opens at Enter with the question, the agent
    and its model, Omarchy's own spinner (Ui/MultiSelect.qml: 󰦖, a turn
    each 800 ms) while the answer is on its way, and a dim line of what
    it waits on (Ask.qml status: starting, installing, signing in,
    searching the bar, thinking) until the words come; a failure stays
    in the pane with why. Renders 60 to 62 show it.

86. **The keys for what was run by hand.** His pick, 2026-10-07, from
    the frontier's "toasts that teach the shortcut for what was run by
    hand". Done 2026-10-07: a row run from the bar by Enter or a click
    that has keys of its own (an Omarchy menu action's binding, a
    binding found under `keys `, a hotkey he gave the row) shows them in
    Omarchy's on-screen display as the bar closes, its keyboard glyph and
    the keys, as Omarchy shows the volume (`omarchy-osd`): the first
    three times a row, counted again when its keys change, then never
    (lib/Teach.js, ~/.cache/nodi/taught.json). Never from the row's own
    hotkey or an agent's run. `"teach": false` turns it off. The measure
    it stays on: `make picks` gives each taught row's picks from the bar
    in the two weeks before its first hint and after.

87. **When nothing matches, Ask in one Enter.** His pick, 2026-10-07, from
    the frontier's "a model fallback over the catalogue when nothing
    matches", which was in part already there: the fallbacks offered "Ask:
    <query>", whose Enter wrote `ask ` for a second Enter. Done
    2026-10-07: Enter on it asks at once, the waiting pane opening as for
    `ask `, the session warmed as soon as the row is selected; Tab still
    only fills `ask ` in. A fallback picked is logged by its key
    (lib/PickLog.js), which no fallback was, being unremembered, so the
    order of the fallbacks can be set from his use: `make picks` counts
    them apart from the ranking's measures, and `make replay` learns
    nothing from them, as the bar learns nothing.

## Frontier, after the above

Each an experiment with a measure before it stays: a model fallback over
the catalogue when nothing matches, toasts that teach the shortcut for what
was run by hand, ranking by context, the scoring constants fitted to his
own picks (on the log of item 42), Latin keys for Tamil titles, the
focused app's own menus over AT-SPI (parked, his word 2026-10-07), and a
query spoken through voxtype.
L 21, Q 13, Q 14, X (frontier).

## Not doing

A Raycast extension runtime (needs Node inside the bar; Nodi's own code is
QML and JS, and npm only installs an agent's ACP adapter, its own process),
text expansion anywhere (needs uinput and setcap), a local embedding model
(this laptop's prefill times), and rows from his personal agent until its
rewrite lands.

From the 2026-10-05 reports: KRunner and GNOME search providers (one on
this machine), MCP tools as rows (their inputs are schemas written for
models), a store of extensions fetched from HEAD (it would escape the
marketplace's review), cloud sync (one machine), a settings window, double
click to run, and a password manager until `op` stops hanging with the
tray-only 1Password.
