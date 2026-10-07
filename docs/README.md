# The Nodi guide

Nodi is a command bar for Omarchy: press its key, type, press Enter.

| | |
|---|---|
| ![Themes, the selected one's picture beside the list](themes.png) | ![A quick answer from Claude](ask.png) |
| ![A file's details and first lines](files.png) | ![Clipboard history, the whole entry beside the list](clipboard.png) |

1. [Getting started](start.md): install it, the first open, the loop.
2. [What it finds](finding.md): every kind of row, with examples.
3. [Keys](keys.md): what each key does.
4. [Actions](actions.md): Ctrl+K, and what you can set on a row.
5. [Settings](settings.md): `nodi.json`, keywords and snippets.
6. [Claude](claude.md): `ask`, and what it does with selected text.
7. [Extending it](extend.md): your own commands, script filters and
   answers, the extensions that come with it, and Nodi from a terminal
   or a coding agent.
8. [What it touches](privacy.md): what it reads, writes, starts and
   sends.
9. [When something is wrong](troubleshooting.md).

Parts of these pages are written from the code itself (every topic,
every key, every default setting), and `make docs-check`, which runs in
every check and in CI, fails when a generated part says other than the
code, a link goes to a file or a heading that is not there, or the
settings page names a setting Nodi does not have.
