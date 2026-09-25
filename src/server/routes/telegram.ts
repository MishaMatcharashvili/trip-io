import { type Bot, webhookCallback } from "grammy";
import { Hono } from "hono";
import { createBot } from "../telegram/bot.ts";

// `POST /api/telegram/webhook` — where Telegram delivers the road-report bot's
// updates (context/architecture.md's cron topology lists it beside the crons).
//
// A public URL, so it is authenticated like the cron routes are: Telegram sends
// the secret registered with `setWebhook` in `X-Telegram-Bot-Api-Secret-Token`,
// and grammY refuses anything without it. Unset, the route refuses rather than
// running open — an unset secret in production is the mistake the check exists
// to survive. `npm run telegram:webhook` registers both.

let bot: Bot | undefined;

export const telegram = new Hono().post("/webhook", async (c) => {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!token || !secret) {
    return c.json(
      { error: "TELEGRAM_BOT_TOKEN or TELEGRAM_WEBHOOK_SECRET is not set" },
      503,
    );
  }

  bot ??= createBot(token);
  // Generous: a published report runs the matcher before replying, and a cold
  // Neon connection is slow. Past this grammY fails the request and Telegram
  // redelivers the update, which the form tolerates — every step is an edit.
  return webhookCallback(bot, "hono", {
    secretToken: secret,
    timeoutMilliseconds: 25_000,
  })(c);
});
