// A paste goes to the window the bar opened over (ROADMAP 69).
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, mkdirSync, chmodSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { load, plain } from "./load.mjs";

const Run = load("lib/Run.js");

test("which runs paste: Omarchy's pastes, never their copy-only form", () => {
  assert.equal(Run.pastes(Run.exec(["omarchy-menu-emoji-insert", "x"])), true);
  assert.equal(Run.pastes(Run.exec(["omarchy-clipboard-paste-text", "--shift-insert", "--history-index", "2"])), true);
  assert.equal(Run.pastes(Run.exec(["omarchy-clipboard-paste-text", "--copy-only", "--history-index", "2"])), false);
  assert.equal(Run.pastes(Run.exec(["omarchy-clipboard-paste-file", "image/png", "/a.png"])), true);
  assert.equal(Run.pastes(Run.copy("x")), false);
  assert.equal(Run.pastes(Run.paste("x")), true);
  assert.equal(Run.pastes(Run.exec(["firefox"])), false);
  assert.equal(Run.pastes(Run.shell('exec wtype -- "$1"', ["x"])), false, "a shell run is a paste only when marked");
  const marked = Run.pasting(Run.shell('exec wtype -- "$1"', ["x"]));
  assert.equal(Run.pastes(marked), true);
  assert.equal(Run.valid(marked), true);
  assert.equal(Run.command(marked, null, "", "0x5b8f")[2], Run.FOCUS_FIRST, "a marked shell run focuses first (Sonnet 2026-10-06)");
});

// The paste and the copy themselves, run against stand-ins for wl-copy and
// wtype that say their arguments and whether NODI_TEXT reached them.
function stand() {
  const dir = mkdtempSync(join(tmpdir(), "nodi-paste-"));
  mkdirSync(join(dir, "bin"));
  const say = 'printf "%s %s|%s\\n" "${0##*/}" "$*" "${NODI_TEXT-unset}" >> "$HOME/argv"\n';
  writeFileSync(join(dir, "bin/wl-copy"), "#!/bin/bash\n" + say + 'cat >> "$HOME/clipboard"\n');
  writeFileSync(join(dir, "bin/wtype"), "#!/bin/bash\n" + say);
  chmodSync(join(dir, "bin/wl-copy"), 0o755); chmodSync(join(dir, "bin/wtype"), 0o755);
  const go = c => execFileSync(c.command[0], c.command.slice(1), { env: { HOME: dir, PATH: join(dir, "bin") + ":/usr/bin", ...c.environment } });
  const read = f => { try { return readFileSync(join(dir, f), "utf8") } catch (e) { return "" } };
  return { dir, go, read };
}

test("a paste and a copy carry their text in the environment, never an argument, and no program they start gets it (the marketplace's review, 2026-10-08)", () => {
  const secret = "my 'pass' $(word)\nline two";
  const s = stand();
  try {
    const p = plain(Run.command(Run.paste(secret, 2)));
    assert.deepEqual(p.environment, { NODI_TEXT: secret });
    assert.ok(!p.command.some(a => a.includes("pass")), "not in the paste's own argv");
    s.go(p);
    assert.equal(s.read("clipboard"), secret, "the text reached the clipboard whole, through stdin");
    assert.equal(s.read("argv"), "wl-copy --type text/plain --sensitive --foreground|unset\nwtype -M shift -k Insert -m shift|unset\nwtype -k Left -k Left|unset\n",
                 "as Omarchy's emoji insert pastes, then the cursor back; NODI_TEXT gone before each program");
    rmSync(join(s.dir, "argv")); rmSync(join(s.dir, "clipboard"));
    const c = plain(Run.command(Run.copy(secret)));
    assert.ok(!c.command.some(a => a.includes("pass")));
    s.go(c);
    assert.deepEqual([s.read("clipboard"), s.read("argv")], [secret, "wl-copy |unset\n"]);
    const n = plain(Run.command(Run.shell('printf "%s" "$NODI_TEXT" > "$HOME/got"', ["a"], secret)));
    assert.deepEqual([n.environment, n.command.includes("a")], [{ NODI_TEXT: secret }, true], "a shell run's text beside its arguments");
    const pasted = plain(Run.command(Run.paste(secret), null, "", "0x5b8f"));
    assert.deepEqual([pasted.command[2], pasted.environment], [Run.FOCUS_FIRST, { NODI_TEXT: secret }], "focused first, the text kept");
  } finally { rmSync(s.dir, { recursive: true, force: true }); }
  assert.equal(Run.valid(Run.paste("")), false);
  assert.equal(Run.paste("x", 900).back, 500);
  assert.equal(Run.describe(Run.paste("hi")), "Paste into the window:\nhi");
  assert.equal(Run.verb(Run.paste("hi")), "Paste");
});

test("the helpers around a command never get its text or title: the focus first, the watch (codex's review, 2026-10-09)", () => {
  const dir = mkdtempSync(join(tmpdir(), "nodi-helpers-"));
  try {
    mkdirSync(join(dir, "bin"));
    const spy = (name, real) => {
      writeFileSync(join(dir, "bin", name), '#!/bin/bash\nprintf "%s text=%s title=%s\\n" "' + name + '" "${NODI_TEXT-unset}" "${NODI_TITLE-unset}" >> "$HOME/seen"\n' + (real ? 'exec ' + real + ' "$@"\n' : ""));
      chmodSync(join(dir, "bin", name), 0o755);
    };
    spy("hyprctl"); spy("mktemp", "/usr/bin/mktemp"); spy("tail", "/usr/bin/tail"); spy("wl-copy", "/usr/bin/cat"); spy("wtype");
    const go = c => execFileSync(c.command[0], c.command.slice(1), { env: { HOME: dir, XDG_RUNTIME_DIR: dir, PATH: join(dir, "bin") + ":/usr/bin", ...c.environment } });
    const seen = () => readFileSync(join(dir, "seen"), "utf8");
    // A shell run with text, watched by a title, pasting into a window.
    const run = Run.pasting(Run.shell('printf "%s|%s" "$NODI_TEXT" "${NODI_TITLE-unset}" > "$HOME/got"', [], "the secret"));
    go(Run.command(run, null, "an entry's first line", "0x5b8f"));
    assert.equal(readFileSync(join(dir, "got"), "utf8"), "the secret|unset", "the command gets its text, not the title");
    assert.match(seen(), /^hyprctl text=unset title=unset\n/);
    assert.match(seen(), /\nmktemp text=unset title=unset\n/);
    assert.match(seen(), /\ntail text=unset title=unset\n/);
    assert.doesNotMatch(seen(), /secret|first line/);
    rmSync(join(dir, "seen"));
    go(Run.command(Run.paste("the secret"), null, "", "0x5b8f"));
    assert.doesNotMatch(seen(), /secret/, "a focused paste: hyprctl, wl-copy and wtype never see it");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("a pinned text sent to a device: written to the runtime directory, the text in no helper", () => {
  const Clip = load("providers/clipboard.js");
  const dir = mkdtempSync(join(tmpdir(), "nodi-share-"));
  try {
    mkdirSync(join(dir, "bin"));
    writeFileSync(join(dir, "bin/mktemp"), '#!/bin/bash\nprintf "%s\\n" "${NODI_TEXT-unset}" >> "$HOME/seen"\nexec /usr/bin/mktemp "$@"\n');
    writeFileSync(join(dir, "bin/omarchy-menu-share"), '#!/bin/bash\nprintf "%s %s\\n" "$1" "$2" > "$HOME/shared"; cat "$2" > "$HOME/sent"; printf "%s\\n" "${NODI_TEXT-unset}" >> "$HOME/seen"\n');
    chmodSync(join(dir, "bin/mktemp"), 0o755); chmodSync(join(dir, "bin/omarchy-menu-share"), 0o755);
    const c = Run.command(Run.shell(Clip.SHARE_TEXT, undefined, "a pinned secret"));
    execFileSync(c.command[0], c.command.slice(1), { env: { HOME: dir, XDG_RUNTIME_DIR: dir, PATH: join(dir, "bin") + ":/usr/bin", ...c.environment } });
    assert.equal(readFileSync(join(dir, "sent"), "utf8"), "a pinned secret");
    assert.match(readFileSync(join(dir, "shared"), "utf8"), new RegExp("^file " + dir + "/nodi-share\\.\\w+\\.txt\\n$"));
    assert.equal(readFileSync(join(dir, "seen"), "utf8"), "unset\nunset\n");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("the clipboard's sequence pastes as Run.paste does", () => {
  const Clip = load("providers/clipboard.js");
  assert.ok(Clip.SEQUENCE.endsWith("\n" + Run.PASTE_T), "the same steps after the text is in $t");
});

test("a paste's command focuses the window first; anything else, or no window, as it is", () => {
  const run = Run.exec(["omarchy-clipboard-paste-file", "image/png", "/a.png"]);
  const argv = Run.command(run);
  const wrapped = Run.focusFirst(run, argv, "0x5b8f");
  assert.deepEqual(plain(wrapped.slice(0, 2).concat(wrapped.slice(3, 5))), ["/usr/bin/bash", "-c", "nodi-paste", "0x5b8f"]);
  assert.deepEqual(plain(wrapped.slice(5)), plain(argv));
  assert.equal(Run.focusFirst(run, argv, ""), argv, "no window known");
  assert.deepEqual(plain(Run.command(run, null, "", "0x5b8f")), plain(wrapped), "Run.command does it with the window given");
  assert.deepEqual(plain(Run.command(run, null, "")), plain(argv), "and without one, as before");
  assert.equal(Run.focusFirst(run, argv, "0xzz; rm"), argv, "an address is hex");
  const other = Run.exec(["firefox"]);
  const plainArgv = Run.command(other);
  assert.equal(Run.focusFirst(other, plainArgv, "0x5b8f"), plainArgv, "no paste: as it is");
});

test("focus first, then the paste as it was, its arguments untouched", () => {
  const dir = mkdtempSync(join(tmpdir(), "nodi-paste-"));
  try {
    mkdirSync(join(dir, "bin"));
    writeFileSync(join(dir, "bin/hyprctl"), '#!/bin/bash\nprintf "%s\\n" "$*" >> "$HOME/log"; echo ok\n');
    writeFileSync(join(dir, "bin/paster"), '#!/bin/bash\nprintf "paste [%s]\\n" "$1" >> "$HOME/log"\n');
    for (const f of ["hyprctl", "paster"]) chmodSync(join(dir, "bin", f), 0o755);
    execFileSync("/usr/bin/bash", ["-c", Run.FOCUS_FIRST, "nodi-paste", "0x5b8f", "paster", "it's $(not) run"], { env: { HOME: dir, PATH: join(dir, "bin") + ":/usr/bin" } });
    assert.deepEqual(readFileSync(join(dir, "log"), "utf8").trim().split("\n"),
                     ['dispatch hl.dsp.focus({ window = "address:0x5b8f" })', "paste [it's $(not) run]"]);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("the pastes that run through a shell are marked so", async () => {
  const { run } = await import("./fixtures.mjs");
  const { config } = await import("./fixtures.mjs");
  const snip = Object.assign({}, config, { snippets: [{ keyword: "sig", text: "Hi {cursor}there" }] });
  const { Engine, services } = await import("./fixtures.mjs");
  const row = Engine.run("sig", snip, services({}))[0];
  assert.equal(Run.pastes(row.run), true, "a snippet with its cursor moved back");
  assert.equal(Run.pastes(row.actions.find(a => a.label === "Type it out").run), true, "Type it out");
  const seq = run("paste the clipboard in sequence", {})[0];
  assert.equal(Run.pastes(seq.run), true, "a paste in sequence");
});
