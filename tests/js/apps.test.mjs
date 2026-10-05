// What an app is matched by beyond its name (providers/apps.js): what its
// row says under the name, and its entry's comment (ROADMAP 35).

import { test } from "node:test";
import assert from "node:assert/strict";
import { load, plain } from "./load.mjs";
import { run } from "./fixtures.mjs";

const Apps = load("providers/apps.js");

const app = (id, name, generic, comment, exec) => ({ id, name, generic: generic || "", comment: comment || "", keywords: [], icon: id, wmclass: "", actions: [], exec: exec || "" });
const apps = [
  app("org.gnome.Nautilus", "Files", "", "Access and organize files"),
  app("xournalpp", "Xournal++", "Note-taking application", "Take handwritten notes"),
  app("Whatsapp", "Whatsapp", "", "Whatsapp", "omarchy-launch-webapp https://web.whatsapp.com/"),
  app("mystery", "Mystery", "", "")
];

test("an app is found by the words its row shows and by its comment", () => {
  const top = q => { const r = run(q, { apps, history: {} })[0]; return r ? r.key : ""; };
  assert.equal(top("organize files"), "app:org.gnome.Nautilus", "the row's own words");
  assert.equal(top("handwritten notes"), "app:xournalpp", "the comment, where the row shows the generic name");
  assert.equal(top("messages"), "app:Whatsapp", "what the row says of a web app (\"Messages and calls, web.whatsapp.com\")");
});

test("a row that says nothing of its app gives no words to match", () => {
  assert.equal(Apps.describedAs(apps[3], {}), "", "not \"Application\"");
  assert.equal(Apps.describedAs(apps[2], { Whatsapp: "Messages and calls" }).indexOf("Whatsapp"), -1, "a comment that repeats the name adds nothing");
  assert.ok(/Messages and calls/.test(Apps.describedAs(apps[2], { Whatsapp: "Messages and calls" })), "a written description counts");
});

test("a verb in front of a name finds the app, unless an app is named with the verb (ROADMAP 41)", () => {
  const verbs = [app("spotify", "Spotify"), app("obs", "Open Broadcaster")];
  const top = q => { const r = run(q, { apps: verbs, history: {} })[0]; return r ? r.key : ""; };
  assert.equal(top("open spotify"), "app:spotify");
  assert.equal(top("launch spotify"), "app:spotify");
  assert.equal(top("open broadcaster"), "app:obs", "the whole query names it: nothing dropped");
  assert.notEqual(top("open"), "app:spotify", "a verb alone is no name");
  const described = [app("obs", "OBS Studio", "", "Free and Open Source Streaming Software")];
  assert.equal(run("open obs", { apps: described, history: {} })[0].tier, "prefix", "a verb in a description is still dropped (Fable 2026-10-05)");
  const Rows = load("lib/Rows.js");
  const memory = { history: {}, picks: {}, query: "start obs", now: 0 };
  const fitted = r => Rows.normalize(Object.assign({ title: "OBS Studio", tier: "prefix", kind: "app", run: { kind: "app", id: "obs" } }, r), { id: "apps", name: "Apps" }, 0, 0, memory).score;
  assert.ok(fitted({ fitQuery: "obs" }) > fitted({}), "fit judges the name without the verb (Fable 2026-10-05)");
  assert.ok(run("start obs", { apps: [app("obs", "OBS Studio")], history: {} })[0].score > 74, "the provider passes it");
});
