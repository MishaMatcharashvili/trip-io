// Drives the road-report bot through its whole form against a real database,
// with no Telegram at all: `npm run smoke:telegram`.
//
// Nobody can talk to the bot until TELEGRAM_BOT_TOKEN exists, so its wiring —
// callback in, screen out, report stored, operator told, reporter told — would
// otherwise ship unrun. Here the bot is given its own identity instead of
// asking Telegram for one, every outgoing API call is captured instead of sent,
// and real updates are fed to the real handlers.
//
// Like smoke:road it writes on the Military Road, where publishing ends every
// open road event, so it refuses to run while one it did not write is live.

import { sql } from "drizzle-orm";
import type { Update } from "grammy/types";
import { db } from "../../src/dal/client.ts";
import { createBot } from "../../src/server/telegram/bot.ts";

const OPERATOR = 9_000_000_001;
const STRANGER = 9_000_000_002;
process.env.TELEGRAM_OPERATOR_IDS = String(OPERATOR);

let failures = 0;
const expect = (ok: boolean, what: string) => {
  console.log(`${ok ? "  ✔" : "  ✘"} ${what}`);
  if (!ok) failures++;
};

const live = await db.execute(sql`
  SELECT count(*)::int AS n FROM world_event
  WHERE source = 'road-report' AND payload->>'corridor' = 'military-road'
    AND (valid_to IS NULL OR valid_to > now())
`);
if ((live.rows[0].n as number) > 0) {
  console.error(
    "live road events on military-road; publishing would end them. Not running.",
  );
  process.exit(1);
}

type Call = { method: string; payload: Record<string, unknown> };
const calls: Call[] = [];

const bot = createBot("0:rehearsal", {
  id: 1,
  is_bot: true,
  first_name: "trip.io roads",
  username: "tripio_roads_bot",
  can_join_groups: false,
  can_read_all_group_messages: false,
  supports_inline_queries: false,
  can_connect_to_business: false,
  has_main_web_app: false,
} as never);

// Every call is captured and answered as Telegram would, minimally.
bot.api.config.use(async (_prev, method, payload) => {
  calls.push({ method, payload: payload as Record<string, unknown> });
  const p = payload as { chat_id?: number; text?: string };
  const message = {
    message_id: calls.length,
    date: 0,
    chat: { id: p.chat_id ?? 0, type: "private" },
    text: p.text,
  };
  return {
    ok: true,
    result: (method === "sendMessage" ? message : true) as never,
  };
});

let updateId = 0;
const person = (id: number) => ({
  id,
  is_bot: false,
  first_name: `User ${id}`,
});
const chat = (id: number, type: "private" | "group" = "private") => ({
  id,
  type,
  ...(type === "group"
    ? { title: "Hostel chat" }
    : { first_name: `User ${id}` }),
});

const command = (
  from: number,
  text: string,
  type: "private" | "group" = "private",
) =>
  bot.handleUpdate({
    update_id: ++updateId,
    message: {
      message_id: updateId,
      date: Math.floor(Date.now() / 1000),
      chat: chat(from, type),
      from: person(from),
      text,
      entities: [
        { type: "bot_command", offset: 0, length: text.split(" ")[0].length },
      ],
    },
  } as Update);

const tap = (from: number, data: string) =>
  bot.handleUpdate({
    update_id: ++updateId,
    callback_query: {
      id: String(updateId),
      from: person(from),
      chat_instance: "rehearsal",
      data,
      message: {
        message_id: 1,
        date: Math.floor(Date.now() / 1000),
        chat: chat(from),
        text: "",
      },
    },
  } as Update);

/** The buttons on the last screen sent or edited to this chat. */
const lastButtons = (): { text: string; callback_data: string }[] => {
  for (let i = calls.length - 1; i >= 0; i--) {
    const markup = calls[i].payload.reply_markup as
      | { inline_keyboard?: { text: string; callback_data: string }[][] }
      | undefined;
    if (markup?.inline_keyboard) return markup.inline_keyboard.flat();
  }
  return [];
};
const press = async (from: number, text: string) => {
  const button = lastButtons().find((b) => b.text.startsWith(text));
  if (!button) throw new Error(`no "${text}" button on the last screen`);
  await tap(from, button.callback_data);
};
const lastText = () =>
  String(
    [...calls].reverse().find((c) => typeof c.payload.text === "string")
      ?.payload.text,
  );

try {
  // ── A stranger reports a closure, one tap at a time.
  await command(STRANGER, "/report");
  await press(STRANGER, "Georgian Military Road");
  await press(STRANGER, "Closed");
  await press(STRANGER, "Avalanche");
  await press(STRANGER, "About 6 hours");
  expect(
    lastText().startsWith("Send this report?"),
    "the form ends on a summary to confirm",
  );
  await press(STRANGER, "Send");

  const sent = calls.filter((c) => c.method === "sendMessage");
  const toOperator = sent.find((c) => c.payload.chat_id === String(OPERATOR));
  expect(Boolean(toOperator), "the operator is sent the report with buttons");
  expect(
    calls.some(
      (c) =>
        c.method === "editMessageText" &&
        String(c.payload.text).startsWith("Thanks — sent to be checked"),
    ),
    "the stranger is told it is waiting",
  );

  // ── Someone who is not an operator taps approve.
  const approve = (
    toOperator?.payload.reply_markup as {
      inline_keyboard: { text: string; callback_data: string }[][];
    }
  ).inline_keyboard.flat()[0].callback_data;
  await tap(STRANGER, approve);
  expect(
    calls.at(-1)?.method === "answerCallbackQuery" &&
      String(calls.at(-1)?.payload.text).startsWith("Only operators"),
    "only an operator can approve",
  );

  // ── The operator approves.
  await tap(OPERATOR, approve);
  const report = (
    await db.execute(sql`
      SELECT status, event_id FROM road_report WHERE reporter_id = ${String(STRANGER)}
    `)
  ).rows[0];
  expect(
    report?.status === "published" && report.event_id !== null,
    "approved and published",
  );
  expect(
    calls.some(
      (c) =>
        c.method === "sendMessage" &&
        c.payload.chat_id === String(STRANGER) &&
        String(c.payload.text).startsWith("Your report is live"),
    ),
    "the reporter hears it is live",
  );

  await tap(OPERATOR, approve);
  expect(
    String(
      calls.findLast((c) => c.method === "answerCallbackQuery")?.payload.text,
    ) === "Already published.",
    "a second tap is told what already happened",
  );

  // ── The operator's own report is live at once, and the queue is empty.
  await command(OPERATOR, "/report");
  await press(OPERATOR, "Georgian Military Road");
  await press(OPERATOR, "Open again");
  await press(OPERATOR, "Send");
  expect(
    lastText().startsWith("Published."),
    "an operator's report publishes at once",
  );
  await command(OPERATOR, "/queue");
  expect(lastText() === "Nothing waiting.", "nothing left to review");

  // ── Nonsense, and group chats.
  await tap(STRANGER, "f:99:99");
  expect(
    String(
      calls.findLast((c) => c.method === "answerCallbackQuery")?.payload.text,
    ) === "That form has expired.",
    "a callback it did not write starts the form over",
  );
  await command(STRANGER, "/report", "group");
  expect(
    lastText() === "Message me directly to report a road.",
    "groups are sent to a private chat",
  );
} finally {
  const events = await db.execute(sql`
    SELECT event_id FROM road_report
    WHERE reporter_id IN (${String(OPERATOR)}, ${String(STRANGER)}) AND event_id IS NOT NULL
  `);
  await db.execute(sql`
    DELETE FROM road_report WHERE reporter_id IN (${String(OPERATOR)}, ${String(STRANGER)})
  `);
  for (const r of events.rows) {
    await db.execute(sql`
      DELETE FROM job WHERE kind = 'judge' AND payload->>'matchId' IN (
        SELECT id::text FROM event_match WHERE event_id = ${r.event_id as string})
    `);
    await db.execute(
      sql`DELETE FROM world_event WHERE id = ${r.event_id as string}`,
    );
  }
}

console.log(
  failures === 0 ? "\nall checks passed" : `\n${failures} check(s) failed`,
);
process.exitCode = failures === 0 ? 0 : 1;
