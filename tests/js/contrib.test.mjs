// Extensions that come with Nodi (ROADMAP 81): named in settings, made
// whole from contrib/, and each program run on a home of its own, with
// stand-ins for gh, docker and curl.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readdirSync, statSync, readFileSync, chmodSync, utimesSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { load, plain, root } from "./load.mjs";
import { defaults } from "./fixtures.mjs";

const Contrib = load("lib/Contrib.js");
const Config = load("lib/Config.js");
const Filters = load("providers/filters.js");
const DIR = "/plug";

test("a name in settings is made whole; what the entry sets wins; nothing else runs", () => {
  const c = Config.merge(defaults, { filters: [{ contrib: "obsidian" }, { contrib: "issues", keyword: "i", args: ["-v", 3] },
                                               { contrib: "weather" }, { contrib: "nope" }, { contrib: "../x" },
                                               { contrib: "containers", command: ["/bin/sh", "-c", "evil"] },
                                               { keyword: "n", command: ["my-notes"] }],
                                     answers: [{ contrib: "weather" }, { contrib: "obsidian" }] }, DIR);
  const f = plain(c.filters);
  assert.deepEqual([f[0].keyword, f[0].title, f[0].list, f[0].refresh, f[0].command], ["ob", "Obsidian", true, "2m", [DIR + "/contrib/obsidian"]]);
  assert.deepEqual([f[1].keyword, f[1].command], ["i", [DIR + "/contrib/issues", "-v"]], "your keyword, and your args after the program");
  assert.deepEqual(f[5].command, [DIR + "/contrib/containers"], "a command of the entry's own never replaces the program named");
  assert.deepEqual(f[6], { keyword: "n", command: ["my-notes"] }, "an entry of your own is as it was");
  // An answer named among filters, an unknown name, a path: no program, so
  // the filter list leaves them out.
  assert.deepEqual(plain(Filters.list(c.filters).map(x => x.keyword)), ["ob", "i", "dk", "n"]);
  assert.deepEqual(plain(c.answers.map(a => a.command || null)), [[DIR + "/contrib/weather"], null]);
  assert.equal(Config.merge(defaults, { filters: [{ contrib: "obsidian" }] }).filters[0].command, undefined, "no plugin folder known: nothing to run");
  // Each reads NODI_QUERY: an "argument": true would hand it the words as
  // one more argument, read as its own (the marketplace's review, 2026-10-10).
  const a = plain(Config.merge(defaults, { answers: [{ contrib: "weather", argument: true, args: ["us"] }] }, DIR).answers[0]);
  assert.deepEqual([a.argument, a.command], [undefined, [DIR + "/contrib/weather", "us"]]);
});

test("every name has its program, executable, and every program its name", () => {
  const files = readdirSync(join(root, "contrib")).filter(n => n !== "README.md").sort();
  assert.deepEqual(files, Object.keys(Contrib.CATALOGUE).sort());
  const readme = readFileSync(join(root, "contrib/README.md"), "utf8");
  for (const n of files) {
    assert.ok(statSync(join(root, "contrib", n)).mode & 0o111, n + " is executable");
    assert.match(readFileSync(join(root, "contrib", n), "utf8"), new RegExp("^#![^\\n]+\\n# Nodi's `" + n + "`"), n + " says what it is");
    assert.ok(readme.includes("| `" + n + "` |"), n + " is in contrib/README.md");
  }
});

function home() {
  const dir = mkdtempSync(join(tmpdir(), "nodi-contrib-"));
  const bin = join(dir, "bin");
  mkdirSync(bin);
  return {
    dir,
    stub: (name, script) => { writeFileSync(join(bin, name), "#!/bin/bash\n" + script); chmodSync(join(bin, name), 0o755); },
    run: (name, args = [], env = {}) => execFileSync(join(root, "contrib", name), args,
      { env: { HOME: dir, PATH: bin + ":/usr/local/bin:/usr/bin:/bin", LANG: "C.UTF-8", ...env } }).toString(),
    done: () => rmSync(dir, { recursive: true, force: true })
  };
}

test("obsidian: a vault's notes newest first, front matter left out, Enter opening Obsidian", () => {
  const h = home();
  try {
    assert.match(plain(Filters.parse(h.run("obsidian"), {})[0].title), /^No Obsidian vault found/);
    const vault = join(h.dir, "Notes vault");
    const note = (rel, text, t) => { mkdirSync(join(vault, rel, ".."), { recursive: true }); writeFileSync(join(vault, rel), text); utimesSync(join(vault, rel), t, t); };
    note("daily/2026-10-07.md", "---\ntags: [day]\n---\n# Today\n\nShip it.", 2000);
    note("ideas & \"quotes\".md", "Old idea", 1000);
    note(".obsidian/workspace.md", "not a note", 3000);
    note("தமிழ்.md", "வணக்கம்", 1500);
    // A name that is not UTF-8 is left out, not the end of the list.
    writeFileSync(Buffer.concat([Buffer.from(join(vault, "caf")), Buffer.from([0xe9]), Buffer.from(".md")]), "latin-1");
    // A folder linked into the vault is read, once.
    mkdirSync(join(h.dir, "elsewhere"));
    writeFileSync(join(h.dir, "elsewhere", "linked.md"), "x");
    utimesSync(join(h.dir, "elsewhere", "linked.md"), 500, 500);
    symlinkSync(join(h.dir, "elsewhere"), join(vault, "link"));
    symlinkSync(join(vault, "daily"), join(vault, "daily", "loop"));
    mkdirSync(join(h.dir, ".config/obsidian"), { recursive: true });
    writeFileSync(join(h.dir, ".config/obsidian/obsidian.json"), JSON.stringify({ vaults: { a: { path: vault, ts: 1 } } }));
    const rows = Filters.parse(h.run("obsidian"), { keyword: "ob", title: "Obsidian" });
    assert.deepEqual(plain(rows.map(r => [r.title, r.subtitle])),
      [["2026-10-07", "Notes vault / daily"], ["தமிழ்", "Notes vault"], ["ideas & \"quotes\"", "Notes vault"], ["linked", "Notes vault / link"]]);
    assert.equal(plain(rows[0].run.target), "obsidian://open?path=" + encodeURIComponent(join(vault, "daily/2026-10-07.md")));
    assert.equal(plain(rows[0].preview.markdown), "# Today\n\nShip it.", "front matter is Obsidian's, not the note's");
    assert.deepEqual(plain(Filters.parse(h.run("obsidian", [join(vault, "daily")]), {}).map(r => r.title)), ["2026-10-07"], "the folders given");
  } finally { h.done(); }
});

test("obsidian: a note it cannot read is listed without its text; a vault past 900 KB of rows is cut there", () => {
  const h = home();
  try {
    const vault = join(h.dir, "v");
    mkdirSync(vault);
    writeFileSync(join(vault, "locked.md"), "secret");
    chmodSync(join(vault, "locked.md"), 0o000);
    let rows = Filters.parse(h.run("obsidian", [vault]), {});
    chmodSync(join(vault, "locked.md"), 0o600);
    assert.deepEqual(plain(rows.map(r => [r.title, r.preview.markdown])), [["locked", ""]]);
    // A thousand notes of 800 letters: more rows than the 900 KB a list may print.
    const body = "x".repeat(800);
    for (let i = 0; i < 1000; i++) writeFileSync(join(vault, "n" + String(i).padStart(4, "0") + ".md"), body);
    const out = h.run("obsidian", [vault]);
    const printed = out.split("\n").filter(Boolean).length;
    assert.ok(Buffer.byteLength(out) <= 900 * 1024, "within its budget: " + Buffer.byteLength(out));
    assert.ok(printed < 1000, "cut before the end: " + printed + " rows printed");
    // Cut where the next row would not fit, not anywhere under the budget
    // (Cursor's review, 2026-10-10).
    const longest = Math.max(...out.split("\n").map(l => Buffer.byteLength(l) + 1));
    assert.ok(Buffer.byteLength(out) > 900 * 1024 - longest, "filled to within a row: " + Buffer.byteLength(out) + ", rows up to " + longest);
  } finally { h.done(); }
});

test("issues: assigned issues with their labels; gh's failure said as a row", () => {
  const h = home();
  try {
    h.stub("gh", 'echo "$*" > "$HOME/gh-args"; echo \'[{"number": 7, "title": "Fix \\"it\\"", "repository": {"nameWithOwner": "o/r"}, "url": "https://github.com/o/r/issues/7", '
      + '"updatedAt": "2026-10-07T00:00:00Z", "labels": [{"name": "bug"}, {"name": "P1"}]}]\'\n');
    const rows = Filters.parse(h.run("issues"), {});
    assert.deepEqual(plain(rows.map(r => [r.title, r.subtitle, r.run.target])), [["Fix \"it\"", "o/r #7, bug, P1", "https://github.com/o/r/issues/7"]]);
    assert.equal(readFileSync(join(h.dir, "gh-args"), "utf8").trim(),
      "search issues --assignee=@me --state=open --sort=updated --limit 100 --json number,title,repository,url,updatedAt,labels");
    h.stub("gh", 'echo "[]"\n');
    assert.match(plain(Filters.parse(h.run("issues"), {})[0].title), /^No open issues/);
    h.stub("gh", 'echo "To get started with GitHub CLI, please run:  gh auth login" >&2; '
      + 'echo "Alternatively, populate the GH_TOKEN environment variable with a GitHub API authentication token." >&2; exit 4\n');
    const failed = Filters.parse(h.run("issues"), {})[0];
    assert.deepEqual(plain([failed.title, failed.subtitle, failed.run]), ["GitHub did not answer", "To get started with GitHub CLI, please run:  gh auth login", null]);
  } finally { h.done(); }
});

test("containers: running first, stop asked twice, a shell and the logs in a terminal; Docker's trouble said", () => {
  const h = home();
  try {
    const id = "a".repeat(64), id2 = "b".repeat(64);
    h.stub("docker", `echo "$*" > "$HOME/docker-args"; printf '%s\\n' '{"ID":"${id2}","Names":"old","Image":"pg:16","State":"exited","Status":"Exited (0) 2 days ago","Ports":""}' `
      + `'{"ID":"${id}","Names":"web","Image":"nginx","State":"running","Status":"Up 3 hours","Ports":"0.0.0.0:80->80/tcp"}' '{"ID":"$(rm -rf ~)","Names":"bad"}'\n`);
    const rows = Filters.parse(h.run("containers"), {});
    assert.deepEqual(plain(rows.map(r => [r.title, r.subtitle, r.badge])),
      [["web", "nginx, Up 3 hours, 0.0.0.0:80->80/tcp", "running"], ["old", "pg:16, Exited (0) 2 days ago", "exited"]], "an id that is not one is left out");
    assert.equal(readFileSync(join(h.dir, "docker-args"), "utf8").trim(), "ps -a --no-trunc --format {{json .}}");
    assert.deepEqual(plain(rows[0].run.argv), ["uwsm-app", "--", "xdg-terminal-exec", "--", "docker", "logs", "--follow", "--tail", "200", id]);
    const stop = rows[0].actions.find(a => a.label === "Stop");
    assert.deepEqual(plain([stop.run.argv, stop.confirm]), [["docker", "stop", id], true]);
    assert.deepEqual(plain(rows[1].actions.map(a => a.label)), ["Start", "Copy its id"]);
    h.stub("docker", 'echo "permission denied while trying to connect to the Docker daemon socket" >&2; exit 1\n');
    assert.match(plain(Filters.parse(h.run("containers"), {})[0].subtitle), /^You are not in the docker group/);
    h.stub("docker", 'echo "Cannot connect to the Docker daemon at unix:///var/run/docker.sock. Is the docker daemon running?" >&2; exit 1\n');
    const down = Filters.parse(h.run("containers"), {})[0];
    assert.deepEqual(plain([down.title, down.subtitle]), ["No containers to show", "Docker is not running: sudo systemctl start docker"]);
    h.stub("docker", "exit 1\n");
    assert.equal(plain(Filters.parse(h.run("containers"), {})[0].subtitle), "docker gave no reason");
  } finally { h.done(); }
});

// A stand-in curl that asks real curl what URL its template makes, from
// the variables it was given, into --expand-write-out: nothing is fetched,
// and $url is what curl would ask for. Each call's own arguments are kept.
const CURL = 'printf "%s\\n" "$*" >> "$HOME/argv.log"; printf "%s\\n" "$*" >> "$HOME/curl.log"\n'
  + 'vars=(); tmpl=; out=; prev=\n'
  + 'for a; do case $prev in --variable) vars+=(--variable "$a");; --expand-url) tmpl=$a;; -o) out=$a;; esac; prev=$a; done\n'
  + 'url=$(/usr/bin/curl -q -s "${vars[@]}" --expand-write-out "$tmpl" -o /dev/null file:///dev/null)\n';

// The other programs a contrib script starts, each keeping its arguments.
function logged(h, names) {
  for (const n of names) h.stub(n, 'printf "%s\\n" "$*" >> "$HOME/argv.log"; exec /usr/bin/' + n + ' "$@"\n');
}

test("wikipedia and weather: Markdown from what the sites send, and nothing asked for a bad language", () => {
  const h = home();
  try {
    h.stub("curl", CURL + 'case "$url" in *list=search*srsearch=tamil%20language) echo \'{"query":{"search":[{"title":"Tamil language"}]}}\';; '
      + '*rest_v1/page/summary/Tamil_language) echo \'{"title":"Tamil language","description":"Dravidian language","extract":"Tamil is old.",'
      + '"content_urls":{"desktop":{"page":"https://en.wikipedia.org/wiki/Tamil_language"}}}\';; *) exit 22;; esac\n');
    assert.equal(h.run("wikipedia", [], { NODI_QUERY: "tamil language" }),
      "# Tamil language\n\n*Dravidian language*\n\nTamil is old.\n\n[Read the article](https://en.wikipedia.org/wiki/Tamil_language)\n");
    h.stub("curl", CURL + 'echo \'{"query":{"search":[]}}\'\n');
    assert.equal(h.run("wikipedia", [], { NODI_QUERY: "zzqx" }), "Wikipedia has no article for *zzqx*.\n");
    assert.match(h.run("wikipedia", ["e;n"], { NODI_QUERY: "x" }), /^No Wikipedia is named/);
    // The summary failing after the search found the article: said, not an empty answer.
    h.stub("curl", CURL + 'case "$url" in *list=search*) echo \'{"query":{"search":[{"title":"Gone"}]}}\';; *) exit 22;; esac\n');
    assert.throws(() => h.run("wikipedia", [], { NODI_QUERY: "gone" }), e => /Wikipedia did not answer/.test(String(e.stderr)));
    assert.equal(readFileSync(join(h.dir, "curl.log"), "utf8").split("\n").filter(Boolean).length, 5, "the bad language asked nothing");
    const day = (d, lo, hi) => ({ date: d, mintempC: lo, maxtempC: hi, mintempF: "0", maxtempF: "0", hourly: [{}, {}, {}, {}, { weatherDesc: [{ value: "Sunny " }] }] });
    const j1 = { nearest_area: [{ areaName: [{ value: "Sowcarpet" }], country: [{ value: "India" }] }],
                 current_condition: [{ temp_C: "31", temp_F: "88", FeelsLikeC: "34", FeelsLikeF: "93", weatherDesc: [{ value: " Sunny" }],
                                       humidity: "60", windspeedKmph: "17", windspeedMiles: "11", precipMM: "0.0" }],
                 weather: [day("2026-10-07", "28", "31"), day("2026-10-08", "27", "30")] };
    // As curl -o FILE -w '%{http_code}' does: the body to the file, the status out.
    h.stub("curl", CURL
      + 'case "$url" in https://wttr.in/chennai?format=j1|https://wttr.in/new+york?format=j1|https://wttr.in/?format=j1) cat > "$out" <<"J"\n' + JSON.stringify(j1) + '\nJ\nprintf 200;; *) : > "$out"; printf 404;; esac\n');
    assert.equal(h.run("weather", [], { NODI_QUERY: "chennai" }), "# chennai\n\n*Measured near Sowcarpet, India*\n\n**31°C**, Sunny, feels like 34°C\n\n"
      + "Humidity 60%, wind 17 km/h, rain 0.0 mm\n\n| Day | Low | High | Sky |\n|---|---|---|---|\n"
      + "| 2026-10-07 | 28°C | 31°C | Sunny |\n| 2026-10-08 | 27°C | 30°C | Sunny |\n");
    assert.match(h.run("weather", ["us"], { NODI_QUERY: "new york" }), /^# new york\n[\s\S]*\*\*88°F\*\*, Sunny, feels like 93°F[\s\S]*wind 11 mph/,
                 "a place of two words as wttr.in takes it; Fahrenheit when the argument says us");
    assert.match(h.run("weather", [], { NODI_QUERY: "Here" }), /^# Sowcarpet, India\n\n\*\*31°C\*\*/, "here: no place asked, the station named");
    assert.equal(h.run("weather", [], { NODI_QUERY: "zzzzqqx" }), "wttr.in knows no place called *zzzzqqx*.\n");
    // Any other status: wttr.in's trouble, said, and the answer failed.
    h.stub("curl", CURL + ': > "$out"; printf 503\n');
    assert.throws(() => h.run("weather", [], { NODI_QUERY: "chennai" }), e => e.status === 1 && /wttr\.in did not answer \(503\)\./.test(String(e.stderr)));
  } finally { h.done(); }
});

test("wikipedia and weather: the words reach no program's arguments, only curl's variables and jq's environment (the marketplace's review, 2026-10-10)", () => {
  const h = home();
  try {
    logged(h, ["jq", "tr", "cat", "mktemp", "rm"]);
    h.stub("curl", CURL + 'case "$url" in *list=search*) echo \'{"query":{"search":[{"title":"Secret merger plan"}]}}\';; '
      + '*rest_v1/page/summary/Secret_merger_plan) echo \'{"title":"Secret merger plan","extract":"x","content_urls":{"desktop":{"page":"https://x"}}}\';; *) exit 22;; esac\n');
    assert.match(h.run("wikipedia", [], { NODI_QUERY: "secret merger plan" }), /^# Secret merger plan/, "found, through the variables");
    h.stub("curl", CURL + 'case "$url" in https://wttr.in/acme+hq+chennai?format=j1) printf "not json" > "$out"; printf 200;; *) : > "$out"; printf 404;; esac\n');
    assert.throws(() => h.run("weather", [], { NODI_QUERY: "acme hq chennai" }), e => /wttr\.in gave no weather/.test(String(e.stderr)), "asked for the place, through the variable");
    // Random names (the test's folder, mktemp's file) can spell a word:
    // "hq" was in one (2026-10-10).
    const argvs = readFileSync(join(h.dir, "argv.log"), "utf8").split(h.dir).join("<home>").replace(/\/tmp\/tmp\.[A-Za-z0-9]+/g, "<tmp>");
    assert.ok(argvs.includes("--variable"), "the log has the calls");
    for (const w of ["secret", "merger", "Secret_merger", "acme", "hq"]) assert.ok(!argvs.toLowerCase().includes(w.toLowerCase()), "in an argument: " + w);
  } finally { h.done(); }
});
