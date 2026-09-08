import { defineApp } from "convex/server";
import cloudflareEmail from "convex-cloudflare-email/convex.config";
import rateLimiter from "@convex-dev/rate-limiter/convex.config";

const app = defineApp();
// Deliberately omit Cloudflare credentials. Every demo send is simulated.
app.use(cloudflareEmail);
app.use(rateLimiter);
export default app;
