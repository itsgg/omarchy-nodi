# contrib

Extensions that come with Nodi. Each is an ordinary script filter or
answer, the kinds you can write yourself (the main README says how), kept
in this repository so that what runs is what was reviewed at its commit.
Nothing here is fetched, and nothing runs until you name it in
`~/.config/omarchy/extensions/nodi.json`:

```jsonc
{
  "filters": [{ "contrib": "obsidian" }, { "contrib": "issues" }, { "contrib": "containers" }],
  "answers": [{ "contrib": "wikipedia" }, { "contrib": "weather" }]
}
```

A name fills in the program, its keyword, title and icon. Anything you set
on the entry wins, so `{ "contrib": "obsidian", "keyword": "o", "root": true }`
takes `o` and also shows notes in any search; `"args"` are handed to the
program. None of them does what Nodi does by itself: projects, SSH hosts,
`man` and `tldr` pages and pull requests are already rows (`?` lists them).

| Name | Kind | Keyword | What it does |
|---|---|---|---|
| `obsidian` | filter | `ob` | The notes in your Obsidian vaults (those Obsidian lists, or the folders given as `"args"`), the most recently changed first, each one's first lines beside the list. Enter opens it in Obsidian; Ctrl+K opens it in your editor or copies its Obsidian link or path. Folders starting with a dot are not read. Read again every two minutes. |
| `issues` | filter | `issues` | The open GitHub issues assigned to you, the most recently updated first, with their labels, through `gh` (signed in). Enter opens one; Ctrl+K copies its link or `owner/repo#N`. About two seconds over the network, read again every five minutes. |
| `containers` | filter | `dk` | Your Docker containers, running ones first, with their image, state and ports. Enter follows a container's logs in a terminal; Ctrl+K starts it, stops it (asked twice), restarts it, opens a shell in it, or copies its id. Read again every ten seconds. |
| `wikipedia` | answer | `wp` | `wp tamil language`, then Enter: the article those words find, its summary, and a link to the whole of it. English unless `"args": ["ta"]` names another Wikipedia. Asks its search, then its summary. |
| `weather` | answer | `weather` | `weather chennai`, then Enter: the weather there now and the next three days; `weather here` is where your connection appears to be. Celsius unless `"args": ["us"]`. Asks wttr.in. |

What each reads and starts is in its own header.
