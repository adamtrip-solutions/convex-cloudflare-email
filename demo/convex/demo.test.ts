import { convexTest } from "convex-test";
import { register as registerEmail } from "convex-cloudflare-email/test";
import rateLimiter from "@convex-dev/rate-limiter/test";
import { RateLimiter, MINUTE } from "@convex-dev/rate-limiter";
import type { SessionId } from "convex-helpers/server/sessions";
import { beforeEach, afterEach, it, expect, vi } from "vitest";
import schema from "./schema";
import { api, internal, components } from "./_generated/api";
const modules = import.meta.glob("./**/*.ts");
const sessionId = "11111111-1111-4111-8111-111111111111" as SessionId;
const otherSession = "22222222-2222-4222-8222-222222222222" as SessionId;
const requestKey = "33333333-3333-4333-8333-333333333333";
function setup() {
  const t = convexTest({ schema, modules, transactionLimits: true });
  registerEmail(t);
  rateLimiter.register(t);
  return t;
}
beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
it("runs the published component in test mode without contacting Cloudflare", async () => {
  const t = setup();
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  const first = await t.mutation(api.demo.send, { sessionId, requestKey });
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  const history = await t.query(api.demo.history, { sessionId });
  expect(history).toHaveLength(1);
  expect(history[0]).toMatchObject({
    emailId: first.emailId,
    submissions: 1,
    status: { status: "test", attempts: 1 },
  });
  expect(fetch).not.toHaveBeenCalled();
});
it("repeats through the component but keeps a single ID and request record", async () => {
  const t = setup();
  const first = await t.mutation(api.demo.send, { sessionId, requestKey });
  const repeat = await t.mutation(api.demo.send, { sessionId, requestKey });
  expect(repeat).toEqual({
    emailId: first.emailId,
    submissions: 2,
    duplicate: true,
  });
  expect(await t.query(api.demo.history, { sessionId })).toHaveLength(1);
});
it("isolates sessions even when they reuse the same request key", async () => {
  const t = setup();
  const first = await t.mutation(api.demo.send, { sessionId, requestKey });
  expect(await t.query(api.demo.history, { sessionId: otherSession })).toEqual(
    [],
  );
  const second = await t.mutation(api.demo.send, {
    sessionId: otherSession,
    requestKey,
  });
  expect(second.emailId).not.toBe(first.emailId);
  const visible = await t.query(api.demo.history, { sessionId: otherSession });
  expect(visible).toHaveLength(1);
  expect(visible[0]?.emailId).toBe(second.emailId);
  expect(visible[0]).not.toHaveProperty("sessionId");
});
it("bounds per-session writes and rolls back rejected submissions", async () => {
  const t = setup();
  for (let i = 0; i < 20; i++)
    await t.mutation(api.demo.send, { sessionId, requestKey });
  await expect(
    t.mutation(api.demo.send, { sessionId, requestKey }),
  ).rejects.toThrow();
  expect((await t.query(api.demo.history, { sessionId }))[0]?.submissions).toBe(
    20,
  );
});
it("the shared daily cap cannot be bypassed by choosing a fresh session", async () => {
  const t = setup();
  const limiter = new RateLimiter(components.rateLimiter, {
    global: {
      kind: "fixed window",
      rate: 500,
      period: 24 * 60 * MINUTE,
      start: 0,
    },
  });
  await t.mutation(async (ctx) => {
    await limiter.limit(ctx, "global", { count: 500, throws: true });
  });
  await expect(
    t.mutation(api.demo.send, { sessionId: otherSession, requestKey }),
  ).rejects.toThrow();
  expect(await t.query(api.demo.history, { sessionId: otherSession })).toEqual(
    [],
  );
});
it("rejects malformed identifiers and extra email fields", async () => {
  const t = setup();
  await expect(
    t.mutation(api.demo.send, { sessionId, requestKey: "x".repeat(1000) }),
  ).rejects.toThrow("Invalid demo");
  await expect(
    t.mutation(api.demo.send, { sessionId: "short" as SessionId, requestKey }),
  ).rejects.toThrow("Invalid demo");
  // Runtime validation must reject attempts to override the fixed recipient or test mode.
  await expect(
    t.mutation(api.demo.send, {
      sessionId,
      requestKey,
      to: "external@example.com",
      testMode: false,
    } as never),
  ).rejects.toThrow();
});
it("cleanup removes expired records but preserves fresh records", async () => {
  const t = setup();
  await t.mutation(api.demo.send, { sessionId, requestKey });
  vi.setSystemTime(Date.now() + 25 * 60 * MINUTE);
  await t.mutation(api.demo.send, { sessionId: otherSession, requestKey });
  await t.mutation(internal.demo.cleanup, {});
  expect(await t.query(api.demo.history, { sessionId })).toEqual([]);
  expect(
    await t.query(api.demo.history, { sessionId: otherSession }),
  ).toHaveLength(1);
});
