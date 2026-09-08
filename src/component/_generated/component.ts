/* eslint-disable */
/**
 * Generated `ComponentApi` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type { FunctionReference } from "convex/server";

/**
 * A utility for referencing a Convex component's exposed API.
 *
 * Useful when expecting a parameter like `components.myComponent`.
 * Usage:
 * ```ts
 * async function myFunction(ctx: QueryCtx, component: ComponentApi) {
 *   return ctx.runQuery(component.someFile.someQuery, { ...args });
 * }
 * ```
 */
export type ComponentApi<Name extends string | undefined = string | undefined> =
  {
    lib: {
      cancel: FunctionReference<
        "mutation",
        "internal",
        { id: string },
        boolean,
        Name
      >;
      cleanup: FunctionReference<
        "mutation",
        "internal",
        { limit?: number; olderThanMs: number },
        number,
        Name
      >;
      enqueue: FunctionReference<
        "mutation",
        "internal",
        {
          config: {
            initialBackoffMs: number;
            maxAttempts: number;
            testMode: boolean;
          };
          email: {
            attachments?: Array<
              | {
                  content: string;
                  disposition: "attachment";
                  filename: string;
                  type: string;
                }
              | {
                  content: string;
                  contentId: string;
                  disposition: "inline";
                  filename: string;
                  type: string;
                }
            >;
            bcc?:
              | string
              | { address: string; name?: string | null }
              | Array<string | { address: string; name?: string | null }>;
            cc?:
              | string
              | { address: string; name?: string | null }
              | Array<string | { address: string; name?: string | null }>;
            from: string | { address: string; name?: string | null };
            headers?: Record<string, string>;
            html?: string;
            replyTo?: string | { address: string; name?: string | null };
            subject: string;
            text?: string;
            to?:
              | string
              | { address: string; name?: string | null }
              | Array<string | { address: string; name?: string | null }>;
          };
          idempotencyKey?: string;
        },
        string,
        Name
      >;
      getStatus: FunctionReference<
        "query",
        "internal",
        { id: string },
        {
          attempts: number;
          completedAt?: number;
          createdAt: number;
          error?: {
            codes?: Array<number>;
            httpStatus?: number;
            kind: "configuration" | "rejected" | "rate_limited" | "unknown";
            message: string;
          };
          id: string;
          nextAttemptAt?: number;
          result?: {
            delivered: Array<string>;
            messageId?: string;
            permanentBounces: Array<string>;
            queued: Array<string>;
            suppressedRecipients: Array<string>;
          };
          status:
            | "pending"
            | "sending"
            | "sent"
            | "failed"
            | "unknown"
            | "canceled"
            | "test";
          updatedAt: number;
        } | null,
        Name
      >;
      retry: FunctionReference<
        "mutation",
        "internal",
        { acknowledgeDuplicateRisk?: boolean; id: string },
        null,
        Name
      >;
    };
  };
