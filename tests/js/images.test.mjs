import { test, after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync, truncateSync, readdirSync, utimesSync, statSync, existsSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deflateSync, inflateSync, crc32 } from "node:zlib";
import { load, root, plain } from "./load.mjs";

const I = load("lib/Images.js");
function chunk(type, data) {
  const name = Buffer.from(type), length = Buffer.alloc(4), crc = Buffer.alloc(4);
  length.writeUInt32BE(data.length); crc.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([length, name, data, crc]);
}
function png(width = 2, height = 1, extras = []) {
  const head = Buffer.alloc(13);
  head.writeUInt32BE(width); head.writeUInt32BE(height, 4); head[8] = 8; head[9] = 2;
  return Buffer.concat([Buffer.from("89504e470d0a1a0a", "hex"), chunk("IHDR", head), ...extras,
    chunk("IDAT", deflateSync(Buffer.from([0, 255, 0, 0, 0, 255, 0]))), chunk("IEND", Buffer.alloc(0))]);
}
// The worker's home and cache are the tests' own: run with his, they wrote
// into his icon cache.
const home = mkdtempSync(join(tmpdir(), "nodi-image-home-"));
const cacheHome = join(home, "cache");
after(() => rmSync(home, { recursive: true, force: true }));
// The worker ends itself at 4 s of wall time and 3 s of CPU. The test's
// own kill is far past both, so "ends itself" still tells a worker that
// stops from one that hangs, and a busy machine has time to start it.
function run(path, edge = 128, cache = cacheHome) {
  return spawnSync("/usr/bin/python3", ["-I", join(root, "lib/raster.py"), String(edge)], {
    env: { HOME: home, XDG_CACHE_HOME: cache, PATH: "/usr/bin:/bin", LANG: "C.UTF-8", NODI_IMAGE: path },
    encoding: "utf8", timeout: 30000, maxBuffer: 5500000
  });
}
// A decode that is to succeed, run again while the worker ended at its own
// wall deadline (exit 124, or SIGALRM before its handler is in). A worker
// that spends its time working ends at the CPU limit instead, by SIGXCPU,
// so the wall deadline means it was waiting: on a busy machine, for a CPU.
// Only a decode that finished is checked, so a retry proves no less; one
// that never finishes still fails after ten.
function decode(path, edge, cache) {
  let result;
  for (let n = 0; n < 10; n++) {
    result = run(path, edge, cache);
    if (result.status !== 124 && result.signal !== "SIGALRM") break;
  }
  return result;
}
function decoded(result) {
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /^data:image\/png;base64,/);
  const data = Buffer.from(result.stdout.trim().split(",")[1], "base64");
  assert.equal(data.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
  const chunks = [];
  for (let at = 8; at < data.length;) {
    const size = data.readUInt32BE(at), type = data.subarray(at + 4, at + 8).toString();
    const body = data.subarray(at + 8, at + 8 + size);
    assert.equal(data.readUInt32BE(at + 8 + size), crc32(Buffer.concat([Buffer.from(type), body])));
    chunks.push({ type, body }); at += size + 12;
  }
  assert.deepEqual(chunks.map(c => c.type), ["IHDR", "IDAT", "IEND"]);
  return { width: chunks[0].body.readUInt32BE(), height: chunks[0].body.readUInt32BE(4),
    pixels: inflateSync(chunks[1].body) };
}

test("image worker emits only fresh pixels and three PNG chunks", () => {
  const dir = mkdtempSync(join(tmpdir(), "nodi-image-"));
  try {
    const path = join(dir, "private #? % image.png");
    writeFileSync(path, png(2, 1, [chunk("zTXt", Buffer.concat([Buffer.from("private\0\0"), deflateSync("private metadata".repeat(1000))]))]));
    const got = decoded(decode(path));
    assert.deepEqual([got.width, got.height], [2, 1]);
    assert.deepEqual([...got.pixels], [0, 255, 0, 0, 0, 255, 0]);
    assert.deepEqual(decoded(decode("file://" + path.split("/").map(encodeURIComponent).join("/"))).pixels, got.pixels);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("metadata bombs, huge dimensions, special files and invalid sources stay in the worker", () => {
  const dir = mkdtempSync(join(tmpdir(), "nodi-image-bad-"));
  try {
    const bomb = join(dir, "bomb.png"), huge = join(dir, "huge.png"), oversized = join(dir, "oversized.png");
    const compressed = deflateSync(Buffer.alloc(8 * 1024 * 1024, 65));
    writeFileSync(bomb, png(2, 1, Array.from({ length: 80 }, (_, n) => chunk("zTXt", Buffer.concat([Buffer.from("text" + n + "\0\0"), compressed])))));
    const result = run(bomb);
    assert.ok(!result.error || result.error.code !== "ETIMEDOUT", "worker must end itself");
    if (result.status === 0) decoded(result);
    else assert.equal(result.stdout, "");
    writeFileSync(huge, png(100000, 100000));
    writeFileSync(oversized, "");
    truncateSync(oversized, 17 * 1024 * 1024);
    spawnSync("/usr/bin/mkfifo", [join(dir, "pipe")]);
    for (const path of [huge, oversized, join(dir, "pipe"), dir, "/dev/zero", "https://example.com/x.png", "image://qsimage/1", "file://host/a", join(dir, "missing")]) {
      const bad = run(path);
      assert.equal(bad.stdout, "", path);
      assert.notEqual(bad.status, 0, path);
      assert.ok(!bad.error || bad.error.code !== "ETIMEDOUT", path);
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("worker limits keep a lower hard limit and make it the OOM killer's first choice", () => {
  // A hard ceiling just under MEMORY_MAX: raising it to MEMORY_MAX is refused.
  const hard = 2047 * 1024 * 1024;
  const probe = "import resource, sys; sys.path.insert(0, sys.argv[1]); import raster; raster.limits(); " +
    "print(resource.getrlimit(resource.RLIMIT_AS)[1], resource.getrlimit(resource.RLIMIT_CPU)[1], open('/proc/self/oom_score_adj').read().strip())";
  const result = spawnSync("/usr/bin/prlimit", ["--as=" + hard, "--", "/usr/bin/python3", "-I", "-c", probe, join(root, "lib")], {
    env: { HOME: home, PATH: "/usr/bin:/bin", LANG: "C.UTF-8" }, encoding: "utf8", timeout: 7000
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), hard + " 3 1000");
  const iconProbe = "import resource, sys; sys.path.insert(0, sys.argv[1]); import raster; raster.limits(128); " +
    "print(resource.getrlimit(resource.RLIMIT_AS)[1], resource.getrlimit(resource.RLIMIT_CPU)[1], open('/proc/self/oom_score_adj').read().strip())";
  const iconResult = spawnSync("/usr/bin/prlimit", ["--as=" + hard, "--", "/usr/bin/python3", "-I", "-c", iconProbe, join(root, "lib")], {
    env: { HOME: home, PATH: "/usr/bin:/bin", LANG: "C.UTF-8" }, encoding: "utf8", timeout: 7000
  });
  assert.equal(iconResult.status, 0, iconResult.stderr);
  assert.equal(iconResult.stdout.trim(), (512 * 1024 * 1024) + " 3 1000", "small app icon workers share a lower memory ceiling");
});

test("SVG previews scale and cannot include a neighbouring image", () => {
  const dir = mkdtempSync(join(tmpdir(), "nodi-image-svg-"));
  try {
    writeFileSync(join(dir, "red.png"), png());
    const plain = '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="200"><rect width="400" height="200" fill="blue"/>';
    writeFileSync(join(dir, "base.svg"), plain + '</svg>');
    writeFileSync(join(dir, "external.svg"), plain + '<image href="' + join(dir, "red.png") + '" width="400" height="200"/></svg>');
    const base = decoded(decode(join(dir, "base.svg")));
    assert.deepEqual([base.width, base.height], [128, 64]);
    assert.deepEqual(decoded(decode(join(dir, "external.svg"))).pixels, base.pixels);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("disk icon cache serves a second run without decoding again", () => {
  const dir = mkdtempSync(join(tmpdir(), "nodi-icon-cache-"));
  try {
    const icon = join(dir, "app.png"), cache = join(dir, "cache"), icons = join(cache, "nodi", "icons");
    writeFileSync(icon, png());
    const first = decoded(decode(icon, 128, cache));
    assert.deepEqual([first.width, first.height], [2, 1]);
    const files = readdirSync(icons).filter(f => f.endsWith(".png"));
    assert.equal(files.length, 1, "the decode is kept");
    // A different picture planted in the cached file: a second run that
    // hands it back read the cache and decoded nothing.
    const entry = join(icons, files[0]);
    writeFileSync(entry, pngOf(3, 3));
    utimesSync(entry, 1, 1);
    const second = decoded(decode(icon, 128, cache));
    assert.deepEqual([second.width, second.height], [3, 3], "served from the cache");
    assert.ok(statSync(entry).mtimeMs > 1000, "a hit marks the file used");
    assert.equal(decode(icon, 1000, cache).status, 0);
    assert.equal(readdirSync(icons).filter(f => f.endsWith(".png")).length, 1, "previews are not cached");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// A bounded PNG of width x height made by the worker's own writer.
function pngOf(width, height) {
  const probe = "import sys; sys.path.insert(0, sys.argv[1]); import raster; " +
    "sys.stdout.buffer.write(raster.png(" + width + ", " + height + ", 3, " + width * 3 + ", bytes(" + width * height * 3 + ")))";
  const r = spawnSync("/usr/bin/python3", ["-I", "-c", probe, join(root, "lib")], { env: { HOME: home, PATH: "/usr/bin:/bin" }, timeout: 7000 });
  assert.equal(r.status, 0, String(r.stderr));
  return r.stdout;
}

function prune(dir, now, maxAge, maxFiles) {
  const probe = "import sys; sys.path.insert(0, sys.argv[1]); import raster; " +
    "print(raster.prune(sys.argv[2], float(sys.argv[3]), int(sys.argv[4]), int(sys.argv[5])))";
  const r = spawnSync("/usr/bin/python3", ["-I", "-c", probe, join(root, "lib"), dir, String(now), String(maxAge), String(maxFiles)],
    { env: { HOME: home, PATH: "/usr/bin:/bin" }, encoding: "utf8", timeout: 7000 });
  assert.equal(r.status, 0, r.stderr);
  return Number(r.stdout.trim());
}

test("the icon cache drops icons unused for a month, then the oldest past its cap", () => {
  const dir = mkdtempSync(join(tmpdir(), "nodi-icon-prune-"));
  try {
    const now = 2_000_000_000, day = 24 * 60 * 60;
    const put = (name, age) => { const p = join(dir, name); writeFileSync(p, "x"); utimesSync(p, now - age, now - age); };
    put("old.png", 31 * day);
    for (let n = 0; n < 5; n++) put("a" + n + ".png", n * day);
    put("left.png.tmp.123", 2 * 60 * 60);
    put("writing.png.tmp.456", 10);
    put("notes.txt", 365 * day);
    assert.equal(prune(dir, now, 30 * day, 3), 3);
    assert.deepEqual(readdirSync(dir).sort(), ["a0.png", "a1.png", "a2.png", "notes.txt", "writing.png.tmp.456"]);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("a decode that writes the cache looks it over once a day", () => {
  const dir = mkdtempSync(join(tmpdir(), "nodi-icon-pruned-"));
  try {
    const cache = join(dir, "cache"), icons = join(cache, "nodi", "icons");
    mkdirSync(icons, { recursive: true });
    const stale = join(icons, "stale.png");
    writeFileSync(stale, "x");
    utimesSync(stale, 1, 1);
    const icon = join(dir, "app.png");
    writeFileSync(icon, png());
    assert.equal(decode(icon, 128, cache).status, 0);
    assert.equal(existsSync(stale), false, "a month-old icon went with the first write");
    assert.ok(existsSync(join(icons, ".pruned")));
    writeFileSync(stale, "x");
    utimesSync(stale, 1, 1);
    writeFileSync(icon, png(2, 1, [chunk("tEXt", Buffer.from("k\0another"))]));
    assert.equal(decode(icon, 128, cache).status, 0);
    assert.equal(existsSync(stale), true, "not looked over again the same day");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("image queue deduplicates, caps work and never returns original URLs on failure", () => {
  const s = I.create();
  for (let n = 0; n < 200; n++) I.get(s, I.key("/image-" + n + ".png", false), 0);
  assert.equal(s.queue.length, I.MAX_QUEUE);
  assert.equal(Object.keys(s.pending).length, I.MAX_QUEUE);
  const job = I.next(s);
  I.get(s, job.key, 0); assert.equal(s.queue.length, I.MAX_QUEUE - 1);
  I.finish(s, job.key, "file:///original.png", 10);
  assert.equal(I.get(s, job.key, 11), "");
  assert.equal(I.key("https://example.com/a.png", false), "");
  assert.equal(I.key("image://qsimage/12", false), "");
  assert.equal(I.key("data:image/png;base64,abc", false), "");
});

test("visible icon requests run before prewarm work and promote a queued duplicate", () => {
  const s = I.create();
  const warm = I.key("/warm.png", false), nextWarm = I.key("/next-warm.png", false);
  const visible = I.key("/visible.png", false);
  I.get(s, warm, 0, true);
  I.get(s, nextWarm, 0, true);
  I.get(s, visible, 0);
  assert.equal(I.next(s).key, visible);
  assert.equal(I.next(s).key, warm);

  const promoted = I.create();
  I.get(promoted, warm, 0, true);
  I.get(promoted, nextWarm, 0, true);
  I.get(promoted, nextWarm, 1);
  assert.equal(I.next(promoted).key, nextWarm);
  assert.equal(I.next(promoted).key, warm);
});

test("visible requests can displace the last background job when the queue is full", () => {
  const s = I.create();
  const warm = Array.from({ length: I.MAX_QUEUE }, (_, n) => I.key("/warm-" + n + ".png", false));
  warm.forEach(key => I.get(s, key, 0, true));
  const visible = I.key("/visible.png", false);
  I.get(s, visible, 1);
  assert.equal(s.queue.length + s.backgroundQueue.length, I.MAX_QUEUE);
  assert.equal(s.pending[visible], true);
  assert.equal(s.pending[warm[warm.length - 1]], undefined);
  assert.equal(I.next(s).key, visible);
});

test("a busy large preview can leave the other worker for small icons", () => {
  const s = I.create();
  const large = I.key("/preview.png", true), icon = I.key("/app.png", false);
  I.get(s, large, 0);
  I.get(s, icon, 0);
  assert.equal(I.next(s).key, large);
  assert.equal(I.next(s, false).key, icon);
  I.get(s, I.key("/next-preview.png", true), 1);
  assert.equal(I.next(s, false), null, "a second worker does not start another large decode");
  assert.equal(I.next(s).edge, 1000, "the large preview remains queued for the first worker");
});

test("image cache evicts old rasters and retries failures after their cooldown", () => {
  const s = I.create(), value = "data:image/png;base64," + "A".repeat(5000000);
  for (let n = 0; n < 12; n++) I.finish(s, I.key("/image-" + n, true), value, n);
  assert.ok(s.bytes <= I.MAX_BYTES);
  assert.ok(Object.keys(s.cache).length < 12);
  const key = I.key("/bad", false);
  I.finish(s, key, "", 0);
  for (const now of [1, 10000, 20000, I.FAILURE_RETRY_MS - 1]) {
    I.get(s, key, now);
    assert.equal(s.queue.length, 0, "a repeated miss is held only to the original expiry");
  }
  I.get(s, key, I.FAILURE_RETRY_MS + 1); assert.equal(s.queue.length, 1);
});

test("named icons stay warm until invalidation or bounded LRU eviction", () => {
  const s = I.create(), key = I.key("application-x-executable", false), value = "data:image/png;base64,iVBORw0KGgo=";
  I.finish(s, key, value, 0);
  assert.equal(I.get(s, key, 10 * 24 * 60 * 60 * 1000), value, "an idle icon does not expire by time");
  assert.equal(s.queue.length, 0);
  I.invalidate(s);
  assert.equal(I.get(s, key, 10 * 24 * 60 * 60 * 1000), "", "an update invalidates the prior raster");
  assert.equal(s.queue[0], key);
});

test("file rasters refresh after a quiet period unless they are app icons or prewarmed", () => {
  const s = I.create(), file = I.key("/preview.png", false);
  const value = "data:image/png;base64,iVBORw0KGgo=";
  I.finish(s, file, value, 0);
  I.get(s, file, I.MAX_AGE + 1);
  assert.equal(s.queue[0], file, "mutable file previews are refreshed");
  const warmState = I.create(), warm = I.key("/app-icon.png", false);
  I.get(warmState, warm, 0, true);
  const job = I.next(warmState);
  assert.equal(job.key, warm);
  I.finish(warmState, warm, value, 1, job.generation);
  assert.equal(I.get(warmState, warm, 10 * 24 * 60 * 60 * 1000), value, "a prewarmed file-backed app icon stays cached");

  const appState = I.create(), app = I.key("/unwarmed-app-icon.png", false);
  I.get(appState, app, 0, false, true);
  I.finish(appState, app, value, 1);
  assert.equal(I.get(appState, app, 10 * 24 * 60 * 60 * 1000), value, "an app's file-backed icon stays cached too");
});

test("an old worker cannot repopulate the cache after an update", () => {
  const s = I.create(), key = I.key("/changed.png", false), oldValue = "data:image/png;base64,aA==", newValue = "data:image/png;base64,bA==";
  I.get(s, key, 0);
  const oldJob = I.next(s);
  I.invalidate(s);
  I.get(s, key, 1);
  const newJob = I.next(s);
  assert.notEqual(oldJob.generation, newJob.generation);
  assert.equal(I.finish(s, key, oldValue, 2, oldJob.generation), false);
  assert.equal(s.pending[key], true, "the stale worker leaves the updated request pending");
  assert.equal(I.finish(s, key, newValue, 3, newJob.generation), true);
  assert.equal(I.get(s, key, 4), newValue);
});

test("a rescan that returns the same app entries keeps every raster", () => {
  const s = I.create(), key = I.key("firefox", false), value = "data:image/png;base64,iVBORw0KGgo=";
  const apps = [{ id: "firefox.desktop", icon: "firefox", keywords: [] }, { id: "foot.desktop", icon: "foot", keywords: [] }];
  assert.equal(I.catalogChanged(s, apps), true, "the first catalog is new");
  I.finish(s, key, value, 0);
  assert.equal(I.catalogChanged(s, apps.map(a => ({ ...a, keywords: [] }))), false, "equal entries rebuilt are not a change");
  assert.equal(I.get(s, key, 1), value);
  assert.equal(I.catalogChanged(s, apps.concat([{ id: "new.desktop", icon: "new", keywords: [] }])), true, "an added entry is");
  assert.equal(I.catalogChanged(s, apps), true, "and so is its removal");
  assert.equal(I.catalogChanged(s, [{ ...apps[0], icon: "firefox-nightly" }, apps[1]]), true, "and a changed icon name");
});

test("a job dropped from a full queue is named once, to be asked for again", () => {
  const s = I.create();
  const warm = Array.from({ length: I.MAX_QUEUE }, (_, n) => I.key("/warm-" + n + ".png", false));
  warm.forEach(key => I.get(s, key, 0, true));
  I.get(s, I.key("/visible.png", false), 1);
  const last = warm[warm.length - 1];
  assert.deepEqual(plain(I.takeDropped(s)), [last]);
  assert.deepEqual(plain(I.takeDropped(s)), [], "told once");
  I.get(s, I.key("/visible-2.png", false), 2);
  const next = warm[warm.length - 2];
  I.next(s);
  I.get(s, next, 3, true);
  assert.equal(s.pending[next], true, "with room again it is queued");
  assert.deepEqual(plain(I.takeDropped(s)), [], "asked for again, it is no longer dropped");
});

test("an open asks again only for the rasters that are stale", () => {
  const s = I.create(), value = "data:image/png;base64,iVBORw0KGgo=";
  const file = I.key("/preview.png", false), app = I.key("firefox", false), bad = I.key("/bad.png", false), fresh = I.key("/fresh.png", false);
  I.finish(s, file, value, 0);
  I.finish(s, app, value, 0);
  I.finish(s, bad, "", 0);
  I.finish(s, fresh, value, I.MAX_AGE);
  assert.deepEqual(plain(I.stale(s, I.MAX_AGE - 1)), []);
  assert.deepEqual(plain(I.stale(s, Math.max(I.MAX_AGE, I.FAILURE_RETRY_MS))).sort(), [bad, file].sort(),
                   "a file past its quiet period and a failure past its cooldown; not a named icon, not a fresh file");
});
