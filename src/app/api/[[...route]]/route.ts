import { handle } from "hono/vercel";
import app from "@/server/app";

// Trip generation runs the model inline and can take a minute or two; the
// default ceiling would cut it off. 300s is also Hobby's ceiling, so this needs
// no plan upgrade.
export const maxDuration = 300;

export const GET = handle(app);
export const POST = handle(app);
export const PUT = handle(app);
export const PATCH = handle(app);
export const DELETE = handle(app);
