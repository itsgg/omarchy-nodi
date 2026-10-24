import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync, truncateSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deflateSync, inflateSync, crc32 } from "node:zlib";
import { load, root } from "./load.mjs";

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
function run(path, edge = 128) {
  return spawnSync("/usr/bin/python3", ["-I", join(root, "lib/raster.py"), String(edge)], {
    env: { HOME: process.env.HOME, PATH: "/usr/bin:/bin", LANG: "C.UTF-8", NODI_IMAGE: path },
    encoding: "utf8", timeout: 7000, maxBuffer: 5500000
  });
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
    const got = decoded(run(path));
    assert.deepEqual([got.width, got.height], [2, 1]);
    assert.deepEqual([...got.pixels], [0, 255, 0, 0, 0, 255, 0]);
    assert.deepEqual(decoded(run("file://" + path.split("/").map(encodeURIComponent).join("/"))).pixels, got.pixels);
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
    env: { HOME: process.env.HOME, PATH: "/usr/bin:/bin", LANG: "C.UTF-8" }, encoding: "utf8", timeout: 7000
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), hard + " 3 1000");
  const iconProbe = "import resource, sys; sys.path.insert(0, sys.argv[1]); import raster; raster.limits(128); " +
    "print(resource.getrlimit(resource.RLIMIT_AS)[1], resource.getrlimit(resource.RLIMIT_CPU)[1], open('/proc/self/oom_score_adj').read().strip())";
  const iconResult = spawnSync("/usr/bin/prlimit", ["--as=" + hard, "--", "/usr/bin/python3", "-I", "-c", iconProbe, join(root, "lib")], {
    env: { HOME: process.env.HOME, PATH: "/usr/bin:/bin", LANG: "C.UTF-8" }, encoding: "utf8", timeout: 7000
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
    const base = decoded(run(join(dir, "base.svg")));
    assert.deepEqual([base.width, base.height], [128, 64]);
    assert.deepEqual(decoded(run(join(dir, "external.svg"))).pixels, base.pixels);
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

test("image cache evicts old rasters and retries expired failures", () => {
  const s = I.create(), value = "data:image/png;base64," + "A".repeat(5000000);
  for (let n = 0; n < 12; n++) I.finish(s, I.key("/image-" + n, true), value, n);
  assert.ok(s.bytes <= I.MAX_BYTES);
  assert.ok(Object.keys(s.cache).length < 12);
  const key = I.key("/bad", false);
  I.finish(s, key, "", 0);
  for (const now of [1, 10000, 20000, I.MAX_AGE - 1]) {
    I.get(s, key, now);
    assert.equal(s.queue.length, 0, "a repeated miss is held only to the original expiry");
  }
  I.get(s, key, I.MAX_AGE + 1); assert.equal(s.queue.length, 1);
});

test("image cache keeps recently used rasters warm", () => {
  const s = I.create(), key = I.key("/warm.png", false), value = "data:image/png;base64,iVBORw0KGgo=";
  I.finish(s, key, value, 0);
  assert.equal(I.get(s, key, 20000), value);
  assert.equal(I.get(s, key, I.MAX_AGE + 19999), value, "recent use extends the cache lifetime");
  assert.equal(I.get(s, key, I.MAX_AGE + 50000), "", "unused entries still expire");
  assert.equal(s.queue.length, 1);
  assert.equal(s.queue[0], key);
});
