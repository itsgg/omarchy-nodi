.pragma library
.import "keywords.js" as Keywords
.import "snippets.js" as Snippets
.import "scripts.js" as Scripts
.import "filters.js" as Filters
.import "answers.js" as Answers
.import "undo.js" as Undo
.import "ask.js" as Ask
.import "selection.js" as Selection
.import "translate.js" as Translate
.import "shell.js" as Shell
.import "math.js" as Calculator
.import "currency.js" as Currency
.import "time.js" as Time
.import "units.js" as Units
.import "emoji.js" as Emoji
.import "processes.js" as Processes
.import "clipboard.js" as Clipboard
.import "files.js" as Files
.import "devtools.js" as Devtools
.import "system.js" as System
.import "lists.js" as Lists
.import "desktop.js" as Desktop
.import "notifications.js" as Notifications
.import "dev.js" as Dev
.import "menu.js" as Menu
.import "omarchy.js" as Omarchy
.import "keys.js" as Keys
.import "windows.js" as Windows
.import "apps.js" as Apps
.import "plugins.js" as Plugins
.import "tray.js" as Tray

// Every provider Nodi knows. To add one: write providers/<name>.js exporting
// `var provider = { id, name, icon, match(query, ctx) }`, import it above,
// list it here, and add its id to "providers" in the config.
var all = [
  Keywords.provider,
  Snippets.provider,
  Scripts.provider,
  Filters.provider,
  Answers.provider,
  Undo.provider,
  Ask.provider,
  Selection.provider,
  Translate.provider,
  Shell.provider,
  Calculator.provider,
  Currency.provider,
  Time.provider,
  Units.provider,
  Emoji.provider,
  Processes.provider,
  Clipboard.provider,
  Files.provider,
  Devtools.provider,
  System.provider,
  Lists.provider,
  Desktop.provider,
  Notifications.provider,
  Dev.provider,
  Menu.provider,
  Plugins.provider,
  Tray.provider,
  Omarchy.provider,
  Keys.provider,
  Windows.provider,
  Apps.provider
]
