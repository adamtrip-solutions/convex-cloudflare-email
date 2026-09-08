import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  requests: defineTable({
    sessionId: v.string(),
    requestKey: v.string(),
    emailId: v.string(),
    submissions: v.number(),
  })
    .index("by_sessionId_and_requestKey", ["sessionId", "requestKey"])
    .index("by_sessionId", ["sessionId"]),
});
