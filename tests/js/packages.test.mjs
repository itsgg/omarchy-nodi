// Packages and a dictionary (ROADMAP 65).
import { test } from "node:test";
import assert from "node:assert/strict";
import { load, plain } from "./load.mjs";
import { run } from "./fixtures.mjs";

const P = load("providers/packages.js");
const D = load("providers/dictionary.js");

const repoOut = "extra/fd 10.5.0-3 [installed]\n    Simple, fast and user-friendly alternative to find\nextra/fd-find 1.0-1\n    Not real\nextra/sfd 2.0-1\n    Has fd inside\n";
const aurOut = "aur/fd-git 10.2.0.r12-1 (+2 0.00) [3d1h] \n    fd from git\naur/fd 9.0-1 (+0 0.00) [1d] \n    a duplicate name\n";

test("pacman's and yay's lines: name, version, installed, description", () => {
  assert.deepEqual(plain(P.parse(repoOut)), [
    { repo: "extra", name: "fd", version: "10.5.0-3", installed: true, description: "Simple, fast and user-friendly alternative to find" },
    { repo: "extra", name: "fd-find", version: "1.0-1", installed: false, description: "Not real" },
    { repo: "extra", name: "sfd", version: "2.0-1", installed: false, description: "Has fd inside" }]);
  assert.deepEqual(plain(P.parse(aurOut).map(p => [p.repo, p.name, p.installed])), [["aur", "fd-git", false], ["aur", "fd", false]]);
  assert.equal(P.literal("c++"), "c\\+\\+", "pacman -Ss takes a pattern: the text typed, as it is");
});

test("pkg: one list by name, the repositories' before the AUR's at each, Enter installing in Omarchy's terminal", () => {
  const rows = run("pkg fd", { pkgRepo: P.parse(repoOut), pkgAur: P.parse(aurOut) }).filter(r => r.provider === "packages");
  assert.deepEqual(plain(rows.map(r => r.title)), ["fd", "fd-find", "fd-git", "sfd"], "the AUR's fd-git by its name before a description's match");
  assert.deepEqual([rows[0].badge, rows[0].actionLabel], ["Installed", "Open its page"]);
  assert.equal(rows[0].actions.find(a => /^Remove/.test(a.label)).confirm, true, "removing asks twice");
  assert.deepEqual(plain(rows[1].run.argv), ["xdg-terminal-exec", "--app-id=org.omarchy.terminal", "bash", "-c", 'omarchy-pkg-add "$1"; omarchy-show-done', "nodi-pkg", "fd-find"],
                   "Done whatever happens, so a failure stays to be read (Sonnet 2026-10-06)");
  assert.deepEqual(plain(rows[2].run.argv.slice(-3)), ['omarchy-pkg-aur-add "$1"; omarchy-show-done', "nodi-pkg", "fd-git"]);
  assert.match(rows[2].subtitle, /^aur, /);
  const many = Array.from({ length: 40 }, (_, i) => ({ repo: "extra", name: "haskell-zed" + i, version: "1", installed: false, description: "zed" }));
  const capped = run("pkg zed", { pkgRepo: many, pkgAur: [{ repo: "aur", name: "zed-bin", version: "1", installed: false, description: "" }] }).filter(r => r.provider === "packages");
  assert.equal(capped[0].title, "zed-bin", "the AUR's own by name, ahead of thirty description matches (Sonnet 2026-10-06)");
  assert.ok(run("pkg fd", { pkgRepo: [] }).some(r => r.title === "Asking the AUR..."));
  assert.equal(run("pkg f", {}).find(r => r.provider === "packages").title, "Search packages", "two letters or more");
  const third = P.rowOf({ repo: "omarchy", name: "gpu-thing", version: "1", installed: true, description: "" }, 90);
  assert.deepEqual([third.run, third.actionLabel], [null, ""], "a third party's repository has no page on Arch's");
});

test("several words are several terms; the AUR not answering says so", () => {
  assert.deepEqual(plain(P.provider.sources["pkg-repo"].argv("noto  font").slice(2)), ["--", "noto", "font"]);
  assert.deepEqual(plain(P.provider.sources["pkg-aur"].argv("noto font").slice(-2)), ["noto", "font"]);
  assert.throws(() => P.provider.sources["pkg-aur"].parse("", false), /did not answer/);
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
  assert.match(D.provider.sources.define.argv("வணக்கம்").at(-1), /\/page\/definition\/%E0%AE/, "the word encoded");
  assert.equal(D.plain("a&#39;b &lt;c&gt;"), "a'b <c>");
  assert.equal(D.plain("x&#x2014;y &mdash; &amp;lt;"), "x\u2014y \u2014 &lt;", "hex, named, and &amp; once (Sonnet 2026-10-06)");
  assert.equal(D.md("*a* _b_ # c"), "\\*a\\* \\_b\\_ \\# c", "the pane's Markdown shows a sense as it is");
  const many = Array.from({ length: 10 }, (_, i) => ({ lang: "en", text: "e" + i })).concat([{ lang: "ta", text: "t0" }, { lang: "fr", text: "f0" }]);
  assert.deepEqual(plain(D.spread(many, 8).map(s => s.text)), ["e0", "e1", "e2", "e3", "e4", "e5", "t0", "f0"], "other languages have room");
  assert.equal(D.spread(many.slice(0, 10), 8).length, 8, "English alone fills it");
  const cased = run("define Hello", { define: [] }).filter(r => r.provider === "dictionary");
  assert.equal(cased[0].complete, "define hello", "Wiktionary is by case");
});
