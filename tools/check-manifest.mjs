// The manifest says what Omarchy's loader and the marketplace require:
// a permanent id of the io.github.<user>.<plugin> form, the overlay kind
// with its entry point present, and a semver version.

import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const m = JSON.parse(readFileSync(join(root, "manifest.json"), "utf8"));
const fail = msg => { console.error("manifest: " + msg); process.exit(1); };

if (m.schemaVersion !== 1) fail("schemaVersion must be the number 1");
if (m.id !== "io.github.itsgg.nodi") fail("the id is permanent once listed: io.github.itsgg.nodi");
for (const f of ["name", "version", "author", "license", "description", "kinds", "entryPoints", "homepage"]) if (!m[f]) fail("missing " + f);
if (!/^\d+\.\d+\.\d+$/.test(m.version)) fail("version must be semver: " + m.version);
if (JSON.stringify(m.kinds) !== '["overlay"]') fail("kinds must be [\"overlay\"]");
if (!m.entryPoints.overlay || !existsSync(join(root, m.entryPoints.overlay))) fail("overlay entry point missing: " + m.entryPoints.overlay);
if (m.keepLoaded !== true) fail("keepLoaded must be true: the hotkey and the caches live in the loaded plugin");
console.log("manifest: ok");
