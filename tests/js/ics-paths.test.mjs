// lib/ics.py, the paths the calendar's feeds rarely take: lines that are no
// content lines, zones of a feed's own, rules Nodi does not expand, values
// that are no date, and each way a fetch can end. Each runs the module's own
// functions in Python, as calendar.test.mjs does.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readdirSync, rmSync, chmodSync, truncateSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { root } from "./load.mjs";

// Runs `lines` with ics imported, and returns what they print as JSON.
function py(lines, args = [], env = {}) {
  const code = ["import sys, json, os; sys.path.insert(0, sys.argv[1]); import ics"].concat(lines).join("\n");
  const out = execFileSync("/usr/bin/python3", ["-I", "-B", "-c", code, join(root, "lib")].concat(args),
                           { env: { PATH: "/usr/bin:/bin", HOME: "/nonexistent", ...env } }).toString();
  return JSON.parse(out);
}

function ics(lines) { return ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//t//EN", ...lines, "END:VCALENDAR"].join("\r\n") + "\r\n"; }

test("ics: a content line's parameters, quoted and in lists; a line that is none is None", () => {
  const got = py([
    "out = []",
    "for line in sys.argv[2:]:",
    "    r = ics.content_line(line)",
    "    out.append(None if r is None else [r[0], r[1], r[2]])",
    "print(json.dumps(out))"],
    ['X;P="a:b",c;Q=d,e:value', 'X;P="no end:value', "X;Q:value", "X;Q=a"]);
  assert.deepEqual(got[0], ["X", { P: ["a:b", "c"], Q: ["d", "e"] }, "value"], "a quoted value holds a colon; a comma makes a list");
  assert.equal(got[1], null, "a quote that never closes");
  assert.equal(got[2], null, "a parameter with no =");
  assert.equal(got[3], null, "parameters and no value");
});

test("ics: the local zone from TZ, else /etc/localtime's link, else the file itself, else UTC", () => {
  const got = py([
    "a = str(ics.local_zone())",
    "real = ics.os.path.realpath",
    "ics.os.path.realpath = lambda p: '/etc/localtime'",
    // Tokyo's file as /etc/localtime: +9 h is read from it, which neither the
    // host's zone (here) nor UTC gives (Cursor's review, 2026-10-10).
    "import io",
    "tokyo = open('/usr/share/zoneinfo/Asia/Tokyo', 'rb').read()",
    "real_open = open",
    "ics.open = lambda p, *a, **k: io.BytesIO(tokyo) if p == '/etc/localtime' else real_open(p, *a, **k)",
    "b = ics.local_zone()",
    "del ics.open",
    "def gone(p): raise OSError('no')",
    "ics.os.path.realpath = gone",
    "c = str(ics.local_zone())",
    "print(json.dumps([a, b.utcoffset(ics.datetime(2026, 1, 1)).total_seconds(), c]))"], [], { TZ: "Nowhere/Such_City" });
  assert.notEqual(got[0], "Nowhere/Such_City", "a TZ that names no zone is passed over");
  assert.equal(got[1], 9 * 3600, "no zoneinfo link: the zone is read from the file");
  assert.equal(got[2], "UTC", "neither: UTC");
});

test("ics: a zone a feed defines itself: its offset before its first change, after, its name, and changes by RDATE and a counted rule", () => {
  const feed = ics([
    "BEGIN:VTIMEZONE", "TZID:Custom/Own Zone",
    "BEGIN:X-NOT-A-PART", "END:X-NOT-A-PART",
    "BEGIN:STANDARD", "DTSTART:20200101T000000", "TZOFFSETFROM:+0100", "TZOFFSETTO:+0200", "RDATE:20250601T000000,not-a-date", "END:STANDARD",
    "BEGIN:DAYLIGHT", "DTSTART:20250601T000000", "TZOFFSETFROM:+0200", "TZOFFSETTO:+0300", "END:DAYLIGHT",
    "BEGIN:DAYLIGHT", "DTSTART:20210301T000000", "TZOFFSETFROM:+0200", "TZOFFSETTO:+0400", "RRULE:FREQ=YEARLY;COUNT=1", "END:DAYLIGHT",
    "BEGIN:STANDARD", "DTSTART:20200101T000000", "TZOFFSETFROM:bad", "TZOFFSETTO:+0500", "END:STANDARD",
    "END:VTIMEZONE"]);
  const got = py([
    "cal = ics.parse(sys.argv[2])",
    "z = ics.Zones(cal, ics.timezone.utc).zone('Custom/Own Zone')",
    "D = ics.datetime",
    "h = lambda d: z.utcoffset(d).total_seconds() / 3600",
    "print(json.dumps([h(D(2019, 6, 1)), h(D(2020, 6, 1)), h(D(2021, 3, 2)), h(D(2022, 3, 2)), h(D(2025, 7, 1)),",
    "                  z.utcoffset(None).total_seconds(), z.tzname(None), z.dst(None).total_seconds(), len(z.parts)]))"], [feed]);
  assert.equal(got[0], 1, "before its first change: the offset that change came from");
  assert.equal(got[1], 2);
  assert.equal(got[2], 4, "a rule counted once changes once");
  assert.equal(got[3], 4, "and not again the next year, where nothing changes it back");
  assert.equal(got[4], 3);
  assert.deepEqual(got.slice(5), [0, "Custom/Own Zone", 0, 3], "no time, no offset; its name; a part with a bad offset is left out");
});

test("ics: values that are no date, durations, and rules Nodi does not expand", () => {
  const got = py([
    "z = ics.Zones(ics.parse(sys.argv[2]), ics.timezone.utc)",
    "print(json.dumps([",
    "  ics.when({}, '20261332T100000', z), ics.when({}, 'tomorrow', z),",
    "  ics.duration_s('PT1H30M'), ics.duration_s('-P1DT2H'), ics.duration_s('P2W'), ics.duration_s('P'), ics.duration_s('soon'),",
    "  ics.parse_rule('FREQ=HOURLY'), ics.parse_rule('FREQ=DAILY;BYHOUR=9'), ics.parse_rule('FREQ=DAILY;INTERVAL=x'), ics.parse_rule('FREQ=DAILY;COUNT=two')]))"],
    [ics([])]);
  assert.deepEqual(got, [null, null, 5400, -93600, 1209600, null, null, null, null, null, null]);
});

test("ics: rules over their defaults: a month's day, a week's day, a year's day, the nth weekday of a year, and the end of the calendar", () => {
  const got = py([
    "D = ics.date",
    "def days(start, rr, hi, lo=None): return [d.isoformat() for d in ics.rule_days(start, ics.parse_rule(rr), hi, lo)]",
    "print(json.dumps([",
    "  days(D(2026, 1, 31), 'FREQ=MONTHLY', D(2026, 5, 31)),",
    "  days(D(2026, 10, 7), 'FREQ=WEEKLY', D(2026, 10, 28)),",
    "  days(D(2026, 1, 1), 'FREQ=YEARLY;BYYEARDAY=100,-1', D(2027, 12, 31)),",
    "  days(D(2026, 1, 1), 'FREQ=YEARLY;BYDAY=2MO,-1FR', D(2026, 12, 31)),",
    "  days(D(9997, 12, 1), 'FREQ=MONTHLY', D(9999, 12, 31)),",
    "  days(D(9997, 3, 1), 'FREQ=YEARLY', D(9999, 12, 31)),",
    "  days(D(2026, 1, 5), 'FREQ=WEEKLY;BYDAY=MO', D(2026, 3, 2), D(2026, 2, 20)),",
    "  days(D(2025, 1, 1), 'FREQ=YEARLY', D(2027, 12, 31), D(2027, 6, 1))]))"]);
  assert.deepEqual(got[0], ["2026-01-31", "2026-03-31", "2026-05-31"], "a month without the day has none");
  assert.deepEqual(got[1], ["2026-10-07", "2026-10-14", "2026-10-21", "2026-10-28"], "a week's day is its start's");
  assert.deepEqual(got[2], ["2026-04-10", "2026-12-31", "2027-04-10", "2027-12-31"], "a year's day from the end too");
  assert.deepEqual(got[3], ["2026-01-12", "2026-12-25"], "the second Monday and the last Friday of the year");
  assert.deepEqual(got[4], ["9997-12-01", "9998-01-01", "9998-02-01", "9998-03-01", "9998-04-01", "9998-05-01", "9998-06-01",
                            "9998-07-01", "9998-08-01", "9998-09-01", "9998-10-01", "9998-11-01", "9998-12-01"], "no month past year 9998");
  assert.deepEqual(got[5], ["9997-03-01", "9998-03-01"], "no year past 9998");
  assert.deepEqual(got[6], ["2026-02-09", "2026-02-16", "2026-02-23", "2026-03-02"], "from the week before lo's week");
  assert.deepEqual(got[7], ["2026-01-01", "2027-01-01"], "from the year before lo's year, not from its start");
});

test("ics: a series that ends before it starts has no day, a time the series is not on is passed over, a day left out of a timed series goes", () => {
  const feed = ics([
    "X-WR-TIMEZONE:Not/A_Zone",
    "BEGIN:VTODO", "UID:t", "SUMMARY:A task", "DTSTART:20261009T090000Z", "END:VTODO",
    "BEGIN:VEVENT", "UID:a", "SUMMARY:Ended before", "DTSTART:20261009T090000Z", "RRULE:FREQ=DAILY;UNTIL=20261001T000000Z", "END:VEVENT",
    "BEGIN:VEVENT", "UID:b", "SUMMARY:Daily", "DTSTART:20261009T090000Z", "DURATION:PT30M", "RRULE:FREQ=DAILY;COUNT=4",
    "EXDATE:garbage", "EXDATE;VALUE=DATE:20261010", "END:VEVENT",
    "BEGIN:VEVENT", "UID:c", "SUMMARY:No start", "DTSTART:someday", "END:VEVENT",
    "BEGIN:VEVENT", "UID:d", "SUMMARY:Backwards", "DTSTART:20261009T120000Z", "DURATION:-PT1H", "END:VEVENT"]);
  const got = py([
    "cal = ics.parse(sys.argv[2])",
    "lo = ics.datetime(2026, 10, 9, tzinfo=ics.timezone.utc).timestamp()",
    "rows, _ = ics.events_of(cal, '', set(), ics.timezone.utc, lo, lo + 9 * 86400)",
    "print(json.dumps([[r['title'], r['day'], (r['end'] - r['start']) // 60000] for r in rows]))"], [feed]);
  assert.deepEqual(got, [["Daily", "2026-10-09", 30], ["Daily", "2026-10-11", 30], ["Daily", "2026-10-12", 30], ["Backwards", "2026-10-09", 0]],
                   "no task, no series that ended before it began, no start that is none; the 10th left out; a negative length is none");
});

test("ics: where an address points: file:// and ~/ are files, webcal is https, anything else is said", () => {
  const got = py(["print(json.dumps([ics.where(u) for u in sys.argv[2:]]))"],
                 ["file:///tmp/a%20b.ics", "~/cal.ics", "/abs.ics", "webcal://x.example/c.ics", "ftp://x/c.ics"], { HOME: "/home/u" });
  assert.deepEqual(got, [["file", "/tmp/a b.ics"], ["file", "/home/u/cal.ics"], ["file", "/abs.ics"], ["web", "https://x.example/c.ics"],
                         [null, "not an https:// or webcal:// address, nor a file"]]);
});
test("ics: http only to this machine: elsewhere the calendar and its address would go unencrypted (2026-10-10)", () => {
  const got = py(["print(json.dumps([ics.where(u) for u in sys.argv[2:]]))"],
                 ["http://cal.example/x.ics", "HTTP://cal.example/x.ics", "http://127.0.0.1:8080/x.ics", "http://localhost/x.ics", "http://[::1]:9/x.ics", "http://127.0.0.1.evil.example/x.ics", "https://cal.example/x.ics",
                  "http://localhost:x@cal.example/x.ics", "http://127.0.0.1:8080@cal.example/x.ics", "http://localhost@cal.example/x.ics", "http://me@LOCALHOST:8080/x.ics", "http://[::1/x.ics"]);
  const refused = [null, "an http:// address would send the calendar unencrypted; use https:// or webcal://"];
  assert.deepEqual(got, [refused, refused, ["web", "http://127.0.0.1:8080/x.ics"], ["web", "http://localhost/x.ics"], ["web", "http://[::1]:9/x.ics"], refused,
                         ["web", "https://cal.example/x.ics"],
                         refused, refused, refused, ["web", "http://me@LOCALHOST:8080/x.ics"], refused], "the host after any user:password@");
});


// A feed served on 127.0.0.1 by `mode`, then fetched by ics.fetch with what
// `setup` changes first; each fetch's [text or None, state].
function served(mode, fetches, setup = []) {
  return py([
    "import threading, http.server, time",
    "MODE = sys.argv[2]; CAL = b'BEGIN:VCALENDAR\\r\\nEND:VCALENDAR\\r\\n'; SEEN = []",
    "class H(http.server.BaseHTTPRequestHandler):",
    "    def log_message(self, *a): pass",
    "    def do_GET(self):",
    "        if MODE == 'etag' and self.headers.get('If-None-Match') == '\"v1\"' and self.headers.get('If-Modified-Since') == 'Fri, 09 Oct 2026 00:00:00 GMT':",
    "            self.send_response(304); self.end_headers(); return",
    "        body = {'html': b'<html>hello</html>', 'big': CAL + b'X' * 200}.get(MODE, CAL)",
    // A 200 after the first is another body: a copy said to be a 304's is
    // then told from a fetch again (Cursor's review, 2026-10-10).
    "        SEEN.append(1)",
    "        if MODE == 'etag' and len(SEEN) > 1: body = CAL.replace(b'END:', b'X-WR-CALNAME:again\\r\\nEND:')",
    "        self.send_response(200)",
    "        if MODE == 'etag': self.send_header('ETag', '\"v1\"'); self.send_header('Last-Modified', 'Fri, 09 Oct 2026 00:00:00 GMT')",
    "        if MODE == 'trickle':",
    "            self.end_headers()",
    "            try:",
    "                self.wfile.write(CAL[:5]); self.wfile.flush()",
    "                for _ in range(60): time.sleep(0.1); self.wfile.write(b'x'); self.wfile.flush()",
    "            except OSError: pass",
    "            return",
    "        self.send_header('Content-Length', str(len(body))); self.end_headers()",
    "        try: self.wfile.write(body)",
    "        except OSError: pass",
    "s = http.server.ThreadingHTTPServer(('127.0.0.1', 0), H); threading.Thread(target=s.serve_forever, daemon=True).start()",
    "url = 'http://127.0.0.1:%d/feed.ics' % s.server_port",
    "cache = sys.argv[3]",
  ].concat(setup, [
    "out = []",
    "for now in json.loads(sys.argv[4]):",
    "    text, state = ics.fetch(url, cache, now)",
    "    out.append([text, state])",
    "print(json.dumps(out))"]), [mode, fetches.cache, JSON.stringify(fetches.at)]);
}

test("ics: a feed fetched again within ten minutes is its copy; after, asked with its ETag and date, and a 304 is the copy again", () => {
  const cache = mkdtempSync(join(tmpdir(), "nodi-ics-"));
  try {
    const got = served("etag", { cache, at: [1000, 1300, 5000, 9000] },
                       ["real_fetch = ics.fetch", "def fetch(u, c, now):",
                        "    if now == 9000: os.chmod(c, 0o500)",
                        "    return real_fetch(u, c, now)", "ics.fetch = fetch"]);
    chmodSync(cache, 0o700);
    assert.equal(got[0][1].ok, true);
    assert.deepEqual([got[1][1].ok, got[1][1].fetchedAt], [true, 1000000], "within ten minutes: the copy, as it was fetched");
    assert.deepEqual([got[2][0].startsWith("BEGIN:VCALENDAR"), got[2][1].ok, got[2][1].fetchedAt], [true, true, 5000000],
                     "later: asked with its ETag and date, told 304, the copy, fetched now");
    assert.deepEqual([got[3][1].ok, got[3][1].fetchedAt], [true, 9000000], "a 304 whose date cannot be kept: the copy still answers");
    assert.ok(!got[2][0].includes("again") && !got[3][0].includes("again"), "both the copy, never a second 200");
    const kept = readdirSync(cache).filter(f => f.endsWith(".json"));
    assert.equal(kept.length, 1);
    assert.equal(JSON.parse(readFileSync(join(cache, kept[0]), "utf8")).fetchedAt, 5000000, "the date it could not keep is not kept");
  } finally { rmSync(cache, { recursive: true, force: true }); }
});

test("ics: a fetch that is no calendar, too big, too slow, or that cannot be kept", () => {
  const dir = mkdtempSync(join(tmpdir(), "nodi-ics-"));
  try {
    assert.deepEqual(served("html", { cache: join(dir, "a"), at: [1] })[0], [null, { ok: false, error: "not a calendar" }]);
    assert.deepEqual(served("big", { cache: join(dir, "b"), at: [1] }, ["ics.MAX_BYTES = 100"])[0], [null, { ok: false, error: "over 20 MB" }]);
    assert.deepEqual(served("trickle", { cache: join(dir, "c"), at: [1] }, ["ics.READ_S = 0.3"])[0], [null, { ok: false, error: "timed out" }],
                     "a feed that trickles past its time for the whole");
    // A cache folder it cannot write in: the feed still answers, nothing kept.
    const locked = join(dir, "d");
    execFileSync("/usr/bin/mkdir", ["-m", "500", locked]);
    const got = served("ok", { cache: locked, at: [1] });
    assert.equal(got[0][1].ok, true);
    assert.deepEqual(readdirSync(locked), [], "nothing written, no temporary file left");
    chmodSync(locked, 0o700);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("ics: a fetch that fails as a socket, or in a way of its own, says how; fetched() turns any throw into a failed feed", () => {
  // Its cache in a folder of the test's own (Cursor's review, 2026-10-10).
  const cache = mkdtempSync(join(tmpdir(), "nodi-ics-"));
  try {
  const got = py([
    "class Boom:",
    "    def __init__(self, e): self.e = e",
    "    def open(self, *a, **k): raise self.e",
    "out = []",
    "for e in [OSError(5, 'Input/output error'), OSError(), ValueError('odd')]:",
    "    ics.OPENER = Boom(e)",
    "    out.append(ics.fetch('https://x.example/c.ics', sys.argv[2], 1)[1])",
    "def boom(*a): raise KeyError('k')",
    "ics.fetch = boom",
    "out.append(ics.fetched('https://x.example/c.ics', sys.argv[2], 1)[1])",
    "print(json.dumps(out))"], [cache]);
  assert.deepEqual(got, [{ ok: false, error: "Input/output error" }, { ok: false, error: "could not be read" },
                         { ok: false, error: "could not be read (ValueError)" }, { ok: false, error: "could not be read (KeyError)" }]);
  } finally { rmSync(cache, { recursive: true, force: true }); }
});

test("ics: a local file past 20 MB is refused before it is read", () => {
  const dir = mkdtempSync(join(tmpdir(), "nodi-ics-"));
  try {
    const big = join(dir, "big.ics");
    writeFileSync(big, "");
    truncateSync(big, 20 * 1024 * 1024 + 1);
    // Not readable: a read first would say so; its size is all that is asked
    // (Cursor's review, 2026-10-10). As root it is read anyway, and holds.
    chmodSync(big, 0o000);
    assert.deepEqual(py(["print(json.dumps(ics.fetch(sys.argv[2], sys.argv[3], 1)))"], [big, join(dir, "cache")]), [null, { ok: false, error: "over 20 MB" }]);
    chmodSync(big, 0o600);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("ics: a write that fails leaves no temporary file and says so", () => {
  const dir = mkdtempSync(join(tmpdir(), "nodi-ics-"));
  try {
    const got = py([
      "def no(*a): raise OSError(28, 'No space left on device')",
      "ics.os.replace = no",
      "try:",
      "    ics.write_private(sys.argv[2], b'x'); print(json.dumps('written'))",
      "except OSError as e:",
      "    print(json.dumps(e.strerror))"], [join(dir, "feed.ics")]);
    assert.equal(got, "No space left on device");
    assert.deepEqual(readdirSync(dir), [], "the temporary file is gone, and no feed.ics");
    // The temporary file cannot be removed either: the write's own failure is said, not the cleanup's.
    const twice = py([
      "def no(*a): raise OSError(28, 'No space left on device')",
      "ics.os.replace = no",
      "ics.os.unlink = lambda p: (_ for _ in ()).throw(OSError(1, 'Operation not permitted'))",
      "try:",
      "    ics.write_private(sys.argv[2], b'x'); print(json.dumps('written'))",
      "except OSError as e:",
      "    print(json.dumps(e.strerror))"], [join(dir, "feed.ics")]);
    assert.equal(twice, "No space left on device");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("ics: main with settings that do not parse reads no calendar; one that cannot be expanded says so; a feed read again is its kept days", () => {
  const dir = mkdtempSync(join(tmpdir(), "nodi-ics-"));
  try {
    const feed = join(dir, "work.ics");
    writeFileSync(feed, ics(["X-WR-CALNAME:Work", "BEGIN:VEVENT", "UID:x", "SUMMARY:Review", "DTSTART:20261009T090000Z", "DTEND:20261009T100000Z", "END:VEVENT"]));
    const env = { NODI_NOW: String(Date.parse("2026-10-09T00:00:00Z")), TZ: "UTC" };
    const run = (ics_, lines = []) => py(lines.concat(["sys.argv = ['ics.py', sys.argv[2]]", "ics.main()"]), [join(dir, "cache")], { ...env, NODI_ICS: ics_ });
    assert.deepEqual(run("{not json").calendars, [], "settings that do not parse: no calendar");
    const want = JSON.stringify({ calendars: [{ url: feed }] });
    const first = run(want);
    assert.deepEqual(first.events.map(e => e.title), ["Review"]);
    assert.ok(readdirSync(join(dir, "cache")).some(f => f.endsWith(".out.json")), "its days kept");
    // Read again, expanding would throw: the kept days answer.
    const again = run(want, ["ics.events_of = lambda *a: (_ for _ in ()).throw(RuntimeError('not again'))"]);
    assert.deepEqual(again.events.map(e => e.title), ["Review"], "the same text: what was kept, not expanded again");
    rmSync(join(dir, "cache"), { recursive: true, force: true });
    const broken = run(want, ["ics.events_of = lambda *a: (_ for _ in ()).throw(RuntimeError('broken'))"]);
    assert.deepEqual([broken.calendars[0].ok, broken.calendars[0].error, broken.calendars[0].name], [false, "could not be read (RuntimeError)", "Calendar 1"]);
    assert.ok(!existsSync(join(dir, "cache", "nothing")));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
