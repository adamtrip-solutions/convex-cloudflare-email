import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { appendFileSync } from "node:fs";

const git = (...args) => execFileSync("git", args, { encoding: "utf8" }).trim();
const tag = process.env.RELEASE_TAG;
assert.match(
  tag ?? "",
  /^v\d+\.\d+\.\d+(?:-(?:alpha|beta|rc)\.\d+)?$/,
  "Use vX.Y.Z or vX.Y.Z-beta.N, alpha.N, rc.N",
);
const commit = git("rev-parse", "--verify", `refs/tags/${tag}^{commit}`);
assert.equal(
  commit,
  process.env.GITHUB_SHA,
  "Release event must match the tag commit for provenance",
);
git("merge-base", "--is-ancestor", commit, "refs/remotes/origin/main");
const pkg = JSON.parse(git("show", `${commit}:package.json`));
const lock = JSON.parse(git("show", `${commit}:package-lock.json`));
assert.equal(tag, `v${pkg.version}`, "Tag must match package.json version");
assert.equal(lock.version, pkg.version, "Lockfile version must match");
assert.equal(
  lock.packages[""].version,
  pkg.version,
  "Lockfile root must match",
);
assert.equal(
  pkg.repository?.url,
  `git+https://github.com/${process.env.GITHUB_REPOSITORY}.git`,
  "Package repository must match the releasing repository",
);
assert.equal(pkg.private, undefined, "Package must be public");
const distTag = pkg.version.includes("-")
  ? pkg.version.split("-")[1].split(".")[0]
  : "latest";
assert(process.env.GITHUB_OUTPUT, "GITHUB_OUTPUT is required");
appendFileSync(
  process.env.GITHUB_OUTPUT,
  `commit=${commit}\ndist-tag=${distTag}\n`,
);
console.log(`Verified ${tag} at ${commit}; npm dist-tag: ${distTag}`);
