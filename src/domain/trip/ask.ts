import { z } from "zod";
import { dayKey, sortedNodes, type TripDoc } from "./document.ts";

// "Ask about your trip." The traveller's question is answered from the trip
// itself — the stops, the places, what the watch has matched — and nothing
// else. It is read-only: an answer can suggest a change, never make one; the
// day editor and the alert card are where plans change.

export const ASK_MAX_CHARS = 300;

export const askAnswer = z.object({
  answer: z.string().min(1).max(900),
  /** False when the trip did not hold what the question needed. */
  grounded: z.boolean(),
});
export type AskAnswer = z.infer<typeof askAnswer>;

export type AskInput = {
  question: string;
  /** The trip as the model may know it, from `askContext`. */
  context: string;
  /** YYYY-MM-DD HH:MM in Tbilisi: "today" and "now" mean something. */
  now: string;
};

/** The port the model call implements (src/infra/openai-ask.ts). */
export type Asker = (input: AskInput) => Promise<unknown>;

export type AskPlace = { name: string; category: string; hours?: string };
export type AskMatch = { nodeId: string; what: string };

const clock = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Tbilisi",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/**
 * The trip as plain lines: one per day, one per stop, with the place's kind
 * and hours and anything the watch matched to it. No ids, no coordinates:
 * nothing the answer could leak or be tempted to cite as a source.
 */
export function askContext(
  doc: TripDoc,
  places: ReadonlyMap<string, AskPlace>,
  matches: readonly AskMatch[],
): string {
  const lines = [
    `Trip: ${doc.trip.title}, pace ${doc.trip.pace}, budget ${doc.trip.budget || "not set"}.`,
  ];
  let day = "";
  for (const { id, node } of sortedNodes(doc.nodes)) {
    const date = dayKey(node.startsAt);
    if (date !== day) {
      day = date;
      lines.push(`Day ${date}:`);
    }
    const place = node.placeId ? places.get(node.placeId) : undefined;
    const facts = [
      `${node.durationMin} min`,
      node.kind,
      place?.category.replace(/_/g, " "),
      node.indoor ? "indoors" : "outdoors",
      place?.hours ? `hours ${place.hours}` : undefined,
    ].filter(Boolean);
    const watch = matches
      .filter((m) => m.nodeId === id)
      .map((m) => ` [watch: ${m.what}]`)
      .join("");
    lines.push(
      `- ${clock.format(new Date(node.startsAt))} ${node.meta.title} (${facts.join(", ")})${watch}`,
    );
  }
  return lines.join("\n");
}

/** A model's reply, held to the schema, or null. */
export function readAnswer(raw: unknown): AskAnswer | null {
  const parsed = askAnswer.safeParse(raw);
  return parsed.success ? parsed.data : null;
}
