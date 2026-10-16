// Filesystem-backed watched-source reads: one descriptor, bounded bytes, fail-closed trust.

import { test } from "node:test";
import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdtempSync, renameSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { load } from "./load.mjs";

const Home = load("lib/HomeSources.js");

function run(argv) {
  return new Promise((resolve, reject) => {
    const child = spawn(argv[0], argv.slice(1), { stdio: ["ignore", "pipe", "pipe"] });
    const out = [];
    const err = [];
    child.stdout.on("data", b => out.push(b));
    child.stderr.on("data", b => err.push(b));
    child.on("error", reject);
    child.on("close", code => resolve({
      code,
      stdout: Buffer.concat(out).toString("utf8"),
      stderr: Buffer.concat(err).toString("utf8")
    }));
  });
}

async function waitFor(path) {
  for (let i = 0; i < 300; i++) {
    if (existsSync(path)) return;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  throw new Error("timed out waiting for " + path);
}

function source(path) {
  return { id: "reader", file: path, title: "Reader", max: 4, priority: 0, trustedActions: true };
}

test("a bounded read and its trust metadata describe the same safe opened file", async t => {
  const dir = mkdtempSync(join(tmpdir(), "nodi-home-reader-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const path = join(dir, "rows.jsonl");
  writeFileSync(path, '{"id":"safe","title":"Safe"}\n', { mode: 0o600 });

  const proc = await run(Home.readArgv(path));
  const got = Home.readResult(proc.stdout, path);
  assert.equal(proc.code, 0, proc.stderr);
  assert.equal(got.ok, true);
  assert.equal(got.text, '{"id":"safe","title":"Safe"}\n');
  assert.equal(Home.trusted(source(path), got.info), true);
});

test("filesystem trust loss and symlinks keep display bytes but disable execution", async t => {
  const dir = mkdtempSync(join(tmpdir(), "nodi-home-reader-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const path = join(dir, "rows.jsonl");
  writeFileSync(path, '{"id":"unsafe","title":"Unsafe"}\n', { mode: 0o600 });
  chmodSync(path, 0o666);

  let got = Home.readResult((await run(Home.readArgv(path))).stdout, path);
  assert.equal(got.ok, true);
  assert.equal(Home.trusted(source(path), got.info), false);

  const link = join(dir, "link.jsonl");
  symlinkSync(path, link);
  got = Home.readResult((await run(Home.readArgv(link))).stdout, link);
  assert.equal(got.ok, true);
  assert.equal(Home.trusted(source(link), got.info), false);
});

test("an atomic path replacement can never give old bytes new-path trust", async t => {
  const dir = mkdtempSync(join(tmpdir(), "nodi-home-reader-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const path = join(dir, "rows.jsonl");
  const next = join(dir, "next.jsonl");
  const gate = join(dir, "gate");
  writeFileSync(path, '{"id":"old","title":"Old"}\n', { mode: 0o600 });
  writeFileSync(next, '{"id":"new","title":"New"}\n', { mode: 0o600 });

  const pending = run(Home.readArgv(path, gate));
  await waitFor(gate + ".opened");
  renameSync(next, path);
  writeFileSync(gate + ".go", "");
  const proc = await pending;
  const got = Home.readResult(proc.stdout, path);
  assert.equal(got.text, '{"id":"old","title":"Old"}\n');
  assert.equal(Home.trusted(source(path), got.info), false);
});

test("oversized files are cut before their contents enter the parser", async t => {
  const dir = mkdtempSync(join(tmpdir(), "nodi-home-reader-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const path = join(dir, "large.jsonl");
  writeFileSync(path, "x".repeat(Home.MAX_BYTES + 4096), { mode: 0o600 });

  const proc = await run(Home.readArgv(path));
  const got = Home.readResult(proc.stdout, path);
  assert.equal(Buffer.byteLength(got.text), Home.MAX_BYTES + 1);
  assert.equal(Home.parse(got.text, source(path), got.info).valid, false);
  assert.ok(Buffer.byteLength(proc.stdout) < Home.MAX_BYTES + 1024);
});
