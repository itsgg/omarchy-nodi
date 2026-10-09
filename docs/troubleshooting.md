# When something is wrong

## What a notification means

| It says | What happened, and what to do |
|---|---|
| Nodi has no hotkey | The `"hotkey"` is not a key combination (write it as `"SUPER + SPACE"`), or something else already opens on it, which it names. Set another in `nodi.json`. |
| A row's hotkey is taken | A key you gave a row from Ctrl+K is bound to something else now. Give the row another from Ctrl+K. |
| nodi.json has an error | Your settings file does not parse, or holds no object of settings; the notification says why, and where for a typo. Nothing in it applies until it does: the last settings that worked are kept, or the defaults, if none has worked since the shell started. |
| (a row's name) failed | A command a row ran exited with an error: the text is the last line it wrote, a script command's exit status if it wrote none, or why an action that can be undone failed. A command of a menu row or a script filter's that fails without a word, or a program you close, says nothing. |
| Window rule not kept | Nodi keeps fifty window rules at most, fewer for very long app names; take one back in `?mine`. |

## Nothing opens on the key

`omarchy plugin list` should show `io.github.itsgg.nodi` enabled;
`omarchy plugin enable io.github.itsgg.nodi` enables it. If the key is
held by something else, a notification said so when the bar loaded, and
`"hotkey"` in [Settings](settings.md) takes another.

## Ask says why it failed

An answer that cannot come ends with the reason the agent gave, in the
bar. Most often the agent is not installed or not signed in: run it once
in a terminal. For Claude and Codex, Node.js and `npm` must be on your
login PATH for the first question, which installs the agent's adapter
(`npm ci` from the lockfile in `lib/adapters`); if that failed,
`~/.local/share/nodi/agents/*.log` says why.
[Ask](ask.md) says what each agent needs.

## A preview shows no colours, or no picture

Code is coloured by `bat`, a PDF's first page made by `pdftoppm` and a
video's frame by `ffmpegthumbnailer`; Omarchy installs all three. Without
one, the pane shows what it can: the text uncoloured, or the file's size,
time and type. A file Nodi may not read shows "Cannot read it".

## Something else

The shell's log has Nodi's own lines, each starting `nodi:`:

```sh
qs -p /usr/share/omarchy/shell log | grep nodi:
```

What you set on rows is in `~/.local/state/nodi/prefs.json`, and its
caches in `~/.cache/nodi/`, which can be deleted: Nodi makes them again
when the shell next starts (`omarchy restart shell`). Reports go to
[GitHub's issues](https://github.com/itsgg/omarchy-nodi/issues).
