import { insertSurvey, surveyState } from "../dal/surveys.ts";

// The post-trip question: would you pay $5 to have this trip watched. Asked
// once, after the trip is over, of trips that held a pass — a traveller who
// never had the watch has nothing to price.

export type SurveyStatus = "ask" | "answered" | "not-yet" | "unknown";

export async function surveyStatus(
  tripId: string,
  now: Date = new Date(),
): Promise<SurveyStatus> {
  const state = await surveyState(tripId, now);
  if (!state) return "unknown";
  if (state.answered) return "answered";
  return state.ask ? "ask" : "not-yet";
}

export async function submitSurvey(
  input: { tripId: string; wouldPay: boolean; note?: string },
  now: Date = new Date(),
): Promise<"recorded" | "not-askable" | "already-answered"> {
  const status = await surveyStatus(input.tripId, now);
  if (status === "answered") return "already-answered";
  if (status !== "ask") return "not-askable";
  const written = await insertSurvey({
    tripId: input.tripId,
    wouldPay: input.wouldPay,
    note: input.note?.trim() || null,
  });
  return written ? "recorded" : "already-answered";
}
