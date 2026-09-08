# Cloudflare Email component demo

A public test-mode demo at [cloudflare-email-demo.adamtrip.pt](https://cloudflare-email-demo.adamtrip.pt), built with React, Vite, and a dedicated Convex deployment. It consumes `convex-cloudflare-email@0.1.0-beta.0` from npm, not the local library source.

## What it exercises

Send a preset message, subscribe to its real component status, and repeat the request with the same idempotency key. The backend always calls the component, including on duplicates. The repeat must return the original ID. `test` means simulated execution, not delivery to an inbox.

The backend fixes `testMode: true` and accepts no recipient, message, or credential input. No Cloudflare email credentials are configured.

## Local development

From this directory:

```sh
npm ci
cp .env.example .env.local
npx convex dev --once
npm run dev
```

The supplied deployment belongs to the maintainer. Contributors should configure their own Convex project and update `.env.local`. Use `npm run check` for tests and the production build. Tests need no account or credentials.

For a different deployment, also update the `connect-src` origins in `public/_headers`, the frontend URL in the GitHub demo workflows, and the custom domain in `wrangler.jsonc`.

## Hosting

The frontend uses Cloudflare Workers static assets at `cloudflare-email-demo.adamtrip.pt`. Wrangler's custom domain configuration provisions routing and TLS. It does not alter the domain's email records. The backend uses the dedicated `reliable-lyrebird-289` Convex development deployment.

With the maintainer's existing Convex and Wrangler CLI logins:

```sh
npx convex dev --once
npm run deploy:frontend
```

Do not publish with a different deployment URL unless the backend, CSP origins, and build configuration agree. No credentials belong in `VITE_` variables; those values are public in the browser bundle.

## CI and automated deployment

`Demo CI` tests and builds every pull request. The separate `Deploy demo` workflow accepts only `main` and uses the protected GitHub `demo` environment.

The initial deployment can use local CLI logins. To enable future deployments from GitHub, add these environment secrets through GitHub settings:

- `CONVEX_DEPLOY_KEY`, a deployment-scoped key for this dedicated demo deployment. Do not use an unrelated project's key.
- `CLOUDFLARE_API_TOKEN`, scoped to deploy this Worker's assets and manage its route in the `adamtrip.pt` zone.

After both are configured, set the repository variable `DEMO_AUTODEPLOY=true` to deploy on merged demo changes, or run the workflow manually from `main`. Environment approval remains required. Local Wrangler login is not available to GitHub Actions. The npm release workflow is independent.

## Sessions, limits, and retention

`convex-helpers` creates a random UUID session token stored in browser session storage. It acts as an anonymous bearer credential; anyone who obtains it can access that session's synthetic examples. Do not share it or reuse this pattern for sensitive user data without proper authentication. The backend never returns session tokens in results.

Each session can submit 20 requests per 10-minute fixed window. A global limit allows 500 requests per UTC day, including duplicate submissions. New sessions cannot bypass that global cap, though anonymous sessions are not an identity-based quota. These limits bound successful writes, not all possible network traffic.

History returns at most eight examples. Every ten minutes, cleanup removes at most 100 demo records older than 24 hours and asks the component to remove at most 20 eligible completed emails. It resets the visitor quota when the session has no records left. The component deliberately retains unknown outcomes for investigation; cleanup does not promise an exact deletion deadline.
