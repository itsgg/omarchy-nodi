// The clipboard history's pins, kinds, text in images, sending to a device,
// and pasting in sequence (ROADMAP 54): providers/clipboard.js and the pins
// lib/Prefs.js keeps.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, execFile } from "node:child_process";
import { mkdtempSync, writeFileSync, mkdirSync, chmodSync, readFileSync, existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { load, plain } from "./load.mjs";
import { run } from "./fixtures.mjs";

const Prefs = load("lib/Prefs.js");
const Rows = load("lib/Rows.js");
const Clip = load("providers/clipboard.js");

const history = [
  { type: "text", text: "https://github.com/itsgg/omarchy-nodi" },
  { type: "image", path: "/s/clipboard-images/aa.png", mime: "image/png", capturedAt: "Monday 10:00" },
  { type: "text", text: "#ff8800" },
  { type: "text", text: "the meeting notes\nsecond line" },
  { type: "image", path: "/s/clipboard-images/bb.png", mime: "image/png", capturedAt: "Monday 09:00" }
];
const keyOf = (q, extra, text) => run(q, { clipboard: history, ...extra }).find(r => r.title.startsWith(text)).key;

test("a pin is kept with what it holds, newest on top, and toggles off", () => {
  let p = Prefs.toggledPin(Prefs.empty(), "clip:text:1", { kind: "text", text: "one" });
  p = Prefs.toggledPin(p, "clip:image:/s/a.png", { kind: "image", path: "/s/a.png", mime: "image/png" });
  assert.deepEqual(plain(p.pins.map(e => e.key)), ["clip:image:/s/a.png", "clip:text:1"]);
  assert.ok(Prefs.isPinned(p, "clip:text:1"));
  assert.ok(!Prefs.isPinned(Prefs.toggledPin(p, "clip:text:1"), "clip:text:1"), "a second Pin unpins");
  assert.deepEqual(plain(Prefs.load(Prefs.serialize(p)).pins), plain(p.pins), "kept across a restart");
  assert.equal(Prefs.toggledPin(p, "k", { kind: "image", path: "rel.png" }), null, "an image by an absolute path only");
  assert.equal(Prefs.toggledPin(p, "k", { kind: "text", text: "" }), null);
  assert.equal(Prefs.toggledPin(p, "k", { kind: "text", text: "x".repeat(65537) }), null, "over 64 KB is not kept");
  const twice = JSON.stringify({ version: 1, pins: [{ key: "a", kind: "text", text: "x" }, { key: "a", kind: "text", text: "y" }, { key: "b", kind: "nope" }] });
  assert.deepEqual(plain(Prefs.load(twice).pins), [{ key: "a", kind: "text", text: "x" }], "a file's repeats and junk are dropped");
  assert.deepEqual(plain(Prefs.load("{}").pins), [], "an older file has none");
});

test("Ctrl+K on an entry offers Pin, then Unpin; other rows offer neither", () => {
  const row = run("cb ", { clipboard: history })[0];
  const labels = prefs => plain(Rows.actionsFor(row, { prefs }).map(a => a.label));
  assert.ok(labels(Prefs.empty()).includes("Pin"));
  const pinned = Prefs.toggledPin(Prefs.empty(), row.key, row.pin);
  assert.ok(labels(pinned).includes("Unpin"));
  assert.equal(Rows.actionsFor(row, { prefs: pinned }).find(a => a.label === "Unpin").nodi, "pinClip");
  const other = run("firefox", {})[0];
  assert.ok(!plain(Rows.actionsFor(other, { prefs: Prefs.empty() }).map(a => a.label)).includes("Pin"));
  const pinOffered = text => plain(Rows.actionsFor(run("cb ", { clipboard: [{ type: "text", text }] })[0], { prefs: Prefs.empty() })
    .map(a => a.label)).includes("Pin");
  assert.ok(!pinOffered("y".repeat(70000)), "too long to keep");
  assert.ok(pinOffered("y".repeat(65536)), "64 KB of ASCII is kept");
  assert.ok(!pinOffered("\u0BA4".repeat(30000)), "30,000 Tamil letters are 90 KB in UTF-8: not kept (Fable 2026-10-06)");
  assert.ok(pinOffered("\u0BA4".repeat(21000)), "21,000 are 63 KB");
  assert.ok(Prefs.textFits("\u{1F600}".repeat(16384)) && !Prefs.textFits("\u{1F600}".repeat(16385)), "an emoji is four bytes");
});

test("pins come first under cb, once each, pasting by their place while the history holds them", () => {
  const notes = keyOf("cb ", {}, "the meeting notes");
  let prefs = Prefs.toggledPin(Prefs.empty(), notes, { kind: "text", text: history[3].text });
  prefs = Prefs.toggledPin(prefs, "clip:text:gone", { kind: "text", text: "an old address" });
  prefs = Prefs.toggledPin(prefs, "clip:image:/s/clipboard-images/bb.png", { kind: "image", path: "/s/clipboard-images/bb.png", mime: "image/png" });
  const rows = run("cb ", { clipboard: history, prefs });
  assert.deepEqual(plain(rows.slice(0, 3).map(r => [r.title, r.group, r.icon])),
                   [["Image, Monday 09:00", "Pinned", "󰐃"], ["an old address", "Pinned", "󰐃"], ["the meeting notes", "Pinned", "󰐃"]]);
  assert.equal(rows.filter(r => r.title === "the meeting notes").length, 1, "shown once, pinned");
  assert.equal(rows.filter(r => r.key === "clip:image:/s/clipboard-images/bb.png").length, 1);
  assert.deepEqual(plain(rows[2].run.argv), ["omarchy-clipboard-paste-text", "--shift-insert", "--history-index", "3"]);
  assert.deepEqual(plain(rows[1].run), { kind: "paste", text: "an old address" }, "gone from the history: from the pin, its text in no argument");
  assert.equal(rows[1].subtitle, "Pinned, 14 characters");
  assert.deepEqual(plain(rows[0].run.argv), ["omarchy-clipboard-paste-file", "image/png", "/s/clipboard-images/bb.png"]);
  assert.equal(rows.length, 6, "three pins and the three entries left");
  const read = { texts: {}, left: 0, at: 0 };
  assert.deepEqual(plain(run("cb address", { clipboard: history, prefs, ocr: read }).map(r => r.title)), ["an old address"], "a pin is searched too");
  const monday = run("cb monday", { clipboard: history, prefs, ocr: read });
  assert.deepEqual(plain(monday.map(r => [r.key, r.group])), [["clip:image:/s/clipboard-images/bb.png", "Pinned"], ["clip:image:/s/clipboard-images/aa.png", "Clipboard"]],
                   "a pinned image by when it was copied, once, first (Fable 2026-10-06)");
  const asked = [];
  const gone = Prefs.toggledPin(prefs, "clip:image:/s/clipboard-images/cc.png", { kind: "image", path: "/s/clipboard-images/cc.png" });
  run("cb words", { clipboard: history, prefs: gone, asked });
  assert.deepEqual(asked.filter(k => k.startsWith("ocr")), ["ocr:/s/clipboard-images/cc.png"], "a pinned image the history lost is read too");
  assert.equal(run("cb ", { clipboard: [], prefs })[0].title, "Image", "pins with an empty history, as kept");
  assert.equal(run("cb ", { clipboard: [], prefs: Prefs.empty() })[0].title, "The clipboard history is empty");
});

test("one kind of entry by the word after cb", () => {
  const titles = q => plain(run(q, { clipboard: history }).map(r => r.title));
  assert.deepEqual(titles("cb img"), ["Image, Monday 10:00", "Image, Monday 09:00"]);
  assert.deepEqual(titles("cb url"), ["https://github.com/itsgg/omarchy-nodi"]);
  assert.deepEqual(titles("cb color"), ["#ff8800"]);
  assert.deepEqual(titles("cb text"), ["the meeting notes"]);
  assert.deepEqual(titles("cb url nodi"), ["https://github.com/itsgg/omarchy-nodi"], "then words");
  const nothing = run("cb url nothing", { clipboard: history })[0];
  assert.deepEqual([nothing.title, nothing.subtitle], ["No links in the history match \"nothing\"", "cb text url finds the word"]);
  assert.deepEqual(titles("cb img"), ["Image, Monday 10:00", "Image, Monday 09:00"]);
  assert.deepEqual(plain(run("cb img", { clipboard: [history[0]] }).map(r => r.title)), ["No images in the history"]);
  assert.equal(Clip.kindOf({ type: "text", text: "rgb(1, 2, 3)" }), "color");
  assert.equal(Clip.kindOf({ type: "text", text: "see https://x.y" }), "text", "a link inside words is text");
});

test("an image by the words in it: one read for them all, and only when a search asks", () => {
  const asked = [];
  const ocr = { texts: { "/s/clipboard-images/aa.png": "INVOICE #42 Total due" }, left: 0, at: 0 };
  assert.deepEqual(plain(run("cb invoice", { clipboard: history, ocr, asked }).map(r => r.title)), ["Image, Monday 10:00"]);
  assert.deepEqual(asked.filter(k => k.startsWith("ocr")), ["ocr"], "one read for every image (Fable 2026-10-06)");
  const none = [];
  const rows = run("cb ", { clipboard: history, ocr, asked: none });
  assert.equal(rows.find(r => r.key === "clip:image:/s/clipboard-images/aa.png").subtitle, "INVOICE #42 Total due", "what is read already shows");
  assert.equal(rows.find(r => r.key === "clip:image:/s/clipboard-images/bb.png").subtitle, "/s/clipboard-images/bb.png", "else its path");
  run("cb url invoice", { clipboard: history, asked: none });
  run("cb hello", { clipboard: [history[0]], asked: none });
  assert.deepEqual(none, [], "no read for the bare list, another kind, or a history with no image");
  assert.deepEqual(plain(run("cb zebra", { clipboard: history, ocr: { texts: {}, left: 2, at: 0 } }).map(r => r.title)), ["Reading the text in 2 more images"]);
  assert.deepEqual(plain(run("cb zebra", { clipboard: history }).map(r => r.title)), ["Reading the text in the images"], "the first read on its way");
  assert.deepEqual(plain(run("cb url nothing", { clipboard: history, ocr: { texts: {}, left: 2, at: 0 } }).map(r => r.title)),
                   ["No links in the history match \"nothing\""], "another kind reads no image, and says so (Fable 2026-10-06)");
  const notes = run("cb notes", { clipboard: history, ocr: { texts: {}, left: 2, at: 0 } });
  assert.deepEqual(plain(notes.map(r => r.title)), ["the meeting notes", "Reading the text in 2 more images"], "under what matched");

  const src = Clip.provider.sources.ocr;
  const v = src.parse("/a.png\tINVOICE  #42\n/b.png\t\njunk\nleft\t3\n", true);
  assert.deepEqual(plain([v.texts, v.left]), [{ "/a.png": "INVOICE #42", "/b.png": "" }, 3]);
  assert.throws(() => src.parse("", false));
  assert.ok(src.fresh({ left: 0, at: 1000 }, 2000));
  assert.ok(!src.fresh({ left: 2, at: 1000 }, 1001), "again at once while images are left");
  assert.ok(!src.fresh({ left: 0, at: 0 }, 31000), "a new image within 30 s");
  assert.deepEqual(plain(src.argv("/s/p.png\nrel\n").slice(3)), ["nodi-ocr", "/s/p.png"], "pinned paths as arguments, absolute only");
  assert.deepEqual(plain(src.argv("").slice(3)), ["nodi-ocr"]);
});

// The OCR script in a home of its own, tesseract replaced by a stub that
// records each image it reads.
function ocrHome(names, sleep) {
  const dir = mkdtempSync(join(tmpdir(), "nodi-ocr-"));
  mkdirSync(join(dir, ".local/state/omarchy"), { recursive: true });
  mkdirSync(join(dir, "img"));
  for (const n of names) if (n !== "missing.png") writeFileSync(join(dir, "img", n), "");
  writeFileSync(join(dir, ".local/state/omarchy/clipboard-history.json"),
                JSON.stringify([{ type: "text", text: "x" }, ...names.map(n => ({ type: "image", path: join(dir, "img", n) }))]));
  mkdirSync(join(dir, "bin"));
  writeFileSync(join(dir, "bin/tesseract"), '#!/bin/bash\nprintf "%s\\n" "$1" >> "$HOME/ran"; sleep ' + (sleep || 0)
    + '\ncase "$1" in *bad*) exit 1 ;; esac; printf "words of\\t%s\\n" "${1##*/}"\n');
  chmodSync(join(dir, "bin/tesseract"), 0o755);
  const read = (...extra) => Clip.provider.sources.ocr.parse(execFileSync("/usr/bin/bash", ["-c", Clip.OCR, "nodi-ocr", ...extra],
    { env: { HOME: dir, PATH: join(dir, "bin") + ":/usr/bin" } }).toString(), true);
  const ran = () => existsSync(join(dir, "ran")) ? readFileSync(join(dir, "ran"), "utf8").split("\n").filter(Boolean).length : 0;
  return { dir, read, ran };
}

test("the OCR script reads each image once, keeps a failure as nothing, and pinned ones too", () => {
  const h = ocrHome(["a.png", "bad.png", "missing.png"]);
  try {
    writeFileSync(join(h.dir, "img/p.png"), "");
    const v = h.read(join(h.dir, "img/p.png"));
    const at = n => join(h.dir, "img", n);
    assert.deepEqual(plain(v.texts), { [at("a.png")]: "words of a.png", [at("bad.png")]: "", [at("p.png")]: "words of p.png" });
    assert.equal(v.left, 0);
    assert.equal(h.ran(), 3, "the missing file is not read");
    h.read();
    assert.equal(h.ran(), 3, "the cache answers the second read");
  } finally { rmSync(h.dir, { recursive: true, force: true }); }
});

test("the OCR script leaves what does not fit in 3 s to the next read", () => {
  const h = ocrHome(["1.png", "2.png", "3.png", "4.png"], 1.2);
  try {
    const v = h.read();
    assert.ok(v.left >= 1, "left " + v.left);
    assert.equal(Object.keys(v.texts).length + v.left, 4);
    const w = h.read();
    assert.equal(Object.keys(w.texts).length + w.left, 4);
    assert.ok(w.left < v.left, "the next read goes on");
  } finally { rmSync(h.dir, { recursive: true, force: true }); }
});

test("send to a device: an entry is copied first, an image goes as its file", () => {
  const rows = run("cb ", { clipboard: history });
  const send = r => r.actions.find(a => a.label === "Send to a device").run;
  const text = send(rows[0]);
  assert.equal(text.kind, "shell");
  assert.deepEqual(plain(text.args), ["0"], "named by its place, never its text");
  assert.match(text.script, /--copy-only --history-index "\$1" && exec omarchy-menu-share clipboard/);
  assert.deepEqual(plain(send(rows[1]).argv), ["omarchy-menu-share", "file", "/s/clipboard-images/aa.png"]);
});

// The sequence script against a history file, with the paste replaced by a
// recorder, in a home of its own.
function sequenceHome(entries) {
  const dir = mkdtempSync(join(tmpdir(), "nodi-seq-"));
  mkdirSync(join(dir, ".local/state/omarchy"), { recursive: true });
  writeFileSync(join(dir, ".local/state/omarchy/clipboard-history.json"), JSON.stringify(entries));
  mkdirSync(join(dir, "bin"));
  // The paste's programs: wl-copy keeps what reaches its stdin, and every
  // program says its arguments, so a text in one shows.
  writeFileSync(join(dir, "bin/wl-copy"), '#!/bin/bash\nprintf "%s\\n" "$*" >> "$HOME/argv"\n{ cat; printf "\\0"; } >> "$HOME/pasted"\n');
  writeFileSync(join(dir, "bin/wtype"), '#!/bin/bash\nprintf "%s\\n" "$*" >> "$HOME/argv"\n');
  chmodSync(join(dir, "bin/wl-copy"), 0o755); chmodSync(join(dir, "bin/wtype"), 0o755);
  mkdirSync(join(dir, "run"), { mode: 0o700 });
  const press = () => execFileSync("/usr/bin/bash", ["-c", Clip.SEQUENCE],
    { env: { HOME: dir, XDG_RUNTIME_DIR: join(dir, "run"), PATH: join(dir, "bin") + ":/usr/bin" } });
  const pasted = () => existsSync(join(dir, "pasted")) ? readFileSync(join(dir, "pasted"), "utf8").split("\0").filter(Boolean) : [];
  const argv = () => existsSync(join(dir, "argv")) ? readFileSync(join(dir, "argv"), "utf8") : "";
  return { dir, press, pasted, argv };
}

test("in sequence: the newest text, then each older one, images skipped, then nothing", () => {
  const h = sequenceHome([{ type: "text", text: "third" }, { type: "image", path: "/x.png" }, { type: "text", text: "second\n" }, { type: "text", text: "first" }]);
  try {
    for (let i = 0; i < 4; i++) h.press();
    assert.deepEqual(h.pasted(), ["third", "second\n", "first"], "a last newline kept");
    assert.doesNotMatch(h.argv(), /third|second|first/, "no text in a program's arguments");
    assert.match(h.argv(), /^--type text\/plain --sensitive --foreground\n-M shift -k Insert -m shift\n/, "pasted as Omarchy's emoji insert pastes");
    // Later than 30 s: from the newest again, as the history is then.
    writeFileSync(join(h.dir, "run/nodi-sequence/at"), String(Math.floor(Date.now() / 1000) - 31));
    writeFileSync(join(h.dir, ".local/state/omarchy/clipboard-history.json"), JSON.stringify([{ type: "text", text: "fresh" }]));
    h.press();
    assert.equal(h.pasted().at(-1), "fresh");
    writeFileSync(join(h.dir, "run/nodi-sequence/at"), "");
    h.press();
    assert.equal(h.pasted().at(-1), "fresh", "a state file that is no number starts afresh (Fable 2026-10-06)");
  } finally { rmSync(h.dir, { recursive: true, force: true }); }
  const row = run("paste the clipboard in sequence", {})[0];
  assert.equal(row.title, "Paste the clipboard in sequence");
  assert.equal(row.run.kind, "shell");
});

test("in sequence: two presses at once paste two entries, and a text over 64 KB is left out", async () => {
  const h = sequenceHome([{ type: "text", text: "third" }, { type: "text", text: "x".repeat(70000) }, { type: "text", text: "second" }]);
  try {
    const env = { HOME: h.dir, XDG_RUNTIME_DIR: join(h.dir, "run"), PATH: join(h.dir, "bin") + ":/usr/bin" };
    const press = () => new Promise((ok, fail) => execFile("/usr/bin/bash", ["-c", Clip.SEQUENCE], { env }, e => e ? fail(e) : ok()));
    await Promise.all([press(), press()]);
    assert.deepEqual(h.pasted().sort(), ["second", "third"]);
  } finally { rmSync(h.dir, { recursive: true, force: true }); }
});
