import { v } from "convex/values";
import { internalAction, env } from "./_generated/server.js";
import { internal } from "./_generated/api.js";
import { sendRequest } from "./transport.js";

export const send = internalAction({
  args: { id: v.id("emails"), generation: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const claimed = await ctx.runMutation(internal.lib.claim, args);
    if (!claimed) return null;
    const outcome = claimed.testMode
      ? { kind: "test" as const }
      : await sendRequest(
          claimed.email,
          env.CLOUDFLARE_ACCOUNT_ID ?? "",
          env.CLOUDFLARE_API_TOKEN ?? "",
        );
    await ctx.runMutation(internal.lib.finish, {
      ...args,
      attempt: claimed.attempt,
      outcome,
    });
    return null;
  },
});
