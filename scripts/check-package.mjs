import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";

// Ask npm for its exact publication manifest without publishing or writing an archive.
const output = execFileSync(
  "npm",
  ["publish", "--dry-run", "--json", "--ignore-scripts", "--tag", "beta"],
  { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] },
);
const result = JSON.parse(output);
const manifest = Array.isArray(result) ? result[0] : result;
const paths = new Set(manifest.files.map((file) => file.path));
for (const path of paths) {
  assert(
    /^(dist\/|src\/|package\.json$|README\.md$|LICENSE$)/.test(path),
    `Unexpected published file: ${path}`,
  );
  assert(
    !/(^|\/)(\.env[^/]*|node_modules|\.convex)(\/|$)|\.tgz$|\.test\.[cm]?[jt]s$/.test(
      path,
    ),
    `Private or test file in package: ${path}`,
  );
  assert(statSync(path).isFile(), `Not a regular file: ${path}`);
}
const pkg = JSON.parse(readFileSync("package.json", "utf8"));
function checkTargets(value) {
  if (typeof value === "string")
    assert(paths.has(value.replace(/^\.\//, "")), `Missing export: ${value}`);
  else for (const target of Object.values(value)) checkTargets(target);
}
checkTargets(pkg.exports);
for (const path of [
  "README.md",
  "LICENSE",
  "src/component/schema.ts",
  "src/component/lib.ts",
  "src/component/send.ts",
  "src/component/_generated/api.ts",
  "src/test.ts",
])
  assert(paths.has(path), `Missing required file: ${path}`);
const api = await import("convex-cloudflare-email");
assert.equal(typeof api.CloudflareEmail, "function");
assert(api.vEmailId);
console.log(
  `Verified ${paths.size} publication files and the built public entry point.`,
);
