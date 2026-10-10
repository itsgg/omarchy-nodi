// An http(s) address opens by a page of Nodi's own (lib/Run.js OPEN_PAGE):
// the address in no process's arguments, where another local user can read
// it in /proc (the marketplace's review of f444138, 2026-10-10). The page is
// 0600 in a 0700 folder, handed to the browser that opens https by its
// path, and gone a while later.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, chmodSync, readFileSync, readdirSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { load, plain } from "./load.mjs";

const Run = load("lib/Run.js");
const LOGIN = ["bash", "-lc", 'exec "$@"', "nodi"];
const URL_ = 'https://www.google.com/search?q=the%20merger&x="</script><img src=x> ';

test("an http(s) address goes to the browser in a page, never an argument; a path or another scheme opens as before", () => {
  const c = plain(Run.command(Run.open(URL_)));
  assert.deepEqual(c.command, ["bash", "-lc", Run.OPEN_PAGE, "nodi"]);
  assert.equal(c.environment.NODI_TEXT, Run.forwardingPage(URL_), "the page, in the environment");
  assert.ok(!c.command.some(a => a.includes("merger") || a.includes("google")), "the address in no argument");
  assert.equal(plain(Run.command(Run.open("HTTP://example.org/a"))).environment.NODI_TEXT, Run.forwardingPage("HTTP://example.org/a"), "the scheme in any case");
  assert.deepEqual(plain(Run.command(Run.open("/home/u/notes.md"))), LOGIN.concat(["gio", "open", "/home/u/notes.md"]));
  assert.deepEqual(plain(Run.command(Run.open("obsidian://open?vault=v"))), LOGIN.concat(["gio", "open", "obsidian://open?vault=v"]));
  assert.equal(Run.describe(Run.open(URL_)), "Open in the browser:\n" + URL_, "the pane still says the address");
});

test("the page forwards by script, refresh and link, the address unable to end the script or an attribute", () => {
  const p = Run.forwardingPage(URL_);
  assert.equal(p.split("</script>").length, 2, "one script, ended by its own tag only");
  assert.ok(!/<img/.test(p), "no tag from the address");
  const js = p.match(/location\.replace\((.*?)\)<\/script>/)[1];
  assert.equal(JSON.parse(js), URL_, "the script's string is the address");
  assert.ok(!js.includes(" "), "no raw line separator in the script");
  const attr = p.match(/content="0;url=([^"]*)"/)[1];
  assert.equal(attr.replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#39;/g, "'").replace(/&amp;/g, "&"), URL_, "the refresh's address, escaped");
  assert.match(p, /<meta name="referrer" content="no-referrer">/);
  assert.match(p, /<a href="https:\/\/www\.google\.com\/search\?q=the%20merger&amp;x=&quot;/);
  // A line or paragraph separator ends a script's string in older engines,
  // and a quote an attribute: neither left raw (Fable 2026-10-10: the
  // address held neither, so the test could not tell).
  const odd = Run.forwardingPage("https://x.example/a\u2028b\u2029c'd");
  const oddJs = odd.match(/location\.replace\((.*?)\)<\/script>/)[1];
  assert.ok(!/[\u2028\u2029]/.test(oddJs) && oddJs.includes("\\u2028") && oddJs.includes("\\u2029"), oddJs);
  assert.equal(JSON.parse(oddJs), "https://x.example/a\u2028b\u2029c'd");
  assert.ok(odd.includes('content="0;url=https://x.example/a\u2028b\u2029c&#39;d"'), "the quote escaped in the attribute");
});

function stage(t, https) {
  const bin = join(t, "bin"), run = join(t, "run"), log = join(t, "log");
  mkdirSync(bin); mkdirSync(run, { mode: 0o700 });
  writeFileSync(join(bin, "xdg-mime"), https === null ? "#!/bin/bash\nexit 1\n" : '#!/bin/bash\n[ "$*" = "query default x-scheme-handler/https" ] && echo ' + https + "\n");
  // Each records what it was given, the environment's NODI_TEXT, and the
  // page it was handed with the modes of it and its folder.
  const seen = '#!/bin/bash\nprintf "%s\\n" "$0 $*" >> "$LOG"\nprintf "text=%s\\n" "${NODI_TEXT-unset}" >> "$LOG"\n'
    + 'p=${@: -1}; p=${p#file://}; stat -c %a "${p%/*}" "$p" | paste -sd " " >> "$LOG"; cp -- "$p" "$LOG.page"\n';
  for (const f of ["gtk-launch", "gio"]) { writeFileSync(join(bin, f), seen); chmodSync(join(bin, f), 0o755); }
  chmodSync(join(bin, "xdg-mime"), 0o755);
  return spawnSync("/usr/bin/bash", ["-c", Run.OPEN_PAGE, "nodi", "1"],
                   { encoding: "utf8", env: { PATH: bin + ":/usr/bin:/bin", XDG_RUNTIME_DIR: run, LOG: log, NODI_TEXT: Run.forwardingPage(URL_) } });
}

test("the page is written 0600 in a 0700 folder, opened by its path in the https browser, and goes after its time", async () => {
  const t = mkdtempSync(join(tmpdir(), "nodi-open-"));
  try {
    const r = stage(t, "fakebrowser.desktop");
    assert.equal(r.status, 0, r.stderr);
    const log = readFileSync(join(t, "log"), "utf8").trim().split("\n");
    assert.match(log[0], /\/gtk-launch fakebrowser\.desktop file:\/\/.*\/run\/nodi-open\.[A-Za-z0-9]{10}\/open\.html$/, "by its path, in the browser for https");
    assert.equal(log[1], "text=unset", "the page's text is not handed on");
    assert.equal(log[2], "700 600", "its folder and the page his alone");
    assert.equal(readFileSync(join(t, "log.page"), "utf8"), Run.forwardingPage(URL_));
    assert.ok(!log.join("\n").includes("merger"), "the address in no argument");
    assert.equal(readdirSync(join(t, "run")).length, 1);
    await new Promise(res => setTimeout(res, 2500));
    assert.deepEqual(readdirSync(join(t, "run")), [], "gone after its time");
  } finally { rmSync(t, { recursive: true, force: true }); }
});

test("with no browser known for https, gio opens the page as a file", () => {
  const t = mkdtempSync(join(tmpdir(), "nodi-open-"));
  try {
    const r = stage(t, null);
    assert.equal(r.status, 0, r.stderr);
    const log = readFileSync(join(t, "log"), "utf8").trim().split("\n");
    assert.match(log[0], /\/gio open \/.*\/run\/nodi-open\.[A-Za-z0-9]{10}\/open\.html$/);
    assert.ok(existsSync(join(t, "log.page")));
  } finally { rmSync(t, { recursive: true, force: true }); }
});
