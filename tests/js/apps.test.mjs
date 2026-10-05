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
