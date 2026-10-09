// What a curl source would ask for, for the tests.
import { execFileSync } from "node:child_process";

// The URL curl would ask for, from a source's argv and environment: its
// expansion run against file:///dev/null, nothing fetched.
export function urlOf(src, param) {
  const argv = src.argv(param);
  const at = argv.indexOf("--expand-url") + 1;
  const url = argv[at];
  const local = argv.slice(1, at).concat(["file:///dev/null?" + url, "-o", "/dev/null", "-w", "%{url_effective}"]).filter((a, i, all) => a !== "-A" && all[i - 1] !== "-A");
  const out = execFileSync(argv[0], local, { env: { PATH: "/usr/bin", ...src.environment(param) } }).toString();
  return out.replace(/^file:\/\/\/dev\/null\?/, "");
}
