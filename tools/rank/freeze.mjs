// Writes the ranking harness's corpus, tests/js/fixtures/rank/corpus.json,
// from what an Omarchy install ships on this machine: the desktop entries
// of Omarchy's own packages (install/omarchy-base.packages) and a few
// widely used apps and web apps, Omarchy's menu, its command list, and the
// keybindings Omarchy's default files declare. Nothing of the user's own:
// no history, picks, clipboard or files, no binding the user added or
// rebound, and nothing naming the home directory or the user. The repo is
// public. Run again after an Omarchy update, then `make rank-update`, and
// read the baseline's diff; then grep the corpus for the user's name.
//   node tools/rank/freeze.mjs

import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { join, basename } from "node:path";
import { execFileSync } from "node:child_process";
import { load, root } from "../../tests/js/load.mjs";

const Menu = load("lib/Menu.js");
const Sources = load("lib/Sources.js");
const Omarchy = load("providers/omarchy.js");
const omarchy = process.env.OMARCHY_PATH || "/usr/share/omarchy";
const sh = script => { try { return execFileSync("/usr/bin/bash", ["-c", script], { timeout: 20000, stdio: ["ignore", "pipe", "ignore"] }).toString(); } catch { return ""; } };

// Apps outside Omarchy's base list that most desktops have, and widely
// used web apps (this machine's own entries, so each URL is cut to its
// site below), so the corpus ranks a full launcher's worth of names.
const ALSO = new Set(["spotify", "nvim", "1password", "dropbox", "org.inkscape.Inkscape", "org.kde.krita", "blender", "audacity",
                      "WhatsApp", "Whatsapp", "YouTube", "X", "Gmail", "Google Calendar", "Discord", "Slack", "Telegram"]);
const base = new Set(readFileSync(join(omarchy, "install/omarchy-base.packages"), "utf8").split("\n").map(l => l.trim().split(/\s+/)[0]).filter(l => l && !l.startsWith("#")));

function entries() {
  const dirs = ["/usr/share/applications", join(process.env.HOME || "", ".local/share/applications")];
  const out = [];
  const seen = new Set();
  for (const dir of dirs) {
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir).sort()) {
      if (!f.endsWith(".desktop")) continue;
      const id = f.replace(/\.desktop$/, "");
      const path = join(dir, f);
      const owner = dir.startsWith("/usr") ? sh("pacman -Qoq -- " + JSON.stringify(path)).trim() : "";
      if (!base.has(owner) && !ALSO.has(id)) continue;
      if (seen.has(id)) continue;
      const text = readFileSync(path, "utf8");
      const main = (text.split(/^\[Desktop Entry\]\s*$/m)[1] || "").split(/^\[/m)[0];
      const get = k => ((main.match(new RegExp("^" + k + "=(.*)$", "m")) || [])[1] || "").trim();
      if (/^true$/i.test(get("NoDisplay")) || /^true$/i.test(get("Hidden"))) continue;
      seen.add(id);
      const actions = get("Actions").split(";").filter(Boolean).map((a, i) => {
        const m = text.match(new RegExp("\\[Desktop Action " + a.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\][^\\[]*?^Name=(.*)$", "m"));
        return { index: i, name: m ? m[1] : a };
      });
      // exec and terminal as the bar reads them: a row says "Web app" or
      // "Terminal app" from them (providers/apps.js about). A URL is cut to
      // its site, all the bar reads of it: the user's web apps keep a
      // workspace's own address there (Fable 2026-10-05 found a Slack id).
      const exec = get("Exec").replace(/(https?:\/\/[^\/\s"']+)[^\s"']*/g, "$1/");
      out.push({ id, name: get("Name") || id, generic: get("GenericName"), comment: get("Comment"),
                 keywords: get("Keywords").split(";").filter(Boolean), icon: get("Icon"), wmclass: get("StartupWMClass"), actions,
                 exec, terminal: /^true$/i.test(get("Terminal")) });
    }
  }
  return out.sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

const menuText = readFileSync(join(omarchy, "default/omarchy/omarchy-menu.jsonc"), "utf8");
const merged = Menu.merge([Menu.parseItems(menuText)]);
const omarchyCommands = Omarchy.parse(sh("omarchy commands --json"));
// The live records (what `hyprctl binds` gives, as Omarchy keeps them)
// carry the user's own bindings among Omarchy's, so a record is kept only
// when Omarchy's default binding files declare its chord with its
// description, the user's own Hyprland files do not bind that chord again,
// and nothing in it names the home directory or the user (a rebound
// default keeps its words and runs the user's program; Fable 2026-10-05
// found a handler under the home directory and a bot's handle this way).
const chordKey = c => String(c).toUpperCase().split(/[\s+]+/).filter(Boolean).sort().join(" ");
const declared = (dir, re) => { const out = []; if (!existsSync(dir)) return out;
  for (const f of readdirSync(dir)) if (f.endsWith(".lua")) for (const m of readFileSync(join(dir, f), "utf8").matchAll(re)) out.push(m); return out; };
const defaults = new Set(declared(join(omarchy, "default/hypr/bindings"), /o\.bind(?:_toggle)?\(\s*"([^"]+)",\s*"([^"]+)"/g).map(m => chordKey(m[1]) + "\t" + m[2]));
const rebound = new Set(declared(join(process.env.HOME || "", ".config/hypr"), /bind\("([^"]+)"/g).map(m => chordKey(m[1])));
const home = process.env.HOME || "/nonexistent", user = process.env.USER || "";
const mine = t => t.indexOf(home) !== -1 || (user && new RegExp("\\b" + user + "\\b|@" + user + "_", "i").test(t));
const keybindings = Sources.keybindings(sh('f=$(ls -t "${XDG_CACHE_HOME:-$HOME/.cache}/omarchy"/keybindings-*.records 2>/dev/null | head -1); [ -n "$f" ] && cat -- "$f"'))
  .filter(b => defaults.has(chordKey(b.chord) + "\t" + b.description) && !rebound.has(chordKey(b.chord)) && !mine(JSON.stringify(b)));
if (!omarchyCommands.length || !keybindings.length) { console.error("freeze: Omarchy's commands or keybindings could not be read"); process.exit(1); }

// Windows a desktop might hold, accented and Tamil titles among them, so
// the harness sees what matching does with each script. Focus 0 is the
// window the bar opened over, which it never lists.
const windows = [
  { address: "0xa0", cls: "foot", title: "~", workspace: "1", focus: 0 },
  { address: "0xa1", cls: "chromium", title: "Inbox - Chromium", workspace: "1", focus: 9 },
  { address: "0xa2", cls: "chromium", title: "Beyoncé - CUFF IT - YouTube - Chromium", workspace: "2", focus: 1 },
  { address: "0xa3", cls: "chromium", title: "Pokémon Database - Chromium", workspace: "2", focus: 2 },
  { address: "0xa4", cls: "org.gnome.Evince", title: "Résumé 2026.pdf", workspace: "3", focus: 3 },
  { address: "0xa5", cls: "chromium", title: "தமிழ் விக்கிப்பீடியா - Chromium", workspace: "4", focus: 4 },
  { address: "0xa6", cls: "org.gnome.Nautilus", title: "Downloads", workspace: "5", focus: 5 },
  { address: "0xa7", cls: "foot", title: "~/code/project", workspace: "6", focus: 6 },
  { address: "0xa8", cls: "obsidian", title: "Weekly review - Obsidian", workspace: "7", focus: 7 },
  { address: "0xa9", cls: "chromium", title: "Москва - Википедия - Chromium", workspace: "8", focus: 8 }
];

// Whatever else came from this machine is checked the same way.
for (const a of entries()) if (mine(JSON.stringify(a))) { console.error("freeze: " + a.id + " names the user; leave it out"); process.exit(1); }

const corpus = {
  note: "Frozen by tools/rank/freeze.mjs from Omarchy's shipped data; see that file.",
  apps: entries(),
  menu: { items: merged.items, order: merged.order },
  omarchyCommands, keybindings, windows
};
const out = join(root, "tests/js/fixtures/rank/corpus.json");
writeFileSync(out, JSON.stringify(corpus, null, 1) + "\n");
console.log(`freeze: ${corpus.apps.length} apps, ${corpus.menu.order.length} menu rows, ${omarchyCommands.length} commands, ${keybindings.length} keybindings, ${windows.length} windows in ${basename(out)}`);
