import { defineApp } from "convex/server";
import { v } from "convex/values";
import cloudflareEmail from "../../src/component/convex.config.js";

const app = defineApp({
  env: {
    CLOUDFLARE_ACCOUNT_ID: v.optional(v.string()),
    CLOUDFLARE_API_TOKEN: v.optional(v.string()),
  },
});
app.use(cloudflareEmail, {
  env: {
    CLOUDFLARE_ACCOUNT_ID: app.env.CLOUDFLARE_ACCOUNT_ID,
    CLOUDFLARE_API_TOKEN: app.env.CLOUDFLARE_API_TOKEN,
  },
});
export default app;
