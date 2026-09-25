import { Bot, type BotConfig, type Context, InlineKeyboard } from "grammy";
import {
  moderateReport,
  reviewQueue,
  submitRoadReport,
} from "../../bll/road-report.ts";
import type { ReportTrust } from "../../domain/watch/road.ts";
import {
  type Button,
  decode,
  moderationButtons,
  screen,
  summary,
  toInput,
} from "./form.ts";

// The road-report bot: detector #2's front door, a form in Telegram against
// the 12 corridors. Anyone may report; operators — `TELEGRAM_OPERATOR_IDS` —
// are published at once and get everyone else's reports to approve or reject.
//
// Wiring only. The form is ./form.ts, the rules are src/domain/watch/road.ts,
// and what happens to a report is src/bll/road-report.ts.

const keyboard = (buttons: Button[][]) =>
  InlineKeyboard.from(
    buttons.map((row) => row.map((b) => InlineKeyboard.text(b.text, b.data))),
  );

/** Telegram user ids allowed to publish without review, and to review. */
export const operatorIds = (): ReadonlySet<string> =>
  new Set(
    (process.env.TELEGRAM_OPERATOR_IDS ?? "")
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean),
  );

const trustOf = (ctx: Context): ReportTrust =>
  ctx.from && operatorIds().has(String(ctx.from.id)) ? "operator" : "community";

const nameOf = (ctx: Context) =>
  [ctx.from?.first_name, ctx.from?.last_name].filter(Boolean).join(" ") ||
  ctx.from?.username ||
  "Someone";

const INTRO = `This bot takes road reports for travellers in Georgia.

If a main road is closed, down to one lane, slow, or has something on it — or has just opened again — /report it. Travellers whose drive uses that road hear about it.

Reports from people we don't know yet are checked before anyone sees them.`;

const OPERATOR_NOTE = `

You're an operator: your reports go out straight away, and you get everyone else's to approve. /queue shows what's waiting.`;

export function createBot(
  token: string,
  /** Given, it skips `getMe`: the rehearsal runs with no real bot at all. */
  botInfo?: BotConfig<Context>["botInfo"],
): Bot {
  const bot = new Bot(token, { botInfo });

  // Private chats only. A report's outcome is sent back to the chat it came
  // from, and in a group that would be everyone's business.
  bot.use(async (ctx, next) => {
    if (ctx.chat && ctx.chat.type !== "private") {
      if (ctx.message) await ctx.reply("Message me directly to report a road.");
      return;
    }
    await next();
  });

  bot.command(["start", "help"], (ctx) =>
    ctx.reply(INTRO + (trustOf(ctx) === "operator" ? OPERATOR_NOTE : "")),
  );

  bot.command("report", (ctx) => {
    const first = screen({});
    return ctx.reply(first.text, { reply_markup: keyboard(first.buttons) });
  });

  bot.command("queue", async (ctx) => {
    if (trustOf(ctx) !== "operator")
      return ctx.reply("Only operators can see the queue.");
    const waiting = await reviewQueue();
    if (waiting.length === 0) return ctx.reply("Nothing waiting.");
    for (const report of waiting) {
      await ctx.reply(`From ${report.reporterName}:\n${report.description}`, {
        reply_markup: keyboard(moderationButtons(report.id)),
      });
    }
  });

  bot.on("callback_query:data", async (ctx) => {
    const callback = decode(ctx.callbackQuery.data);

    if (!callback) {
      // Not ours, or from a form older than this deploy: start again rather
      // than guess what it meant.
      await ctx.answerCallbackQuery({ text: "That form has expired." });
      const first = screen({});
      return ctx.editMessageText(first.text, {
        reply_markup: keyboard(first.buttons),
      });
    }

    switch (callback.type) {
      case "cancel":
        await ctx.answerCallbackQuery();
        return ctx.editMessageText("Cancelled. /report to start again.");

      case "form": {
        await ctx.answerCallbackQuery();
        const next = screen(callback.state);
        return ctx.editMessageText(next.text, {
          reply_markup: keyboard(next.buttons),
        });
      }

      case "send": {
        const input = toInput(callback.state);
        if (!input || !ctx.from || !ctx.chat) {
          return ctx.answerCallbackQuery({ text: "That form has expired." });
        }
        const trust = trustOf(ctx);
        const result = await submitRoadReport(
          input,
          {
            id: String(ctx.from.id),
            name: nameOf(ctx),
            chatId: String(ctx.chat.id),
          },
          trust,
        );
        await ctx.answerCallbackQuery();

        if (!result.ok) {
          return ctx.editMessageText(
            result.reason === "too-many-pending"
              ? "You already have reports waiting to be checked. Once they're through, send more."
              : "That report couldn't be taken. /report to try again.",
          );
        }
        if (result.status !== "pending") {
          return ctx.editMessageText(
            `Published.\n\n${summary(input)}\n\nTravellers driving this road will be told.`,
          );
        }

        await ctx.editMessageText(
          `Thanks — sent to be checked.\n\n${summary(input)}\n\nYou'll hear back here once it has been.`,
        );
        // Every operator gets it. The first to answer decides; a stale button
        // on someone else's phone is answered with what already happened.
        for (const operator of operatorIds()) {
          await ctx.api
            .sendMessage(
              operator,
              `Road report from ${nameOf(ctx)}:\n\n${summary(input)}`,
              {
                reply_markup: keyboard(moderationButtons(result.reportId)),
              },
            )
            .catch(() => {
              // An operator who never opened a chat with the bot cannot be
              // messaged. The report still waits in /queue.
            });
        }
        return;
      }

      case "moderate": {
        if (trustOf(ctx) !== "operator" || !ctx.from) {
          return ctx.answerCallbackQuery({
            text: "Only operators can do that.",
          });
        }
        const result = await moderateReport(
          callback.reportId,
          String(ctx.from.id),
          callback.decision,
        );
        if (!result.ok) {
          await ctx.answerCallbackQuery({
            text:
              result.reason === "already-decided"
                ? `Already ${result.status}.`
                : "That report is gone.",
          });
          return ctx.editMessageReplyMarkup();
        }

        await ctx.answerCallbackQuery();
        const verdict =
          result.status === "published"
            ? "Approved and published"
            : result.status === "expired"
              ? "Approved, but its window had already closed — not published"
              : "Rejected";
        await ctx.editMessageText(
          `${verdict} by ${nameOf(ctx)}:\n${result.description}`,
        );

        // Tell the reporter, in the chat they reported from.
        await ctx.api
          .sendMessage(
            result.report.chatId,
            result.status === "published"
              ? `Your report is live — thank you.\n${result.description}`
              : result.status === "expired"
                ? `Your report was checked after the time it covered had passed, so it wasn't sent out.\n${result.description}`
                : `Your report wasn't sent out this time.\n${result.description}`,
          )
          .catch(() => {});
        return;
      }
    }
  });

  return bot;
}
