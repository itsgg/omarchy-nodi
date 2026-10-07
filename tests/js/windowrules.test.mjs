// Window rules from Ctrl+K on a window (ROADMAP 79). The Lua Nodi hands
// Hyprland is run in Lua itself, against a stand-in for hl.window_rule
// written from Hyprland 0.56.2's own (LuaBindingsConfigRules.cpp,
// LuaWindowRule.cpp, ConfigManager.cpp): a name given again finds its rule
// and adds the matches and effects once more; set_enabled and is_enabled
// on the object it gives back; a config reload drops every rule, and an
// object then answers nil.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { load, plain } from "./load.mjs";
import { run, windows } from "./fixtures.mjs";

const W = load("lib/WindowRules.js");
const P = load("lib/Prefs.js");
const Rows = load("lib/Rows.js");
const Sources = load("lib/Sources.js");

const HL = `
local named, all = {}, {}
hl = { window_rule = function(t)
  local r = t.name and named[t.name]
  if not r then
    r = { name = t.name, effects = {}, matches = {}, alive = true }
    if t.name then named[t.name] = r end
    table.insert(all, r)
  end
  if t.enabled == nil then r.enabled = true else r.enabled = t.enabled end
  for k, v in pairs(t) do
    if k == "match" then for mk, mv in pairs(v) do table.insert(r.matches, mk .. "=" .. mv) end
    elseif k ~= "name" and k ~= "enabled" then table.insert(r.effects, k .. "=" .. tostring(v)) end
  end
  local o = {}
  function o:set_enabled(b) calls = calls + 1; if r.alive then r.enabled = b end end
  function o:is_enabled() if not r.alive then return nil end return r.enabled end
  return o
end }
-- A reload clears every rule, then makes the Lua state anew.
function reload() for _, r in ipairs(all) do r.alive = false end named, all = {}, {}; nodi_rules = nil end
-- Rules gone while the table stayed: each object answers nil.
function drop() for _, r in ipairs(all) do r.alive = false end named, all = {}, {} end
calls = 0
function dump(label)
  local out = {}
  for _, r in ipairs(all) do table.insert(out, r.name .. (r.enabled and " on " or " off ") .. table.concat(r.matches, ",") .. " " .. table.concat(r.effects, ",")) end
  table.sort(out)
  print(label .. "\\t" .. table.concat(out, "|") .. "|calls=" .. calls)
end
`;

const LUA = ["lua5.4", "lua"].find(b => { try { execFileSync(b, ["-v"], { stdio: "ignore" }); return true; } catch { return false; } });

// Each step either hands over a set of rules (as Nodi.qml applyRules) or
// reloads Hyprland's config; what Hyprland holds after each, by label.
function hyprland(steps) {
  const dir = mkdtempSync(join(tmpdir(), "nodi-rules-"));
  try {
    const body = steps.map(([label, rules]) => (rules === "reload" ? "reload()" : rules === "drop" ? "drop()" : "do\n" + W.lua(rules) + "\nend") + "\ndump(" + JSON.stringify(label) + ")").join("\n");
    writeFileSync(join(dir, "t.lua"), HL + body + "\n");
    const out = {};
    const calls = {};
    Object.defineProperty(out, "calls", { value: calls });
    for (const line of execFileSync(LUA, [join(dir, "t.lua")]).toString().trim().split("\n")) {
      const [k, v] = line.split("\t");
      const parts = v.split("|");
      out[k] = parts.filter(x => !x.startsWith("calls=") && x !== "");
      calls[k] = Number(parts.find(x => x.startsWith("calls=")).slice(6));
    }
    return out;
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

test("Hyprland ends holding exactly the rules kept, however often they are handed over", () => {
  assert.ok(LUA, "a Lua interpreter (lua5.4 or lua) to run the rules in");
  const ff = ws => ({ firefox: { app: "Firefox", workspace: ws, float: false } });
  const fl = { firefox: { app: "Firefox", workspace: "2", float: true } };
  const got = hyprland([
    ["once", ff("2")], ["twice", ff("2")], ["moved", ff("5")], ["back", ff("2")],
    ["float", fl], ["unfloat", ff("2")], ["refloat", fl],
    ["none", {}], ["reload", "reload"], ["after", ff("2")], ["again", ff("2")], ["drop", "drop"], ["kept", ff("2")]
  ]);
  const ws = n => "nodi:ws:" + n + ":firefox";
  const rule = (name, on, effect) => name + (on ? " on " : " off ") + "class=^(firefox)$ " + effect;
  assert.deepEqual(got.once, [rule(ws(2), true, "workspace=2")]);
  assert.deepEqual(got.twice, [rule(ws(2), true, "workspace=2")], "handed over again: one rule, one effect");
  assert.deepEqual(got.moved, [rule(ws(2), false, "workspace=2"), rule(ws(5), true, "workspace=5")]);
  assert.deepEqual(got.back, [rule(ws(2), true, "workspace=2"), rule(ws(5), false, "workspace=5")], "back on, its effect not doubled");
  assert.deepEqual(got.refloat, [rule("nodi:float:firefox", true, "float=true"), rule(ws(2), true, "workspace=2"), rule(ws(5), false, "workspace=5")],
                   "floated, unfloated and floated again: one rule");
  assert.deepEqual(got.none.filter(r => / on /.test(r)), [], "taken out of prefs: every rule of Nodi's off");
  assert.deepEqual(got.reload, [], "a reload drops them all");
  assert.deepEqual(got.after, [rule(ws(2), true, "workspace=2")], "and the next handover makes them again");
  assert.equal(got.calls.again, got.calls.after, "a rule already on is not turned on again: Hyprland weighs every rule at each");
  assert.deepEqual(got.kept, [rule(ws(2), true, "workspace=2")], "rules gone while the table stayed: made again, once");
});

test("two classes never share a rule, and the class is matched whole and as written", () => {
  assert.ok(LUA, "a Lua interpreter (lua5.4 or lua) to run the rules in");
  // These two named one rule while names were a 32-bit hash (Cursor 2026-10-07).
  const got = hyprland([["two", { "nodi-collision-5189": { float: true }, "nodi-collision-56352": { float: true } }],
                        ["one", { "nodi-collision-5189": { float: true } }],
                        ["odd", { 'a"b\\c(d)': { workspace: "3" } }]]);
  assert.equal(got.two.length, 2);
  assert.deepEqual(got.one.map(r => r.split(" ").slice(0, 2).join(" ")), ["nodi:float:nodi-collision-5189 on", "nodi:float:nodi-collision-56352 off"]);
  assert.deepEqual(got.odd.filter(r => / on /.test(r)), ['nodi:ws:3:a"b\\c(d) on class=^(a"b\\\\c\\(d\\))$ workspace=3']);
  assert.ok(new RegExp(W.classPattern('a"b\\c(d)')).test('a"b\\c(d)') && !new RegExp(W.classPattern("a.b")).test("axb"));
});

test("the Lua fits in hyprctl's one argument: a rule past it is refused, or left out when read", () => {
  let p = P.empty();
  const long = i => "c".repeat(190) + "-" + i;
  let refused = 0;
  for (let i = 0; i < 50; i++) { const next = P.withRule(p, long(i), "App", { workspace: "2", float: true }); if (next) p = next; else refused++; }
  assert.ok(refused > 0 && W.fits(p.rules), "the budget stops it short of 50 such rules");
  const many = {};
  for (let i = 0; i < 50; i++) many[long(i)] = { workspace: "2", float: true };
  const read = P.load(JSON.stringify({ rules: many }));
  assert.ok(W.fits(read.rules) && Object.keys(read.rules).length < 50, "read back, the same");
  assert.ok(Buffer.byteLength(W.lua(read.rules)) <= W.BUDGET);
});

test("prefs keep rules by class, and read back only what could be one", () => {
  let p = P.withRule(P.empty(), "firefox", "Firefox", { workspace: "2" });
  p = P.withRule(p, "firefox", "Firefox", { float: true });
  assert.deepEqual(plain(p.rules.firefox), { app: "Firefox", workspace: "2", float: true });
  p = P.withRule(p, "firefox", "Firefox", { workspace: "" });
  assert.deepEqual(plain(p.rules.firefox), { app: "Firefox", workspace: "", float: true });
  assert.equal(P.withRule(p, "firefox", "Firefox", { float: false }).rules.firefox, undefined, "nothing left: no rule");
  assert.equal(P.withRule(p, "firefox", "", { workspace: "special:magic" }), null, "a numbered workspace only");
  assert.equal(P.withRule(p, "bad\nclass", "", { float: true }), null);
  const back = P.load(P.serialize(p));
  assert.deepEqual(plain(back.rules), plain(p.rules));
  const hostile = P.load('{"rules": {"ok": {"workspace": "4"}, "x\\u0007": {"float": true}, "none": {}, "ws": {"workspace": "0"}, '
                         + '"fl": {"float": "yes"}, "__proto__": {"float": true}}}');
  assert.deepEqual(Object.keys(hostile.rules).sort(), ["__proto__", "ok"]);
  assert.equal(Object.getPrototypeOf(hostile.rules), null, "a class named __proto__ is just a class");
  const many = {};
  for (let i = 0; i < 80; i++) many["c" + i] = { float: true };
  assert.equal(Object.keys(P.load(JSON.stringify({ rules: many })).rules).length, W.MAX);
});

test("Ctrl+K on a window: its app's rules to set or take back, on a numbered workspace only", () => {
  const row = run("w ", { windows }).find(r => r.run && r.run.address === "0xb1");
  assert.deepEqual(plain(row.data.window), { cls: "brave-browser", workspace: "1", app: "Brave" });
  const labels = (r, prefs) => plain(Rows.actionsFor(r, { prefs }).filter(a => a.nodi === "windowRule").map(a => a.label));
  assert.deepEqual(labels(row, P.empty()), ["Always open Brave on workspace 1", "Always float Brave"]);
  const set = P.withRule(P.withRule(P.empty(), "brave-browser", "Brave", { workspace: "1" }), "brave-browser", "Brave", { float: true });
  assert.deepEqual(labels(row, set), ["Stop opening Brave on workspace 1", "Stop floating Brave"]);
  const elsewhere = P.withRule(P.empty(), "brave-browser", "Brave", { workspace: "9" });
  assert.deepEqual(labels(row, elsewhere), ["Stop opening Brave on workspace 9", "Always open Brave on workspace 1", "Always float Brave"]);
  const scratch = run("w ", { windows }).find(r => r.data && r.data.window.cls === "com.mitchellh.ghostty");
  assert.deepEqual(labels(scratch, P.empty()), ["Always float Ghostty"], "a special workspace is no place to always open on");
  // A named workspace called "2" is not workspace 2 (Cursor 2026-10-07).
  const named = Sources.windowsFrom([{ address: "0xe1", class: "zed", title: "Zed", mapped: true, workspace: { id: -1337, name: "2" }, focusHistoryID: 1 }], null).list;
  const zed = run("w ", { windows: named }).find(r => r.data && r.data.window.cls === "zed");
  assert.equal(plain(zed.data.window.workspace), "");
  assert.ok(labels(zed, P.empty()).every(l => !/^Always open/.test(l)));
  assert.ok(Rows.actionsFor(row, { prefs: P.empty() }).filter(a => a.nodi === "windowRule").every(a => a.group === "Manage"));
});

test("?mine lists each rule by app, Enter taking it back", () => {
  let prefs = P.withRule(P.empty(), "org.gnome.Calculator", "Calculator", { float: true });
  prefs = P.withRule(prefs, "brave-browser", "Brave", { workspace: "2" });
  prefs = P.withRule(prefs, "brave-browser", "Brave", { float: true });
  const rows = run("?mine", { prefs }).filter(r => r.group === "Window rules");
  assert.deepEqual(plain(rows.map(r => [r.title, r.subtitle, r.nodi, r.actionLabel])),
    [["Brave", "Opens on workspace 2, floats; brave-browser", "windowRule", "Remove"],
     ["Calculator", "Floats; org.gnome.Calculator", "windowRule", "Remove"]]);
  assert.deepEqual(plain(rows[0].data), { window: { cls: "brave-browser", app: "Brave" }, change: { workspace: "", float: false } });
  // Enter's change, as Nodi.qml setWindowRule makes it, leaves no rule.
  const gone = P.withRule(prefs, rows[0].data.window.cls, rows[0].data.window.app, rows[0].data.change);
  assert.equal(gone.rules["brave-browser"], undefined);
  assert.match(plain(run("?", { prefs }).find(r => r.title === "Yours").subtitle), /2 window rules/);
});
