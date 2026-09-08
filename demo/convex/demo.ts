import { RateLimiter, MINUTE } from "@convex-dev/rate-limiter";
import {
  CloudflareEmail,
  vEmailId,
  vEmailStatus,
  type EmailId,
} from "convex-cloudflare-email";
import { SessionIdArg } from "convex-helpers/server/sessions";
import { ConvexError, v } from "convex/values";
import { components } from "./_generated/api";
import { mutation, query, internalMutation } from "./_generated/server";

const DAY = 24 * 60 * MINUTE;
const email = new CloudflareEmail(components.cloudflareEmail, {
  testMode: true,
});
const limits = new RateLimiter(components.rateLimiter, {
  visitor: { kind: "fixed window", rate: 20, period: 10 * MINUTE },
  global: { kind: "fixed window", rate: 500, period: DAY, start: 0 },
});
const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function validateId(id: string) {
  if (!uuid.test(id))
    throw new ConvexError(
      "Invalid demo session or request. Refresh the page and try again.",
    );
}

export const send = mutation({
  args: { ...SessionIdArg, requestKey: v.string() },
  returns: v.object({
    emailId: vEmailId,
    duplicate: v.boolean(),
    submissions: v.number(),
  }),
  handler: async (ctx, { sessionId, requestKey }) => {
    validateId(sessionId);
    validateId(requestKey);
    await limits.limit(ctx, "global", { throws: true });
    await limits.limit(ctx, "visitor", { key: sessionId, throws: true });
    const existing = await ctx.db
      .query("requests")
      .withIndex("by_sessionId_and_requestKey", (q) =>
        q.eq("sessionId", sessionId).eq("requestKey", requestKey),
      )
      .unique();
    if (existing && Date.now() - existing._creationTime >= DAY)
      throw new ConvexError("This example has expired. Start a new example.");
    // Always call the actual component, even on repeats, to demonstrate its deduplication.
    const emailId = await email.sendEmail(ctx, {
      from: { address: "hello@example.com", name: "Cloudflare Email Demo" },
      to: "visitor@example.net",
      subject: "Hello from Convex",
      text: "Your welcome email is queued. This is a test-mode example; no email leaves the component.",
      idempotencyKey: `${sessionId}:${requestKey}`,
    });
    const submissions = (existing?.submissions ?? 0) + 1;
    if (existing) {
      if (existing.emailId !== emailId)
        throw new Error(
          "Component returned a different ID for the same request",
        );
      await ctx.db.patch(existing._id, { submissions });
    } else {
      await ctx.db.insert("requests", {
        sessionId,
        requestKey,
        emailId,
        submissions,
      });
    }
    return { emailId, duplicate: existing !== null, submissions };
  },
});

export const history = query({
  args: SessionIdArg,
  returns: v.array(
    v.object({
      requestKey: v.string(),
      emailId: vEmailId,
      submissions: v.number(),
      createdAt: v.number(),
      status: v.union(vEmailStatus, v.null()),
    }),
  ),
  handler: async (ctx, { sessionId }) => {
    validateId(sessionId);
    const rows = await ctx.db
      .query("requests")
      .withIndex("by_sessionId", (q) => q.eq("sessionId", sessionId))
      .order("desc")
      .take(8);
    return await Promise.all(
      rows.map(async (row) => ({
        requestKey: row.requestKey,
        emailId: row.emailId as EmailId,
        submissions: row.submissions,
        createdAt: row._creationTime,
        status: await email.getStatus(ctx, row.emailId as EmailId),
      })),
    );
  },
});

export const cleanup = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const rows = await ctx.db
      .query("requests")
      .withIndex("by_creation_time", (q) =>
        q.lt("_creationTime", Date.now() - DAY),
      )
      .take(100);
    for (const row of rows) {
      await ctx.db.delete(row._id);
      const remaining = await ctx.db
        .query("requests")
        .withIndex("by_sessionId", (q) => q.eq("sessionId", row.sessionId))
        .first();
      if (!remaining)
        await limits.reset(ctx, "visitor", { key: row.sessionId });
    }
    await email.cleanup(ctx, { olderThanMs: DAY, limit: 20 });
    return null;
  },
});
