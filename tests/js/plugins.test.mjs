// Other plugins' panels, overlays and menus as rows (ROADMAP 58):
// providers/plugins.js over the shell's own list.
import { test } from "node:test";
import assert from "node:assert/strict";
import { load, plain } from "./load.mjs";
import { run } from "./fixtures.mjs";

const P = load("providers/plugins.js");
const listed = JSON.stringify([
  { id: "omarchy.clipboard", name: "Clipboard", kinds: ["overlay"], enabled: true, firstParty: true },
  { id: "omarchy.speedtest", name: "Speed test", kinds: ["panel"], enabled: true, firstParty: true },
  { id: "io.github.someone.weather-radar", name: "Weather radar", kinds: ["panel", "bar-widget"], enabled: true, firstParty: false },
  { id: "io.github.someone.pomodoro", name: "Pomodoro", kinds: ["overlay"], enabled: false, firstParty: false },
  { id: "io.github.someone.cpu", name: "CPU", kinds: ["bar-widget"], enabled: true, firstParty: false },
  { id: "io.github.itsgg.nodi", name: "Nodi", kinds: ["overlay"], enabled: true, firstParty: false },
  { id: "-bad", name: "Bad", kinds: ["menu"], enabled: true, firstParty: false },
  { id: "io.github.someone.weather-radar", name: "Weather radar again", kinds: ["panel"], enabled: true, firstParty: false },
  { id: "gg.clipboard", name: "Clipboard", kinds: ["overlay"], enabled: true, firstParty: false, clonedFrom: "omarchy.clipboard" }
]);

test("the shell's list: someone else's plugins that open, enabled", () => {
  assert.deepEqual(plain(P.parse(listed)), [
    { id: "io.github.someone.weather-radar", name: "Weather radar", kinds: ["panel"] },
    { id: "io.github.itsgg.nodi", name: "Nodi", kinds: ["overlay"] }]);
  assert.equal(P.parse("not json"), null);
  assert.equal(P.parse("{}"), null);
  assert.throws(() => P.provider.sources.plugins.parse("", false));
});

test("a plugin by its name opens through the shell, Nodi itself never", () => {
  const plugins = P.parse(listed);
  const extra = { plugins, pluginId: "io.github.itsgg.nodi" };
  const row = run("radar", extra).find(r => r.provider === "plugins");
  assert.deepEqual([row.title, row.key, row.subtitle], ["Weather radar", "plugin:io.github.someone.weather-radar", "Plugin panel, io.github.someone.weather-radar"]);
  assert.deepEqual(plain(row.run), { kind: "summon", id: "io.github.someone.weather-radar", payload: {} });
  assert.ok(!run("nodi", extra).some(r => r.provider === "plugins"), "not itself");
  assert.ok(!run("w", extra).some(r => r.provider === "plugins"), "one letter: none");
  assert.deepEqual(plain(run("plugin", extra).filter(r => r.provider === "plugins").map(r => r.title)), ["Weather radar"], "by the word plugin");
  const asked = [];
  run("radar", { asked });
  assert.ok(asked.includes("plugins"), "the list is asked for");
});

test("the shell's list that did not come, or did not read, is no list", () => {
  const parse = P.provider.sources.plugins.parse;
  assert.throws(() => parse("", false), /did not list its plugins/);
  assert.throws(() => parse("not json", true), /did not read/);
  assert.ok(Array.isArray(parse(listed, true)));
});
