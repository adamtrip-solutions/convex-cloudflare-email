import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const script = fileURLToPath(
  new URL("./validate-release.mjs", import.meta.url),
);
function fixture(
  t,
  {
    version = "1.0.0-beta.0",
    tag = `v${version}`,
    lockVersion = version,
    repository = "owner/package",
    merged = true,
  } = {},
) {
  const cwd = mkdtempSync(join(tmpdir(), "email-release-test-"));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const git = (...args) =>
    execFileSync("git", args, {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  git("init", "-b", "main");
  git("config", "user.name", "Release test");
  git("config", "user.email", "test@example.invalid");
  git("config", "commit.gpgsign", "false");
  writeFileSync(
    join(cwd, "package.json"),
    JSON.stringify({
      version,
      repository: { url: `git+https://github.com/${repository}.git` },
    }),
  );
  writeFileSync(
    join(cwd, "package-lock.json"),
    JSON.stringify({
      version: lockVersion,
      packages: { "": { version: lockVersion } },
    }),
  );
  git("add", ".");
  git("commit", "-m", "Initial fixture");
  git("update-ref", "refs/remotes/origin/main", "HEAD");
  if (!merged) {
    git("checkout", "-b", "unmerged");
    writeFileSync(join(cwd, "unmerged.txt"), "not reviewed");
    git("add", ".");
    git("commit", "-m", "Unmerged change");
  }
  git("tag", tag);
  const output = join(cwd, "output");
  const run = (releaseTag = tag, eventSha = git("rev-parse", "HEAD")) =>
    spawnSync(process.execPath, [script], {
      cwd,
      encoding: "utf8",
      env: {
        ...process.env,
        RELEASE_TAG: releaseTag,
        GITHUB_REPOSITORY: "owner/package",
        GITHUB_SHA: eventSha,
        GITHUB_OUTPUT: output,
      },
    });
  return { run, output, commit: git("rev-parse", "HEAD") };
}
for (const [version, channel] of [
  ["1.0.0", "latest"],
  ["1.0.0-alpha.0", "alpha"],
  ["1.0.0-beta.1", "beta"],
  ["1.0.0-rc.2", "rc"],
]) {
  test(`publishes ${version} to ${channel}`, (t) => {
    const f = fixture(t, { version });
    const result = f.run();
    assert.equal(result.status, 0, result.stderr);
    assert.equal(
      readFileSync(f.output, "utf8"),
      `commit=${f.commit}\ndist-tag=${channel}\n`,
    );
  });
}
for (const [name, options, message] of [
  ["version mismatch", { tag: "v2.0.0" }, "Tag must match"],
  ["stale lockfile", { lockVersion: "0.9.0" }, "Lockfile version must match"],
  [
    "fork repository",
    { repository: "fork/package" },
    "Package repository must match",
  ],
  ["unmerged commit", { merged: false }, "merge-base"],
]) {
  test(`rejects ${name}`, (t) => {
    const { run } = fixture(t, options);
    const result = run();
    assert.notEqual(result.status, 0);
    assert(result.stderr.includes(message), result.stderr);
  });
}
test("rejects missing tags and command-like input", (t) => {
  const { run } = fixture(t);
  for (const tag of [
    "v9.9.9",
    "--help",
    "v1.0.0;echo bad",
    "v1.0.0\ncommit=bad",
  ])
    assert.notEqual(run(tag).status, 0);
});

test("rejects a release event for a different commit", (t) => {
  const { run } = fixture(t);
  const result = run(undefined, "0".repeat(40));
  assert.notEqual(result.status, 0);
  assert(
    result.stderr.includes("Release event must match the tag commit"),
    result.stderr,
  );
});
