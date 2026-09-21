import { createMiddleware } from "hono/factory";

// Cron routes are public URLs. Vercel Cron authenticates itself with a bearer
// token, and without this check anyone who guesses `/api/cron/drain` can make
// the system spend money on model calls.
//
// The comparison is length-safe rather than `===`: a secret compared with an
// early-exit string compare leaks its length and, over enough requests, its
// prefix.

const equal = (a: string, b: string) => {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
};

export const requireCronSecret = createMiddleware(async (c, next) => {
  const secret = process.env.CRON_SECRET;
  // Refusing rather than waving it through: an unset secret in production is
  // the configuration mistake this guard exists to survive.
  if (!secret) return c.json({ error: "CRON_SECRET is not set" }, 503);

  const header = c.req.header("authorization") ?? "";
  if (!equal(header, `Bearer ${secret}`)) {
    return c.json({ error: "unauthenticated" }, 401);
  }
  await next();
});
