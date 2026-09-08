import type { Email, EmailAddress, SendConfig } from "./validators.js";

// Leave room for document metadata under Convex's 1 MiB document limit.
export const MAX_EMAIL_BYTES = 512 * 1024;
const noNewlines = (s: string) => !/[\r\n\0]/.test(s);

function address(value: EmailAddress) {
  const raw = typeof value === "string" ? value : value.address;
  if (!noNewlines(raw) || !/^[^\s<>@]+@[^\s<>@]+$/.test(raw)) {
    throw new Error(
      "Use a plain email address, or { address, name } for a display name",
    );
  }
  if (
    typeof value !== "string" &&
    value.name != null &&
    !noNewlines(value.name)
  ) {
    throw new Error("Address names must not contain line breaks");
  }
}

export function validateEmail(email: Email) {
  if (
    new TextEncoder().encode(JSON.stringify(email)).byteLength > MAX_EMAIL_BYTES
  ) {
    throw new Error(
      "Email exceeds this component's 512 KiB serialized payload limit, including base64 attachments",
    );
  }
  address(email.from);
  if (email.replyTo !== undefined) address(email.replyTo);
  const recipients = [email.to, email.cc, email.bcc].flatMap((r) =>
    r === undefined ? [] : Array.isArray(r) ? r : [r],
  );
  if (recipients.length < 1 || recipients.length > 50) {
    throw new Error(
      "An email must have between 1 and 50 recipients across to, cc, and bcc",
    );
  }
  recipients.forEach(address);
  if (!email.text?.trim() && !email.html?.trim())
    throw new Error("Provide nonempty text or html");
  if (email.subject.length > 998 || !noNewlines(email.subject))
    throw new Error(
      "Invalid subject, maximum 998 characters without line breaks",
    );
  for (const [name, value] of Object.entries(email.headers ?? {})) {
    if (!/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(name) || !noNewlines(value))
      throw new Error("Invalid email header");
  }
  for (const attachment of email.attachments ?? []) {
    if (
      !attachment.filename ||
      !attachment.type ||
      !noNewlines(attachment.filename) ||
      !noNewlines(attachment.type)
    )
      throw new Error(
        "Attachments require a filename and MIME type without line breaks",
      );
    if (
      attachment.content.length % 4 !== 0 ||
      !/^[A-Za-z0-9+/]*={0,2}$/.test(attachment.content)
    )
      throw new Error("Attachment content must be base64 encoded");
    if (
      attachment.disposition === "inline" &&
      (!attachment.contentId || !noNewlines(attachment.contentId))
    )
      throw new Error(
        "Inline attachments require a contentId without line breaks",
      );
  }
}

export function validateConfig(config: SendConfig) {
  if (
    !Number.isInteger(config.maxAttempts) ||
    config.maxAttempts < 1 ||
    config.maxAttempts > 10
  )
    throw new Error("maxAttempts must be an integer between 1 and 10");
  if (
    !Number.isFinite(config.initialBackoffMs) ||
    config.initialBackoffMs < 1000 ||
    config.initialBackoffMs > 3_600_000
  )
    throw new Error("initialBackoffMs must be between 1000 and 3600000");
}

/** Stable serialization for comparing requests with a caller's deduplication key. */
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.entries(value)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}
