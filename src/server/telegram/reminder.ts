import { Bot } from "grammy";
import { operatorIds } from "./bot.ts";

// Detector #6's clock: a message to every operator on Monday morning asking
// them to look at the railway's notices. The check is theirs, since there is
// nothing to poll; this only makes sure the week does not go by unremarked.

export const REMINDER = `Monday rail check: have a look at Georgian Railway's notices (railway.ge) for the week.

If a line is cancelled or running late, /rail to tell travellers. If it is all normal, there is nothing to send.`;

export type ReminderReport = {
  reminded: number;
  failed: number;
  /** Why nothing was sent, when nothing was. */
  skipped?: "no-bot-token" | "no-operators";
};

/** `send` is injectable so the rehearsal needs no bot. */
export async function remindOperators(
  send?: (operator: string, text: string) => Promise<void>,
): Promise<ReminderReport> {
  const operators = [...operatorIds()];
  if (operators.length === 0)
    return { reminded: 0, failed: 0, skipped: "no-operators" };

  let transport = send;
  if (!transport) {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) return { reminded: 0, failed: 0, skipped: "no-bot-token" };
    const bot = new Bot(token);
    transport = async (operator, text) => {
      await bot.api.sendMessage(operator, text);
    };
  }

  let reminded = 0;
  let failed = 0;
  for (const operator of operators) {
    try {
      await transport(operator, REMINDER);
      reminded++;
    } catch {
      // An operator who never opened a chat with the bot cannot be messaged.
      failed++;
    }
  }
  return { reminded, failed };
}
