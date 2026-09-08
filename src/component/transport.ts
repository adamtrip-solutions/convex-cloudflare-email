import type { DeliveryResult, Email, SendError } from "../validators.js";

export type SendOutcome =
  | { kind: "sent"; result: DeliveryResult }
  | { kind: "failed" | "unknown"; error: SendError }
  | { kind: "rate_limited"; error: SendError; retryAfterMs: number };

function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
function strings(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.length <= 50 &&
    value.every((v) => typeof v === "string" && v.length <= 1024)
  );
}
export function parseResult(value: unknown): DeliveryResult | null {
  const r = object(value);
  if (
    !r ||
    !strings(r.delivered) ||
    !strings(r.queued) ||
    !strings(r.permanent_bounces)
  )
    return null;
  if (
    r.message_id !== undefined &&
    (typeof r.message_id !== "string" || r.message_id.length > 2048)
  )
    return null;
  if (
    r.suppressed_recipients !== undefined &&
    !strings(r.suppressed_recipients)
  )
    return null;
  return {
    ...(r.message_id === undefined
      ? {}
      : { messageId: r.message_id as string }),
    delivered: r.delivered,
    queued: r.queued,
    permanentBounces: r.permanent_bounces,
    suppressedRecipients:
      (r.suppressed_recipients as string[] | undefined) ?? [],
  };
}

export function retryAfterMs(header: string | null, now = Date.now()): number {
  if (!header) return 0;
  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds >= 0)
    return Math.ceil(seconds * 1000);
  const date = Date.parse(header);
  return Number.isFinite(date) ? Math.max(0, date - now) : 0;
}

export function toRequest(email: Email) {
  const { replyTo, attachments, ...body } = email;
  return {
    ...body,
    ...(replyTo === undefined ? {} : { reply_to: replyTo }),
    ...(attachments === undefined
      ? {}
      : {
          attachments: attachments.map((a) => {
            if (a.disposition === "attachment") return a;
            const { contentId, ...rest } = a;
            return { ...rest, content_id: contentId };
          }),
        }),
  };
}

/** Exactly one HTTP attempt. Never retry an uncertain external side effect. */
export async function sendRequest(
  email: Email,
  accountId: string,
  apiToken: string,
): Promise<SendOutcome> {
  if (
    !/^[a-f0-9]{32}$/i.test(accountId) ||
    !apiToken.trim() ||
    /[\r\n]/.test(apiToken)
  ) {
    return {
      kind: "failed",
      error: {
        kind: "configuration",
        message:
          "Set a 32-character CLOUDFLARE_ACCOUNT_ID and a valid CLOUDFLARE_API_TOKEN on the component",
      },
    };
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60_000);
  try {
    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/email/sending/send`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(toRequest(email)),
        signal: controller.signal,
        redirect: "error",
      },
    );
    const body = object(await response.json().catch(() => null));
    // Retain numeric codes only. Provider messages may echo credentials or email content.
    const codes = Array.isArray(body?.errors)
      ? body.errors.slice(0, 20).flatMap((e: unknown) => {
          const code = object(e)?.code;
          return typeof code === "number" && Number.isFinite(code)
            ? [code]
            : [];
        })
      : [];
    const details = { httpStatus: response.status, codes };
    if (response.status === 429)
      return {
        kind: "rate_limited",
        retryAfterMs: retryAfterMs(response.headers.get("Retry-After")),
        error: {
          kind: "rate_limited",
          message: "Cloudflare rejected the request due to rate limiting",
          ...details,
        },
      };
    if (response.ok && body?.success === true) {
      const result = parseResult(body.result);
      if (result) return { kind: "sent", result };
    }
    if (
      response.status >= 400 &&
      response.status < 500 &&
      response.status !== 408
    ) {
      return {
        kind: "failed",
        error: {
          kind: "rejected",
          message: "Cloudflare rejected the email request",
          ...details,
        },
      };
    }
    return {
      kind: "unknown",
      error: {
        kind: "unknown",
        message:
          "Cloudflare may have accepted the email; check provider logs before resending",
        ...details,
      },
    };
  } catch {
    return {
      kind: "unknown",
      error: {
        kind: "unknown",
        message:
          "The HTTP attempt did not return a usable response; delivery is unknown",
      },
    };
  } finally {
    clearTimeout(timeout);
  }
}
