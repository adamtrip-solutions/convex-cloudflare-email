# Cloudflare Email for Convex

A Convex component for sending email through Cloudflare Email Service's beta REST API. Enqueue an email inside a mutation, track its status, and cancel it before sending starts.

This package is an initial beta implementation. It has been tested with mocked Cloudflare responses and a local Convex deployment. Real sending requires your Cloudflare account and an onboarded sending domain.

## Interactive demo

[Try the hosted demo](https://cloudflare-email-demo.adamtrip.pt) to send a simulated email, watch its status, and repeat the request to verify deduplication. [Demo source and setup](demo/README.md). No external email is sent.

## Install

Requires Node.js 22 or newer and Convex 1.45 or newer. Install the beta from npm:

```sh
npm install convex-cloudflare-email@beta
```

The [npm package](https://www.npmjs.com/package/convex-cloudflare-email) is in beta. Use `@beta` to select the beta channel. Releases will remain on `0.x.x` until the stable `1.0.0` release.

Register the component in `convex/convex.config.ts`. Component environment variables keep credentials out of queued jobs and database rows.

```ts
import { defineApp } from "convex/server";
import { v } from "convex/values";
import cloudflareEmail from "convex-cloudflare-email/convex.config";

const app = defineApp({
  env: {
    CLOUDFLARE_ACCOUNT_ID: v.optional(v.string()),
    CLOUDFLARE_API_TOKEN: v.optional(v.string()),
  },
});
app.use(cloudflareEmail, {
  env: {
    CLOUDFLARE_ACCOUNT_ID: app.env.CLOUDFLARE_ACCOUNT_ID,
    CLOUDFLARE_API_TOKEN: app.env.CLOUDFLARE_API_TOKEN,
  },
});
export default app;
```

Run `npx convex dev` to generate the component references.

## Send an email

```ts
// convex/email.ts
import { CloudflareEmail, vEmailId } from "convex-cloudflare-email";
import { components } from "./_generated/api";
import { internalMutation } from "./_generated/server";
import { v } from "convex/values";

const email = new CloudflareEmail(components.cloudflareEmail);

export const sendWelcome = internalMutation({
  args: { userId: v.string(), to: v.string() },
  returns: vEmailId,
  handler: async (ctx, { userId, to }) => {
    return email.sendEmail(ctx, {
      from: { address: "hello@yourdomain.com", name: "Your app" },
      to,
      subject: "Welcome",
      text: "Thanks for joining.",
      html: "<p>Thanks for joining.</p>",
      idempotencyKey: `welcome:${userId}`,
    });
  },
});
```

The default is `testMode: true`. A test send ends in `test` status without contacting Cloudflare or requiring credentials. This is a local simulation, not a deliverability test. To send real mail, onboard your domain through [Cloudflare Email Sending](https://developers.cloudflare.com/email-service/get-started/send-emails/), create a token with **Email Sending: Edit**, and configure the app's environment variables:

```sh
npx convex env set CLOUDFLARE_ACCOUNT_ID your_32_character_account_id
npx convex env set CLOUDFLARE_API_TOKEN your_api_token
```

Then opt into real sends:

```ts
const email = new CloudflareEmail(components.cloudflareEmail, {
  testMode: false,
  maxAttempts: 3,
  initialBackoffMs: 30_000,
});
```

Credentials are read when each attempt runs, so queued emails use the current token after rotation. Configure separate component instances if you need separate accounts.

## Input

`sendEmail(ctx, options)` returns a branded `EmailId`. It works from mutations and actions. Within a mutation, the enqueue rolls back if the caller's transaction fails. Multiple calls from an action are separate transactions.

| Field             | Type and behavior                                                     |
| ----------------- | --------------------------------------------------------------------- |
| `from`            | Plain email string or `{ address, name? }`                            |
| `to`, `cc`, `bcc` | One address or an array of addresses. At least one recipient overall. |
| `subject`         | String, up to 998 characters, without line breaks                     |
| `text`, `html`    | At least one nonempty body                                            |
| `replyTo`         | One plain or named address                                            |
| `headers`         | Record of header names to string values                               |
| `attachments`     | Array of base64 attachments described below                           |
| `idempotencyKey`  | Optional nonempty string, up to 256 characters                        |

There can be at most 50 recipients combined. Use a named address object instead of a string such as `Support <support@example.com>`. Cloudflare validates sender domains, supported custom headers, suppression rules, and other provider restrictions. See its [header reference](https://developers.cloudflare.com/email-service/reference/headers/).

Attachments require `filename`, MIME `type`, base64 `content`, and `disposition: "attachment"`. Inline images use `disposition: "inline"` and a `contentId`, referenced in HTML as `cid:logo`.

```ts
attachments: [
  {
    filename: "logo.png",
    type: "image/png",
    content: base64Png,
    disposition: "inline",
    contentId: "logo",
  },
];
```

This version limits the entire JSON email payload to **512 KiB**, including base64 content, to leave room within Convex's document limit. That is lower than Cloudflare's [message size limit](https://developers.cloudflare.com/email-service/platform/limits/). Large attachments and raw MIME sending are not supported yet.

## Status and controls

Call these methods from your app's server functions:

```ts
await email.getStatus(ctx, id); // Query or action context; null if deleted.
await email.cancelEmail(ctx, id); // Mutation or action; boolean.
await email.retryEmail(ctx, id); // Failed emails only, unless acknowledged below.
await email.retryEmail(ctx, id, { acknowledgeDuplicateRisk: true });
await email.cleanup(ctx); // Deletes at most 20 completed rows older than 7 days.
```

`getStatus` returns the component ID, status, attempt count for the current run, timestamps, and any result or error. It omits the email body and configuration. Exported `vEmailStatus` and `vEmailId` validators can validate application wrappers. Authenticate and check ownership in those wrappers before exposing status, retries, or sending to clients. Recipient results contain email addresses.

| Status     | Meaning                                                                                                  |
| ---------- | -------------------------------------------------------------------------------------------------------- |
| `pending`  | Waiting for an attempt, including rate-limit backoff. Can be canceled.                                   |
| `sending`  | Claimed by a worker. Cancellation is too late.                                                           |
| `sent`     | Cloudflare returned a valid successful response. Inspect recipient results.                              |
| `test`     | Simulated send. No HTTP request occurred.                                                                |
| `failed`   | Configuration or request rejection, exhausted throttling attempts, or a job that failed before claiming. |
| `unknown`  | An attempt may have reached Cloudflare, but its result is uncertain.                                     |
| `canceled` | Canceled before claim.                                                                                   |

A successful result contains `delivered`, `queued`, `permanentBounces`, and `suppressedRecipients` arrays, plus `messageId` when returned. `sent` does not mean every recipient received the email. The component preserves the send-time snapshot. Cloudflare handles further delivery attempts for recipients in `queued`.

## Retries and deduplication

The component uses `@convex-dev/workpool` with four concurrent workers per installed instance. It automatically retries HTTP 429 rejections using exponential backoff and the larger `Retry-After` delay. `maxAttempts` includes the first attempt and must be between 1 and 10. Backoff starts at 30 seconds by default. A requested delay exceeding one day stops the run as `failed` instead of retrying early.

There is no documented idempotency guarantee for Cloudflare's [send operation](https://developers.cloudflare.com/api/resources/email_sending/methods/send/). The component therefore makes a single HTTP request per attempt, with a 60-second timeout. Network failures, HTTP 408/5xx, and unusable successful responses become `unknown`. A watchdog marks abandoned attempts `unknown` after 15 minutes. Generic workpool retries are disabled.

An enqueue key prevents duplicate jobs within one installed component. Reusing a key with a different payload or configuration throws. This does not provide exactly-once delivery across an HTTP request and a database write. Check Cloudflare logs before acknowledging an unknown retry. A manual retry starts a new run and resets its attempt count.

The component never resends a successful request to retry its bounced or queued recipients. Such a repeat could duplicate email for recipients already delivered.

## Retention

Email bodies and recipient data stay in the component database until cleanup. Call `cleanup` from an application cron or a maintenance mutation. It processes one batch per call, accepts `olderThanMs` of at least one day and `limit` from 1 to 20, and returns the number deleted. It removes old `sent`, `test`, `failed`, and `canceled` records. `unknown` records are retained for investigation.

Deleting a record also deletes its enqueue key. Reusing that key after cleanup can send another email. Set retention to match the deduplication period your application needs. Workpool maintains its own job records; those contain component IDs and generation numbers, not message bodies or credentials.

## Development and tests

```sh
npm ci
npm run check
CONVEX_AGENT_MODE=anonymous npx convex dev --once
npx convex run email:sendExample '{}'
# Use the returned ID:
npx convex run email:status '{"id":"RETURNED_EMAIL_ID"}'
npm run codegen
```

The example always uses test mode. Keep the local backend running with `npm run dev` when making CLI calls. Unit tests mock every HTTP request and cover response parsing, failures, throttling, claim/cancel races, deduplication, transaction rollback, stale completions, cleanup, and execution through the nested workpool.

For tests in a consuming app:

```ts
import { convexTest } from "convex-test";
import { register } from "convex-cloudflare-email/test";
import schema from "./schema";

const t = convexTest(schema, import.meta.glob("./**/*.ts"));
register(t); // Pass the component's name as the second argument if renamed.
```

## Differences from the Resend component

The server wrapper and transactional queue follow the pattern of [Convex's Resend component](https://github.com/get-convex/resend). This implementation targets Cloudflare's REST API and uses its recipient results. It does not include Resend templates, batch sending, open/click tracking, callbacks, or webhooks.

Cloudflare delivery events use [Event Subscriptions and Queues](https://developers.cloudflare.com/email-service/platform/event-subscriptions/). Consuming those events to update delivery status is outside this initial version. Sending itself requires no Cloudflare Worker.

## Contributing

Contributions are welcome, including bug reports, tests, documentation, and code. See [CONTRIBUTING.md](CONTRIBUTING.md) for setup and the pull request process. Report vulnerabilities through the private channel in [SECURITY.md](SECURITY.md).

## Releases and license

GitHub Actions validates each pull request and publishes approved releases directly to npm. Maintainers should follow [the release guide](docs/releasing.md). The component is available under the [MIT license](LICENSE).
