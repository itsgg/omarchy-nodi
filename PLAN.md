# Nodi: plan

Written 2026-10-02, before the first line of code. Nodi replaces
`io.github.saikomantisu.commandbar` on this machine: the same idea, a
Spotlight-style bar for Omarchy, rewritten under Ganesh's name with Omarchy's
own menu and toggles at its centre. Since the review that evening,
ROADMAP.md is the plan and README.md says what Nodi does; this file keeps
the decisions it was written to make, and its Shape, Processes, State and
Verification sections were brought up to the code on 2026-10-03.

## Name

Nodi is Tamil for an instant, the time a finger snap takes: two syllables,
said the way it is spelt (NO-dee), and what the bar is for. It is unused in
the Omarchy plugin marketplace (4,712 listings in `registry.json`, checked
2026-10-02) and on github.com/itsgg.

| Thing | Value |
|---|---|
| Plugin id | `io.github.itsgg.nodi` (permanent once listed) |
| Repository | `~/Work/GG/omarchy-nodi`, later `github.com/itsgg/omarchy-nodi` |
| User config | `~/.config/omarchy/extensions/nodi.json` (JSONC) |
| Cache | `~/.cache/nodi/` (rates, last query, launch counts) |
| Open it | `omarchy-shell shell toggle io.github.itsgg.nodi` |

## Language

QML for the surface, JavaScript libraries for every decision, and bash only
as the fixed argv of a program Omarchy already ships. That is how Omarchy
builds its own plugins: `menu/Menu.qml` draws, `menu/MenuModel.js` decides,
and `clipboard/capture.sh` is the one script. No Python, no compiled binary,
no npm dependency, no build step. The upstream bar is already QML and JS;
the Python helper agy added on 2026-10-02 goes, since nothing in Omarchy's
own scripts uses Python and the marketplace scans every executable.

The split is a rule, not a habit: a `.qml` file holds layout, bindings, keys
and the processes that fetch data; anything that can be wrong about a query
lives in a `.pragma library` file that `node --test` runs without Qt.

## What it does

Parity with the upstream bar, the fixes the 2026-10-02 review found, and
Omarchy's own commands at the centre. Akshi integration is out until the
Akshi rewrite lands (his ruling, 2026-10-02).

1. Apps: launch, desktop actions ("brave new window"), acronyms, fuzzy
   fallback, launch counts as a tiebreak, Omarchy's hidden apps left out.
2. Windows: switch by app or title, `w ` for all; actions close, move here,
   toggle floating.
3. Answers: calculator, units, currency (daily rates, offline cache), time
   zones, date maths. Ported from upstream with their tests.
4. Emoji: `:word`, typed into the previous app or copied.
5. Processes: `kill`, `kill name`, `kill -9 name`, pid-only targets.
6. Keywords: the user's `open` and `run` shortcuts from config.
7. Omarchy menu: every action in the default menu and the user's extension
   menu, with its breadcrumb (Setup > Network > DNS), its `when:` honoured so
   a row that cannot work on this machine does not show, and its `checked:`
   shown so DNS and default-app rows name the current choice. Install and
   remove rows appear only when the query starts with install, remove or
   uninstall.
8. Toggles with live state: Omarchy's toggle rows (stay awake, notifications,
   nightlight, bar, gaps, layout, screensaver, crash capture, battery
   percentage, touchpad, touchscreen) plus Bluetooth, Wi-Fi, speaker mute and
   microphone mute, each saying ON or OFF from a probe, flipped at once on
   Enter and reconciled a moment later.
9. Parameters: `volume 60`, `vol +10`, `brightness 80%`, `bright -10`,
   `remind 15 call mom`, `reminders`, `theme tokyo` (the live theme list
   `omarchy theme list` gives, user themes included, with previews and the
   current one marked).
10. Power: lock, suspend, log out, reboot, shut down; the last three ask for a
    second Enter.
11. Clipboard: `cb`, `cb word`, paste or copy an entry; `cb clear` asks
    Omarchy's clipboard plugin to clear itself rather than writing its file.
12. Files: `f name`, `recent`, and `~/path` or `/path` to list a directory.
13. Developer tools: uuid, base64 over UTF-8, epoch, colours.
14. Help: `?`, topics, live examples, search.
15. Keys: Up/Down and Ctrl+N/P move, Enter runs, Tab fills in, Ctrl+K opens a
    row's actions, Ctrl+1 to Ctrl+9 run a row directly, Esc clears then closes.

## Shape

```
manifest.json           overlay, keepLoaded
Nodi.qml                the overlay: keys, the row pipeline, preferences,
                        the hotkey, and what is read on every open
components/
  Card, ResultRow,      the surface: field, list, Ctrl+K palette, footer,
  ActionPalette,        sizes
  Footer, Look
  Reader                every program Nodi reads from
  Requests              the reads providers ask for, one Reader per source
                        (per key for a concurrent one)
  Desktop               Quickshell's media, audio, Bluetooth, network and
                        battery services as plain data
  Ask                   the held-open Claude session
  LaunchFeedback, Keycap, IconTile
lib/
  Engine.js             query to ranked, grouped rows; modes; help; fallbacks
  Rows.js               the row contract, and the Ctrl+K actions
  Run.js                a row's run to one argv: the only place a command
                        is built
  Match.js, Score.js    word prefixes, acronyms, typos; the one scoring table
  History.js            what was run, how often and when (~/.cache/nodi)
  Prefs.js              aliases, favourites, hidden rows, row hotkeys
                        (~/.local/state/nodi)
  Requests.js           when a provider's read is due, and what it keeps
  Keys.js               what a key press does
  Placeholders.js       snippet and link placeholders
  AskStream.js          the Claude session's command and its output
  Jsonc.js, Config.js   JSONC; nodi.json over config.default.json
  Menu.js, Toggles.js   the menu tree and its guards; the toggle probe
  Sources.js            parsers for the readers' output
  Hotkey.js             the hotkey and row hotkeys, bound at runtime
providers/              one file per feature, `.pragma library`
tests/js/, tests/qml/   node --test; components run inside Quickshell
tools/                  qmllint.sh, compile-check.sh, qs-test.sh, render.sh,
                        installed.sh, hygiene.mjs, check-manifest.mjs
Makefile                check, install, reload, installed
```

### The run contract

A provider never builds a shell string from data. A row's `run` is one of:

| kind | carries | does |
|---|---|---|
| `exec` | `argv` | runs the argv, nothing interpreted |
| `shell` | `script` | `bash -c` on text the user or Omarchy wrote: a keyword's `run`, a menu `action` |
| `app` | desktop id, action index | launches through `uwsm-app`, as Omarchy does |
| `window` | Hyprland address (hex only) | focuses it |
| `open` | URL or path | `xdg-open` |
| `summon` | plugin id, payload | `omarchy-shell shell summon` |
| `copy` | text | `wl-copy --` |

`lib/Run.js` turns any of these into one `execDetached` context. Enter,
Ctrl+K and Ctrl+digit all go through it, so an action can never take a
different path from the row it belongs to (agy's palette ran `bash -c
undefined` for every argv row). Confirmation (`confirm: true`) is enforced
there too, for every entry point.

### Processes

Two kinds, treated differently on purpose:

- Readers (apps aside, which Quickshell lists itself: windows, processes,
  rates, toggles, menu guards, themes, directory listings and every source a
  provider declares) run with `clearEnvironment: true`, an explicit
  environment (HOME, USER, PATH of `$OMARCHY_PATH/bin:/usr/local/bin:/usr/bin:/bin`,
  OMARCHY_PATH, LANG, WAYLAND_DISPLAY, XDG_RUNTIME_DIR,
  HYPRLAND_INSTANCE_SIGNATURE, DBUS_SESSION_BUS_ADDRESS), programs by
  absolute path where they have one, a deadline, and output capped before
  it is parsed; output past the cap fails the read rather than being cut. This is what
  the marketplace's manual review asked of OmaPass on 2026-09-16.
- Actions the user chose (launch an app, run a menu action, a keyword's
  command) inherit the session environment, as Omarchy's own menu does,
  because an app started without it loses its session.

`tools/hygiene.mjs` fails the check if a `Process` appears outside
`components/Reader.qml` (Ask.qml's one session excepted) or that one lacks
`clearEnvironment`, if a provider's `bash -c` script is not a constant, or
if `Quickshell.execDetached` takes an argv that neither Run.js nor
Hotkey.js built and that names no program but a shell; `tests/js/corpus.test.mjs` runs about a hundred queries
through every provider and fails on any row whose run the contract
rejects.

Some readers depart from the minimal environment on purpose, by running a
login shell inside it: the menu's `when:` and `checked:` guards, as
Omarchy's menu runs them, so a guard in the user's own menu sees the PATH
their profile sets; `gh` for pull requests, which mise or a profile may put
on PATH; and inline script commands. Ask's session inherits the user's
environment, since Claude Code needs its own login. Actions run as
Omarchy's menu runs them (`bash -lc`, arguments through a constant
`exec "$@"`).

### State

| What | Read when | How |
|---|---|---|
| Config | load, on change | FileView, JSONC |
| Menu tree | load, on change | FileView on both files, merged as written and then normalized, so a user entry that only renames a row keeps its action (Omarchy's MenuModel loses it); guards in one bash batch, re-run on open when a minute old |
| Toggle states | each open | one probe process from `lib/Toggles.js`; optimistic flip on Enter, reconciled after 1.5 s |
| Themes | each open | the theme directories `omarchy-theme-list` reads, named as it names them (a test checks they agree), with each preview, and `omarchy-theme-current` |
| Windows | each open | `hyprctl clients -j` |
| Preferences | load, on change | FileView on `~/.local/state/nodi/prefs.json` |
| Clipboard | on change | FileView on Omarchy's history file |
| Recent files | on change | FileView on `recently-used.xbel`, newest first by its `modified` |
| Desktop state | each query that shows it | Quickshell's MPRIS, PipeWire, Bluetooth, NetworkManager and UPower services |
| What a provider asks for | while a query shows it, once older than its source's limit | `components/Requests.qml`: processes under `kill`, rates for a currency query once a day, a directory under `~/` or `/`, Omarchy's command list and keybindings, fonts, power profiles, notifications, the developer views, the clipboard's text, script headers and inline output |

## Look

Omarchy's menu tokens and nothing else: `Color.menu.*` for the surface,
`Color.accent` for an ON state, `Color.urgent` for a pending confirmation,
`Style.*` for sizes. A theme that styles the menu styles Nodi. agy's
hardcoded per-provider colours, the Ctrl+N badge on every row and the fixed
92% alpha with forced blur are not carried over; the keys themselves stay.

## Replacing the old bar

1. `make install` copies Nodi to `~/.config/omarchy/plugins/io.github.itsgg.nodi`
   (rsync, not a symlink: the shell's watcher does not follow one).
2. `~/.config/omarchy/extensions/nodi.json` gets the hotkey from
   `commandbar.json` (`SUPER + SPACE`), the only setting there.
3. `omarchy plugin disable io.github.saikomantisu.commandbar`, then
   `omarchy plugin enable io.github.itsgg.nodi`; the old bar's runtime bind is
   dropped with it and Nodi binds the same key.
4. The old plugin's directory stays until he has used Nodi and says remove it
   (`omarchy plugin remove`); its uncommitted changes are agy's and are not
   carried anywhere.

## Verification

- `make check`: `node --test`, the ranking harness, qmllint with the shell's `qs` imports,
  `tools/compile-check.sh` (Quickshell compiles every QML file),
  `tools/qs-test.sh` (components run inside Quickshell), the shots rendered
  offscreen, `tools/hygiene.mjs`, `tools/check-manifest.mjs`,
  `omarchy plugin validate`. `make installed` says whether the installed
  copy is the repository's and whether the shell has loaded it.
- `make rank` (tools/rank/rank.mjs) ranks over a corpus frozen from what
  Omarchy ships (tests/js/fixtures/rank/corpus.json, written by
  tools/rank/freeze.mjs; no history): the rank of each query's meant row
  in tools/rank/queries.mjs, by kind of match; the letters typed until each
  app, and one menu row per label that the whole label finds, is first; and
  how many rows past the fallbacks some queries show, a count to watch. It
  fails on any difference from tools/rank/baseline.json, gains as well as
  losses, each named, so a ranking change commits its baseline's diff, and
  the baseline holds where the ranking stands. It began on 2026-10-05 at 70
  of 100 queries first, apps first after a median of 2 letters, menu
  labels 3.
- `make bench` times every keystroke of a set of queries through
  lib/Engine.js, on node and in Qt's own engine (qml6, offscreen), over
  Omarchy's emoji, menu, command list, keybindings and desktop entries and
  made-up history, clipboard and files at their caps. On 2026-10-04 a
  keystroke took 29 ms (median) and 50 ms (worst) in Qt; after keeping
  each list's match fields between keystrokes, about 4.5 and 15 to 20
  (load on the machine moves them).
- Every upstream test case ported and passing, plus a case per defect the
  2026-10-02 review found (font route, theme list, Ctrl+K on argv rows,
  unknown toggle state, base64 UTF-8, `f` and `~/Downloads`, clipboard
  clear, the manual's URL).
- The load check is `tools/compile-check.sh`: a throwaway Quickshell
  config compiles each file and creates nothing, so nothing is drawn on his
  screen.
- A second model reviews every diff before it is committed (Fable since
  2026-10-02; codex or agy when it cannot), findings verified and reported.

## Credit

Nodi's architecture, run contract, Omarchy integration and UI are new. The
calculator, units, currency, time zone, date, emoji, process, window and app
matching are ported from Saikomantisu's omarchy-commandbar (MIT), so
`LICENSE` carries both copyright lines and the README says where they came
from.

## Not now

- Akshi rows and actions: after the Akshi rewrite, through `akshi rows` and a
  non-interactive `akshi pick` (asked of the Akshi session, 2026-10-02).
- Pushing to GitHub and a marketplace submission: each on his word.

## Milestones

1. Skeleton: manifest, Makefile, tools, CI, `Nodi.qml` with input, list and
   footer, `Engine.js`, `Rows.js`, `Run.js`, `Match.js`, `Jsonc.js`, tests.
2. Ported providers with their tests: math, units, currency, time, emoji,
   processes, windows, apps, keywords, help.
3. Omarchy: menu tree and guards, toggles and their probe, parameters,
   themes, power with confirmation.
4. Clipboard, files with directory listing, developer tools.
5. Ctrl+K actions, Ctrl+digit, README, screenshots.
6. Review, install, the swap, a pointer in the Akshi vault.
