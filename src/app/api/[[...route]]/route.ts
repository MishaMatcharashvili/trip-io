import { handle } from "hono/vercel";
import app from "@/server/app";

// Trip generation runs the model inline and can take a minute or two; the
// default ceiling would cut it off. Needs Vercel Pro, which the architecture
// already depends on for cron.
export const maxDuration = 300;

export const GET = handle(app);
export const POST = handle(app);
export const PUT = handle(app);
export const PATCH = handle(app);
export const DELETE = handle(app);
