// Loads a QML ".pragma library" file in node, resolving its
// `.import "x.js" as Name` lines, so the files QML runs are the files tested.
// Each file is evaluated once, as QML shares one instance of a library.

import { readFileSync } from "node:fs";
import { createContext, runInContext } from "node:vm";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

const cache = new Map();
export const warnings = [];

export function load(rel) {
  const file = resolve(root, rel);
  if (cache.has(file)) return cache.get(file);
  const sandbox = {
    console: { log: console.log, warn: (...a) => warnings.push(a.join(" ")), error: console.error }
  };
  const body = readFileSync(file, "utf8").split("\n").map(line => {
    const m = line.match(/^\.import\s+"([^"]+)"\s+as\s+(\w+)/);
    if (m) { sandbox[m[2]] = load(join(dirname(file), m[1])); return ""; }
    return line.startsWith(".pragma") ? "" : line;
  }).join("\n");
  const ctx = createContext(sandbox);
  runInContext(body, ctx, { filename: file });
  cache.set(file, ctx);
  return ctx;
}

// Values made inside a library come from its own realm; compare them as data.
export const plain = value => JSON.parse(JSON.stringify(value));
