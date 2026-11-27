// providers/time.js: zones as tzdata has them, and date maths.

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { load, plain } from "./load.mjs";
import { Engine, Jsonc, config, services } from "./fixtures.mjs";

const Sources = load("lib/Sources.js");

const timeRows = (q, extra, cfg) => Engine.run(q, cfg || config, services(extra)).filter(r => r.provider === "time");

test("zones: one tzdata has no file for is left out, never read as UTC", { skip: !existsSync("/usr/share/zoneinfo/Asia/Kolkata") }, () => {
  const argv = Sources.zonesArgv(["Asia/Kolkata", "Asia/Calcuta", "../../../etc/passwd", "/usr/share/zoneinfo/UTC", "Asia", "UTC"]);
  const out = execFileSync(argv[0], argv.slice(1), { env: { PATH: "/usr/bin:/bin" } }).toString();
  const z = plain(Sources.zones(out));
  assert.deepEqual(z.zones["Asia/Kolkata"], { offset: 330, abbr: "IST" });
  assert.ok(z.zones.UTC);
  for (const bad of ["Asia/Calcuta", "../../../etc/passwd", "/usr/share/zoneinfo/UTC", "Asia"]) assert.equal(z.zones[bad], undefined, bad);
});

test("zones: a configured zone the read left out is named unknown, not looked up forever", () => {
  const cfg = Jsonc.merge(config, { time: { zones: ["UTC", "Asia/Calcuta"] } });
  const rows = timeRows("time", {}, cfg);
  assert.ok(rows.some(r => /Colombo/.test(r.title)), "the known ones still show");
  assert.ok(rows.some(r => r.title === "Unknown time zone: Asia/Calcuta"), JSON.stringify(rows.map(r => r.title)));
  const home = Jsonc.merge(config, { time: { home: "Asia/Colmbo" } });
  assert.equal(timeRows("3pm to tokyo", {}, home)[0].title, "Unknown time zone: Asia/Colmbo");
  assert.equal(timeRows("3pm to tokyo", { zones: {} }, home)[0].title, "Looking up time zones...", "before the read lands");
});
