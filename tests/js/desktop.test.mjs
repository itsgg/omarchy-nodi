// The desktop as rows: what plays, the audio devices, Bluetooth, Wi-Fi and
// the battery, each acting through Omarchy's command for it.

import { test } from "node:test";
import assert from "node:assert/strict";
import { load, plain } from "./load.mjs";
import { run, top } from "./fixtures.mjs";

const desktop = {
  media: [{ dbusName: "org.mpris.MediaPlayer2.spotify", identity: "Spotify", title: "Blue in Green", artist: "Miles Davis", album: "Kind of Blue", playing: true, canToggle: true },
          { dbusName: "bad name; reboot", identity: "Evil", title: "x", artist: "", album: "", playing: false, canToggle: true }],
  sinks: [{ id: 51, name: "bluez_output.41_42", description: "SolarBeatz", isDefault: true },
          { id: 52, name: "alsa_output.pci.analog-stereo", description: "Speakers", isDefault: false }],
  sources: [{ id: 61, name: "alsa_input.pci.analog-stereo", description: "Internal Microphone", isDefault: true }],
  bluetooth: { enabled: true, devices: [{ name: "SolarBeatz", address: "41:42:28:7B:19:CF", connected: true, paired: true, battery: 0.7 },
                                         { name: "WH-1000XM4", address: "00:11:22:33:44:55", connected: false, paired: true, battery: -1 },
                                         { name: "Stranger", address: "not a mac", connected: false, paired: true, battery: -1 }] },
  wifi: { enabled: true, networks: [{ ssid: "Home", signal: 0.8, known: true, connected: true }, { ssid: "Cafe", signal: 0.5, known: false, connected: false },
                                    { ssid: "Office", signal: 0.6, known: true, connected: false }] },
  battery: { present: true, percentage: 82, charging: false, onBattery: true, timeToEmpty: 11400, timeToFull: 0 }
};
const rows = q => run(q, { desktop }).filter(r => r.provider === "desktop");

test("media: pause what plays, through the player's own D-Bus name", () => {
  const p = rows("pause")[0];
  assert.equal(p.title, "Pause: Blue in Green"); assert.equal(p.subtitle, "Spotify, Miles Davis");
  assert.deepEqual(plain(p.run.argv), ["busctl", "--user", "call", "org.mpris.MediaPlayer2.spotify", "/org/mpris/MediaPlayer2", "org.mpris.MediaPlayer2.Player", "PlayPause"]);
  assert.ok(rows("miles").some(r => r.key === "media:org.mpris.MediaPlayer2.spotify"), "found by its artist");
  assert.ok(!rows("music").some(r => r.subtitle.indexOf("Evil") === 0), "a player whose bus name is not MPRIS's is left out");
});

test("audio: the outputs and inputs, the current marked, set by Omarchy's commands", () => {
  const outs = rows("output");
  assert.deepEqual(plain(outs.map(r => r.title)), ["SolarBeatz", "Speakers"]);
  assert.equal(outs[0].badge, "Current");
  assert.deepEqual(plain(outs[1].run.argv), ["omarchy-audio-output-set-default", "52", "alsa_output.pci.analog-stereo"]);
  const mic = rows("microphone")[0];
  assert.deepEqual(plain(mic.run.argv), ["omarchy-audio-input-set-default", "61", "alsa_input.pci.analog-stereo"]);
});

test("bluetooth: connect or disconnect a paired device, with its battery", () => {
  const sb = rows("solarbeatz").find(r => r.key.indexOf("bluetooth:") === 0);
  assert.equal(sb.subtitle, "Bluetooth, connected, 70%"); assert.equal(sb.actionLabel, "Disconnect");
  assert.deepEqual(plain(sb.run.argv), ["omarchy-bluetooth-device", "disconnect", "41:42:28:7B:19:CF"]);
  assert.deepEqual(plain(rows("wh 1000")[0].run.argv), ["omarchy-bluetooth-device", "connect", "00:11:22:33:44:55"]);
  assert.ok(!rows("stranger").length, "only a real address reaches the command");
});

test("wifi: join a saved network, a new one in Omarchy's panel", () => {
  const nets = rows("wifi");
  assert.deepEqual(plain(nets.map(r => r.title)), ["Home", "Office", "Cafe"], "connected, saved, then the rest");
  assert.equal(nets[0].run, null);
  assert.deepEqual(plain(nets[1].run.argv), ["nmcli", "device", "wifi", "connect", "Office"]);
  assert.deepEqual(plain(nets[2].run.argv), ["omarchy-shell", "omarchy.network", "open"]);
});

test("battery: an answer, with the time left", () => {
  const b = top("battery", { desktop });
  assert.equal(b.title, "Battery 82%"); assert.equal(b.subtitle, "3 h 10 min left");
  const charging = top("battery", { desktop: Object.assign({}, desktop, { battery: { present: true, percentage: 40, charging: true, onBattery: false, timeToFull: 2700 } }) });
  assert.equal(charging.subtitle, "Full in 45 min");
  assert.ok(!rows("battery").length || top("battery", { desktop: Object.assign({}, desktop, { battery: { present: false } }) }).provider !== "desktop");
});

test("names as typed, camel case or not; a short prefix is not an answer over an app", () => {
  const phone = { ...desktop, wifi: { enabled: true, networks: [{ ssid: "GG's iPhone", signal: 0.9, known: true, connected: false }] } };
  assert.ok(run("iphone", { desktop: phone }).some(r => r.key === "wifi:GG's iPhone"));
  const dash = { ...desktop, wifi: { enabled: true, networks: [{ ssid: "-rf", signal: 0.9, known: true, connected: false }] } };
  assert.deepEqual(plain(run("wifi", { desktop: dash }).find(r => r.key === "wifi:-rf").run.argv), ["omarchy-shell", "omarchy.network", "open"], "an SSID nmcli would read as an option");
  const bat = run("bat", { desktop, apps: [{ id: "battlenet", name: "Battle.net", generic: "", keywords: [], icon: "", actions: [] }] });
  assert.equal(bat[0].title, "Battle.net", bat.map(r => r.title).join());
  assert.equal(top("battery", { desktop }).title, "Battery 82%");
});

test("nothing from the desktop for queries it does not name", () => {
  for (const q of ["firefox", "2+2", "lock", "theme"]) assert.equal(rows(q).length, 0, q);
});
