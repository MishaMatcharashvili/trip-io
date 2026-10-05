import { Bot, InlineKeyboard } from "grammy";
import { announced, proposalsToAnnounce } from "../../bll/road-proposals.ts";
import { operatorIds } from "./bot.ts";
import { moderationButtons } from "./form.ts";

// Tells the operators what the model proposed from the Roads Department's
// notices, with the same approve and reject buttons a person's report gets.
// Each proposal is sent once (`road_report.notified_at`).

export type Send = (
  operator: string,
  text: string,
  buttons: { text: string; data: string }[][],
) => Promise<void>;

export type AnnounceReport = {
  proposals: number;
  sent: number;
  skipped?: "no-bot-token" | "no-operators" | "nothing-new";
};

export async function announceProposals(send?: Send): Promise<AnnounceReport> {
  const operators = [...operatorIds()];
  if (operators.length === 0) {
    return { proposals: 0, sent: 0, skipped: "no-operators" };
  }
  const waiting = await proposalsToAnnounce();
  if (waiting.length === 0) {
    return { proposals: 0, sent: 0, skipped: "nothing-new" };
  }

  let transport = send;
  if (!transport) {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    // Left unmarked: they are announced the first time there is a bot to do it.
    if (!token) {
      return { proposals: waiting.length, sent: 0, skipped: "no-bot-token" };
    }
    const bot = new Bot(token);
    transport = async (operator, text, buttons) => {
      await bot.api.sendMessage(operator, text, {
        reply_markup: InlineKeyboard.from(
          buttons.map((row) =>
            row.map((b) => InlineKeyboard.text(b.text, b.data)),
          ),
        ),
      });
    };
  }

  let sent = 0;
  for (const proposal of waiting) {
    let reached = 0;
    for (const operator of operators) {
      try {
        await transport(
          operator,
          `From the Roads Department's notices (read by a model — check it):\n\n${proposal.description}`,
          moderationButtons(proposal.id),
        );
        reached++;
      } catch {
        // An operator who never opened a chat with the bot cannot be messaged;
        // the proposal still waits in /queue.
      }
    }
    // Marked once anyone has it: the others find it in /queue.
    if (reached > 0) {
      await announced([proposal.id]);
      sent++;
    }
  }
  return { proposals: waiting.length, sent };
}
