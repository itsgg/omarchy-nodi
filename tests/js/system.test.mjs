// Levels, reminders, themes, the toggles the menu lacks, and the defects the
// 2026-10-02 review of the old bar found, each with a case.

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, chmodSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { plain } from "./load.mjs";
import { run, top } from "./fixtures.mjs";

const levels = { toggleStates: { volume: { on: null, value: "40" }, brightness: { on: null, value: "75" }, bluetooth: { on: false, value: "0" } } };
const themes = { themes: { current: "Tokyo Night", list: [
  { name: "Catppuccin", preview: "/usr/share/omarchy/themes/catppuccin/preview.png" },
  { name: "Dark Knight", preview: "/home/u/.config/omarchy/themes/dark-knight/preview.png" },
  { name: "Tokyo Night", preview: "/usr/share/omarchy/themes/tokyo-night/preview.png" }
] } };

test("volume", () => {
  assert.equal(top("volume", levels).title, "Volume");
  assert.equal(top("volume", levels).subtitle, "Now 40%");
  assert.match(top("volume", levels).hint, /^volume <0-100>/);
  const setRow = top("volume 60", levels);
  assert.equal(setRow.title, "Volume"); assert.equal(setRow.badge, "60%"); assert.equal(setRow.actionLabel, "Set", "the level said once, as the badge");
  assert.deepEqual(plain(top("vol +10", levels).run.argv), ["omarchy-audio-output-volume", "+10"]);
  assert.deepEqual(plain(top("vol -15%", levels).run.argv), ["omarchy-audio-output-volume", "-15"]);
  assert.deepEqual(plain(top("vol up", levels).run.argv), ["omarchy-audio-output-volume", "+5"]);
  assert.deepEqual(plain(top("vol toggle", levels).run.argv), ["omarchy-audio-output-volume", "mute-toggle"]);
  assert.equal(top("vol mute", levels).title, "Mute Sound"); assert.equal(top("vol unmute", levels).title, "Unmute Sound");
  const set = top("volume 150", levels);
  assert.equal(set.title, "Volume"); assert.equal(set.badge, "100%", "clamped, shown once");
  assert.equal(set.run.argv[4], "100", "the level is an argument, clamped");
  assert.ok(!run("volume loud", levels).some(r => r.run), "no level is read out of a word; the Set the volume command may fill it in");
  // On the way to a level, the mode keeps the query: no other provider's rows flash in.
  for (const q of ["vol +", "vol u", "volume -1", "vol mu", "bright o", "bright d"]) assert.ok(run(q, levels).every(r => r.provider === "system"), q);
});

test("the absolute volume script uses the resolved sink and Omarchy's OSD", () => {
  const bin = mkdtempSync(join(tmpdir(), "nodi-vol-"));
  const log = join(bin, "log");
  for (const [name, body] of [["omarchy-audio-output-sink", "echo alsa_output.speaker"], ["pactl", `echo "pactl $*" >> ${log}`], ["omarchy-osd", `echo "osd $*" >> ${log}`]]) {
    writeFileSync(join(bin, name), "#!/bin/bash\n" + body + "\n"); chmodSync(join(bin, name), 0o755);
  }
  const argv = top("volume 60", levels).run.argv;
  execFileSync(argv[0], argv.slice(1), { env: { PATH: bin + ":/usr/bin:/bin" } });
  assert.equal(readFileSync(log, "utf8"), "pactl set-sink-mute alsa_output.speaker 0\npactl set-sink-volume alsa_output.speaker 60%\nosd -i volume-high -p 60\n");
  rmSync(bin, { recursive: true, force: true });
});

test("mute and unmute set the state asked for, never toggle it", () => {
  const bin = mkdtempSync(join(tmpdir(), "nodi-mute-"));
  const log = join(bin, "log");
  for (const [name, body] of [["omarchy-audio-output-sink", "echo alsa_output.speaker"],
                              ["pactl", `echo "pactl $*" >> ${log}; [ "$1" = get-sink-volume ] && echo "Volume: front-left: 26214 /  40% / -23.88 dB"; true`],
                              ["omarchy-osd", `echo "osd $*" >> ${log}`]]) {
    writeFileSync(join(bin, name), "#!/bin/bash\n" + body + "\n"); chmodSync(join(bin, name), 0o755);
  }
  for (const [q, want] of [["vol mute", "pactl set-sink-mute alsa_output.speaker 1\npactl get-sink-volume alsa_output.speaker\nosd -i volume-muted -p 40\n"],
                           ["vol unmute", "pactl set-sink-mute alsa_output.speaker 0\npactl get-sink-volume alsa_output.speaker\nosd -i volume-high -p 40\n"]]) {
    writeFileSync(log, "");
    const argv = top(q, levels).run.argv;
    execFileSync(argv[0], argv.slice(1), { env: { PATH: bin + ":/usr/bin:/bin" } });
    assert.equal(readFileSync(log, "utf8"), want, q);
  }
  rmSync(bin, { recursive: true, force: true });
});

test("brightness", () => {
  assert.equal(top("brightness", levels).subtitle, "Now 75%");
  assert.deepEqual(plain(top("bright 80", levels).run.argv), ["omarchy-brightness-display", "80%"]);
  assert.deepEqual(plain(top("bright +10", levels).run.argv), ["omarchy-brightness-display", "+10%"]);
  assert.deepEqual(plain(top("bright -10", levels).run.argv), ["omarchy-brightness-display", "10%-"]);
  assert.deepEqual(plain(top("bright off", levels).run.argv), ["omarchy-brightness-display", "off"]);
  assert.deepEqual(plain(top("bright 0", levels).run.argv), ["omarchy-brightness-display", "1%"], "never fully dark by a number");
});

test("reminders", () => {
  const r = top("remind 15 call mom");
  assert.equal(r.title, "Remind in 15 min: call mom");
  assert.deepEqual(plain(r.run.argv), ["omarchy-reminder", "15", "call mom"]);
  assert.deepEqual(plain(top("remind me in 1h to stretch").run.argv), ["omarchy-reminder", "60", "stretch"]);
  assert.deepEqual(plain(top("reminder 5").run.argv), ["omarchy-reminder", "5"]);
  assert.equal(top("remind").complete, "remind 15 ");
  assert.equal(top("reminders").title, "Show Reminders");
  const clear = top("reminders clear");
  assert.equal(clear.title, "Clear All Reminders"); assert.equal(clear.confirm, true);
  assert.deepEqual(plain(top("remind 5 -rf --help").run.argv), ["omarchy-reminder", "5", "-rf --help"], "the message is one argument");
});

test("themes come from Omarchy's list, user themes included, the current one marked", () => {
  const all = run("theme", themes);
  assert.deepEqual(plain(all.map(r => r.title)), ["Catppuccin", "Dark Knight", "Tokyo Night"]);
  const tokyo = all.find(r => r.title === "Tokyo Night");
  assert.equal(tokyo.badge, "Current"); assert.equal(tokyo.image, "/usr/share/omarchy/themes/tokyo-night/preview.png");
  assert.deepEqual(plain(top("theme dark", themes).run.argv), ["omarchy-theme-set", "Dark Knight"]);
  assert.equal(top("theme tokyo night", themes).score, 99);
  assert.equal(run("theme zzz", themes).filter(r => r.provider !== "fallback").length, 0, "no theme of that name, and nothing else answers it");
  assert.equal(top("theme", {}).title, "Reading themes...");
});

test("toggles the menu has no row for", () => {
  const bt = top("bluetooth", levels);
  assert.equal(bt.title, "Bluetooth"); assert.equal(bt.badge, "OFF"); assert.equal(bt.toggle, "bluetooth");
  assert.deepEqual(plain(bt.run.argv), ["omarchy-bluetooth-power", "toggle"]);
  assert.equal(top("wifi").title, "Wi-Fi");
  assert.equal(top("mic").title, "Microphone");
  assert.equal(top("reload hyprland").title, "Reload Hyprland");
  assert.equal(top("screenshot region").title, "Screenshot of a Region");
});

test("defects found in the old bar stay fixed", () => {
  // agy's palette built its generic action from run.target, which argv rows
  // do not have, and ran "bash -c undefined"; every row here carries a valid run.
  for (const q of ["bluetooth", "volume 50", "remind 5 x", "reload hyprland"]) {
    const r = top(q, levels);
    assert.ok(r.run && r.run.kind === "exec" && r.run.argv.every(a => typeof a === "string"), q);
  }
  // "Change Font" ran `omarchy menu font`, which omarchy-menu rejects; the
  // font list is opened through the menu route (menu.test.mjs, "font").
  // Themes were a fixed list of 23; now whatever Omarchy lists, Dark Knight from ~/.config included.
  assert.ok(run("theme", themes).some(r => r.image.startsWith("/home/u/.config/omarchy/themes/")));
});

test("brightness with words it does not take answers nothing of its own", () => {
  assert.ok(!run("brightness xyz").some(r => r.provider === "system"));
});
