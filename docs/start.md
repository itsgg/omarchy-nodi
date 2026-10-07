# Getting started

Nodi is a command bar for Omarchy: press its key, type, press Enter.

## Install

```sh
omarchy plugin add https://github.com/itsgg/omarchy-nodi --enable
```

Super+Period opens it; `omarchy-shell shell toggle io.github.itsgg.nodi
'{"query": ":"}'` opens it with text typed, for a binding or a script.
Another key goes in
`~/.config/omarchy/extensions/nodi.json` as `"hotkey": "SUPER + SPACE"`
([Settings](settings.md)); a key something else already holds is left
alone, and a notification says "Nodi has no hotkey" and why.

`omarchy plugin update io.github.itsgg.nodi` updates it, showing what
changed first ([CHANGELOG](../CHANGELOG.md) says what each version
brought), and `omarchy plugin remove io.github.itsgg.nodi` removes it,
releasing its key. What it keeps of yours stays until you delete it:
`~/.local/state/nodi/prefs.json` (what you set on rows), `~/.cache/nodi/`
(its caches) and `nodi.json` (your settings).

## The first open

An empty bar shows your favourites, what you run most and your
reminders, after whatever wants you now (an undo, a meeting about to
start, text you just selected), so on a new install there is little
yet. Until the bar has five rows of yours, it ends with five that
each teach one thing: open an app by its name, switch to a window (`w `),
find what you copied (`cb `), an answer as you type (a sum), and Ctrl+K
on a row. Enter fills one in. Each goes once you have been there, by it
or any other way.

## The loop

Type a few letters of what you want, and Enter runs the top row:
`chrom` for Chromium, `lock` to lock the screen, `12*8` for 96, `w git` for
the window with GitHub in its title. Arrow keys or Ctrl+N and Ctrl+P move
down the list; Ctrl+1 to Ctrl+9 run one of the first nine rows directly.

Ctrl+K shows the selected row's other actions: copy it, make it a
favourite, give it an alias or a hotkey, hide it, and what its kind
offers, such as a file's folder or a window's rules
([Actions](actions.md)). Tab fills in what the row offers, Esc closes
(or first steps back out of Ctrl+K, a prompt or a help topic).

A row you pick for what you typed comes first for it after a pick or
two, and sooner for the start of it: picked as "spotify", Spotify comes
first at "s". Closed within two minutes, the bar reopens on what was
typed, selected; later, on its empty view. Ctrl+R brings back an
earlier query, older on each press.

## Help

`?` lists every topic, each with examples you can run; `?units` opens
one, and `?mine` lists everything you set. [What it finds](finding.md)
is the same list on one page, and [Keys](keys.md) every key.

## Next

- [What it finds](finding.md): every kind of row, with examples.
- [Keys](keys.md) and [Actions](actions.md): what each key does, and
  what Ctrl+K offers.
- [Settings](settings.md): `nodi.json`, keywords, snippets.
- [Claude](claude.md): `ask`, and what it does with selected text
  (these need Claude Code installed and signed in).
- [Extending it](extend.md): your own commands, script filters,
  answers, the extensions that come with it, and Nodi from a terminal.
- [What it touches](privacy.md): what it reads, writes, starts and
  sends.
- [When something is wrong](troubleshooting.md).
