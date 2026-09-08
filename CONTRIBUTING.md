# Contributing

Contributions are welcome. Bug reports, examples, documentation fixes, and tests are useful alongside new features. Open an issue before a large change so maintainers can discuss the proposed behavior and scope.

## Local setup

Use Node.js 24, the version in `.nvmrc`, and npm. CI also checks Node.js 22.

1. Fork the repository and clone your fork.
2. Create a branch from `main`, such as `fix/retry-delay` or `docs/setup`.
3. Install dependencies and run the checks:

```sh
npm ci
npm run check
```

`npm run check` checks formatting and types, runs the tests, builds from a clean `dist` directory, and verifies the npm publication file list without publishing. Tests use mocked HTTP responses and need no Cloudflare credentials or deployed Convex app.

Run `npm run format` to fix formatting. Run `npm test -- src/component/transport.test.ts` to focus on transport tests.

The `example/convex` app imports this repository's source directly. See the README for the optional local Convex backend setup. The example uses test mode. Never commit `.env` files, local backend state, API tokens, real recipients, or email bodies.

## Making a change

Keep pull requests focused. Add tests for changed behavior, including failure cases. Update the README if public methods, defaults, or limits change. Do not edit files under `_generated` by hand. If component functions or schemas change, run `npm run codegen` with your local Convex setup and include the generated changes.

Email sends are external side effects. An uncertain HTTP result must remain `unknown`; automatically repeating it can deliver duplicate mail. Keep credentials out of queue arguments, database rows, and error messages. Test cancellation, retries, and stale completions when changing the queue lifecycle.

Do not bump the package version in ordinary contributions. Maintainers handle release versions separately. If a dependency changes, include the updated `package-lock.json`.

## Pull requests

Open a pull request against `main`. Explain the problem, the resulting behavior, and the checks you ran. CI must pass before merging. A maintainer may request changes or help narrow the scope. Public contributions do not receive release credentials.

By submitting a contribution, you agree to license it under this project's MIT license. Please follow the [code of conduct](CODE_OF_CONDUCT.md). For vulnerabilities, follow [SECURITY.md](SECURITY.md) instead of opening a public issue.
