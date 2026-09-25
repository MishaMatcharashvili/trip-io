// Points the road-report bot at this deployment: `npm run telegram:webhook`.
//
// Registers `${APP_URL}/api/telegram/webhook` with Telegram, with the secret
// Telegram will send back on every update, and sets the command menu. Run it
// once per deployment URL, and again whenever the secret changes. Reads
// TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET and APP_URL from .env — which
// must match what the deployment itself has, or every update is refused.

import { Api } from "grammy";

const need = (name: string) => {
  const value = process.env[name];
  if (!value) {
    console.error(`${name} is not set`);
    process.exit(1);
  }
  return value;
};

const api = new Api(need("TELEGRAM_BOT_TOKEN"));
const url = `${need("APP_URL").replace(/\/$/, "")}/api/telegram/webhook`;

if (!url.startsWith("https://")) {
  console.error(`Telegram only delivers to https; APP_URL gives ${url}`);
  process.exit(1);
}

await api.setWebhook(url, {
  secret_token: need("TELEGRAM_WEBHOOK_SECRET"),
  // The form is buttons and three commands; nothing else is read.
  allowed_updates: ["message", "callback_query"],
  drop_pending_updates: true,
});
await api.setMyCommands([
  { command: "report", description: "Report a road" },
  { command: "help", description: "What this bot does" },
]);

const me = await api.getMe();
const info = await api.getWebhookInfo();
console.log(`@${me.username} → ${info.url}`);
if (info.last_error_message) {
  console.log(`last delivery error: ${info.last_error_message}`);
}
