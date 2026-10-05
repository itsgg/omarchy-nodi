// The scenes the render harness draws: real rows from the engine and the
// test fixtures (apps, windows, rates, Omarchy's menu and command list as
// the tests have them), with each app's icon found in the live icon theme.
// Prints scenes.js for Harness.qml.

import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { load, root } from "../../tests/js/load.mjs";
import { Engine, config, services, windows } from "../../tests/js/fixtures.mjs";

const Menu = load("lib/Menu.js");
const Rows = load("lib/Rows.js");
const History = load("lib/History.js");
const Prefs = load("lib/Prefs.js");
const Omarchy = load("providers/omarchy.js");
const plain = v => JSON.parse(JSON.stringify(v));

const fixture = name => readFileSync(join(root, "tests/js/fixtures", name), "utf8");
const merged = Menu.merge([Menu.parseItems(fixture("menu.jsonc")), Menu.parseItems(fixture("user-menu.jsonc"))]);
const menu = { items: merged.items, order: merged.order, when: {}, checked: {} };
const omarchyCommands = Omarchy.parse(fixture("omarchy-commands.json"));
const Sources = load("lib/Sources.js");
const keybindings = Sources.keybindings(fixture("keybindings.records"));

// Icons by name from the live icon theme, then its parents and hicolor.
const home = process.env.HOME;
const themeName = (() => { try { return readFileSync(join(home, ".local/state/omarchy/current/theme/icons.theme"), "utf8").trim(); } catch { return ""; } })();
const roots = [themeName, themeName.replace(/-[a-z]+(-dark)?$/, "$1").replace(/-$/, ""), "Yaru", "Adwaita", "hicolor"]
  .filter((v, i, a) => v && a.indexOf(v) === i).map(n => "/usr/share/icons/" + n)
  // Omarchy puts its web apps' icons in the user's hicolor.
  .concat(["/usr/share/pixmaps", join(home, ".local/share/icons/hicolor")]);
const index = new Map();
function walk(dir, depth) {
  let entries;
  try { entries = readdirSync(dir); } catch { return; }
  for (const e of entries) {
    const p = join(dir, e);
    let st; try { st = statSync(p); } catch { continue; }
    if (st.isDirectory()) { if (depth < 4) walk(p, depth + 1); continue; }
    const m = e.match(/^(.*)\.(svg|png)$/);
    if (!m) continue;
    const prev = index.get(m[1]);
    // Scalable or the largest raster wins.
    const score = /scalable/.test(p) ? 1000 : Number((p.match(/\/(\d+)x\d+\//) || [0, 0])[1]);
    if (!prev || score > prev.score) index.set(m[1], { path: p, score });
  }
}
for (const r of roots) if (existsSync(r)) walk(r, 0);
// The fixture's apps are not all installed here; for the picture, an
// installed app of the same kind lends its icon, so a shot shows how a real
// image sits in the tile rather than the fallback glyph.
const STAND_IN = { firefox: "chromium", "brave-browser": "chromium", Alacritty: "foot", code: "omacalc",
                   signal: "localsend", "org.localsend.localsend_app": "localsend", "org.pulseaudio.pavucontrol": "multimedia-volume-control" };
const found = name => (index.get(name) || {}).path || "";
const icon = name => (!name ? "" : name[0] === "/" ? name : found(name) || (STAND_IN[name] ? found(STAND_IN[name]) : ""));

const now = new Date(2026, 8, 23, 14, 0).getTime();
const base = { menu, toggleStates: { bluetooth: { on: true, value: "1" }, "stay-awake": { on: false, value: "0" } }, omarchyCommands, keybindings };

// A home of what was run most: snapshots of real rows.
let history = {};
for (const [q, n] of [["firefox", 12], ["lock", 6], ["screenshot", 4], ["bluetooth", 3]]) {
  const row = Engine.run(q, config, services(base))[0];
  for (let i = 0; i < n; i++) history = History.record(history, row.key, now - i * 3600e3, History.snapshot(row));
}

function scene(name, query, extra, view, cfg) {
  const svc = services(Object.assign({}, base, extra || {}));
  const rows = plain(Engine.run(query, cfg || config, svc)).map(r => Object.assign(r, { image: icon(r.image) }));
  const mode = plain(Engine.mode(query, cfg || config) || null);
  return Object.assign({ name, query, rows, mode, selectedIndex: 0, paletteOpen: false, paletteActions: [], paletteIndex: 0, paletteArmed: "", paletteRow: null, armedKey: "" }, view ? view(rows) : {});
}

const snippets = Object.assign({}, config, { snippets: [
  { keyword: "sig", name: "Signature", text: "Regards,\nGanesh" },
  { keyword: "mt", name: "Meeting", text: 'Meet {argument name="who"} at {argument name="when" default="3pm"}, {date format="EEEE d MMM"}' },
  { keyword: "addr", name: "Office address", text: "12 Example Road\nChennai 600001" },
  { keyword: "cl", name: "Quote the clipboard", text: "> {clipboard}" }
] });
const Dev = load("providers/dev.js");
const ports = Dev.parsePorts([
  'LISTEN 0 511 127.0.0.1:5173 0.0.0.0:* users:(("node",pid=4211,fd=20))',
  'LISTEN 0 2048 127.0.0.1:8000 0.0.0.0:* users:(("gunicorn",pid=5002,fd=5),("gunicorn",pid=5001,fd=5))',
  'LISTEN 0 4096 0.0.0.0:17500 0.0.0.0:* users:(("dropbox",pid=4507,fd=74))',
  'LISTEN 0 4096 127.0.0.53%lo:53 0.0.0.0:*'].join("\n"));

const Filters = load("providers/filters.js");
const withFilter = Object.assign({}, config, { filters: [{ keyword: "n", title: "Notes", icon: "󰎞", command: ["notes"] }] });
const filterOutput = [
  { title: "Meeting notes", subtitle: "Monday, 3 items", id: "meeting", action: { exec: ["notes", "open", "meeting"] },
    preview: "## Meeting notes\n\n- Ship the **filter** contract\n- Review the `nodi` command\n\n![a remote picture](https://x.test/p.png)\n\n```sh\nnodi pick < rows.txt\n```" },
  { title: "Weekly report", subtitle: "Friday", id: "weekly", action: { exec: ["notes", "open", "weekly"] }, preview: "Numbers from the Friday run." }
].map(o => JSON.stringify(o)).join("\n");

const ScriptsProvider = load("providers/scripts.js");
const scriptsDir = join(root, "tests/js/fixtures/scripts");
const listing = ScriptsProvider.provider.sources.scripts.argv(scriptsDir);
const scripts = ScriptsProvider.parseScripts(execFileSync(listing[0], listing.slice(1), { env: { PATH: "/usr/bin:/bin" } }).toString());

// The README's pictures (make docs): apps as Omarchy installs them, their
// entries' own words, rows built by the engine as everywhere else.
const desk = (id, name, generic, comment, icon, exec, actions) => ({ id, name, generic, comment, keywords: [], icon, wmclass: "",
  actions: (actions || []).map((n, i) => ({ index: i, name: n })), exec, terminal: false });
const docsApps = [
  desk("chromium", "Chromium", "Web Browser", "Access the Internet", "chromium", "chromium %U", ["New Window", "New Incognito Window"]),
  desk("Discord", "Discord", "", "Discord", "discord", 'omarchy-launch-webapp "https://discord.com/channels/@me"'),
  desk("1password", "1Password", "", "Password manager and secure wallet", "1password", "1password %U"),
  desk("localsend", "LocalSend", "", "An open source cross-platform alternative to AirDrop", "localsend", "localsend_app"),
  desk("omacalc", "Omacalc", "Calculator", "Dead-simple calculator", "omacalc", "omacalc")
];
const docsBase = Object.assign({}, base, { apps: docsApps, toggleStates: Object.assign({}, base.toggleStates, { wifi: { on: true, value: "1" } }) });
const docsRow = (q, key) => {
  const rows = Engine.run(q, config, services(docsBase));
  const row = rows.find(r => r.key === key);
  if (!row) throw new Error("no row " + key + " for " + q + ": " + rows.map(r => r.key).join(", "));
  return row;
};
let docsHistory = {};
for (const [q, key, n] of [["chromium", "app:chromium", 40], ["discord", "app:Discord", 30], ["1password", "app:1password", 22],
                           ["screenshot", "menu:trigger.capture.screenshot", 15], ["wifi", "toggle:wifi", 10],
                           ["localsend", "app:localsend", 7], ["omacalc", "app:omacalc", 5]]) {
  const row = docsRow(q, key);
  for (let i = 0; i < n; i++) docsHistory = History.record(docsHistory, row.key, now - i * 3600e3, History.snapshot(row));
}

const scenes = [
  scene("01-home", "", { history }),
  scene("02-sum", "2+2"),
  scene("03-currency", "100 usd to eur"),
  scene("04-windows-and-app", "brave", { windows }),
  scene("05-app", "firefox"),
  scene("06-menu", "lock"),
  scene("07-toggle", "bluetooth"),
  scene("08-volume-mode", "vol 60"),
  scene("09-emoji", ":fire"),
  scene("10-help", "?"),
  scene("11-confirm", "shutdown", {}, rows => ({ armedKey: rows[0] ? rows[0].key : "" })),
  scene("12-palette", "firefox", {}, rows => {
    const row = rows[0];
    const actions = plain(Rows.actionsFor(row, { activeWorkspace: 1, knows: () => true, prefs: Prefs.empty() }));
    return { paletteOpen: true, paletteActions: actions, paletteIndex: 1, paletteRow: row };
  }),
  // The chosen action past the fold: clear of the fade, the next one peeking.
  scene("39-palette-deep", "firefox", {}, rows => {
    const row = rows[0];
    const actions = plain(Rows.actionsFor(row, { activeWorkspace: 1, knows: () => true, prefs: Prefs.empty() }));
    return { paletteOpen: true, paletteActions: actions, paletteIndex: 8, paletteRow: row };
  }),
  scene("13-nothing", "zzqx"),
  scene("14-omarchy-catalog", "omarchy "),
  scene("38-long-list-selected", "omarchy ", {}, () => ({ selectedIndex: 8 })),
  scene("15-run", "> htop"),
  scene("16-second-row", "term", {}, () => ({ selectedIndex: 1 })),
  scene("17-keybindings", "keys "),
  scene("19-ask-answer", "ask how do I list open ports", { ask: { phase: "done", question: "how do I list open ports", model: "haiku",
    answer: "Use ss, which ships with iproute2:\n\nss -tulpn\n\n-t and -u are TCP and UDP, -l listening sockets, -p the process holding each, -n numbers instead of names. Run it with sudo to see other users' processes." } },
    rows => ({ answer: "Use ss, which ships with iproute2:\n\nss -tulpn\n\n-t and -u are TCP and UDP, -l listening sockets, -p the process holding each, -n numbers instead of names. Run it with sudo to see other users' processes." })),
  scene("20-snippets", "snip ", { clipboardText: "the build is green" }, null, snippets),
  scene("21-snippet-arguments", "mt Ravi", {}, null, snippets),
  scene("22-ports", "ports", { ports }),
  scene("24-ctrl-numbers", "", { history }, () => ({ ctrlHeld: true })),
  scene("25-no-match", "zzqx", {}, null, Object.assign({}, config, { fallbacks: [] })),
  scene("26-clipboard", "cb ", { clipboard: [
    { type: "text", text: "git log --oneline -20 --graph --decorate\n# then rebase onto main once review lands\ngit rebase -i origin/main" },
    { type: "text", text: "https://github.com/itsgg/omarchy-nodi" } ] }),
  scene("29-file-text", "find report", { found: { q: "report", list: [
    { path: "/home/u/notes/report.md", name: "report.md", dir: false, rank: 0 },
    { path: "/home/u/Documents/report.pdf", name: "report.pdf", dir: false, rank: 0 } ] } },
    () => ({ reads: { "/home/u/notes/report.md": { size: 2381, modified: 1791090000, type: "text/markdown",
      text: "# Weekly report\n\n- Search: the preview pane landed\n- Docs: the README covers it\n\nNumbers below are from the Friday run." } } })),
  scene("28-mixed-list", "find report", { found: { q: "report", list: [
    { path: "/home/u/Documents/report.pdf", name: "report.pdf", dir: false, rank: 0 },
    { path: "/usr/share/omarchy/themes/kanagawa/preview.png", name: "report-cover.png", dir: false, rank: 1 },
    { path: "/home/u/Work/report", name: "report", dir: true, rank: 0 } ] } }),
  scene("27-themes", "theme ", { themes: { current: "Tokyo Night", list: ["Tokyo Night", "Catppuccin Latte", "Rose Pine", "Kanagawa"].map(name => (
    { name, preview: "/usr/share/omarchy/themes/" + name.toLowerCase().replace(/ /g, "-") + "/preview.png" })) } }),
  scene("23-scripts", "scripts ", { scripts, scriptOutput: { [join(scriptsDir, "uptime.sh")]: "up 3 days, 4 hours" } }),
  scene("docs-home", "", Object.assign({}, docsBase, { history: docsHistory })),
  // An undoable action ran a minute ago: its undo is on offer first.
  scene("36-undo-home", "", { history, undo: [{ key: "undo:1", title: "Restore the meeting note",
    run: { kind: "exec", argv: ["my-notes", "restore", "meeting"] }, at: services().now().getTime() - 60000 }] }),
  scene("31-pane-overflow", "cb ", { clipboard: [
    { type: "text", text: Array.from({ length: 40 }, (_, i) => "line " + (i + 1) + " of a long entry, more than the pane shows").join("\n") } ] }),
  scene("32-keys-help", "?shortcuts"),
  scene("30-filter-markdown", "n meet", { filter: () => Filters.parse(filterOutput, { keyword: "n", title: "Notes", icon: "󰎞" }) }, null, withFilter),
  (() => {
    // A row that runs only once a word is typed, its command and risk shown.
    const Run = load("lib/Run.js");
    const wordAsk = { title: "Send the weekly report", word: "send", risk: "Mails the report to 40 people on the team list; it cannot be called back.",
                      run: Run.exec(["mailer", "send", "--list", "team", "reports/weekly 2026-10-04.md"]) };
    return { name: "35-confirm-word", query: "sen", rows: plain(Engine.wordPrompt("sen", wordAsk)), mode: { label: "Confirm", icon: "󰀦" }, wordAsk,
             selectedIndex: 0, paletteOpen: false, paletteActions: [], paletteIndex: 0, paletteArmed: "", paletteRow: null, armedKey: "" };
  })(),
  (() => {
    // An answer a program streams (providers/answers.js), halfway through.
    const withAnswers = Object.assign({}, config, { answers: [{ keyword: "a", title: "Assistant", icon: "󰚩", command: ["my-ask"] }] });
    const said = "The cache is cold after a reboot, so the first open reads every desktop entry.\n\n"
      + "- `nodi` keeps its own cache in `~/.cache/nodi`\n- the second open is **under 100 ms**\n\nTo warm it at login:";
    const answer = { phase: "streaming", keyword: "a", question: "why is the first open slow", text: said, error: "" };
    const rows = plain(Engine.run("a why is the first open slow", withAnswers, services(Object.assign({}, base, { answer }))));
    return { name: "34-answer", query: "a why is the first open slow", rows, mode: plain(Engine.mode("a q", withAnswers)),
             streamed: { question: answer.question, title: "Assistant", text: said },
             selectedIndex: 0, paletteOpen: false, paletteActions: [], paletteIndex: 0, paletteArmed: "", paletteRow: null, armedKey: "" };
  })(),
  (() => {
    // `nodi pick --json`: a program's rows, one with a preview, filtered by
    // what is typed.
    const Pick = load("lib/Pick.js");
    const given = Pick.parse([
      { title: "Ship the filter contract", subtitle: "Today, Nodi", icon: "󰄲", preview: "## Ship the filter contract\n\nThe README section, then the **Akshi** side." },
      { title: "Review the nodi command", subtitle: "Tomorrow", icon: "󰄱" },
      { title: "Shop for the week", subtitle: "Saturday", icon: "󰄱" },
      { title: "Write the release notes", subtitle: "Friday", icon: "󰄱" }
    ].map(o => JSON.stringify(o)).join("\n"), true);
    return { name: "33-pick", query: "s", rows: plain(Pick.rows("s", given)), mode: { label: "Pick", icon: Pick.PROVIDER.icon },
             selectedIndex: 0, paletteOpen: false, paletteActions: [], paletteIndex: 0, paletteArmed: "", paletteRow: null, armedKey: "" };
  })(),
  (() => {
    const firefox = plain(Engine.run("firefox", config, services(base)))[0];
    return { name: "18-alias-prompt", query: "ff", rows: plain(Engine.aliasPrompt("ff", firefox)), mode: { label: "Alias", icon: "󰌌" }, aliasRow: firefox,
             selectedIndex: 0, paletteOpen: false, paletteActions: [], paletteIndex: 0, paletteArmed: "", paletteRow: null, armedKey: "" };
  })()
];

process.stdout.write(".pragma library\n\nvar scenes = " + JSON.stringify(scenes) + "\n");
