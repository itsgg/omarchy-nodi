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

const at = iso => ({ now: () => new Date(iso) });
const top = (q, iso, cfg) => timeRows(q, iso ? at(iso) : {}, cfg)[0];

test("dates: a weekday ending a range falls on or after its start", () => {
  // Wednesday 23 September 2026.
  assert.equal(top("monday to friday").subtitle, "Mon, 28 Sep 2026 to Fri, 2 Oct 2026");
  assert.equal(top("friday to monday").subtitle, "Fri, 25 Sep 2026 to Mon, 28 Sep 2026");
  assert.equal(top("friday to friday").subtitle, "Fri, 25 Sep 2026 to Fri, 2 Oct 2026");
  assert.equal(top("dec 25 to friday").subtitle, "Fri, 25 Dec 2026 to Fri, 25 Dec 2026");
  assert.equal(top("2026-10-01 to 2026-10-05").title, "4 days", "dates with years as given");
});

test("dates: a month or a year on keeps to the end of a shorter month", () => {
  assert.equal(top("jan 31 + 1 month", "2026-01-10T10:00").title, "Sat, 28 Feb 2026");
  assert.equal(top("2024-01-31 + 1 month").title, "Thu, 29 Feb 2024");
  assert.equal(top("2024-02-29 + 1 year").title, "Fri, 28 Feb 2025");
  assert.equal(top("2024-03-31 - 1 month").title, "Thu, 29 Feb 2024");
  assert.equal(top("2026-01-15 + 13 months").title, "Mon, 15 Feb 2027");
  assert.ok(!timeRows("today + 99999999999 months").some(r => /NaN/.test(r.title)));
});

test("dates: today is time.home's today when it is set", () => {
  // 23:00 UTC on 23 September: already the 24th in Tokyo.
  const utc = "2026-09-23T23:00:00Z";
  const tokyo = Jsonc.merge(config, { time: { home: "Asia/Tokyo" } });
  assert.equal(top("today", utc, tokyo).title, "Thu, 24 Sep 2026");
  assert.equal(top("tomorrow", utc, tokyo).title, "Fri, 25 Sep 2026");
  const ny = Jsonc.merge(config, { time: { home: "America/New_York" } });
  assert.equal(top("today", utc, ny).title, "Wed, 23 Sep 2026");
});

test("times: minutes and hours from now give the time, and the date past midnight", () => {
  // 14:00 in Colombo, the fixture's time.home.
  const two = "2026-09-23T08:30:00Z";
  for (const [q, title, sub] of [["in 30 min", "14:30", "in 30 minutes"], ["in 2 hours", "16:00", "in 2 hours"],
    ["now + 90 minutes", "15:30", "in 1h 30m"], ["in 1 hr", "15:00", "in 1 hour"], ["in 45 mins", "14:45", "in 45 minutes"],
    ["3 hours ago", "11:00", "3 hours ago"], ["now - 15 minute", "13:45", "15 minutes ago"], ["2h from now", "16:00", "in 2 hours"],
    ["in 11 hours", "01:00, Thu, 24 Sep 2026", "in 11 hours"]]) {
    const r = top(q, two);
    assert.equal(r && r.title, title, q);
    assert.equal(r.subtitle, sub, q);
  }
  assert.equal(top("in 2 m", two).title, "Mon, 23 Nov 2026", "m is still months");
  assert.equal(top("in 2 m", two).provider, "time");
});
