import { convexTest } from "convex-test";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { components } from "../../example/convex/_generated/api.js";
import { CloudflareEmail, type EmailId } from "./index.js";
import { register } from "../test.js";
import schema from "../../example/convex/schema.js";

const modules = import.meta.glob("../../example/convex/**/*.ts");
const message = {
  from: "sender@example.com",
  to: "recipient@example.net",
  subject: "Welcome",
  text: "Hello",
};
beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it("exercises the server wrapper across a real component boundary", async () => {
  const t = convexTest(schema, modules);
  register(t);
  const email = new CloudflareEmail(components.cloudflareEmail);
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  const id = await t.mutation((ctx) => email.sendEmail(ctx, message));
  expect(await t.query((ctx) => email.getStatus(ctx, id))).toMatchObject({
    id,
    status: "pending",
  });
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  expect(await t.query((ctx) => email.getStatus(ctx, id))).toMatchObject({
    id,
    status: "test",
  });
  expect(await t.mutation((ctx) => email.cancelEmail(ctx, id))).toBe(false);
  expect(fetch).not.toHaveBeenCalled();
});

it("rolls back child-component enqueue when the parent transaction fails", async () => {
  const t = convexTest(schema, modules);
  register(t);
  const email = new CloudflareEmail(components.cloudflareEmail);
  let id: EmailId | undefined;
  await expect(
    t.mutation(async (ctx) => {
      id = await email.sendEmail(ctx, message);
      throw new Error("parent failure");
    }),
  ).rejects.toThrow("parent failure");
  expect(await t.query((ctx) => email.getStatus(ctx, id!))).toBeNull();
});
