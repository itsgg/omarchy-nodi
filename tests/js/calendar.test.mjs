// Calendar from an iCal address (ROADMAP 67): lib/ics.py on feeds written
// here, and providers/calendar.js on what it gives.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { load, root, plain } from "./load.mjs";
import { Engine, Jsonc, config, services, now } from "./fixtures.mjs";

const C = load("providers/calendar.js");
const HELPER = join(root, "lib/ics.py");
const FEED = "https://calendar.google.com/calendar/ical/me%40example.com/private-x/basic.ics";

function ics(lines) { return ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//t//EN", ...lines, "END:VCALENDAR"].join("\r\n") + "\r\n"; }

function helper(calendars, opts) {
  const env = { NODI_ICS: JSON.stringify({ calendars, me: opts.me || "" }), NODI_NOW: String(opts.now), TZ: opts.tz, HOME: "/nonexistent" };
  return JSON.parse(execFileSync("/usr/bin/python3", ["-I", HELPER, opts.cache || "/nonexistent/cache"], { env }).toString());
}

const at = (iso) => Date.parse(iso);

// A Google feed as it comes: Kolkata's VTIMEZONE, a weekday standup with
// one day left out and one moved, a declined invitation, a cancelled
// meeting, a three-day offsite under way, links in each place they hide.
const GOOGLE = ics([
  "X-WR-CALNAME:Work", "X-WR-TIMEZONE:Asia/Kolkata",
  "BEGIN:VTIMEZONE", "TZID:Asia/Kolkata", "BEGIN:STANDARD", "TZOFFSETFROM:+0530", "TZOFFSETTO:+0530", "TZNAME:IST", "DTSTART:19700101T000000", "END:STANDARD", "END:VTIMEZONE",
  "BEGIN:VEVENT", "UID:standup@google.com", "SUMMARY:Standup", "DTSTART;TZID=Asia/Kolkata:20260901T100000", "DTEND;TZID=Asia/Kolkata:20260901T101500",
  "RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR", "EXDATE;TZID=Asia/Kolkata:20261007T100000", "X-GOOGLE-CONFERENCE:https://meet.google.com/abc-defg-hij",
  "ORGANIZER;CN=Asha:mailto:asha@example.com", "ATTENDEE;PARTSTAT=ACCEPTED:mailto:me@example.com", "ATTENDEE;PARTSTAT=ACCEPTED:mailto:asha@example.com",
  "DESCRIPTION:<b>Daily</b> sync<br>Notes &amp; links\\n\\n-::~:~::~:~:~:~::~:~::-\\nJoin with Google Meet: https://meet.google.com/abc-defg-hij\\n-::~:~::~:~:~:~::~:~::-",
  "END:VEVENT",
  "BEGIN:VEVENT", "UID:standup@google.com", "RECURRENCE-ID;TZID=Asia/Kolkata:20261008T100000", "SUMMARY:Standup (moved)",
  "DTSTART;TZID=Asia/Kolkata:20261008T113000", "DTEND;TZID=Asia/Kolkata:20261008T114500", "END:VEVENT",
  "BEGIN:VEVENT", "UID:budget@google.com", "SUMMARY:Budget review", "DTSTART;TZID=Asia/Kolkata:20261006T150000", "DTEND;TZID=Asia/Kolkata:20261006T160000",
  "ATTENDEE;CN=Me;PARTSTAT=DECLINED:mailto:ME@example.com", "END:VEVENT",
  "BEGIN:VEVENT", "UID:old@google.com", "SUMMARY:Old sync", "STATUS:CANCELLED", "DTSTART:20261006T060000Z", "DTEND:20261006T063000Z", "END:VEVENT",
  "BEGIN:VEVENT", "UID:offsite@google.com", "SUMMARY:Offsite", "DTSTART;VALUE=DATE:20261005", "DTEND;VALUE=DATE:20261008", "END:VEVENT",
  "BEGIN:VEVENT", "UID:cust@google.com", "SUMMARY:Customer call", "DTSTART:20261007T103000Z", "DTEND:20261007T110000Z",
  "LOCATION:https://us02web.zoom.us/j/123456?pwd=abc", "END:VEVENT",
  "BEGIN:VEVENT", "UID:partner@google.com", "SUMMARY:Partner\\, sync", "DTSTART;TZID=Asia/Kolkata:20261009T170000", "DTEND;TZID=Asia/Kolkata:20261009T173000",
  "DESCRIPTION:Join: <https://teams.microsoft.com/l/meetup-join/19%3ameeting_x/0?context=y>", "LOCATION:Room 4", "END:VEVENT"
]);

test("ics: a Google feed's next nine days, repeats worked out, the declined and the cancelled left out", () => {
  const dir = mkdtempSync(join(tmpdir(), "nodi-ics-"));
  try {
    writeFileSync(join(dir, "work.ics"), GOOGLE);
    const got = helper([{ url: join(dir, "work.ics") }], { now: at("2026-10-06T09:55:00+05:30"), tz: "Asia/Kolkata", me: "me@example.com" });
    assert.deepEqual(got.calendars.map(c => [c.name, c.ok]), [["Work", true]]);
    const list = got.events.map(e => [e.title, new Date(e.start).toISOString(), e.allDay]);
    assert.deepEqual(list, [
      ["Offsite", "2026-10-04T18:30:00.000Z", true],
      ["Standup", "2026-10-06T04:30:00.000Z", false],
      ["Customer call", "2026-10-07T10:30:00.000Z", false],
      ["Standup (moved)", "2026-10-08T06:00:00.000Z", false],
      ["Standup", "2026-10-09T04:30:00.000Z", false],
      ["Partner, sync", "2026-10-09T11:30:00.000Z", false],
      ["Standup", "2026-10-12T04:30:00.000Z", false],
      ["Standup", "2026-10-13T04:30:00.000Z", false],
      ["Standup", "2026-10-14T04:30:00.000Z", false]
    ], "the 7th left out, the 8th moved, Budget review declined, Old sync cancelled, the offsite under way");
    const [offsite, standup, call] = got.events;
    assert.deepEqual([offsite.day, new Date(offsite.end).toISOString()], ["2026-10-05", "2026-10-07T18:30:00.000Z"]);
    assert.equal(standup.link, "https://meet.google.com/abc-defg-hij");
    assert.equal(call.link, "https://us02web.zoom.us/j/123456?pwd=abc", "a place that is a meeting link");
    assert.equal(got.events[5].link, "https://teams.microsoft.com/l/meetup-join/19%3ameeting_x/0?context=y", "Teams, from the description");
    assert.equal(got.events[5].location, "Room 4");
    const d = got.details[standup.d];
    assert.equal(d.description, "Daily sync\nNotes & links", "markup, entities and Google's join block gone");
    assert.deepEqual([d.organizer, d.guests], ["Asha", 2]);
    assert.equal(got.events[6].d, standup.d, "one copy of a repeating event's details");
    assert.equal(got.events[3].link, "", "a moved occurrence is its own event");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("ics: Outlook's Windows zone, from the feed's VTIMEZONE, across the end of daylight time", () => {
  const dir = mkdtempSync(join(tmpdir(), "nodi-ics-"));
  try {
    writeFileSync(join(dir, "o.ics"), ics([
      "BEGIN:VTIMEZONE", "TZID:Pacific Standard Time",
      "BEGIN:STANDARD", "DTSTART:16010101T020000", "TZOFFSETFROM:-0700", "TZOFFSETTO:-0800", "RRULE:FREQ=YEARLY;INTERVAL=1;BYDAY=1SU;BYMONTH=11", "END:STANDARD",
      "BEGIN:DAYLIGHT", "DTSTART:16010101T020000", "TZOFFSETFROM:-0800", "TZOFFSETTO:-0700", "RRULE:FREQ=YEARLY;INTERVAL=1;BYDAY=2SU;BYMONTH=3", "END:DAYLIGHT",
      "END:VTIMEZONE",
      "BEGIN:VEVENT", "UID:040000008200E00074C5B7101A82E008", "SUMMARY:PT sync", "DTSTART;TZID=Pacific Standard Time:20261028T090000",
      "DTEND;TZID=Pacific Standard Time:20261028T093000", "RRULE:FREQ=DAILY;COUNT=6", "END:VEVENT"
    ]));
    const got = helper([{ url: join(dir, "o.ics"), name: "Office" }], { now: at("2026-10-29T12:00:00-07:00"), tz: "America/Los_Angeles" });
    assert.deepEqual(got.events.map(e => new Date(e.start).toISOString()),
      ["2026-10-29T16:00:00.000Z", "2026-10-30T16:00:00.000Z", "2026-10-31T16:00:00.000Z", "2026-11-01T17:00:00.000Z", "2026-11-02T17:00:00.000Z"],
      "09:00 each day, an hour later in UTC from 1 November; COUNT 6 from the 28th");
    assert.equal(got.events[0].calendar, "Office", "the name nodi.json gives");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// Each rule's occurrences as recurring-ical-events 3 gives them (checked
// 2026-10-06), but f: a DATE UNTIL on a timed event keeps that day, as
// libical reads it, where dateutil stops at its midnight.
test("ics: the rules calendars write, over the end of daylight time in New York", () => {
  const got = helper([{ url: join(root, "tests/js/fixtures/recurrence.ics") }], { now: at("2026-10-25T12:00:00-04:00"), tz: "America/New_York" });
  assert.deepEqual(got.events.map(e => [e.key.split("/")[0], new Date(e.start).toISOString().slice(0, 16), e.day]), [
    ["l", "2026-10-25T04:00", "2026-10-25"], ["f", "2026-10-25T11:00", "2026-10-25"], ["e", "2026-10-25T12:00", "2026-10-25"],
    ["j", "2026-10-25T14:00", "2026-10-25"], ["f", "2026-10-26T11:00", "2026-10-26"], ["e", "2026-10-26T12:00", "2026-10-26"],
    ["h", "2026-10-26T14:00", "2026-10-26"], ["l", "2026-10-27T04:00", "2026-10-27"], ["e", "2026-10-27T12:00", "2026-10-27"],
    ["a", "2026-10-27T13:00", "2026-10-27"], ["k", "2026-10-28T04:00", "2026-10-28"], ["l", "2026-10-28T04:00", "2026-10-28"],
    ["h", "2026-10-28T14:00", "2026-10-28"], ["a", "2026-10-29T13:00", "2026-10-29"], ["g", "2026-10-30T05:30", "2026-10-30"],
    ["b", "2026-10-30T19:00", "2026-10-30"], ["c", "2026-10-30T21:00", "2026-10-30"], ["g", "2026-10-31T05:30", "2026-10-31"],
    ["i", "2026-10-31T16:00", "2026-10-31"], ["g", "2026-11-01T05:30", "2026-11-01"], ["j", "2026-11-01T15:00", "2026-11-01"],
    ["h", "2026-11-02T15:00", "2026-11-02"], ["d", "2026-11-02T16:00", "2026-11-02"]
  ]);
});

test("ics: a VTIMEZONE whose rules ended years ago keeps the offset they ended on", () => {
  const dir = mkdtempSync(join(tmpdir(), "nodi-ics-"));
  try {
    writeFileSync(join(dir, "z.ics"), ics([
      "BEGIN:VTIMEZONE", "TZID:Old Europe",
      "BEGIN:STANDARD", "DTSTART:19701025T030000", "TZOFFSETFROM:+0200", "TZOFFSETTO:+0100", "RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU;UNTIL=20091025T010000Z", "END:STANDARD",
      "BEGIN:DAYLIGHT", "DTSTART:19700329T020000", "TZOFFSETFROM:+0100", "TZOFFSETTO:+0200", "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU;UNTIL=20100328T010000Z", "END:DAYLIGHT",
      "END:VTIMEZONE",
      "BEGIN:VEVENT", "UID:x", "SUMMARY:Ten local", "DTSTART;TZID=Old Europe:20261007T100000", "DTEND;TZID=Old Europe:20261007T110000", "END:VEVENT"]));
    const got = helper([{ url: join(dir, "z.ics") }], { now: at("2026-10-06T12:00:00Z"), tz: "UTC" });
    assert.deepEqual(got.events.map(e => new Date(e.start).toISOString()), ["2026-10-07T08:00:00.000Z"], "+0200 since 2010 (Sonnet 2026-10-06)");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("ics: one meeting in two calendars is one row; a cache that cannot be made fails no feed", () => {
  const dir = mkdtempSync(join(tmpdir(), "nodi-ics-"));
  try {
    const one = ics(["BEGIN:VEVENT", "UID:same@google.com", "SUMMARY:Shared", "DTSTART:20261006T100000Z", "DTEND:20261006T110000Z", "END:VEVENT"]);
    writeFileSync(join(dir, "a.ics"), one);
    writeFileSync(join(dir, "b.ics"), one);
    const cache = join(dir, "cache");
    const got = helper([{ url: join(dir, "a.ics"), name: "Work" }, { url: join(dir, "b.ics"), name: "Home" }], { now: at("2026-10-06T09:00:00Z"), tz: "UTC", cache });
    assert.deepEqual(got.events.map(e => [e.title, e.calendar]), [["Shared", "Work"]]);
    // No UID: nothing says two are one, so each feed keeps its own; one
    // address listed twice is read once, each entry named as set.
    const bare = ics(["BEGIN:VEVENT", "SUMMARY:Focus", "DTSTART:20261006T100000Z", "DTEND:20261006T110000Z", "END:VEVENT"]);
    writeFileSync(join(dir, "c.ics"), bare);
    writeFileSync(join(dir, "d.ics"), bare);
    const twice = helper([{ url: join(dir, "c.ics"), name: "A" }, { url: join(dir, "d.ics"), name: "B" }, { url: join(dir, "c.ics"), name: "C" }],
                         { now: at("2026-10-06T09:00:00Z"), tz: "UTC" });
    assert.deepEqual(twice.calendars.map(c => c.name), ["A", "B", "C"]);
    assert.deepEqual(twice.events.map(e => [e.title, e.calendar]), [["Focus", "A"], ["Focus", "B"], ["Focus", "C"]]);
    assert.equal(new Set(twice.events.map(e => e.key)).size, 3, "each its own key");
    const kept = join(cache, createHash("sha256").update(join(dir, "a.ics")).digest("hex").slice(0, 20) + ".out.json");
    assert.equal(statSync(kept).mode & 0o777, 0o600, "what it keeps is yours alone");
    assert.equal(statSync(cache).mode & 0o777, 0o700);
    // A cache under a file: nothing can be made there, and the feeds still answer.
    writeFileSync(join(dir, "plain"), "");
    const stuck = helper([{ url: join(dir, "a.ics") }, { url: "http://127.0.0.1:9/x.ics" }], { now: at("2026-10-06T09:00:00Z"), tz: "UTC", cache: join(dir, "plain", "cache") });
    assert.deepEqual(stuck.calendars.map(c => [c.ok, c.error || ""]), [[true, ""], [false, "could not be reached (Connection refused)"]]);
    assert.deepEqual(stuck.events.map(e => e.title), ["Shared"]);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("ics: a feed that fails says why; a copy answers, marked stale; a changed feed is read anew", () => {
  const dir = mkdtempSync(join(tmpdir(), "nodi-ics-"));
  try {
    writeFileSync(join(dir, "hello.txt"), "hello");
    // Port 9 on this machine: nothing listens, so the fetch is refused.
    const url = "http://127.0.0.1:9/feed.ics";
    const cache = join(dir, "cache");
    mkdirSync(cache);
    const base = join(cache, createHash("sha256").update(url).digest("hex").slice(0, 20));
    writeFileSync(base + ".ics", ics(["BEGIN:VEVENT", "UID:a", "SUMMARY:From the copy", "DTSTART:20261006T100000Z", "DTEND:20261006T110000Z", "END:VEVENT"]));
    writeFileSync(base + ".json", JSON.stringify({ fetchedAt: 1000 }));
    const opts = { now: at("2026-10-06T09:00:00Z"), tz: "UTC", cache };
    const got = helper([{ url: join(dir, "none.ics") }, { url: join(dir, "hello.txt") }, { url }, { url: "ftp://x" }], opts);
    assert.deepEqual(got.calendars.map(c => [c.ok, c.error, !!c.stale]), [
      [false, "No such file or directory", false], [false, "not a calendar", false],
      [true, "could not be reached (Connection refused)", true], [false, "not an https:// or webcal:// address, nor a file", false]]);
    assert.deepEqual(got.calendars.map(c => c.name), ["Calendar 1", "Calendar 2", "Calendar 3", "Calendar 4"]);
    assert.deepEqual(got.events.map(e => [e.title, e.calendar]), [["From the copy", "Calendar 3"]]);
    const feed = join(dir, "f.ics");
    writeFileSync(feed, ics(["BEGIN:VEVENT", "UID:b", "SUMMARY:First", "DTSTART:20261006T100000Z", "END:VEVENT"]));
    assert.deepEqual(helper([{ url: feed }], opts).events.map(e => e.title), ["First"]);
    assert.ok(existsSync(join(cache, createHash("sha256").update(feed).digest("hex").slice(0, 20) + ".out.json")), "the expansion kept");
    writeFileSync(feed, ics(["BEGIN:VEVENT", "UID:b", "SUMMARY:Second", "DTSTART:20261006T100000Z", "END:VEVENT"]));
    assert.deepEqual(helper([{ url: feed }], opts).events.map(e => e.title), ["Second"], "a changed feed is not answered from the kept copy");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("ics: a redirect is followed, but never from https to anything else (codex's review, 2026-10-09)", () => {
  const out = execFileSync("/usr/bin/python3", ["-I", "-B", "-c", [
    "import sys, json, urllib.request, urllib.error; sys.path.insert(0, sys.argv[1]); import ics",
    "h = ics.HttpsOnly()",
    "def go(a, b):",
    "    try:",
    "        r = h.redirect_request(urllib.request.Request(a), None, 302, 'Found', {}, b)",
    "        return r.full_url if r else None",
    "    except urllib.error.HTTPError as e:",
    "        return 'refused: ' + e.msg",
    "print(json.dumps([go('https://a.example/x', 'https://b.example/y'), go('https://a.example/x', 'http://b.example/y'),",
    "  go('http://localhost/x', 'http://127.0.0.1:8080/y'), go('http://a.example/x', 'ftp://b.example/y'),",
    "  go('http://localhost/x', 'http://b.example/y'), go('http://localhost/x', 'https://b.example/y'),",
    "  any(isinstance(x, ics.HttpsOnly) for x in ics.OPENER.handlers)]))"].join("\n"), join(root, "lib")]).toString();
  // To http only on this machine, as where() takes one (Fable 2026-10-10).
  assert.deepEqual(JSON.parse(out), ["https://b.example/y", "refused: a redirect away from https", "http://127.0.0.1:8080/y",
                                     "refused: a redirect to no web address", "refused: a redirect to http elsewhere", "https://b.example/y", true]);
});

test("ics: a redirect to no web address, through the real opener, says so (codex's review, 2026-10-09)", () => {
  const out = execFileSync("/usr/bin/python3", ["-I", "-B", "-c", [
    "import sys, json, threading, tempfile, http.server; sys.path.insert(0, sys.argv[1]); import ics",
    "class H(http.server.BaseHTTPRequestHandler):",
    "    def log_message(self, *a): pass",
    "    def do_GET(self):",
    "        to = {'/file': 'file:///etc/hostname', '/ok': '/feed.ics'}.get(self.path)",
    "        if to: self.send_response(302); self.send_header('Location', to); self.end_headers(); return",
    "        b = b'BEGIN:VCALENDAR\\r\\nEND:VCALENDAR\\r\\n'; self.send_response(200); self.send_header('Content-Length', str(len(b))); self.end_headers(); self.wfile.write(b)",
    "s = http.server.HTTPServer(('127.0.0.1', 0), H); threading.Thread(target=s.serve_forever, daemon=True).start()",
    "u = 'http://127.0.0.1:%d' % s.server_port",
    "d = tempfile.mkdtemp()",
    "print(json.dumps([ics.fetch(u + '/file', d, 0)[1].get('error'), ics.fetch(u + '/ok', d + '/b', 0)[1].get('ok')]))"].join("\n"), join(root, "lib")]).toString();
  assert.deepEqual(JSON.parse(out), ["a redirect to no web address", true], "refused with its reason; an http feed's own redirect still followed");
});

test("ics: Google's event page and calendar id, webcal as https", () => {
  const out = execFileSync("/usr/bin/python3", ["-I", "-B", "-c", [
    "import sys; sys.path.insert(0, sys.argv[1]); import ics, json",
    "print(json.dumps([ics.google_page('abc123@google.com', 'me@example.com'), ics.google_page('x@outlook.com', 'me@example.com'),",
    "  ics.google_id(sys.argv[2]), ics.google_id('webcal://calendar.google.com/calendar/ical/team%40group.calendar.google.com/public/basic.ics'),",
    "  ics.google_id('https://example.com/calendar/ical/a/public/basic.ics'), ics.where('webcal://example.com/a.ics')]))"].join("\n"), join(root, "lib"), FEED]).toString();
  const eid = Buffer.from("abc123 me@example.com").toString("base64url");
  assert.deepEqual(JSON.parse(out), ["https://calendar.google.com/calendar/event?eid=" + eid, "", "me@example.com", "team@group.calendar.google.com", "", ["web", "https://example.com/a.ics"]]);
});

// ---------------------------------------------------------------- rows

// Rows come from the sandbox's realm: compared as plain data.
const eq = (a, b, m) => assert.deepEqual(plain(a), b, m);

const cfg = Jsonc.merge(config, { calendar: { ics: FEED, me: "me@example.com" } });
const t = now().getTime();
const MIN = 60000;
const local = (d, h, m) => new Date(2026, 8, d, h, m).getTime();
const ev = (key, title, start, end, more) => Object.assign({ key, title, start, end, allDay: false, day: "2026-09-23", calendar: "Work", location: "", link: "", tentative: false, d: "c0" + key }, more || {});
const data = {
  calendars: [{ name: "Work", ok: true, fetchedAt: t - 10 * MIN }],
  events: [
    ev("c", "Workshop", t - 30 * MIN, t + 210 * MIN, { link: "https://us02web.zoom.us/j/1" }),
    ev("a", "Design review", t - 5 * MIN, t + 25 * MIN, { link: "https://meet.google.com/abc-defg-hij" }),
    ev("b", "1:1 with Asha", t + 12 * MIN, t + 42 * MIN, { location: "Room 4" }),
    ev("d", "Gym", local(23, 18, 0), local(23, 19, 0)),
    ev("e", "Holiday", local(24, 0, 0), local(25, 0, 0), { allDay: true, day: "2026-09-24" }),
    ev("f", "Standup", local(26, 10, 0), local(26, 10, 15), { day: "2026-09-26", tentative: true })
  ],
  details: { c0a: { page: "https://calendar.google.com/calendar/event?eid=x", description: "Agenda", organizer: "Asha", guests: 3 },
             c0b: { page: "https://calendar.google.com/calendar/event?eid=y", description: "", organizer: "", guests: 0 } }
};
const mine = rows => rows.filter(r => r.provider === "calendar");

test("calendar: the meeting under way and the next within the hour lead the empty bar, Enter joining", () => {
  const rows = Engine.home(cfg, services({ calendar: data, history: {}, reminders: [] }));
  const cal = mine(rows);
  eq(cal.map(r => [r.title, r.subtitle, r.actionLabel]), [
    ["Design review", "Now, until 14:25, Google Meet", "Join"],
    ["1:1 with Asha", "In 12 min, 14:12 to 14:42, Room 4", "Open"]
  ], "the four-hour workshop only in its first ten minutes; Gym at six is not near");
  assert.equal(rows[0].title, "Design review", "first on the empty bar");
  eq((cal[0].run), { kind: "open", target: "https://meet.google.com/abc-defg-hij" });
  eq((cal[1].run), { kind: "open", target: "https://calendar.google.com/calendar/event?eid=y" }, "no link: the event in Google Calendar");
  eq(cal[0].actions.map(a => a.label), ["Copy the meeting link", "Open in Google Calendar", "Copy the details"]);
  assert.equal(cal[0].actions[2].run.text, "Design review\nToday, 13:55 to 14:25\nhttps://meet.google.com/abc-defg-hij");
  eq(cal[0].preview.labels, [["When", "Today, 13:55 to 14:25"], ["Calendar", "Work"], ["Join", "Google Meet"], ["Organizer", "Asha"], ["Guests", "3"]]);
  assert.equal(cal[0].preview.text, "Agenda");
});

test("calendar: off until a feed is set, its mode and command too", () => {
  eq(mine(Engine.home(config, services({ calendar: data, history: {}, reminders: [] }))), []);
  eq(mine(Engine.run("cal ", config, services({ calendar: data }))), []);
  // Off, its help says how to turn it on and fills in nothing that does
  // nothing (2026-10-10, driven live).
  const off = Engine.run("?calendar", config, services());
  eq(off.map(r => [r.title, r.complete || ""]), [["Calendar", ""]]);
  assert.ok(off[0].subtitle.indexOf("\"calendar\": { \"ics\"") !== -1, off[0].subtitle);
  eq(Engine.run("?calendar", cfg, services()).map(r => r.complete), ["cal ", "cal standup"], "on: cal with its space, so it lists");
  assert.equal(Engine.mode("cal 5", config), null, "\"cal ...\" is anyone's while it is off (Sonnet 2026-10-06)");
  assert.equal(Engine.mode("cal 5", cfg).label, "Calendar");
  const offRows = Engine.run("schedule", config, services({ calendar: data }));
  assert.ok(!offRows.some(r => r.title === "My schedule"), "no command row while it is off");
  assert.ok(Engine.run("schedule", cfg, services({ calendar: data })).some(r => r.title === "My schedule"), "and one once a feed is set");
  const asked = [];
  Engine.run("cal ", cfg, services({ asked }));
  eq(asked.filter(a => a.startsWith("calendar")), ["calendar:" + C.param(cfg.calendar)]);
  assert.equal(C.param({}), "");
  assert.equal(C.param({ ics: [FEED, { url: "webcal://x/y.ics", name: "Home" }, 7, { url: " " }] }),
    JSON.stringify({ calendars: [{ url: FEED, name: "" }, { url: "webcal://x/y.ics", name: "Home" }], me: "" }));
});

test("calendar: the address goes to lib/ics.py in its environment, never its arguments", () => {
  const s = C.provider.sources.calendar;
  const p = C.param(cfg.calendar);
  const argv = plain(s.argv(p, { pluginDir: "/plug", cacheDir: "/home/u/.cache/nodi" }));
  eq(argv, ["/usr/bin/python3", "-I", "/plug/lib/ics.py", "/home/u/.cache/nodi/calendar"]);
  assert.ok(!argv.join(" ").includes("private-x"));
  assert.equal(plain(s.environment(p)).NODI_ICS, p);
  assert.equal(s.argv(p, {}), null);
  eq((s.parse(JSON.stringify({ at: 5, calendars: [], events: [] }), true)), { calendars: [], events: [], details: {} }, "its read time dropped");
  assert.throws(() => s.parse("", false));
});

test("calendar: cal lists the next days in order, words finding events; a failed or stale feed says so first", () => {
  const rows = mine(Engine.run("cal ", cfg, services({ calendar: data })));
  eq(rows.map(r => [r.title, r.subtitle]), [
    ["Workshop", "Now, until 17:30, Zoom"],
    ["Design review", "Now, until 14:25, Google Meet"],
    ["1:1 with Asha", "In 12 min, 14:12 to 14:42, Room 4"],
    ["Gym", "In 4 h, 18:00 to 19:00"],
    ["Holiday", "Tomorrow, all day"],
    ["Standup (tentative)", "Saturday 26 Sep, 10:00 to 10:15"]
  ]);
  assert.ok(rows.every(r => !r.group || r.group === "Calendar"), "one list, each row saying its day: a day's header would not show over its one row");
  assert.equal(rows[3].actionLabel, "Copy", "no link and no page: Enter copies it");
  eq(mine(Engine.run("cal asha", cfg, services({ calendar: data }))).map(r => r.title), ["1:1 with Asha"]);
  assert.equal(mine(Engine.run("cal dentist", cfg, services({ calendar: data })))[0].title, "No event holds \"dentist\"");
  const broken = { calendars: [{ name: "Home", ok: false, error: "HTTP 404" }, { name: "Work", ok: true, stale: true, error: "timed out", fetchedAt: t - 10 * MIN }],
                   events: [], details: {} };
  eq(mine(Engine.run("cal ", cfg, services({ calendar: broken }))).map(r => [r.title, r.subtitle]), [
    ["Home could not be read", "HTTP 404"], ["Work as last read, today at 13:50", "The new copy failed: timed out"], ["Nothing in the next eight days", "Home, Work"]]);
  assert.equal(mine(Engine.run("cal ", cfg, services({})))[0].title, "Reading the calendar...");
});

test("calendar: a meeting near is found by its title or by join", () => {
  eq((mine(Engine.run("join", cfg, services({ calendar: data }))).map(r => r.title)), ["Design review", "1:1 with Asha"]);
  eq((mine(Engine.run("design rev", cfg, services({ calendar: data }))).map(r => r.title)), ["Design review"]);
  eq(mine(Engine.run("gym", cfg, services({ calendar: data }))), [], "later today: only under cal");
  const all = Object.assign({}, data, { events: [ev("g", "All hands", local(23, 0, 0), local(24, 0, 0), { allDay: true })] });
  eq(mine(Engine.home(cfg, services({ calendar: all, history: {}, reminders: [] }))), [], "an all-day event never leads");
});

test("calendar: a meeting link of a service it does not know is named by its host", () => {
  const meet = { calendars: data.calendars, details: {}, events: [ev("z", "Sync", t - 5 * MIN, t + 25 * MIN, { link: "https://meet.example.org/room-7" })] };
  const row = mine(Engine.home(cfg, services({ calendar: meet, history: {}, reminders: [] })))[0];
  assert.equal(row.subtitle, "Now, until 14:25, meet.example.org");
});
