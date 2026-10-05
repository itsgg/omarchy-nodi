// The data the bench searches, at the sizes a full machine gives Nodi: the
// emoji list, Omarchy's menu, command list and keybindings, and the desktop
// entries, as this machine has them (the test fixtures where it does not),
// and made-up history, clipboard and recent files at their caps (nothing of
// the user's own).
// Prints JSON for engine.mjs and Bench.qml.

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { load, root } from "../../tests/js/load.mjs";
import { config, rates, zones, emojis, windows } from "../../tests/js/fixtures.mjs";

const Menu = load("lib/Menu.js");
const Sources = load("lib/Sources.js");
const Omarchy = load("providers/omarchy.js");
const fixture = name => readFileSync(join(root, "tests/js/fixtures", name), "utf8");
const omarchy = process.env.OMARCHY_PATH || "/usr/share/omarchy";

// Desktop entries as Nodi's rebuildApps keeps them.
function desktopApps() {
  const dirs = ["/usr/share/applications", join(process.env.HOME || "", ".local/share/applications")];
  const out = [];
  for (const dir of dirs) {
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir)) {
      if (!f.endsWith(".desktop")) continue;
      let text; try { text = readFileSync(join(dir, f), "utf8"); } catch { continue; }
      const main = (text.split(/^\[Desktop Entry\]\s*$/m)[1] || "").split(/^\[/m)[0];
      const get = k => ((main.match(new RegExp("^" + k + "=(.*)$", "m")) || [])[1] || "").trim();
      if (/^true$/i.test(get("NoDisplay"))) continue;
      const actions = get("Actions").split(";").filter(Boolean).map((a, i) => {
        const m = text.match(new RegExp("\\[Desktop Action " + a + "\\][^\\[]*?^Name=(.*)$", "m"));
        return { index: i, name: m ? m[1] : a };
      });
      out.push({ id: f.replace(/\.desktop$/, ""), name: get("Name") || f, generic: get("GenericName"), comment: get("Comment"),
                 keywords: get("Keywords").split(";").filter(Boolean), icon: get("Icon"), wmclass: get("StartupWMClass"), actions,
                 exec: get("Exec"), terminal: /^true$/i.test(get("Terminal")) });
    }
  }
  return out;
}

const menuFile = join(omarchy, "default/omarchy/omarchy-menu.jsonc");
const merged = Menu.merge([Menu.parseItems(existsSync(menuFile) ? readFileSync(menuFile, "utf8") : fixture("menu.jsonc"))]);
const menu = { items: merged.items, order: merged.order, when: {}, checked: {} };

// Omarchy's own lists, read the way providers/omarchy.js and keys.js read them.
function live(script) {
  try { return execFileSync("/usr/bin/bash", ["-c", script], { timeout: 15000, stdio: ["ignore", "pipe", "ignore"] }).toString(); } catch { return ""; }
}
const commandsText = live("omarchy commands --json");
let omarchyCommands = commandsText ? Omarchy.parse(commandsText) : [];
if (!omarchyCommands.length) omarchyCommands = Omarchy.parse(fixture("omarchy-commands.json"));
let keybindings = Sources.keybindings(live('f=$(ls -t "${XDG_CACHE_HOME:-$HOME/.cache}/omarchy"/keybindings-*.records 2>/dev/null | head -1); [ -n "$f" ] && cat -- "$f"'));
if (!keybindings.length) keybindings = Sources.keybindings(fixture("keybindings.records"));

const now = new Date(2026, 8, 23, 14, 0).getTime();
const apps = desktopApps();
// 300 rows run before, the apps among them; 200 clipboard entries; 500 recent files.
const history = {};
for (let i = 0; i < 300; i++) {
  const key = i < apps.length ? "app:" + apps[i].id : "menu:item-" + i;
  history[key] = { n: 1 + (i * 7) % 40, t: now - i * 3600e3 };
}
const words = "build deploy release notes meeting agenda invoice draft review config server branch merge report budget".split(" ");
// One entry in five, and four windows, in text past ASCII, so the bench
// measures the fold where it calls normalize.
const wide = ["Résumé für Müller, café", "தமிழ் விக்கிப்பீடியா", "Москва, Википедия", "Beyoncé - CUFF IT"];
const clipboard = Array.from({ length: 200 }, (_, i) => ({ type: "text", text: words[i % words.length] + " " + words[(i * 3) % words.length] + " line " + i
  + (i % 5 === 0 ? " " + wide[i % wide.length] : "") + "\nsecond line of entry " + i }));
const allWindows = windows.concat(wide.map((title, i) => ({ address: "0xe" + i, cls: "chromium", title: title + " - Chromium", workspace: String(i + 1), focus: 10 + i })));
const files = Array.from({ length: 500 }, (_, i) => ({ path: "/home/u/" + ["Documents", "Work", "Downloads", "notes"][i % 4] + "/" + words[i % words.length] + "-" + i + [".md", ".pdf", ".png", ".txt"][i % 4],
                                                        name: words[i % words.length] + "-" + i + [".md", ".pdf", ".png", ".txt"][i % 4], at: now - i * 60e3 }));

process.stdout.write(JSON.stringify({
  config, rates, zones, emojis, windows: allWindows, apps, history, menu, clipboard, files,
  omarchyCommands, keybindings,
  now
}));
