import { Workpool, vOnCompleteArgs, type WorkId } from "@convex-dev/workpool";
import { v } from "convex/values";
import { components, internal } from "./_generated/api.js";
import {
  mutation,
  query,
  internalMutation,
  type MutationCtx,
} from "./_generated/server.js";
import type { Doc, Id } from "./_generated/dataModel.js";
import { canonical, validateEmail, validateConfig } from "../validation.js";
import {
  vEmail,
  vEmailStatus,
  vSendConfig,
  vDeliveryResult,
  vSendError,
  type SendError,
} from "../validators.js";

const pool = new Workpool(components.workpool, {
  maxParallelism: 4,
  retryActionsByDefault: false,
});
const DAY = 86_400_000;

async function schedule(
  ctx: MutationCtx,
  id: Id<"emails">,
  generation: number,
  runAfter = 0,
) {
  const workId = await pool.enqueueAction(
    ctx,
    internal.send.send,
    { id, generation },
    {
      retry: false,
      runAfter,
      onComplete: internal.lib.onComplete,
      context: { id, generation },
    },
  );
  await ctx.db.patch(id, { workId, nextAttemptAt: Date.now() + runAfter });
}

function status(email: Doc<"emails">) {
  return {
    id: email._id,
    status: email.status,
    attempts: email.attempts,
    createdAt: email._creationTime,
    updatedAt: email.updatedAt,
    ...(email.completedAt === undefined
      ? {}
      : { completedAt: email.completedAt }),
    ...(email.nextAttemptAt === undefined
      ? {}
      : { nextAttemptAt: email.nextAttemptAt }),
    ...(email.result === undefined ? {} : { result: email.result }),
    ...(email.error === undefined ? {} : { error: email.error }),
  };
}

async function markUnknown(ctx: MutationCtx, id: Id<"emails">) {
  await ctx.db.patch(id, {
    status: "unknown",
    completedAt: Date.now(),
    updatedAt: Date.now(),
    nextAttemptAt: undefined,
    error: {
      kind: "unknown",
      message:
        "The send attempt ended without a recorded outcome; check Cloudflare logs before resending",
    },
  });
}

// Public component functions are accessible to the parent app, never directly to browsers.
export const enqueue = mutation({
  args: {
    email: vEmail,
    config: vSendConfig,
    idempotencyKey: v.optional(v.string()),
  },
  returns: v.id("emails"),
  handler: async (ctx, args) => {
    validateEmail(args.email);
    validateConfig(args.config);
    if (args.idempotencyKey !== undefined) {
      if (!args.idempotencyKey.trim() || args.idempotencyKey.length > 256)
        throw new Error("idempotencyKey must contain 1 to 256 characters");
      const existing = await ctx.db
        .query("emails")
        .withIndex("by_idempotencyKey", (q) =>
          q.eq("idempotencyKey", args.idempotencyKey),
        )
        .unique();
      if (existing) {
        if (
          canonical(existing.email) !== canonical(args.email) ||
          canonical(existing.config) !== canonical(args.config)
        ) {
          throw new Error(
            "idempotencyKey already belongs to a different email or configuration",
          );
        }
        return existing._id;
      }
    }
    const id = await ctx.db.insert("emails", {
      ...args,
      status: "pending",
      attempts: 0,
      generation: 0,
      updatedAt: Date.now(),
    });
    await schedule(ctx, id, 0);
    return id;
  },
});

export const getStatus = query({
  args: { id: v.id("emails") },
  returns: v.union(vEmailStatus, v.null()),
  handler: async (ctx, { id }) => {
    const email = await ctx.db.get(id);
    return email ? status(email) : null;
  },
});

export const cancel = mutation({
  args: { id: v.id("emails") },
  returns: v.boolean(),
  handler: async (ctx, { id }) => {
    const email = await ctx.db.get(id);
    if (!email || email.status !== "pending") return false;
    await ctx.db.patch(id, {
      status: "canceled",
      updatedAt: Date.now(),
      completedAt: Date.now(),
      nextAttemptAt: undefined,
    });
    if (email.workId) await pool.cancel(ctx, email.workId as WorkId);
    return true;
  },
});

export const retry = mutation({
  args: {
    id: v.id("emails"),
    acknowledgeDuplicateRisk: v.optional(v.boolean()),
  },
  returns: v.null(),
  handler: async (ctx, { id, acknowledgeDuplicateRisk }) => {
    const email = await ctx.db.get(id);
    if (!email || (email.status !== "failed" && email.status !== "unknown"))
      throw new Error("Only failed or unknown emails can be retried");
    if (email.status === "unknown" && acknowledgeDuplicateRisk !== true)
      throw new Error(
        "Retrying an unknown email may deliver a duplicate; set acknowledgeDuplicateRisk: true to proceed",
      );
    const generation = email.generation + 1;
    await ctx.db.patch(id, {
      status: "pending",
      generation,
      attempts: 0,
      updatedAt: Date.now(),
      completedAt: undefined,
      error: undefined,
      result: undefined,
    });
    await schedule(ctx, id, generation);
    return null;
  },
});

/** Delete one bounded batch. Retention also defines the enqueue-deduplication window. */
export const cleanup = mutation({
  args: { olderThanMs: v.number(), limit: v.optional(v.number()) },
  returns: v.number(),
  handler: async (ctx, args) => {
    if (!Number.isFinite(args.olderThanMs) || args.olderThanMs < DAY)
      throw new Error("olderThanMs must be at least one day");
    const limit = args.limit ?? 20;
    if (!Number.isInteger(limit) || limit < 1 || limit > 20)
      throw new Error("limit must be an integer between 1 and 20");
    let deleted = 0;
    // Separate indexed ranges keep old unknown outcomes from blocking cleanup.
    for (const status of ["sent", "failed", "canceled", "test"] as const) {
      if (deleted === limit) break;
      const emails = await ctx.db
        .query("emails")
        .withIndex("by_status_and_completedAt", (q) =>
          q
            .eq("status", status)
            .gt("completedAt", 0)
            .lt("completedAt", Date.now() - args.olderThanMs),
        )
        .take(limit - deleted);
      for (const email of emails) {
        await ctx.db.delete(email._id);
        deleted++;
      }
    }
    return deleted;
  },
});

export const claim = internalMutation({
  args: { id: v.id("emails"), generation: v.number() },
  returns: v.union(
    v.object({ email: vEmail, testMode: v.boolean(), attempt: v.number() }),
    v.null(),
  ),
  handler: async (ctx, { id, generation }) => {
    const row = await ctx.db.get(id);
    if (!row || row.status !== "pending" || row.generation !== generation)
      return null;
    const attempt = row.attempts + 1;
    await ctx.db.patch(id, {
      status: "sending",
      attempts: attempt,
      updatedAt: Date.now(),
      nextAttemptAt: undefined,
    });
    // A process termination can prevent both HTTP error handling and a completion write.
    await ctx.scheduler.runAfter(15 * 60_000, internal.lib.expire, {
      id,
      generation,
      attempt,
    });
    return { email: row.email, testMode: row.config.testMode, attempt };
  },
});

export const finish = internalMutation({
  args: {
    id: v.id("emails"),
    generation: v.number(),
    attempt: v.number(),
    outcome: v.union(
      v.object({ kind: v.literal("sent"), result: vDeliveryResult }),
      v.object({ kind: v.literal("test") }),
      v.object({
        kind: v.union(v.literal("failed"), v.literal("unknown")),
        error: vSendError,
      }),
      v.object({
        kind: v.literal("rate_limited"),
        error: vSendError,
        retryAfterMs: v.number(),
      }),
    ),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const email = await ctx.db.get(args.id);
    if (
      !email ||
      email.status !== "sending" ||
      email.generation !== args.generation ||
      email.attempts !== args.attempt
    )
      return null;
    const outcome = args.outcome;
    if (outcome.kind === "rate_limited") {
      const delay = Math.max(
        email.config.initialBackoffMs * 2 ** (email.attempts - 1),
        outcome.retryAfterMs,
      );
      if (
        email.attempts < email.config.maxAttempts &&
        Number.isFinite(delay) &&
        delay <= DAY
      ) {
        const generation = email.generation + 1;
        await ctx.db.patch(email._id, {
          status: "pending",
          generation,
          error: outcome.error,
          updatedAt: Date.now(),
        });
        await schedule(ctx, email._id, generation, delay);
        return null;
      }
    }
    await ctx.db.patch(email._id, {
      status: outcome.kind === "rate_limited" ? "failed" : outcome.kind,
      result: outcome.kind === "sent" ? outcome.result : undefined,
      error: "error" in outcome ? outcome.error : undefined,
      completedAt: Date.now(),
      updatedAt: Date.now(),
      nextAttemptAt: undefined,
    });
    return null;
  },
});

export const expire = internalMutation({
  args: { id: v.id("emails"), generation: v.number(), attempt: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const email = await ctx.db.get(args.id);
    if (
      email?.status === "sending" &&
      email.generation === args.generation &&
      email.attempts === args.attempt
    )
      await markUnknown(ctx, email._id);
    return null;
  },
});

export const onComplete = internalMutation({
  args: vOnCompleteArgs(
    v.object({ id: v.id("emails"), generation: v.number() }),
    v.null(),
  ),
  returns: v.null(),
  handler: async (ctx, { workId, context, result }) => {
    const email = await ctx.db.get(context.id);
    if (
      !email ||
      email.workId !== workId ||
      email.generation !== context.generation
    )
      return null;
    if (email.status === "sending") await markUnknown(ctx, email._id);
    else if (email.status === "pending" && result.kind !== "success") {
      const error: SendError = {
        kind: "rejected",
        message:
          "The background job ended before sending; the email was not submitted",
      };
      await ctx.db.patch(email._id, {
        status: "failed",
        error,
        completedAt: Date.now(),
        updatedAt: Date.now(),
        nextAttemptAt: undefined,
      });
    }
    return null;
  },
});
