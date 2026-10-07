// The live Omarchy theme, resolved the way the shell's Color and Style
// singletons resolve it, written as a QML JavaScript module for the render
// harness's stand-ins (stubs/Color.qml, stubs/Style.qml). Prints Theme.js.

import { readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";

const home = process.env.HOME;
// NODI_THEME_DIR draws the shots in another theme (`make themes`);
// NODI_ROUNDING stands in for Hyprland's decoration:rounding.
const themeDir = process.env.NODI_THEME_DIR || join(home, ".local/state/omarchy/current/theme");
const read = p => (existsSync(p) ? readFileSync(p, "utf8") : "");

// Color.loadColors
function loadColors(raw) {
  const c = { foreground: "#cacccc", background: "#101315", accent: "#cacccc", urgent: "#a55555", muted: "#707880" };
  let foundAccent = false, foundMuted = false, fg = false, bg = false, c0 = "", c4 = "", c7 = "", c8 = "";
  for (const line of raw.split("\n")) {
    const m = line.match(/^\s*([A-Za-z0-9_-]+)\s*=\s*["']?(#[0-9A-Fa-f]{6})/);
    if (!m) continue;
    if (m[1] === "foreground") { c.foreground = m[2]; fg = true; }
    else if (m[1] === "background") { c.background = m[2]; bg = true; }
    else if (m[1] === "accent") { c.accent = m[2]; foundAccent = true; }
    else if (m[1] === "muted") { c.muted = m[2]; foundMuted = true; }
    else if (m[1] === "color0") c0 = m[2];
    else if (m[1] === "color4") c4 = m[2];
    else if (m[1] === "color7") c7 = m[2];
    else if (m[1] === "color8") c8 = m[2];
    else if (m[1] === "red" || m[1] === "color1") c.urgent = m[2];
  }
  if (!bg && c0) c.background = c0;
  if (!fg && c7) c.foreground = c7;
  if (!foundAccent && c4) c.accent = c4;
  if (!foundMuted) c.muted = c8 || c.foreground;
  return c;
}

// Color.parseShell
function parseShell(text) {
  const parsed = {};
  let section = "";
  for (const raw of String(text || "").split("\n")) {
    const line = raw.trim();
    if (!line || line[0] === "#") continue;
    const s = line.match(/^\[([A-Za-z0-9_-]+)\]\s*(#.*)?$/);
    if (s) { section = s[1]; continue; }
    const kv = line.match(/^([A-Za-z0-9_-]+)\s*=\s*["']([^"']+)["']\s*(#.*)?$/)
      || line.match(/^([A-Za-z0-9_-]+)\s*=\s*(-?\d+(?:\.\d+)?)\s*(#.*)?$/)
      || line.match(/^([A-Za-z0-9_-]+)\s*=\s*(-?\d+(?:\.\d+)?(?:\s+-?\d+(?:\.\d+)?){1,3})\s*(#.*)?$/)
      || line.match(/^([A-Za-z0-9_-]+)\s*=\s*([A-Za-z][A-Za-z0-9_-]*)\s*(#.*)?$/);
    if (!kv || !section) continue;
    parsed[section + "." + kv[1]] = kv[2];
  }
  return parsed;
}

const run = (cmd, args) => { try { return execFileSync(cmd, args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); } catch { return ""; } };
const option = name => { try { return JSON.parse(run("hyprctl", ["getoption", name, "-j"]) || "{}"); } catch { return {}; } };

const colors = loadColors(read(join(themeDir, "colors.toml")));
// User keys win, as in the shell.
const shellValues = Object.assign(parseShell(read(join(themeDir, "shell.toml"))), parseShell(read(join(home, ".config/omarchy/shell.toml"))));
// A text size to draw at, as Omarchy's Display panel sets it (item 70).
if (process.env.NODI_BASE_SIZE) shellValues["font.base-size"] = String(process.env.NODI_BASE_SIZE);
const fontFamily = run("fc-match", ["-f", "%{family[0]}", "monospace"]) || "monospace";
const menuFontFamily = process.env.OMARCHY_MENU_FONT || fontFamily;
const rounding = process.env.NODI_ROUNDING !== undefined ? Number(process.env.NODI_ROUNDING) : Number(option("decoration:rounding").int);
const gaps = option("general:gaps_out");
const gapParts = String(gaps.css || "").match(/-?\d+(?:\.\d+)?/g) || [];
const gapNumber = gapParts.length ? Number(gapParts[0]) : Number(gaps.int);

const theme = {
  colors, shellValues, fontFamily, menuFontFamily,
  // Whole, for the sixteen colours a file's coloured lines take (lib/Ansi.js).
  colorsToml: read(join(themeDir, "colors.toml")),
  cornerRadius: Number.isFinite(rounding) && rounding >= 0 ? rounding : 0,
  gapsOut: Number.isFinite(gapNumber) && gapNumber >= 0 ? Math.round(gapNumber / 2) : 5
};
process.stdout.write(".pragma library\n\nvar theme = " + JSON.stringify(theme, null, 2) + "\n");
