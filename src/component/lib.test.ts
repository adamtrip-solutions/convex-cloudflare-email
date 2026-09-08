import { convexTest } from "convex-test";
import workpool from "@convex-dev/workpool/test";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import schema from "./schema.js";
import { api, internal } from "./_generated/api.js";
import type { Email, SendConfig } from "../validators.js";
import type { WorkId } from "@convex-dev/workpool";

const modules = import.meta.glob("./**/*.ts");
const email: Email = {
  from: "from@example.com",
  to: "to@example.net",
  subject: "Hello",
  text: "Hello",
};
const config: SendConfig = {
  testMode: true,
  maxAttempts: 3,
  initialBackoffMs: 30_000,
};
function setup() {
  const t = convexTest({ schema, modules, transactionLimits: true });
  workpool.register(t);
  return t;
}
beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

it("deduplicates enqueues but rejects key reuse with another payload or mode", async () => {
  const t = setup();
  const args = { email, config, idempotencyKey: "welcome:user-1" };
  const id = await t.mutation(api.lib.enqueue, args);
  expect(await t.mutation(api.lib.enqueue, args)).toBe(id);
  await expect(
    t.mutation(api.lib.enqueue, {
      ...args,
      email: { ...email, subject: "other" },
    }),
  ).rejects.toThrow("different email");
  await expect(
    t.mutation(api.lib.enqueue, {
      ...args,
      config: { ...config, testMode: false },
    }),
  ).rejects.toThrow("different email");
  expect(await t.run((ctx) => ctx.db.query("emails").take(10))).toHaveLength(1);
});

it("rolls back an enqueue when the caller's mutation fails", async () => {
  const t = setup();
  await expect(
    t.mutation(async (ctx) => {
      await ctx.runMutation(api.lib.enqueue, { email, config });
      throw new Error("business mutation failed");
    }),
  ).rejects.toThrow("business mutation failed");
  expect(await t.run((ctx) => ctx.db.query("emails").take(10))).toHaveLength(0);
});

it("claims each generation once and refuses cancellation after claim", async () => {
  const t = setup();
  const id = await t.mutation(api.lib.enqueue, { email, config });
  expect(
    await t.mutation(internal.lib.claim, { id, generation: 0 }),
  ).toMatchObject({ attempt: 1 });
  expect(
    await t.mutation(internal.lib.claim, { id, generation: 0 }),
  ).toBeNull();
  expect(await t.mutation(api.lib.cancel, { id })).toBe(false);
});

it("cancels before claim and makes the queued action a no-op", async () => {
  const t = setup();
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  const id = await t.mutation(api.lib.enqueue, { email, config });
  expect(await t.mutation(api.lib.cancel, { id })).toBe(true);
  await t.action(internal.send.send, { id, generation: 0 });
  expect((await t.query(api.lib.getStatus, { id }))?.status).toBe("canceled");
  expect(fetch).not.toHaveBeenCalled();
});

it("records test sends without credentials or network access", async () => {
  const t = setup();
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  const id = await t.mutation(api.lib.enqueue, { email, config });
  await t.action(internal.send.send, { id, generation: 0 });
  expect(await t.query(api.lib.getStatus, { id })).toMatchObject({
    status: "test",
    attempts: 1,
  });
  expect(fetch).not.toHaveBeenCalled();
});

it("runs the real nested workpool to completion", async () => {
  const t = setup();
  const id = await t.mutation(api.lib.enqueue, { email, config });
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  expect(await t.query(api.lib.getStatus, { id })).toMatchObject({
    status: "test",
    attempts: 1,
  });
});

it("stores mixed recipient results without repeating accepted sends", async () => {
  const t = setup();
  vi.stubEnv("CLOUDFLARE_ACCOUNT_ID", "a".repeat(32));
  vi.stubEnv("CLOUDFLARE_API_TOKEN", "private-token");
  const fetch = vi.fn().mockResolvedValue(
    Response.json({
      success: true,
      result: {
        delivered: ["to@example.net"],
        queued: ["later@example.net"],
        permanent_bounces: ["bad@example.net"],
        message_id: "cf-123",
      },
    }),
  );
  vi.stubGlobal("fetch", fetch);
  const id = await t.mutation(api.lib.enqueue, {
    email,
    config: { ...config, testMode: false },
  });
  await t.action(internal.send.send, { id, generation: 0 });
  await t.action(internal.send.send, { id, generation: 0 });
  const status = await t.query(api.lib.getStatus, { id });
  expect(status).toMatchObject({
    status: "sent",
    result: {
      messageId: "cf-123",
      queued: ["later@example.net"],
      permanentBounces: ["bad@example.net"],
    },
  });
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(JSON.stringify(await t.run((ctx) => ctx.db.get(id)))).not.toContain(
    "private-token",
  );
});

it("bounds rate-limit retries, respects Retry-After, and ignores stale callbacks", async () => {
  const t = setup();
  const id = await t.mutation(api.lib.enqueue, { email, config });
  const old = (await t.run((ctx) => ctx.db.get(id)))!;
  for (let i = 0; i < 3; i++) {
    await t.mutation(internal.lib.claim, { id, generation: i });
    await t.mutation(internal.lib.finish, {
      id,
      generation: i,
      attempt: i + 1,
      outcome: {
        kind: "rate_limited",
        error: { kind: "rate_limited", message: "Throttled" },
        retryAfterMs: 120_000,
      },
    });
    if (i === 0) {
      expect((await t.query(api.lib.getStatus, { id }))?.nextAttemptAt).toBe(
        Date.now() + 120_000,
      );
      await t.mutation(internal.lib.onComplete, {
        workId: old.workId as WorkId,
        context: { id, generation: 0 },
        result: { kind: "failed", error: "old job" },
      });
      expect((await t.query(api.lib.getStatus, { id }))?.status).toBe(
        "pending",
      );
      expect(
        await t.mutation(internal.lib.claim, { id, generation: 0 }),
      ).toBeNull();
    }
  }
  expect(await t.query(api.lib.getStatus, { id })).toMatchObject({
    status: "failed",
    attempts: 3,
  });
});

it("does not shorten Retry-After longer than its scheduling limit", async () => {
  const t = setup();
  const id = await t.mutation(api.lib.enqueue, { email, config });
  await t.mutation(internal.lib.claim, { id, generation: 0 });
  await t.mutation(internal.lib.finish, {
    id,
    generation: 0,
    attempt: 1,
    outcome: {
      kind: "rate_limited",
      error: { kind: "rate_limited", message: "Throttled" },
      retryAfterMs: 2 * 86_400_000,
    },
  });
  expect((await t.query(api.lib.getStatus, { id }))?.status).toBe("failed");
});

it("requires acknowledgement before resending unknown work and rejects a stale finish", async () => {
  const t = setup();
  const id = await t.mutation(api.lib.enqueue, { email, config });
  await t.mutation(internal.lib.claim, { id, generation: 0 });
  await t.mutation(internal.lib.expire, { id, generation: 0, attempt: 1 });
  expect((await t.query(api.lib.getStatus, { id }))?.status).toBe("unknown");
  await expect(t.mutation(api.lib.retry, { id })).rejects.toThrow(
    "may deliver a duplicate",
  );
  await t.mutation(api.lib.retry, { id, acknowledgeDuplicateRisk: true });
  await t.mutation(internal.lib.finish, {
    id,
    generation: 0,
    attempt: 1,
    outcome: { kind: "test" },
  });
  expect(await t.query(api.lib.getStatus, { id })).toMatchObject({
    status: "pending",
    attempts: 0,
  });
  await t.action(internal.send.send, { id, generation: 1 });
  expect((await t.query(api.lib.getStatus, { id }))?.status).toBe("test");
});

it("records a crashed send as unknown but a pre-claim crash as failed", async () => {
  const t = setup();
  for (const claim of [true, false]) {
    const id = await t.mutation(api.lib.enqueue, { email, config });
    const row = (await t.run((ctx) => ctx.db.get(id)))!;
    if (claim) await t.mutation(internal.lib.claim, { id, generation: 0 });
    await t.mutation(internal.lib.onComplete, {
      workId: row.workId as WorkId,
      context: { id, generation: 0 },
      result: { kind: "failed", error: "private-token" },
    });
    const status = await t.query(api.lib.getStatus, { id });
    expect(status?.status).toBe(claim ? "unknown" : "failed");
    expect(JSON.stringify(status)).not.toContain("private-token");
  }
});

it("cleans bounded terminal records even when older unknown outcomes remain", async () => {
  const t = setup();
  const completedAt = Date.now() - 8 * 86_400_000;
  await t.run(async (ctx) => {
    for (let i = 0; i < 25; i++)
      await ctx.db.insert("emails", {
        email,
        config,
        status: "unknown",
        generation: 0,
        attempts: 1,
        updatedAt: completedAt,
        completedAt,
      });
    for (let i = 0; i < 25; i++)
      await ctx.db.insert("emails", {
        email,
        config,
        status: "test",
        generation: 0,
        attempts: 1,
        updatedAt: completedAt + 1,
        completedAt: completedAt + 1,
      });
  });
  expect(
    await t.mutation(api.lib.cleanup, { olderThanMs: 7 * 86_400_000 }),
  ).toBe(20);
  expect(
    await t.mutation(api.lib.cleanup, { olderThanMs: 7 * 86_400_000 }),
  ).toBe(5);
  expect(
    await t.mutation(api.lib.cleanup, { olderThanMs: 7 * 86_400_000 }),
  ).toBe(0);
  expect(await t.run((ctx) => ctx.db.query("emails").take(50))).toHaveLength(
    25,
  );
});

it.each([
  { ...email, to: [] },
  { ...email, text: "", html: " " },
  { ...email, to: Array(51).fill("to@example.net") },
  { ...email, subject: "header\r\ninjection" },
  { ...email, text: "x".repeat(512 * 1024) },
])("rejects invalid email before inserting or scheduling", async (email) => {
  const t = setup();
  await expect(
    t.mutation(api.lib.enqueue, { email, config }),
  ).rejects.toThrow();
  expect(await t.run((ctx) => ctx.db.query("emails").take(10))).toHaveLength(0);
});
