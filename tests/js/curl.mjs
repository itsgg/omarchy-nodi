// What a curl source would ask for, for the tests.
import { execFileSync } from "node:child_process";

// The URL curl would ask for, from a source's argv and environment: its
// template expanded by curl itself, into --write-out rather than the URL,
// so nothing is fetched and no version's way of reporting a file:// URL
// matters (curl 8.5 on CI dropped the query from url_effective).
export function urlOf(src, param) {
  const argv = src.argv(param);
  const at = argv.indexOf("--expand-url");
  const template = argv[at + 1];
  // Without its user agent and its https-only: file:// is asked for here.
  const drop = new Set(["-A", "--proto"]);
  const local = argv.slice(1, at).filter((a, i, all) => !drop.has(a) && !drop.has(all[i - 1]))
    .concat(["--expand-write-out", template, "-o", "/dev/null", "file:///dev/null"]);
  return execFileSync(argv[0], local, { env: { PATH: "/usr/bin", ...src.environment(param) } }).toString();
}

// Whether the URL needs the source's environment: run again without it,
// curl must fail to expand, so the words are in no argument, encoded or
// not (codex's review, 2026-10-09).
export function needsEnvironment(src, param) {
  const argv = src.argv(param);
  const at = argv.indexOf("--expand-url");
  const drop = new Set(["-A", "--proto"]);
  const local = argv.slice(1, at).filter((a, i, all) => !drop.has(a) && !drop.has(all[i - 1]))
    .concat(["--expand-write-out", argv[at + 1], "-o", "/dev/null", "file:///dev/null"]);
  try { execFileSync(argv[0], local, { env: { PATH: "/usr/bin" }, stdio: "pipe" }); return false; } catch (e) { return true; }
}
