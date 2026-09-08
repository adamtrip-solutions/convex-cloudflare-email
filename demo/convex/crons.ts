import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";
const crons = cronJobs();
crons.interval(
  "Remove expired demo data",
  { minutes: 10 },
  internal.demo.cleanup,
  {},
);
export default crons;
