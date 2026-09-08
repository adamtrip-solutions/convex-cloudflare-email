# Releasing

Releases are published by `.github/workflows/release.yml`. Contributors install from npm. No local archive or manual package installation is part of this process.

## One-time repository setup

Configure these settings before publishing the first release. Files in the repository do not enforce GitHub settings by themselves.

- Protect `main`. Require pull requests, resolved conversations, and the GitHub Actions checks `Check (Node 22)` and `Check (Node 24)`. Require the branch to be up to date. Block force pushes and deletion. Apply these checks to administrators too.
- Require a code owner review when a second maintainer is available. A sole maintainer cannot approve their own pull requests; requiring their approval would block maintenance. CODEOWNERS still routes reviews for outside contributions.
- Protect tags matching `v*` against updates and deletion. Restrict creation to repository administrators. Tags used for releases must point to commits already merged into `main`.
- Create the `npm` environment. Allow deployments from tags matching `v*` only. Require approval from the release maintainer, disable administrator bypass, and keep release secrets in this environment. A sole maintainer must be allowed to approve their own release; disable self-approval when another release maintainer is available.
- Set the default Actions token to read-only, disable Actions creating or approving pull requests, and require approval for all outside collaborators' workflow runs.
- Enable Dependabot alerts and security updates, private vulnerability reporting, secret scanning, and push protection. Enable immutable releases if available for the repository.
- Use squash merges and delete merged branches automatically. Keep organization-wide settings at least as restrictive as repository settings.

CI and releases use pinned action commits, standard GitHub-hosted Linux runners, and no dependency cache. Pull requests run with read-only permissions and no release secrets. There is no automated deployment to a user's Convex or Cloudflare account.

## First npm publication

The package name must be available to your npm account. A registry 404 is not a reservation of the name. Confirm the repository URL in `package.json` matches the public GitHub repository before releasing.

For a new package with no trusted publisher configured, create a short-lived granular npm token with Read and write package permissions that allow creation of this package. Enable Bypass two-factor authentication for this initial unattended publish. Use the shortest practical expiry. Store it through GitHub's environment secret UI as `NPM_BOOTSTRAP_TOKEN` in `npm`. Never paste it into an issue, chat, or committed file. This token is used only by the publish step after environment approval.

Run the release process below for `0.1.0-beta.0`. After it succeeds, configure an [npm trusted publisher](https://docs.npmjs.com/trusted-publishers/) in the package settings:

- Organization or user: `adamtrip-solutions`.
- Repository: `convex-cloudflare-email`.
- Workflow filename: `release.yml`.
- Environment: `npm`.
- Allow direct publishing with `npm publish`.

Delete the bootstrap secret, revoke its npm token, and set npm publishing access to require two-factor authentication and disallow tokens. Subsequent releases use GitHub's OIDC identity and produce provenance without a stored npm credential. The Node.js 24 runner includes an npm version that supports trusted publishing.

## Version policy

Keep releases on `0.x.x` throughout beta. Use prerelease versions such as `0.1.0-beta.0` and `0.1.0-beta.1`, published under npm's `beta` tag. Reserve `1.0.0` for the stable release. Document breaking changes in the changelog even during beta.

## Publishing a version

1. Create a release branch from `main`. Update the version and lockfile with `npm version 0.1.0-beta.1 --no-git-tag-version`, using the intended version. Update the changelog and relevant documentation. Run `npm run check`.
2. Open a pull request and merge it after required checks and reviews.
3. Create a GitHub release with tag `v` followed by the exact package version, targeting the merged commit on `main`. Copy the version's changelog entry into the release notes. Mark prereleases as such in GitHub. Inspect the target commit before publishing the release.
4. Publishing the GitHub release starts the Release workflow. It verifies tag syntax, version and lockfile consistency, repository identity, and membership in `main` history, then runs the checks.
5. Review and approve the pending `npm` deployment. The publish job rebuilds and checks the verified commit, then runs `npm publish` with provenance. Versions ending in `-alpha.N`, `-beta.N`, or `-rc.N` publish under that channel. Stable versions publish under `latest`.
6. Confirm the Release workflow is green and inspect `npm view convex-cloudflare-email@VERSION version dist-tags dist.attestations --json`. The GitHub release existing alone does not prove npm publication succeeded.

The first beta, `0.1.0-beta.0`, is published. npm currently points both `beta` and `latest` at that initial version; install with `@beta` to explicitly follow beta releases. Future beta publications use `--tag beta`, and stable publications use `--tag latest`.

## Failed runs

A failed validation never reaches the publishing environment. Fix source or workflow defects through a pull request and use a new version when the package contents change.

If publication failed before npm accepted the version, rerun the failed job. Use GitHub's rerun control on the original release-triggered run so provenance retains the original release commit. Tags outside `main` history and version mismatches are rejected. npm versions cannot be overwritten; if the version already exists, inspect its provenance and workflow logs before deciding whether a new release is needed. Do not move release tags to repair a failed release.
