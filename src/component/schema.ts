import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import {
  vEmail,
  vStatus,
  vDeliveryResult,
  vSendError,
  vSendConfig,
} from "../validators.js";

export default defineSchema({
  emails: defineTable({
    email: vEmail,
    config: vSendConfig,
    idempotencyKey: v.optional(v.string()),
    status: vStatus,
    attempts: v.number(),
    generation: v.number(),
    updatedAt: v.number(),
    completedAt: v.optional(v.number()),
    nextAttemptAt: v.optional(v.number()),
    result: v.optional(vDeliveryResult),
    error: v.optional(vSendError),
    workId: v.optional(v.string()),
  })
    .index("by_idempotencyKey", ["idempotencyKey"])
    .index("by_status_and_completedAt", ["status", "completedAt"]),
});
