# Actions

Enter runs the selected row. Ctrl+K, or a right click, shows everything
else it can do, in three groups: the row's own (Enter's first, then what
its kind offers), Copy, and Manage. Typing in Ctrl+K finds an action by
the start of its words ("fav", "copy"); each action's key, where it has
one, is on its right.

## What a row's kind offers

- A file: open its folder, copy its path.
- A window: bring it to this workspace, float it or tile it, close it,
  and its app's [window rules](#window-rules).
- An app: copy its desktop id; uninstall it, as Omarchy's own launcher
  removes one (a web app, a TUI, a launcher of yours, or the package, in
  a terminal for its password), after a second Enter.
- A clipboard entry: pin it, copy it without pasting, send it to a
  device.
- Anything that holds text: copy it (Ctrl+Enter, without opening
  Ctrl+K), and copy its title.

## Yours to set

Each is kept in `~/.local/state/nodi/prefs.json` and listed in `?mine`,
where Ctrl+K on one changes it as on the row itself.

- **Favourite** (Ctrl+Shift+F): first on the empty bar.
- **Alias** (Ctrl+Shift+A): a word of yours that names the row. Typed
  whole, it puts that row first; type the word, then Enter saves it.
- **Hotkey**: a key of yours that runs the row from anywhere, bound in
  the running Hyprland, never written into its config. Press the keys
  when asked; a key something else holds is refused, and says what
  holds it. A row that asks before it runs gets none.
- **Deeplink** (Ctrl+Shift+D): copies the command that runs the row,
  `omarchy-shell shell call io.github.itsgg.nodi runRow '<key>'`, for a
  Hyprland binding, a script or another launcher.
- **Hide** (Ctrl+Shift+H): the row is never shown again; `hidden` lists
  the rows you hid, Enter showing one again.
- **Pin** (Ctrl+Shift+P): a clipboard entry kept first under `cb`, and
  kept after the clipboard's history drops it.
- **Reset ranking**: the row goes back to where its name alone puts it.

A row of the moment (a sum's answer, a process to quit) has none of
these: it would mean nothing run again.

## Window rules

Ctrl+K on a window offers rules for its app: "Always open Firefox on
workspace 2" (the numbered workspace it is on) and "Always float
Calculator", or takes either back. Hyprland is handed them at once, and
again after each reload of its config, which drops them; no config file
is edited. `?mine` lists them under Window rules, Enter removing one, so
a rule can go without a window of its app open. Fifty at most, fewer
when app names are very long: they must fit one call of hyprctl.

## Undo

An action that says how to take itself back (a script filter's row or
action with `undoable`) is offered first on the empty bar for ten minutes after it
ran, as "Undo ...": Enter twice takes it back.
