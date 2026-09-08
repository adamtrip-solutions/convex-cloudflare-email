# Security policy

## Supported versions

Security fixes target the latest published beta. Older prereleases are not maintained separately. The package is still in beta; do not assume production delivery has been verified for your account.

## Reporting a vulnerability

Use [private vulnerability reporting](https://github.com/adamtrip-solutions/convex-cloudflare-email/security/advisories/new) to send a private report. Include affected versions, a minimal reproduction with synthetic data, and the likely impact. Do not include API tokens, real email contents, or recipient data.

If private reporting is unavailable, contact a maintainer privately through their GitHub profile. Do not disclose an unresolved vulnerability in a public issue. Maintainers will investigate and coordinate a fix and disclosure; there is no guaranteed response time.

## Application responsibilities

Store Cloudflare credentials in Convex environment variables. Application wrappers must authenticate callers and check ownership before exposing sending, status, cancellation, or retry operations. Status results may contain recipient addresses.

The database retains message content until cleanup. Choose retention deliberately, and remember that deleting an enqueue key removes its deduplication guarantee. Review provider logs before retrying an `unknown` send, since the previous request may have succeeded.
