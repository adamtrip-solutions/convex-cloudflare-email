import { v, type Infer } from "convex/values";

export const vAddress = v.union(
  v.string(),
  v.object({
    address: v.string(),
    name: v.optional(v.union(v.string(), v.null())),
  }),
);
export const vRecipients = v.union(vAddress, v.array(vAddress));
export const vAttachment = v.union(
  v.object({
    content: v.string(),
    filename: v.string(),
    type: v.string(),
    disposition: v.literal("attachment"),
  }),
  v.object({
    content: v.string(),
    filename: v.string(),
    type: v.string(),
    disposition: v.literal("inline"),
    contentId: v.string(),
  }),
);
export const vEmail = v.object({
  from: vAddress,
  to: v.optional(vRecipients),
  cc: v.optional(vRecipients),
  bcc: v.optional(vRecipients),
  subject: v.string(),
  text: v.optional(v.string()),
  html: v.optional(v.string()),
  replyTo: v.optional(vAddress),
  headers: v.optional(v.record(v.string(), v.string())),
  attachments: v.optional(v.array(vAttachment)),
});
export const vStatus = v.union(
  v.literal("pending"),
  v.literal("sending"),
  v.literal("sent"),
  v.literal("failed"),
  v.literal("unknown"),
  v.literal("canceled"),
  v.literal("test"),
);
export const vDeliveryResult = v.object({
  messageId: v.optional(v.string()),
  delivered: v.array(v.string()),
  queued: v.array(v.string()),
  permanentBounces: v.array(v.string()),
  suppressedRecipients: v.array(v.string()),
});
export const vSendError = v.object({
  kind: v.union(
    v.literal("configuration"),
    v.literal("rejected"),
    v.literal("rate_limited"),
    v.literal("unknown"),
  ),
  message: v.string(),
  httpStatus: v.optional(v.number()),
  codes: v.optional(v.array(v.number())),
});
export const vSendConfig = v.object({
  testMode: v.boolean(),
  maxAttempts: v.number(),
  initialBackoffMs: v.number(),
});
export const vEmailStatus = v.object({
  id: v.string(),
  status: vStatus,
  attempts: v.number(),
  createdAt: v.number(),
  updatedAt: v.number(),
  completedAt: v.optional(v.number()),
  nextAttemptAt: v.optional(v.number()),
  result: v.optional(vDeliveryResult),
  error: v.optional(vSendError),
});

export type EmailAddress = Infer<typeof vAddress>;
export type Email = Infer<typeof vEmail>;
export type EmailStatus = Infer<typeof vEmailStatus>;
export type DeliveryResult = Infer<typeof vDeliveryResult>;
export type SendError = Infer<typeof vSendError>;
export type SendConfig = Infer<typeof vSendConfig>;
