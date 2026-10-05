import type { ExtractionInput } from "./extraction.ts";

// The gate between a translated item and a model call. Most of what the news
// feeds carry is politics, and a model call spent saying "no events here" is
// still a call. This is deliberately generous — it exists to remove the
// obviously irrelevant, not to decide anything: a false pass costs one cheap
// call and a false stop costs a missed event, so the words err toward passing.

const EVENTS =
  /\b(festival|fest|fair|parade|march|concert|marathon|race|rally|exhibition|celebration|celebrations|holiday|ceremony|tbilisoba|rtveli|harvest|opening|premiere|tournament|championship|closed|closure|close|cordon|blocked|detour|rerouted|re-routed|suspended|cancel|cancelled|canceled|postponed|will be held|takes place|to be held|from \d{1,2}|on (monday|tuesday|wednesday|thursday|friday|saturday|sunday))\b/i;

const SAFETY =
  /\b(protest|protests|protesters|demonstration|demonstrators|rally|march|strike|blockade|clashes|unrest|riot|advisory|warning|evacuat\w*|curfew|detain\w*|police|state of emergency)\b/i;

const GATES: Record<ExtractionInput["detector"], RegExp> = {
  events: EVENTS,
  safety: SAFETY,
};

/** Something dated ahead, or a time of day: an event is a thing at a time. */
const WHEN =
  /\b(today|tonight|tomorrow|this (week|weekend|saturday|sunday|friday)|next (week|month)|\d{1,2}[:.]\d{2}|\d{1,2} (january|february|march|april|may|june|july|august|september|october|november|december)|(january|february|march|april|may|june|july|august|september|october|november|december) \d{1,2})\b/i;

export function worthReading(
  detector: ExtractionInput["detector"],
  english: string,
): boolean {
  return GATES[detector].test(english) && WHEN.test(english);
}
