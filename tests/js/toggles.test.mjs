// The toggle probe, run for real in bash against a fake home and stub
// commands, so every state line is read the way Nodi.qml reads it.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, chmodSync, rmSync, existsSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { load, plain } from "./load.mjs";

const Toggles = load("lib/Toggles.js");

function stub(dir, name, body) {
  const file = join(dir, name);
  writeFileSync(file, "#!/bin/bash\n" + body + "\n");
  chmodSync(file, 0o755);
}

// Every command the probe runs, stubbed to fail unless a test says what
// it prints, so no test reaches the real hyprctl or Omarchy's helpers.
const PROBED = ["brightnessctl", "hyprctl", "nmcli", "omarchy-audio-output-sink", "omarchy-bluetooth-power",
                "omarchy-shell", "omarchy-toggle-nightlight", "pactl", "wpctl"];

function probe(setup) {
  const home = mkdtempSync(join(tmpdir(), "nodi-home-"));
  const bin = mkdtempSync(join(tmpdir(), "nodi-bin-"));
  try {
    for (const name of PROBED) stub(bin, name, "exit 1");
    setup(home, bin);
    const out = execFileSync("/bin/bash", ["-c", Toggles.probeScript()], {
      env: { HOME: home, PATH: bin + ":/usr/bin:/bin", OMARCHY_PATH: "/nonexistent" }, timeout: 10000
    }).toString();
    return plain(Toggles.parse(out));
  } finally {
    rmSync(home, { recursive: true, force: true });
    rmSync(bin, { recursive: true, force: true });
  }
}

test("every command the probe runs under timeout is stubbed here", () => {
  const run = [...new Set((Toggles.probeScript().match(/timeout [0-9.]+ [A-Za-z][\w.-]*/g) || []).map(m => m.split(" ")[2]))].sort();
  assert.deepEqual(run, [...PROBED].sort());
});

function states(map) {
  const out = {};
  for (const k in map) out[k] = map[k].on === null ? map[k].value : map[k].on;
  return out;
}

test("flag files and commands become ON, OFF and values", () => {
  const s = states(probe((home, bin) => {
    const st = join(home, ".local/state/omarchy");
    mkdirSync(join(st, "indicators"), { recursive: true });
    mkdirSync(join(st, "toggles/hypr"), { recursive: true });
    writeFileSync(join(st, "indicators/stay-awake"), "");
    writeFileSync(join(st, "toggles/bar-off"), "");
    writeFileSync(join(st, "toggles/hypr/window-no-gaps.lua"), "");
    writeFileSync(join(st, "toggles/suspend-off"), "");
    mkdirSync(join(home, ".config/omarchy"), { recursive: true });
    writeFileSync(join(home, ".config/omarchy/shell.json"), JSON.stringify({ bar: { layout: { right: [{ id: "omarchy.power", showPercentage: true }] } } }));
    stub(bin, "omarchy-shell", '[ "$1 $2" = "notifications dndState" ] && echo on');
    stub(bin, "omarchy-toggle-nightlight", 'echo \'{"enabled":true,"temperature":4000}\'');
    stub(bin, "hyprctl", 'echo \'{"id":1,"tiledLayout":"scrolling"}\'');
    stub(bin, "omarchy-bluetooth-power", '[ "$1" = is-on ] && exit 1');
    stub(bin, "nmcli", "echo enabled");
    stub(bin, "omarchy-audio-output-sink", "echo alsa_output.speaker");
    stub(bin, "pactl", 'case $1 in get-sink-mute) echo "Mute: yes" ;; get-sink-volume) echo "Volume: front-left: 26214 /  40% / -23.88 dB" ;; esac');
    stub(bin, "wpctl", 'echo "Volume: 0.40"');
    stub(bin, "brightnessctl", 'echo "intel_backlight,backlight,600,75%,800"');
  }));
  assert.deepEqual(s, {
    "stay-awake": true, notifications: false, nightlight: true, "top-bar": false, "battery-percentage": true,
    "workspace-layout": "scrolling", "window-gaps": false, "one-window-ratio": false, screensaver: true, "crash-capture": true,
    touchpad: true, touchscreen: true, suspend: false, bluetooth: false, wifi: true, sound: false, microphone: true,
    volume: "40", brightness: "75"
  });
});

test("a state that cannot be read is left out, never guessed", () => {
  const s = probe((home, bin) => {
    stub(bin, "omarchy-shell", "exit 1");
    stub(bin, "omarchy-toggle-nightlight", "exit 1");
    stub(bin, "hyprctl", "exit 1");
    stub(bin, "omarchy-bluetooth-power", "exit 124");
    stub(bin, "nmcli", "echo weird");
    stub(bin, "omarchy-audio-output-sink", "true");
    stub(bin, "wpctl", "exit 1");
    stub(bin, "brightnessctl", "exit 1");
  });
  for (const id of ["notifications", "nightlight", "workspace-layout", "bluetooth", "wifi", "sound", "microphone", "volume", "brightness", "battery-percentage"])
    assert.equal(s[id], undefined, id + " should be unknown");
  assert.equal(s["window-gaps"].on, true, "a missing flag file is still an answer");
});

test("a probe that hangs costs only its own line", () => {
  const started = Date.now();
  const s = probe((home, bin) => {
    stub(bin, "nmcli", "sleep 5; echo enabled");
    stub(bin, "omarchy-shell", "echo off");
  });
  assert.ok(Date.now() - started < 4000, "took " + (Date.now() - started) + " ms");
  assert.equal(s.wifi, undefined);
  assert.equal(s.notifications.on, true);
});

test("badges and the flip after Enter", () => {
  assert.deepEqual(plain(Toggles.badge({ on: true, value: "1" })), { text: "ON", tone: "on" });
  assert.deepEqual(plain(Toggles.badge({ on: false, value: "0" })), { text: "OFF", tone: "" });
  assert.deepEqual(plain(Toggles.badge({ on: null, value: "dwindle" })), { text: "Dwindle", tone: "" });
  assert.deepEqual(plain(Toggles.badge(undefined)), { text: "", tone: "" });
  const st = { wifi: { on: true, value: "1" }, "workspace-layout": { on: null, value: "dwindle" } };
  assert.equal(Toggles.flipped(st, "wifi").wifi.on, false);
  assert.equal(Toggles.flipped(st, "workspace-layout")["workspace-layout"].value, "scrolling");
  assert.equal(Toggles.flipped(st, "bluetooth").bluetooth, undefined, "an unknown state is not invented");
  assert.equal(st.wifi.on, true, "the original is not changed");
});

const REAL_MENU = "/usr/share/omarchy/default/omarchy/omarchy-menu.jsonc";

test("every menu toggle names a real Omarchy menu id", { skip: !existsSync(REAL_MENU) }, () => {
  const Menu = load("lib/Menu.js");
  const real = Menu.merge([Menu.parseItems(readFileSync(REAL_MENU, "utf8"))]);
  for (const t of Toggles.TABLE) if (t.menu) assert.ok(real.items[t.menu] && real.items[t.menu].action, t.menu);
});


test("a state that says neither on, off nor a value shows no badge", () => {
  const T = load("lib/Toggles.js");
  assert.deepEqual(plain(T.badge({ on: null })), { text: "", tone: "" });
  assert.deepEqual(plain(T.badge(null)), { text: "", tone: "" });
});
