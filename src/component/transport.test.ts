import { afterEach, describe, expect, it, vi } from "vitest";
import { parseResult, retryAfterMs, sendRequest } from "./transport.js";
import type { Email } from "../validators.js";

const email: Email = {
  from: "from@example.com",
  to: "to@example.net",
  subject: "Hello",
  text: "Hello",
};
const account = "a".repeat(32);
const result = {
  delivered: ["to@example.net"],
  queued: [],
  permanent_bounces: [],
};
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("Cloudflare transport", () => {
  it("uses the REST contract and keeps mixed recipient results", async () => {
    const fetch = vi.fn().mockResolvedValue(
      Response.json({
        success: true,
        result: {
          ...result,
          message_id: "provider-id",
          queued: ["later@example.net"],
          permanent_bounces: ["bounce@example.net"],
          suppressed_recipients: ["suppressed@example.net"],
        },
      }),
    );
    vi.stubGlobal("fetch", fetch);
    const outcome = await sendRequest(
      {
        ...email,
        replyTo: { address: "reply@example.com", name: "Support" },
        attachments: [
          {
            filename: "logo.png",
            type: "image/png",
            disposition: "inline",
            contentId: "logo",
            content: "aGk=",
          },
        ],
      },
      account,
      "secret-token",
    );
    expect(outcome).toEqual({
      kind: "sent",
      result: {
        messageId: "provider-id",
        delivered: ["to@example.net"],
        queued: ["later@example.net"],
        permanentBounces: ["bounce@example.net"],
        suppressedRecipients: ["suppressed@example.net"],
      },
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, options] = fetch.mock.calls[0]!;
    expect(url).toBe(
      `https://api.cloudflare.com/client/v4/accounts/${account}/email/sending/send`,
    );
    expect(options.headers.Authorization).toBe("Bearer secret-token");
    expect(options.redirect).toBe("error");
    const body = JSON.parse(options.body);
    expect(body.reply_to).toEqual({
      address: "reply@example.com",
      name: "Support",
    });
    expect(body.attachments[0].content_id).toBe("logo");
    expect(body.replyTo).toBeUndefined();
    expect(body.attachments[0].contentId).toBeUndefined();
  });

  it("accepts the older documented response without a message ID", () => {
    expect(parseResult(result)).toEqual({
      delivered: ["to@example.net"],
      queued: [],
      permanentBounces: [],
      suppressedRecipients: [],
    });
  });

  it.each([400, 401, 403, 404, 422])(
    "records HTTP %s as rejection without reflecting response secrets",
    async (status) => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(
          Response.json(
            {
              success: false,
              errors: [{ code: 10101, message: "secret-token" }],
            },
            { status },
          ),
        ),
      );
      const outcome = await sendRequest(email, account, "secret-token");
      expect(outcome.kind).toBe("failed");
      expect(JSON.stringify(outcome)).not.toContain("secret-token");
      expect(outcome).toMatchObject({
        error: { codes: [10101], httpStatus: status },
      });
    },
  );

  it.each([408, 500, 502, 503])(
    "does not retry an uncertain HTTP %s",
    async (status) => {
      const fetch = vi
        .fn()
        .mockResolvedValue(new Response("upstream error", { status }));
      vi.stubGlobal("fetch", fetch);
      expect((await sendRequest(email, account, "token")).kind).toBe("unknown");
      expect(fetch).toHaveBeenCalledTimes(1);
    },
  );

  it("exposes rate-limit delay without retrying inside transport", async () => {
    const fetch = vi.fn().mockResolvedValue(
      new Response("rate limited", {
        status: 429,
        headers: { "Retry-After": "120" },
      }),
    );
    vi.stubGlobal("fetch", fetch);
    expect(await sendRequest(email, account, "token")).toMatchObject({
      kind: "rate_limited",
      retryAfterMs: 120_000,
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it.each([
    { success: true, result: {} },
    { success: false, result: null },
    { success: true, result: { ...result, queued: [23] } },
  ])("preserves uncertainty for malformed success %j", async (body) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(body)));
    expect((await sendRequest(email, account, "token")).kind).toBe("unknown");
  });

  it("does not retry or expose network exception text", async () => {
    const fetch = vi
      .fn()
      .mockRejectedValue(new Error("token and private content"));
    vi.stubGlobal("fetch", fetch);
    const outcome = await sendRequest(email, account, "token");
    expect(outcome.kind).toBe("unknown");
    expect(JSON.stringify(outcome)).not.toContain("private content");
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("aborts timed-out requests and records unknown", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url, init) =>
          new Promise((_resolve, reject) => {
            init.signal.addEventListener("abort", () =>
              reject(new Error("aborted")),
            );
          }),
      ),
    );
    const pending = sendRequest(email, account, "token");
    await vi.advanceTimersByTimeAsync(60_000);
    expect((await pending).kind).toBe("unknown");
  });

  it("checks configuration before making a request", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    expect((await sendRequest(email, "../other-account", "token")).kind).toBe(
      "failed",
    );
    expect((await sendRequest(email, account, "")).kind).toBe("failed");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("handles numeric and HTTP-date Retry-After headers", () => {
    const now = Date.UTC(2026, 8, 7);
    expect(retryAfterMs("1.5", now)).toBe(1500);
    expect(retryAfterMs(new Date(now + 90_000).toUTCString(), now)).toBe(
      90_000,
    );
    expect(retryAfterMs("garbage", now)).toBe(0);
    expect(retryAfterMs(null, now)).toBe(0);
  });
});
