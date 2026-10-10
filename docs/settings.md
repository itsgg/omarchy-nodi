# Settings

Your settings are `~/.config/omarchy/extensions/nodi.json` (type `nodi
settings` in the bar to open it). It holds only what you change; the rest
comes from [`config.default.json`](../config.default.json). A change applies
when the file is saved. A file that does not parse changes nothing: Nodi's
toast, "nodi.json has an error", says where, and the last settings
that worked are kept (the defaults, if none has worked since the shell
started).

```jsonc
{
  "hotkey": "SUPER + SEMICOLON",
  "currency": { "home": "INR", "favorites": ["USD", "EUR"] },
  "time": { "home": "Asia/Kolkata", "zones": ["UTC", "America/New_York"] },
  // Merged with the default keywords; "disabled": true removes one.
  "keywords": [
    { "keyword": "g", "title": "Search DuckDuckGo", "open": "https://duckduckgo.com/?q={q}", "suggest": true },
    { "keyword": "todo", "title": "Add a todo", "run": "printf '%s\\n' \"$1\" >> ~/todo.txt" },
    { "keyword": "map", "title": "Directions",
      "open": "https://www.google.com/maps/dir/{argument name=\"from\"}/{argument name=\"to\"}" }
  ],
  "snippets": [
    { "keyword": "sig", "name": "Signature", "text": "Regards,\nGanesh" },
    { "keyword": "mt", "name": "Meeting", "text": "Meet {argument name=\"who\"} at {argument name=\"when\" default=\"3pm\"}" }
  ],
  // A few words from Claude for apps with no description of their own.
  "apps": { "describe": true },
  // Your calendar, by its secret iCal address (Google Calendar: Settings,
  // the calendar, Integrate calendar); a list for more than one, and your
  // address, so an invitation you declined is left out.
  "calendar": { "ics": "https://calendar.google.com/calendar/ical/.../basic.ics", "me": "you@example.com" },
  // What `tr` and Translate on selected text go to (English unless set).
  "translate": { "language": "Tamil" },
  // Ask's model, and MCP servers its answers may use, each call on your Enter
  // (with Ask's actions on, as they are unless "actions": false).
  "ask": { "model": "sonnet", "mcpServers": { "github": { "command": "github-mcp-server", "args": ["stdio"] } } }
}
```

## Every setting

| Setting | What it does |
|---|---|
| `"hotkey"` | The key that opens the bar, as `"SUPER + PERIOD"`; one something else holds is left alone, and Nodi's toast says so |
| `"providers"` | What Nodi searches, in order; where two take the same word, the earlier wins |
| `"fallbacks"` | What a query nothing answers offers: `"keywords"` (your searches, Google's first), `"find"` (files), `"ask"` (your agent) |
| `"teach"` | `false` stops [showing a row's keys](keys.md) after you run it from the bar |
| `"picks"` | `true` keeps the last 1000 rows run from a query, with the queries typed for each, in `~/.cache/nodi/picks-log.json`, for `make picks` and `make replay` when working on Nodi's ranking |
| `"keywords"` | Searches and commands by a word of yours (below); they merge with the defaults by keyword |
| `"snippets"` | Text pasted by a word of yours (below) |
| `"scripts"` | `"dirs"`: the folders [script commands](extend.md#script-commands) are read from, in place of `~/.config/omarchy/nodi/scripts`; `"arguments"`: `true` gives a script what you type as `$1`, `$2` ... too, as Raycast's scripts read it (always `NODI_ARGUMENT1`, ...) |
| `"filters"` | [Script filters](extend.md#script-filters), and the ones that [come with Nodi](extend.md#extensions-that-come-with-nodi); on an entry, `"argument": true` makes what you type its last argument too (always `NODI_QUERY`) |
| `"answers"` | [Answers](extend.md#answers): a program's answer, streamed beside the list; `"argument": true` as a filter's |
| `"ask"` | [Ask](ask.md): `"agent"` (`"claude"`, `"codex"`, `"gemini"`, or one of your own by its `"command"`; Omarchy's default agent unless set), `"model"` (the agent's own name for it; `haiku` for Claude unless set, which also describes apps), `"actions"` (`false` keeps the agent to answers, without the bar's rows), `"mcpServers"` (servers its answers may use, each call on your Enter), `"environment"` (names of variables of yours the agent is given, past those Ask passes) |
| `"apps"` | `"describe"`: a few words from Claude for an app with no description of its own |
| `"math"` | `"precision"`: significant digits in an answer (10) |
| `"currency"` | `"home"`: your currency, what a bare amount converts to; `"favorites"`: the ones shown with it |
| `"time"` | `"home"`: your time zone (the system's unless set); `"zones"`: the clocks `time` shows; `"clock24"`: `false` for a 12-hour clock |
| `"emoji"` | `"onEnter"`: `"paste"`, or `"copy"` to copy instead |
| `"clipboard"` | `"limit"`: how many entries `cb` lists |
| `"files"` | `"limit"`: how many files a search lists; `"root"`: `false` stops the search of your home by name; `"contents"`: the folders `in` searches |
| `"windows"` | `"preview"`: `false` leaves the window itself out of the pane under `w` |
| `"calendar"` | `"ics"`: your calendar's secret iCal address (`https://` or `webcal://`), an `.ics` file's path (`/...`, `~/...` or `file://`), or a list of them; `"me"`: your address, so an invitation you declined is left out |
| `"translate"` | `"language"`: what `tr` and Translate go to (English unless set) |
| `"notes"` | `"file"`: where `note` writes (`~/Documents/notes.md` unless set) |

A list you set replaces the default one whole, so start a list such as
`"providers"` from `config.default.json`; only `"keywords"` merge.

## Keywords and snippets

With that, `g omarchy` searches DuckDuckGo, with DuckDuckGo's
suggestions for what you type under it (`"suggest": true`, which the
built-in `g`, `yt` and `wiki` have; a keyword of yours by the same word
replaces the built-in one whole, so it says `"suggest": true` itself),
`todo buy milk` adds a line to `~/todo.txt`, `map home office` gives
directions, `sig` pastes a signature and `mt Ravi 4pm` a filled-in sentence (Enter pastes it where
you were, Ctrl+Enter copies it). Placeholders, in `open` and in snippets:
`{q}` or `{argument name="..." default="..."}` for the words typed after
the keyword (the last one takes the rest), `{clipboard}`, `{date}`,
`{time}` (with `format="d MMM yyyy"` and `offset="+1d"`), `{uuid}`, an
older clipboard entry `{clipboard offset="1"}` and `{random from="a,b,c"}`
or `{random min="1" max="6"}`; in snippets also another snippet's text,
`{snippet name="sig"}` (its own placeholders filled too); in both, `{selection}`, the text selected in the
window you came from; and in snippets `{cursor}`, where the cursor is left after the
paste, by Left keys over the text after it. Those count places as
Chromium, Electron and GTK do; a Qt app joins no Indic conjunct, so after
"क्ष" there the cursor stops a place short. In
`run`, what you type is the command's `$1`, never written into its text, so
use it as a script would: `"$1"`, quoted, and kept out of arithmetic such
as `$((...))`, where bash evaluates what it holds. A `run` written with
`{q}` says to write `"$1"` instead, and runs nothing.

## The defaults

What `config.default.json` holds, as it holds it:

<!-- nodi:generated settings -->
| Setting | Default |
|---|---|
| `"hotkey"` | `"SUPER + PERIOD"` |
| `"providers"` | `a list of 39 (config.default.json)` |
| `"fallbacks"` | `["keywords","find","ask"]` |
| `"teach"` | `true` |
| `"picks"` | `false` |
| `"ask"` | `{"agent":"","model":"","actions":true}` |
| `"apps"` | `{"describe":false}` |
| `"math"` | `{"precision":10}` |
| `"currency"` | `{"home":"USD","favorites":["EUR","GBP"]}` |
| `"emoji"` | `{"onEnter":"paste"}` |
| `"time"` | `{"zones":["UTC","America/New_York","Europe/London"],"clock24":true}` |
| `"clipboard"` | `{"limit":30}` |
| `"files"` | `{"limit":30,"root":true,"contents":["~/Documents"]}` |
| `"snippets"` | `[]` |
| `"scripts"` | `{"dirs":["~/.config/omarchy/nodi/scripts"]}` |
| `"filters"` | `[]` |
| `"answers"` | `[]` |
| `"keywords"` | `[{"keyword":"g","title":"Search Google","open":"https://www.google.com/search?q={q}","suggest":true},{"keyword":"yt","title":"Search YouTube","open":"https://www.youtube.com/results?search_query={q}","suggest":true},{"keyword":"gh","title":"Search GitHub","open":"https://github.com/search?q={q}"},{"keyword":"wiki","title":"Wikipedia","open":"https://en.wikipedia.org/w/index.php?search={q}","suggest":true}]` |
<!-- /nodi:generated -->
