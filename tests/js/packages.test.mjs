// Packages and a dictionary (ROADMAP 65).
import { test } from "node:test";
import assert from "node:assert/strict";
import { urlOf, needsEnvironment } from "./curl.mjs";
import { load, plain } from "./load.mjs";
import { run } from "./fixtures.mjs";

const P = load("providers/packages.js");
const D = load("providers/dictionary.js");

const repoOut = "extra/fd 10.5.0-3 [installed]\n    Simple, fast and user-friendly alternative to find\nextra/fd-find 1.0-1\n    Not real\nextra/sfd 2.0-1\n    Has fd inside\n";
const aurOut = JSON.stringify({ resultcount: 3, type: "search", results: [{ Name: "fd-git", Version: "10.2.0.r12-1", Description: "fd from git" },
  { Name: "fd", Version: "9.0-1", Description: "a duplicate name" }, { Name: "bad name; x", Version: "1" }] });

test("pacman's lines and the AUR's answer: name, version, installed, description", () => {
  assert.deepEqual(plain(P.parse(repoOut)), [
    { repo: "extra", name: "fd", version: "10.5.0-3", installed: true, description: "Simple, fast and user-friendly alternative to find" },
    { repo: "extra", name: "fd-find", version: "1.0-1", installed: false, description: "Not real" },
    { repo: "extra", name: "sfd", version: "2.0-1", installed: false, description: "Has fd inside" }]);
  assert.deepEqual(plain(P.parseAur(aurOut).map(p => [p.repo, p.name, p.installed, p.description])), [["aur", "fd-git", false, "fd from git"], ["aur", "fd", false, "a duplicate name"]],
                   "a name no package could have left out");
  assert.throws(() => P.parseAur(JSON.stringify({ type: "error", error: "Too many package results." })), /the AUR: Too many package results\./);
  assert.throws(() => P.parseAur("<html>"), /did not read/);
  assert.throws(() => P.parseAur("null"), /it refused/);
  assert.deepEqual(plain(P.parseAur("{}")), []);
});

test("pkg: one list by name, the repositories' before the AUR's at each, Enter installing in Omarchy's terminal", () => {
  const rows = run("pkg fd", { pkgRepo: P.parse(repoOut), pkgAur: P.parseAur(aurOut) }).filter(r => r.provider === "packages");
  assert.deepEqual(plain(rows.map(r => r.title)), ["fd", "fd-find", "fd-git", "sfd"], "the AUR's fd-git by its name before a description's match");
  assert.deepEqual([rows[0].badge, rows[0].actionLabel], ["Installed", "Open its page"]);
  assert.equal(rows[0].actions.find(a => /^Remove/.test(a.label)).confirm, true, "removing asks twice");
  assert.deepEqual(plain(rows[1].run.argv), ["xdg-terminal-exec", "--app-id=org.omarchy.terminal", "bash", "-c", 'omarchy-pkg-add "$1"; omarchy-show-done', "nodi-pkg", "fd-find"],
                   "Done whatever happens, so a failure stays to be read (Sonnet 2026-10-06)");
  assert.deepEqual(plain(rows[2].run.argv.slice(-3)), ['omarchy-pkg-aur-add "$1"; omarchy-show-done', "nodi-pkg", "fd-git"]);
  assert.match(rows[2].subtitle, /^aur, /);
  // What is installed now marks every row once read: the repositories'
  // list is five minutes old (Fable 2026-10-10).
  const now = run("pkg fd", { pkgRepo: P.parse(repoOut), pkgAur: P.parseAur(aurOut), pkgInstalled: ["sfd", "fd-git"] }).filter(r => r.provider === "packages");
  assert.deepEqual(plain(now.map(r => [r.title, r.badge])), [["fd", ""], ["fd-find", ""], ["fd-git", "Installed"], ["sfd", "Installed"]], "fd removed, sfd installed since");
  const many = Array.from({ length: 40 }, (_, i) => ({ repo: "extra", name: "haskell-zed" + i, version: "1", installed: false, description: "zed" }));
  const capped = run("pkg zed", { pkgRepo: many, pkgAur: [{ repo: "aur", name: "zed-bin", version: "1", installed: false, description: "" }] }).filter(r => r.provider === "packages");
  assert.equal(capped[0].title, "zed-bin", "the AUR's own by name, ahead of thirty description matches (Sonnet 2026-10-06)");
  assert.ok(run("pkg fd", { pkgRepo: [] }).some(r => r.title === "Asking the AUR..."));
  assert.equal(run("pkg f", {}).find(r => r.provider === "packages").title, "Search packages", "two letters or more");
  const third = P.rowOf({ repo: "omarchy", name: "gpu-thing", version: "1", installed: true, description: "" }, 90);
  assert.deepEqual([third.run, third.actionLabel], [null, ""], "a third party's repository has no page on Arch's");
});

test("the words in no argument: every package listed and searched here, the AUR by its longest word from the environment (the marketplace's review, 2026-10-10)", () => {
  const S = P.provider.sources;
  assert.deepEqual(plain(S["pkg-repo"].argv("noto font")), ["/usr/bin/pacman", "-Ss"]);
  assert.deepEqual(plain(S["pkg-installed"].argv()), ["/usr/bin/pacman", "-Qq"]);
  assert.ok(!plain(S["pkg-aur"].argv("noto")).some(a => a.includes("noto")));
  assert.match(urlOf(S["pkg-aur"], "நொடி font"), /^https:\/\/aur\.archlinux\.org\/rpc\/v5\/search\/%E0%AE[^/?]*%20font\?by=name-desc$/, "encoded by curl");
  assert.ok(needsEnvironment(S["pkg-aur"], "noto"), "from the environment only");
  const a = plain(S["pkg-aur"].argv());
  assert.deepEqual([a[1], a[a.indexOf("--proto") + 1], a.includes("-L")], ["-q", "=https", false]);
  assert.equal(P.aurWord("ttf noto font"), "noto");
  assert.throws(() => S["pkg-aur"].parse("", false), /did not answer/);
  assert.throws(() => S["pkg-repo"].parse("", false), /could not list/);
  assert.throws(() => S["pkg-installed"].parse("", false), /could not list/);
  assert.deepEqual(plain(S["pkg-installed"].parse("fd\nzed\n\nbad name\n", true)), ["fd", "zed"]);
  // Several words: each in the name or the description, as pacman -Ss and
  // the AUR's own search find them; an installed AUR package says so.
  const repo = [{ repo: "extra", name: "noto-fonts", version: "1", installed: false, description: "Google Noto TTF fonts" },
                { repo: "extra", name: "noto-tools", version: "1", installed: false, description: "Tools" }];
  const found = run("pkg Noto font", { pkgRepo: repo, pkgAur: [{ repo: "aur", name: "noto-fonts-cjk-git", version: "1", installed: false, description: "Noto CJK fonts" }],
                                       pkgInstalled: ["noto-fonts-cjk-git"] }).filter(r => r.provider === "packages");
  assert.deepEqual(plain(found.map(r => [r.title, r.badge])), [["noto-fonts", ""], ["noto-fonts-cjk-git", "Installed"]]);
  assert.deepEqual(plain(run("pkg a b", { pkgRepo: [{ repo: "extra", name: "ab", version: "1", installed: false, description: "" }] }).filter(r => r.provider === "packages").map(r => r.title)),
                   ["ab"], "words of one letter: the AUR is not asked");
  const rows = run("pkg qqqq", { pkgRepo: [], failed: { "pkg-aur": "Error during AUR search" } }).filter(r => r.provider === "packages");
  assert.deepEqual(plain(rows.map(r => r.title)), ["The AUR did not answer"], "never \"no package\" when the AUR was not asked");
});

const wiki = { en: [{ partOfSpeech: "Noun", language: "English", definitions: [
  { definition: "An <a href=\"/wiki/x\">unsought</a>, unintended &amp; <i>fortunate</i> discovery.", examples: ["It was <b>pure</b> serendipity."] },
  { definition: "" }] }],
  ta: [{ partOfSpeech: "Noun", language: "Tamil", definitions: [{ definition: "A greeting." }] }] };

test("define: Wiktionary's senses as plain text, English first, a row each, Enter copying it", () => {
  const s = D.senses(wiki);
  assert.deepEqual(plain(s.map(x => [x.lang, x.text])), [["en", "An unsought, unintended & fortunate discovery."], ["ta", "A greeting."]]);
  assert.deepEqual(plain(s[0].examples), ["It was pure serendipity."]);
  const rows = run("define serendipity", { define: s }).filter(r => r.provider === "dictionary");
  assert.deepEqual(plain(rows.map(r => r.title)), ["An unsought, unintended & fortunate discovery.", "A greeting.", "Open \"serendipity\" on Wiktionary"]);
  assert.equal(rows[0].copy, "An unsought, unintended & fortunate discovery.");
  assert.match(rows[0].preview.markdown, /> It was pure serendipity\./);
  assert.equal(run("define xyzzy", { define: [] }).find(r => r.provider === "dictionary").title, "No definition of \"xyzzy\"");
  assert.ok(!D.provider.sources.define.argv("வணக்கம்").some(a => a.includes("வணக்கம்")), "the word in no argument");
  const d = D.provider.sources.define.argv("x");
  assert.deepEqual([d[1], d[d.indexOf("--max-filesize") + 1], d[d.indexOf("--proto") + 1], d.includes("-L")], ["-q", "4194304", "=https", false], "no ~/.curlrc, at most its cap, over https, no redirect followed");
  assert.match(urlOf(D.provider.sources.define, "வணக்கம்"), /^https:\/\/en\.wiktionary\.org\/api\/rest_v1\/page\/definition\/%E0%AE[^/]*$/, "the word encoded, by curl");
  assert.ok(needsEnvironment(D.provider.sources.define, "வணக்கம்"), "from the environment only");
  assert.equal(D.plain("a&#39;b &lt;c&gt;"), "a'b <c>");
  assert.equal(D.plain("x&#x2014;y &mdash; &amp;lt;"), "x\u2014y \u2014 &lt;", "hex, named, and &amp; once (Sonnet 2026-10-06)");
  assert.equal(D.md("*a* _b_ # c"), "\\*a\\* \\_b\\_ \\# c", "the pane's Markdown shows a sense as it is");
  const many = Array.from({ length: 10 }, (_, i) => ({ lang: "en", text: "e" + i })).concat([{ lang: "ta", text: "t0" }, { lang: "fr", text: "f0" }]);
  assert.deepEqual(plain(D.spread(many, 8).map(s => s.text)), ["e0", "e1", "e2", "e3", "e4", "e5", "t0", "f0"], "other languages have room");
  assert.equal(D.spread(many.slice(0, 10), 8).length, 8, "English alone fills it");
  const cased = run("define Hello", { define: [] }).filter(r => r.provider === "dictionary");
  assert.equal(cased[0].complete, "define hello", "Wiktionary is by case");
});

test("define: an answer that did not come or did not read says so, and one still on its way says it is looking", () => {
  const parse = D.provider.sources.define.parse;
  assert.throws(() => parse("", false), /Wiktionary did not answer/);
  assert.throws(() => parse("<html>", true), /Wiktionary's answer did not read/);
  const down = run("define xyzzy", { failed: { define: "timed out" } }).filter(r => r.provider === "dictionary");
  assert.deepEqual(plain(down.map(r => [r.title, r.subtitle])), [["Wiktionary did not answer", "timed out"]]);
  const waiting = run("define xyzzy", {}).filter(r => r.provider === "dictionary");
  assert.deepEqual(plain(waiting.map(r => [r.title, r.subtitle])), [["Looking up xyzzy...", "Wiktionary"]]);
});

test("packages: nothing in pacman or the AUR for the words says so", () => {
  const rows = run("pkg zzqxv", { pkgRepo: [], pkgAur: [] }).filter(r => r.provider === "packages");
  assert.deepEqual(plain(rows.map(r => [r.title, r.subtitle])), [["No package named or about \"zzqxv\"", "pacman and the AUR"]]);
});

test("define: Wiktionary's answer as it sends it, read into senses", () => {
  const got = plain(D.provider.sources.define.parse(JSON.stringify({ en: [{ partOfSpeech: "Noun", definitions: [{ definition: "A <b>happy</b> accident." }] }] }), true));
  assert.equal(got.length, 1);
  assert.match(JSON.stringify(got[0]), /A happy accident\./);
});
