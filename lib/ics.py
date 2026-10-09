# The calendars' next days, for providers/calendar.js (ROADMAP 67, L 9).
#
#   /usr/bin/python3 -I lib/ics.py <cache-dir>
#
# The feeds come in NODI_ICS, never as arguments: a secret iCal address is
# a password, and a process's arguments are anyone's to read in /proc where
# its environment is its owner's. NODI_ICS is
#
#   { "calendars": [{ "url": "https://...", "name": "Work" }], "me": "you@example.com" }
#
# and what is printed one line of JSON:
#
#   { "at": ms, "calendars": [{ name, ok, error, stale, fetchedAt }],
#     "events": [{ key, title, start, end, allDay, day, calendar, location,
#                  link, tentative, d }],
#     "details": { d: { description, organizer, guests, page } } }
#
# the events that are on between the start of today and nine days on, in
# the order they start, times in ms since the epoch; `link` the meeting's
# own (Meet, Zoom, Teams and the like), `page` the event in Google
# Calendar for a Google feed. A feed is fetched again
# once its copy in <cache-dir> is ten minutes old, and when that fails the
# copy answers, marked stale. A local file (a path, ~/..., file://) is read
# as it is.
#
# Only the standard library: the recurrence rules of RFC 5545 that calendars
# write (DAILY to YEARLY; BYDAY with or without a position, BYMONTHDAY,
# BYMONTH, BYYEARDAY, BYSETPOS; COUNT, UNTIL, INTERVAL, WKST), EXDATE,
# RDATE, and an occurrence moved or cancelled on its own (RECURRENCE-ID).
# A rule with BYWEEKNO, BYHOUR, BYMINUTE or BYSECOND, or a FREQ under a day,
# gives its first occurrence only. A TZID is read from tzdata (Google
# writes IANA names), then from the feed's own VTIMEZONE (Outlook writes
# Windows names with one), and a time with neither is the feed's
# X-WR-TIMEZONE or this machine's.

import base64
import hashlib
import html
import json
import os
import re
import sys
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, timedelta, timezone, tzinfo
from zoneinfo import ZoneInfo

# Raised with any change to what an expansion holds, so one kept by an
# older lib/ics.py is not answered with (Sonnet 2026-10-06).
VERSION = 2
FRESH_S = 600
DAYS = 9
TIMEOUT_S = 10
READ_S = 20
MAX_BYTES = 20 * 1024 * 1024
DESCRIPTION_MAX = 1500
# The most periods one rule is walked through (a daily rule from 1990 is
# about 13000), past which its occurrences stop.
PERIODS_MAX = 40000

WEEKDAYS = {"MO": 0, "TU": 1, "WE": 2, "TH": 3, "FR": 4, "SA": 5, "SU": 6}
DATE_TIME = re.compile(r"(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?")
DURATION = re.compile(r"([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?")
NAME = re.compile(r"[A-Za-z0-9-]+")
BYDAY = re.compile(r"([+-]?\d{1,2})?(MO|TU|WE|TH|FR|SA|SU)")

# A meeting's link by its host: Meet, Zoom, Teams, Webex, Jitsi, Whereby,
# Slack huddles, Chime, Around, Gather and Discord.
MEETING = re.compile(
    r"https://(?:meet\.google\.com/[a-z]+-[a-z]+-[a-z]+"
    r"|(?:[\w-]+\.)?zoom(?:gov)?\.(?:us|com)/(?:j|my|w|s)/[^\s<>\"']+"
    r"|teams\.microsoft\.com/(?:l/meetup-join|meet)/[^\s<>\"']+"
    r"|teams\.live\.com/meet/[^\s<>\"']+"
    r"|[\w-]+\.webex\.com/[^\s<>\"']+"
    r"|meet\.jit\.si/[^\s<>\"']+"
    r"|(?:[\w-]+\.)?whereby\.com/[^\s<>\"']+"
    r"|app\.slack\.com/huddle/[^\s<>\"']+"
    r"|(?:[\w-]+\.)?chime\.aws/[^\s<>\"']+"
    r"|meet\.around\.co/[^\s<>\"']+"
    r"|(?:app\.)?gather\.town/[^\s<>\"']+"
    r"|discord\.gg/[^\s<>\"']+)", re.I)
ANY_URL = re.compile(r"https?://[^\s<>\"']+", re.I)
GOOGLE_FEED = re.compile(r"^/calendar/ical/([^/]+)/(?:private-[^/]+|public)/basic\.ics$")
# Google's block under an invitation that says how to join, which the link
# already does.
GOOGLE_INVITE = re.compile(r"-::~[:~]*::-.*?-::~[:~]*::-", re.S)


# ---------------------------------------------------------------- reading

class Component:
    def __init__(self, name):
        self.name = name
        self.props = []
        self.children = []

    def all(self, name):
        return [(p, v) for (n, p, v) in self.props if n == name]

    def first(self, name):
        for (n, p, v) in self.props:
            if n == name:
                return p, v
        return None, None

    def text(self, name):
        _, v = self.first(name)
        return unescape(v) if v is not None else ""


def unfold(text):
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    return re.sub(r"\n[ \t]", "", text).split("\n")


# NAME;PARAM=a,"b;c":value, or None for a line that is not one.
def content_line(line):
    m = NAME.match(line)
    if not m:
        return None
    name, i, n = m.group(0).upper(), m.end(), len(line)
    params = {}
    while i < n and line[i] == ";":
        m = NAME.match(line, i + 1)
        if not m or m.end() >= n or line[m.end()] != "=":
            return None
        pname, i = m.group(0).upper(), m.end() + 1
        values = []
        while True:
            if i < n and line[i] == '"':
                j = line.find('"', i + 1)
                if j < 0:
                    return None
                values.append(line[i + 1:j])
                i = j + 1
            else:
                j = i
                while j < n and line[j] not in ';:,"':
                    j += 1
                values.append(line[i:j])
                i = j
            if i < n and line[i] == ",":
                i += 1
                continue
            break
        params[pname] = values
    if i >= n or line[i] != ":":
        return None
    return name, params, line[i + 1:]


def parse(text):
    root = Component("ROOT")
    stack = [root]
    for line in unfold(text):
        got = content_line(line)
        if not got:
            continue
        name, params, value = got
        if name == "BEGIN":
            c = Component(value.strip().upper())
            stack[-1].children.append(c)
            stack.append(c)
        elif name == "END":
            if len(stack) > 1:
                stack.pop()
        else:
            stack[-1].props.append((name, params, value))
    cals = [c for c in root.children if c.name == "VCALENDAR"]
    return cals[0] if cals else None


def unescape(v):
    return re.sub(r"\\([nN,;\\])", lambda m: "\n" if m.group(1) in "nN" else m.group(1), v)


def param(params, name):
    vs = (params or {}).get(name) or [""]
    return vs[0]


# ---------------------------------------------------------------- time zones

def local_zone():
    tz = os.environ.get("TZ", "").lstrip(":")
    if tz:
        try:
            return ZoneInfo(tz)
        except Exception:
            pass
    try:
        target = os.path.realpath("/etc/localtime")
        if "/zoneinfo/" in target:
            return ZoneInfo(target.split("/zoneinfo/", 1)[1])
        with open("/etc/localtime", "rb") as f:
            return ZoneInfo.from_file(f)
    except Exception:
        return timezone.utc


class Observances(tzinfo):
    """A VTIMEZONE: the offset of a wall time is the one its latest change
    before it set (each STANDARD and DAYLIGHT part a change, on its rule)."""

    def __init__(self, tzid, parts):
        self.tzid = tzid
        self.parts = parts          # [(start naive, rule or None, rdates, offset_from, offset_to)]
        self.years = {}

    # Its changes up to the end of `year`: each part's start and RDATEs
    # however old (a zone that stopped changing years ago keeps its last
    # offset), and its rule's from the year before, or from the year before
    # its UNTIL for a rule that ended (Sonnet 2026-10-06: a zone on +0200
    # since its rules ended in 2010 read as +0100).
    def changes(self, year):
        if year not in self.years:
            out = []
            hi = date(min(year, 9998), 12, 31)
            for (start, rule, rdates, _, to) in self.parts:
                out.extend((a, to) for a in [start] + rdates if a.year <= year)
                if not rule:
                    continue
                n = 0
                ended = rule.get("until_wall")
                lo = min(year, ended.year if ended else year) - 1
                for d in rule_days(start.date(), rule, hi, date(max(lo, 1), 1, 1)):
                    if rule["count"] is not None and n >= rule["count"]:
                        break
                    n += 1
                    a = datetime.combine(d, start.time())
                    if rule.get("until_wall") and a > rule["until_wall"]:
                        break
                    out.append((a, to))
            out.sort(key=lambda x: x[0])
            self.years[year] = out
        return self.years[year]

    def utcoffset(self, dt):
        if dt is None:
            return timedelta(0)
        wall = dt.replace(tzinfo=None)
        best = None
        for (a, to) in self.changes(wall.year):
            if a <= wall:
                best = to
        if best is None:
            early = min(self.parts, key=lambda p: p[0])
            best = early[3]
        return best

    def dst(self, dt):
        return timedelta(0)

    def tzname(self, dt):
        return self.tzid


def offset(v):
    m = re.fullmatch(r"([+-])(\d{2})(\d{2})(\d{2})?", (v or "").strip())
    if not m:
        return None
    s = int(m.group(2)) * 3600 + int(m.group(3)) * 60 + int(m.group(4) or 0)
    return timedelta(seconds=-s if m.group(1) == "-" else s)


class Zones:
    def __init__(self, cal, fallback):
        self.fallback = fallback
        self.cache = {}
        self.own = {}
        for c in cal.children:
            if c.name != "VTIMEZONE":
                continue
            tzid = c.text("TZID").strip()
            parts = []
            for p in c.children:
                if p.name not in ("STANDARD", "DAYLIGHT"):
                    continue
                _, s = p.first("DTSTART")
                m = DATE_TIME.fullmatch((s or "").strip())
                fr, to = offset(p.first("TZOFFSETFROM")[1]), offset(p.first("TZOFFSETTO")[1])
                if not m or fr is None or to is None:
                    continue
                start = datetime(*[int(x or 0) for x in m.groups()[:6]])
                rule = None
                _, rr = p.first("RRULE")
                if rr:
                    rule = parse_rule(rr)
                    # UNTIL in UTC, a change's start in the offset it
                    # changes from.
                    u = DATE_TIME.fullmatch(rule["until_raw"]) if rule and rule["until_raw"] else None
                    if u:
                        rule["until_wall"] = datetime(*[int(x or 0) for x in u.groups()[:6]]) + (fr if u.group(7) else timedelta(0))
                rdates = []
                for (_, v) in p.all("RDATE"):
                    for one in v.split(","):
                        m2 = DATE_TIME.fullmatch(one.strip())
                        if m2:
                            rdates.append(datetime(*[int(x or 0) for x in m2.groups()[:6]]))
                parts.append((start, rule, rdates, fr, to))
            if tzid and parts:
                self.own[tzid] = Observances(tzid, parts)

    def zone(self, tzid):
        if not tzid:
            return self.fallback
        key = tzid.strip().strip('"')
        if key in self.cache:
            return self.cache[key]
        found = None
        # "/mozilla.org/20050126_1/America/New_York" and its like.
        bits = key.strip("/").split("/")
        for k in range(len(bits)):
            try:
                found = ZoneInfo("/".join(bits[k:]))
                break
            except Exception:
                continue
        if found is None:
            found = self.own.get(key) or self.fallback
        self.cache[key] = found
        return found


# ---------------------------------------------------------------- values

def when(params, value, zones):
    """A DATE (date), or a DATE-TIME made aware (UTC, its TZID, or the
    feed's zone for a floating one); None for anything else."""
    m = DATE_TIME.fullmatch((value or "").strip())
    if not m:
        return None
    y, mo, d = int(m.group(1)), int(m.group(2)), int(m.group(3))
    try:
        if m.group(4) is None or param(params, "VALUE").upper() == "DATE":
            return date(y, mo, d)
        hh, mm, ss = int(m.group(4)), int(m.group(5)), min(int(m.group(6) or 0), 59)
        tz = timezone.utc if m.group(7) else zones.zone(param(params, "TZID"))
        return datetime(y, mo, d, hh, mm, ss, tzinfo=tz)
    except ValueError:
        return None


def duration_s(v):
    m = DURATION.fullmatch((v or "").strip())
    if not m or not any(m.groups()[1:]):
        return None
    w, d, h, mi, s = [int(x or 0) for x in m.groups()[1:]]
    total = w * 604800 + d * 86400 + h * 3600 + mi * 60 + s
    return -total if m.group(1) == "-" else total


def parse_rule(value):
    r = {}
    for part in (value or "").split(";"):
        if "=" in part:
            k, v = part.split("=", 1)
            r[k.strip().upper()] = v.strip()
    freq = r.get("FREQ", "").upper()
    if freq not in ("DAILY", "WEEKLY", "MONTHLY", "YEARLY"):
        return None
    if any(k in r for k in ("BYWEEKNO", "BYHOUR", "BYMINUTE", "BYSECOND")):
        return None
    try:
        ints = lambda k, lo, hi: [int(x) for x in r[k].split(",") if x.strip() and lo <= abs(int(x)) <= hi] if k in r else []
        rule = {
            "freq": freq,
            "interval": max(1, int(r.get("INTERVAL") or 1)),
            "count": int(r["COUNT"]) if r.get("COUNT") else None,
            "until_raw": r.get("UNTIL", ""),
            "until": None,
            "bymonth": [x for x in ints("BYMONTH", 1, 12) if x > 0],
            "bymonthday": ints("BYMONTHDAY", 1, 31),
            "byyearday": ints("BYYEARDAY", 1, 366),
            "bysetpos": ints("BYSETPOS", 1, 366),
            "byday": [],
            "wkst": WEEKDAYS.get(r.get("WKST", "MO").upper(), 0),
        }
    except ValueError:
        return None
    for one in r.get("BYDAY", "").split(","):
        m = BYDAY.fullmatch(one.strip().upper())
        if m:
            n = int(m.group(1)) if m.group(1) else None
            rule["byday"].append((n if n else None, WEEKDAYS[m.group(2)]))
    rule["until"] = rule["until_raw"] or None
    return rule


# ---------------------------------------------------------------- recurrence

def month_days(y, m):
    if m == 12:
        return 31
    return (date(y, m + 1, 1) - date(y, m, 1)).days


def year_days(y):
    return 366 if (y % 4 == 0 and y % 100 != 0) or y % 400 == 0 else 365


def rule_days(start, rule, hi, lo=None):
    """The dates a rule makes from `start` on, in order, up to `hi`: each
    period's days that every BYxxx part allows (dateutil's way), then
    BYSETPOS over them. From the period before `lo` when one is given and
    the rule has no COUNT, which counts from the start."""
    freq, interval = rule["freq"], rule["interval"]
    bymonth, bymonthday, byyearday = rule["bymonth"], rule["bymonthday"], rule["byyearday"]
    byday, bysetpos = list(rule["byday"]), rule["bysetpos"]
    if not (byyearday or bymonthday or byday):
        if freq == "YEARLY":
            bymonth = bymonth or [start.month]
            bymonthday = [start.day]
        elif freq == "MONTHLY":
            bymonthday = [start.day]
        elif freq == "WEEKLY":
            byday = [(None, start.weekday())]
    week0 = start - timedelta(days=(start.weekday() - rule["wkst"]) % 7)

    def allows(d):
        if bymonth and d.month not in bymonth:
            return False
        if bymonthday:
            dim = month_days(d.year, d.month)
            if d.day not in bymonthday and d.day - dim - 1 not in bymonthday:
                return False
        if byyearday:
            diy, yd = year_days(d.year), d.timetuple().tm_yday
            if yd not in byyearday and yd - diy - 1 not in byyearday:
                return False
        if byday:
            for (n, wd) in byday:
                if d.weekday() != wd:
                    continue
                if n is None or freq in ("DAILY", "WEEKLY"):
                    return True
                if freq == "MONTHLY" or bymonth:
                    span, at = month_days(d.year, d.month), d.day
                else:
                    span, at = year_days(d.year), d.timetuple().tm_yday
                if n == (at - 1) // 7 + 1 or n == -((span - at) // 7 + 1):
                    return True
            return False
        return True

    def period(k):
        if freq == "DAILY":
            d = start + timedelta(days=k * interval)
            return d, [d]
        if freq == "WEEKLY":
            d = week0 + timedelta(days=7 * k * interval)
            return d, [d + timedelta(days=i) for i in range(7)]
        if freq == "MONTHLY":
            i = start.year * 12 + start.month - 1 + k * interval
            y, m = divmod(i, 12)
            if y > 9998:
                return None, []
            return date(y, m + 1, 1), [date(y, m + 1, x) for x in range(1, month_days(y, m + 1) + 1)]
        y = start.year + k * interval
        if y > 9998:
            return None, []
        first = date(y, 1, 1)
        return first, [first + timedelta(days=i) for i in range(year_days(y))]

    k = 0
    if lo is not None and rule["count"] is None and lo > start:
        if freq == "DAILY":
            k = (lo - start).days // interval
        elif freq == "WEEKLY":
            k = (lo - week0).days // 7 // interval
        elif freq == "MONTHLY":
            k = ((lo.year - start.year) * 12 + lo.month - start.month) // interval
        else:
            k = (lo.year - start.year) // interval
        k = max(0, k - 1)
    for _ in range(PERIODS_MAX):
        begins, days = period(k)
        if begins is None or begins > hi:
            return
        got = [d for d in days if allows(d)]
        if bysetpos:
            picked = set()
            for p in bysetpos:
                i = p - 1 if p > 0 else len(got) + p
                if 0 <= i < len(got):
                    picked.add(got[i])
            got = sorted(picked)
        for d in got:
            if start <= d <= hi:
                yield d
        k += 1


def key_of(v):
    """What a RECURRENCE-ID or EXDATE is matched by: a date as itself, a
    time by its instant."""
    return v.isoformat() if not isinstance(v, datetime) else int(v.timestamp())


def instant(v, local):
    if isinstance(v, datetime):
        return v.timestamp()
    return datetime(v.year, v.month, v.day, tzinfo=local).timestamp()


def starts(ev, start, zones, local, lo, hi):
    """The starts of an event's occurrences that could begin between lo and
    hi (seconds): its DTSTART, the rule's, and its RDATEs, less its
    EXDATEs."""
    timed = isinstance(start, datetime)
    tz = start.tzinfo if timed else local
    _, rr = ev.first("RRULE")
    rule = parse_rule(rr) if rr else None
    out = [start]
    if rule:
        until = None
        if rule["until"]:
            u = when({}, rule["until"], zones)
            if isinstance(u, datetime) and not DATE_TIME.fullmatch(rule["until"]).group(7):
                u = u.replace(tzinfo=tz)
            if u is not None:
                until = instant(u, tz) if timed else (u.astimezone(local).date() if isinstance(u, datetime) else u)
                if timed and not isinstance(u, datetime):
                    until = datetime(u.year, u.month, u.day, 23, 59, 59, tzinfo=tz).timestamp()
        # A rule that ends before it starts has no occurrence, its DTSTART
        # neither (as recurring-ical-events and dateutil read it).
        if until is not None and ((instant(start, tz) > until) if timed else (start > until)):
            return []
        day0 = start.astimezone(tz).date() if timed else start
        hi_day = datetime.fromtimestamp(hi, tz).date() + timedelta(days=1)
        lo_day = datetime.fromtimestamp(lo, tz).date() - timedelta(days=1)
        clock = start.astimezone(tz).timetz().replace(tzinfo=None) if timed else None
        # DTSTART is the first occurrence, by the rule or not (RFC 5545).
        n = 1
        for d in rule_days(day0, rule, hi_day, lo_day):
            if rule["count"] is not None and n >= rule["count"]:
                break
            occ = datetime.combine(d, clock, tzinfo=tz) if timed else d
            if occ == start:
                continue
            if until is not None and ((instant(occ, tz) > until) if timed else (occ > until)):
                break
            out.append(occ)
            n += 1
    for (rp, rv) in ev.all("RDATE"):
        for one in rv.split(","):
            r = when(rp, one.split("/")[0], zones)
            if r is not None:
                out.append(r)
    gone, gone_days = set(), set()
    for (xp, xv) in ev.all("EXDATE"):
        for one in xv.split(","):
            x = when(xp, one, zones)
            if x is None:
                continue
            if timed and not isinstance(x, datetime):
                gone_days.add(x)
            elif not timed and isinstance(x, datetime):
                # An all-day series's day, written as a time by some
                # exporters (Sonnet 2026-10-06).
                gone.add(x.date().isoformat())
            else:
                gone.add(key_of(x))
    kept, seen = [], set()
    for o in out:
        if key_of(o) in gone or key_of(o) in seen:
            continue
        seen.add(key_of(o))
        if gone_days and isinstance(o, datetime) and o.astimezone(tz).date() in gone_days:
            continue
        kept.append(o)
    return kept


# ---------------------------------------------------------------- events

def plain(text):
    if re.search(r"<(?:br|p|a|div|span|b|i|ul|li|html)\b", text, re.I):
        text = re.sub(r"<br\s*/?>|</p>|</div>|</li>", "\n", text, flags=re.I)
        text = re.sub(r"<[^>]+>", "", text)
    text = html.unescape(text)
    text = GOOGLE_INVITE.sub("", text)
    text = re.sub(r"[ \t]+\n", "\n", text)
    text = re.sub(r"\n{3,}", "\n\n", text).strip()
    return text[:DESCRIPTION_MAX]


def join_link(ev):
    for name in ("X-GOOGLE-CONFERENCE", "URL", "LOCATION", "DESCRIPTION"):
        for (_, v) in ev.all(name):
            m = MEETING.search(html.unescape(unescape(v)))
            if m:
                return m.group(0).rstrip(").,;>]")
    # A place that is a link is where the meeting is.
    loc = ev.text("LOCATION").strip()
    m = ANY_URL.match(loc)
    return m.group(0).rstrip(").,;>]") if m and m.end() == len(loc) else ""


def declined(ev, me):
    for (p, v) in ev.all("ATTENDEE"):
        who = v.strip().lower()
        who = who[7:] if who.startswith("mailto:") else who
        if who in me:
            return param(p, "PARTSTAT").upper() == "DECLINED"
    return False


def google_page(uid, cal_id):
    if not cal_id or not uid.endswith("@google.com"):
        return ""
    eid = base64.urlsafe_b64encode(("%s %s" % (uid[:-len("@google.com")], cal_id)).encode()).decode().rstrip("=")
    return "https://calendar.google.com/calendar/event?eid=" + eid


# The occurrences on between lo and hi, and each event's details apart, by
# a key the occurrences carry ("d"): a weekly meeting's description once.
def events_of(cal, cal_id, me, local, lo, hi):
    _, wr = cal.first("X-WR-TIMEZONE")
    floating = local
    if wr:
        try:
            floating = ZoneInfo(wr.strip())
        except Exception:
            pass
    zones = Zones(cal, floating)
    masters, moved = [], {}
    for ev in cal.children:
        if ev.name != "VEVENT":
            continue
        rp, rv = ev.first("RECURRENCE-ID")
        if rv is not None:
            r = when(rp, rv, zones)
            if r is not None:
                moved.setdefault(ev.text("UID"), set()).add(key_of(r))
                masters.append((ev, True))
            continue
        masters.append((ev, False))
    out, details = [], {}
    for (ev, is_moved) in masters:
        if ev.text("STATUS").upper() == "CANCELLED" or declined(ev, me):
            continue
        uid = ev.text("UID")
        p, v = ev.first("DTSTART")
        start = when(p, v, zones)
        if start is None:
            continue
        timed = isinstance(start, datetime)
        ep, evv = ev.first("DTEND")
        end = when(ep, evv, zones) if evv is not None else None
        if end is not None and isinstance(end, datetime) == timed:
            length = (end - start).days * 86400 if not timed else end.timestamp() - start.timestamp()
        else:
            d = duration_s(ev.first("DURATION")[1])
            length = d if d is not None else (86400 if not timed else 0)
        length = max(0, length)
        # One that began before the window and is still on counts.
        occs = [start] if is_moved else starts(ev, start, zones, local, lo - length, hi)
        common, dkey = None, "e%d" % len(details)
        for o in occs:
            if not is_moved and key_of(o) in moved.get(uid, ()):
                continue
            s = instant(o, local)
            if timed:
                e = s + length
            else:
                e = instant(o + timedelta(days=max(1, round(length / 86400))), local)
            if e <= lo or s >= hi:
                continue
            if common is None:
                op, ov = ev.first("ORGANIZER")
                details[dkey] = {
                    "description": plain(ev.text("DESCRIPTION")),
                    "organizer": (param(op, "CN") or re.sub(r"^mailto:", "", ov or "", flags=re.I)).strip()[:120],
                    "guests": len(ev.all("ATTENDEE")),
                    "page": google_page(uid, cal_id),
                }
                common = {
                    "title": ev.text("SUMMARY").strip()[:300] or "(no title)",
                    "location": ev.text("LOCATION").strip()[:300],
                    "link": join_link(ev),
                    "tentative": ev.text("STATUS").upper() == "TENTATIVE",
                    "d": dkey,
                }
            row = dict(common)
            row.update({
                "key": "%s/%d" % (uid or row["title"], int(s)),
                "uid": bool(uid),
                "start": int(s * 1000),
                "end": int(e * 1000),
                "allDay": not timed,
                "day": datetime.fromtimestamp(s, local).date().isoformat(),
            })
            out.append(row)
    return out, details


# ---------------------------------------------------------------- feeds

def where(url):
    """('file', path) or ('web', url), or (None, why)."""
    u = (url or "").strip()
    if u.startswith("webcal://"):
        u = "https://" + u[len("webcal://"):]
    if u.startswith("file://"):
        return "file", urllib.parse.unquote(u[len("file://"):])
    if u == "~" or u.startswith("~/"):
        return "file", os.path.join(os.environ.get("HOME", ""), u[2:])
    if u.startswith("/"):
        return "file", u
    if re.match(r"https?://", u, re.I):
        return "web", u
    return None, "not an https:// or webcal:// address, nor a file"


class HttpsOnly(urllib.request.HTTPRedirectHandler):
    """Follows a feed's redirect, but never from https to anything else:
    an address asked for over https is not read in the clear (codex's
    review, 2026-10-09). urllib follows ten at most, and only to http,
    https and ftp; ftp is no feed's either."""
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        to = (newurl or "").lower()
        if req.full_url.lower().startswith("https://") and not to.startswith("https://"):
            raise urllib.error.HTTPError(newurl, code, "a redirect away from https", headers, fp)
        if not to.startswith(("https://", "http://")):
            raise urllib.error.HTTPError(newurl, code, "a redirect to no web address", headers, fp)
        return super().redirect_request(req, fp, code, msg, headers, newurl)


OPENER = urllib.request.build_opener(HttpsOnly)


def fetch(url, cache_dir, now):
    """The feed's text, and its { ok, error, stale, fetchedAt }."""
    kind, at = where(url)
    if kind is None:
        return None, {"ok": False, "error": at}
    if kind == "file":
        try:
            if os.path.getsize(at) > MAX_BYTES:
                return None, {"ok": False, "error": "over 20 MB"}
            with open(at, "rb") as f:
                return f.read().decode("utf-8", "replace"), {"ok": True, "fetchedAt": int(os.path.getmtime(at) * 1000)}
        except OSError as e:
            return None, {"ok": False, "error": e.strerror or "could not be read"}
    base = os.path.join(cache_dir, hashlib.sha256(at.encode()).hexdigest()[:20])
    meta = {}
    try:
        os.makedirs(cache_dir, mode=0o700, exist_ok=True)
        keeps = True
    except OSError:
        keeps = False
    try:
        with open(base + ".json") as f:
            meta = json.load(f)
        meta["fetchedAt"] = int(meta.get("fetchedAt") or 0)
    except (OSError, ValueError, TypeError, AttributeError):
        meta = {}
    have = keeps and os.path.exists(base + ".ics")
    if have and now - meta.get("fetchedAt", 0) / 1000 < FRESH_S:
        with open(base + ".ics", "rb") as f:
            return f.read().decode("utf-8", "replace"), {"ok": True, "fetchedAt": meta.get("fetchedAt", 0)}
    req = urllib.request.Request(at, headers={"User-Agent": "nodi-calendar", "Accept": "text/calendar, */*"})
    if have and meta.get("etag"):
        req.add_header("If-None-Match", meta["etag"])
    if have and meta.get("modified"):
        req.add_header("If-Modified-Since", meta["modified"])
    error = ""
    try:
        with OPENER.open(req, timeout=TIMEOUT_S) as r:
            # The socket's timeout is for each read: a feed that trickles
            # is bounded as a whole too (Sonnet 2026-10-06).
            body, until = bytearray(), time.monotonic() + READ_S
            while len(body) <= MAX_BYTES:
                if time.monotonic() > until:
                    raise TimeoutError()
                piece = r.read1(65536)
                if not piece:
                    break
                body += piece
            if len(body) > MAX_BYTES:
                error = "over 20 MB"
            elif b"BEGIN:VCALENDAR" not in body[:4096].upper():
                error = "not a calendar"
            else:
                meta = {"fetchedAt": int(now * 1000), "etag": r.headers.get("ETag", ""), "modified": r.headers.get("Last-Modified", "")}
                if keeps:
                    try:
                        write_private(base + ".ics", bytes(body))
                        write_meta(base, meta)
                    except OSError:
                        pass
                return body.decode("utf-8", "replace"), {"ok": True, "fetchedAt": meta["fetchedAt"]}
    except urllib.error.HTTPError as e:
        if e.code == 304 and have:
            meta["fetchedAt"] = int(now * 1000)
            try:
                write_meta(base, meta)
            except OSError:
                pass
            with open(base + ".ics", "rb") as f:
                return f.read().decode("utf-8", "replace"), {"ok": True, "fetchedAt": meta["fetchedAt"]}
        # A redirect refused: ours says why; urllib's own, to a scheme it
        # follows to nowhere (file:), says it with its code.
        error = e.msg if e.msg == "a redirect away from https" else "a redirect to no web address" if e.code in (301, 302, 303, 307, 308) else "HTTP %d" % e.code
    except urllib.error.URLError as e:
        error = "could not be reached (%s)" % (getattr(e.reason, "strerror", None) or e.reason)
    except (TimeoutError, OSError) as e:
        error = "timed out" if isinstance(e, TimeoutError) else (e.strerror or "could not be read")
    except Exception as e:
        error = "could not be read (%s)" % type(e).__name__
    if have:
        with open(base + ".ics", "rb") as f:
            return f.read().decode("utf-8", "replace"), {"ok": True, "stale": True, "error": error, "fetchedAt": meta.get("fetchedAt", 0)}
    return None, {"ok": False, "error": error or "could not be read"}


# A feed's fetch, any failure of it its own.
def fetched(url, cache_dir, now):
    try:
        return fetch(url, cache_dir, now)
    except Exception as e:
        return None, {"ok": False, "error": "could not be read (%s)" % type(e).__name__}


def write_private(path, data):
    """`data` (bytes) to `path`, whole or not at all: written to a file of
    its own beside it (mkstemp: a name of its own, made with O_EXCL, 0600,
    so no name another could have put a link at), then renamed over it
    (codex's review, 2026-10-09)."""
    fd, tmp = tempfile.mkstemp(dir=os.path.dirname(path) or ".", prefix="." + os.path.basename(path) + ".", suffix=".tmp")
    try:
        with os.fdopen(fd, "wb") as f:
            f.write(data)
        os.replace(tmp, path)
    except BaseException:
        try:
            os.unlink(tmp)
        except OSError:
            pass
        raise


def write_meta(base, meta):
    write_private(base + ".json", json.dumps(meta).encode("utf-8"))


def google_id(url):
    kind, at = where(url)
    if kind != "web":
        return ""
    parts = urllib.parse.urlsplit(at)
    m = GOOGLE_FEED.match(parts.path)
    if parts.hostname not in ("calendar.google.com", "www.google.com") or not m:
        return ""
    return urllib.parse.unquote(m.group(1))


def main():
    cache_dir = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.environ.get("HOME", "/tmp"), ".cache/nodi/calendar")
    try:
        want = json.loads(os.environ.get("NODI_ICS") or "{}")
    except ValueError:
        want = {}
    now = float(os.environ.get("NODI_NOW") or 0) / 1000 or time.time()
    local = local_zone()
    today = datetime.fromtimestamp(now, local).date()
    lo = datetime(today.year, today.month, today.day, tzinfo=local).timestamp()
    end_day = today + timedelta(days=DAYS)
    hi = datetime(end_day.year, end_day.month, end_day.day, tzinfo=local).timestamp()
    report, events, details = [], [], {}
    feeds = [c if isinstance(c, dict) else {} for c in (want.get("calendars") or [])]
    # Side by side: one at a time, a few slow feeds would outlast the
    # bar's deadline for the read, and every feed would fail with them.
    # Each address once: two fetches of one would write one cache file at
    # the same time (Sonnet 2026-10-06).
    urls = list(dict.fromkeys(str(c.get("url") or "") for c in feeds))
    with ThreadPoolExecutor(max_workers=max(1, min(len(urls), 8))) as pool:
        by_url = dict(zip(urls, pool.map(lambda u: fetched(u, cache_dir, now), urls)))
    seen = set()
    for i, c in enumerate(feeds):
        url = str(c.get("url") or "")
        text, state = by_url[url]
        state = dict(state)
        report.append(state)
        state["name"] = str(c.get("name") or "")
        if text is None:
            state["name"] = state["name"] or "Calendar %d" % (i + 1)
            continue
        cal_id = google_id(url)
        me = {str(want.get("me") or "").strip().lower(), cal_id.lower()} - {""}
        try:
            got = expanded(cache_dir, url, text.lstrip("\ufeff"), state["name"], i, cal_id, me, local, lo, hi)
        except Exception as e:
            got = {"error": "could not be read (%s)" % type(e).__name__}
        state["name"] = state["name"] or got.get("name") or "Calendar %d" % (i + 1)
        if got.get("error"):
            state.update({"ok": False, "error": got["error"]})
            continue
        for r in got["events"]:
            # One meeting in two of your calendars (its UID and start) is
            # one row, from the first (Sonnet 2026-10-06: two rows of one
            # key); one with no UID is keyed by its calendar, never merged.
            if not r.pop("uid", True):
                r["key"] = "c%d/%s" % (i, r["key"])
            elif r["key"] in seen:
                continue
            seen.add(r["key"])
            r["calendar"] = state["name"]
            r["d"] = "c%d%s" % (i, r["d"])
            events.append(r)
        details.update(("c%d%s" % (i, k), v) for (k, v) in got["details"].items())
    events.sort(key=lambda e: (e["start"], not e["allDay"], e["title"]))
    print(json.dumps({"at": int(now * 1000), "calendars": report, "events": events, "details": details}))


# The window is whole days, so a feed's occurrences are the same all day
# while its text is: kept with what they came of, and read back for it
# (a big feed takes most of a second to expand).
def expanded(cache_dir, url, text, name, i, cal_id, me, local, lo, hi):
    stamp = hashlib.sha256(json.dumps([VERSION, text, sorted(me), str(local), lo, hi]).encode()).hexdigest()
    path = os.path.join(cache_dir, hashlib.sha256(url.encode()).hexdigest()[:20] + ".out.json")
    try:
        with open(path) as f:
            kept = json.load(f)
        if kept.get("stamp") == stamp and isinstance(kept.get("events"), list):
            return kept
    except (OSError, ValueError, AttributeError):
        pass
    cal = parse(text)
    if cal is None:
        return {"error": "not a calendar"}
    rows, details = events_of(cal, cal_id, me, local, lo, hi)
    got = {"stamp": stamp, "name": cal.text("X-WR-CALNAME").strip(), "events": rows, "details": details}
    try:
        os.makedirs(cache_dir, mode=0o700, exist_ok=True)
        write_private(path, json.dumps(got).encode("utf-8"))
    except OSError:
        pass
    return got


if __name__ == "__main__":
    main()
