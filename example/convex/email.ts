import { internalMutation, internalQuery } from "./_generated/server.js";
import { components } from "./_generated/api.js";
import {
  CloudflareEmail,
  vEmailId,
  vEmailStatus,
} from "../../src/client/index.js";
import { v } from "convex/values";

const email = new CloudflareEmail(components.cloudflareEmail); // Test mode by default.

export const sendExample = internalMutation({
  args: {},
  returns: vEmailId,
  handler: async (ctx) =>
    email.sendEmail(ctx, {
      from: { address: "hello@example.com", name: "Example" },
      to: "recipient@example.net",
      subject: "Hello from Convex",
      text: "This example records a test send without contacting Cloudflare.",
      idempotencyKey: "example-welcome-v1",
    }),
});

export const status = internalQuery({
  args: { id: vEmailId },
  returns: v.union(vEmailStatus, v.null()),
  handler: async (ctx, { id }) => email.getStatus(ctx, id),
});
