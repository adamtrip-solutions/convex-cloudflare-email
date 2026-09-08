import { defineComponent } from "convex/server";
import { v } from "convex/values";
import workpool from "@convex-dev/workpool/convex.config";

const component = defineComponent("cloudflareEmail", {
  env: {
    CLOUDFLARE_ACCOUNT_ID: v.optional(v.string()),
    CLOUDFLARE_API_TOKEN: v.optional(v.string()),
  },
});
component.use(workpool);
export default component;
