import type {
  GenericDataModel,
  GenericMutationCtx,
  GenericQueryCtx,
} from "convex/server";
import { v, type VString } from "convex/values";
import type { ComponentApi } from "../component/_generated/component.js";
import type { Email, EmailStatus, SendConfig } from "../validators.js";

export {
  vEmail,
  vEmailStatus,
  vStatus,
  vDeliveryResult,
} from "../validators.js";
export type {
  Email,
  EmailAddress,
  EmailStatus,
  DeliveryResult,
  SendError,
} from "../validators.js";
export type CloudflareEmailComponent = ComponentApi;
export type EmailId = string & { readonly __emailId: unique symbol };
export const vEmailId = v.string() as VString<EmailId>;
type MutationCtx = Pick<GenericMutationCtx<GenericDataModel>, "runMutation">;
type QueryCtx = Pick<GenericQueryCtx<GenericDataModel>, "runQuery">;

export type CloudflareEmailOptions = {
  /** Defaults to true. Records a test send without making any HTTP request. */
  testMode?: boolean;
  /** Total attempts in a run, including the first. Only HTTP 429 is retried. Default 3. */
  maxAttempts?: number;
  /** Minimum backoff after HTTP 429. Default 30 seconds; Retry-After can increase it. */
  initialBackoffMs?: number;
};
export type SendEmailOptions = Email & { idempotencyKey?: string };

/** Server-side wrapper for an installed Cloudflare Email component. */
export class CloudflareEmail {
  private readonly config: SendConfig;
  constructor(
    public readonly component: ComponentApi,
    options: CloudflareEmailOptions = {},
  ) {
    this.config = {
      testMode: options.testMode ?? true,
      maxAttempts: options.maxAttempts ?? 3,
      initialBackoffMs: options.initialBackoffMs ?? 30_000,
    };
  }

  /** Enqueues atomically with the caller's mutation. Returns a component email ID. */
  async sendEmail(
    ctx: MutationCtx,
    options: SendEmailOptions,
  ): Promise<EmailId> {
    const { idempotencyKey, ...email } = options;
    return (await ctx.runMutation(this.component.lib.enqueue, {
      email,
      config: this.config,
      ...(idempotencyKey === undefined ? {} : { idempotencyKey }),
    })) as EmailId;
  }

  async getStatus(ctx: QueryCtx, id: EmailId): Promise<EmailStatus | null> {
    return ctx.runQuery(this.component.lib.getStatus, { id });
  }

  /** Returns false once an attempt has been claimed or the email has finished. */
  async cancelEmail(ctx: MutationCtx, id: EmailId): Promise<boolean> {
    return ctx.runMutation(this.component.lib.cancel, { id });
  }

  /** Starts another run. Unknown outcomes require explicit duplicate-risk acknowledgment. */
  async retryEmail(
    ctx: MutationCtx,
    id: EmailId,
    options: { acknowledgeDuplicateRisk?: boolean } = {},
  ): Promise<void> {
    await ctx.runMutation(this.component.lib.retry, { id, ...options });
  }

  /** Deletes at most 20 completed rows per call. Default retention is seven days. */
  async cleanup(
    ctx: MutationCtx,
    options: { olderThanMs?: number; limit?: number } = {},
  ): Promise<number> {
    return ctx.runMutation(this.component.lib.cleanup, {
      ...options,
      olderThanMs: options.olderThanMs ?? 7 * 86_400_000,
    });
  }
}
