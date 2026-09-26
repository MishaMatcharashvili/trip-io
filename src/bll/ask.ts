import { liveMatchesFor } from "../dal/matches.ts";
import { placeCards } from "../dal/places.ts";
import { summariseHours } from "../domain/catalogue/opening-hours.ts";
import {
  type Asker,
  type AskPlace,
  askContext,
  readAnswer,
} from "../domain/trip/ask.ts";
import { placeIdsOf } from "../domain/trip/document.ts";
import { at, kindLabel } from "../domain/watch/briefing.ts";
import { askWithOpenAI } from "../infra/openai-ask.ts";
import { tripView } from "./trip-document.ts";

// A traveller's question about their trip, answered from the trip. Access is
// the caller's to check. Read-only: nothing here writes.

export type AskResult =
  | { ok: true; answer: string; grounded: boolean }
  | { ok: false; reason: "not-found" | "unavailable" };

const nowInTbilisi = (now: Date) =>
  new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Tbilisi",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(now);

export async function askAboutTrip(
  tripId: string,
  question: string,
  { ask = askWithOpenAI, now = new Date() }: { ask?: Asker; now?: Date } = {},
): Promise<AskResult> {
  const view = await tripView(tripId);
  if (!view) return { ok: false, reason: "not-found" };

  const [cards, matches] = await Promise.all([
    placeCards(placeIdsOf(view.doc)),
    liveMatchesFor(tripId, now),
  ]);
  const places = new Map<string, AskPlace>(
    [...cards].map(([id, p]) => [
      id,
      {
        name: p.name,
        category: p.category,
        hours: p.openingHours ? summariseHours(p.openingHours) : undefined,
      },
    ]),
  );
  const context = askContext(
    view.doc,
    places,
    matches.map((m) => ({
      nodeId: m.nodeId,
      what: `${kindLabel(m.kind)} ${m.kind.split(".")[1] ?? ""} from ${at(m.validFrom)}`,
    })),
  );

  try {
    const reply = readAnswer(
      await ask({ question, context, now: nowInTbilisi(now) }),
    );
    return reply
      ? { ok: true, ...reply }
      : { ok: false, reason: "unavailable" };
  } catch {
    return { ok: false, reason: "unavailable" };
  }
}
