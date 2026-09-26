import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import { z } from "zod";
import { accessTrip } from "@/bll/trip-document";
import { type TripScreen, tripScreen } from "@/bll/trip-screen";
import type { Day, Trip } from "@/data/trip";
import { tripModel } from "@/features/trip-model";
import { getAuth } from "@/infra/auth";

export type LoadedTrip = {
  screen: TripScreen;
  trip: Trip;
  userId: string;
};

/**
 * A real trip for one of its pages, or the page's 404. Signed out, the
 * traveller is sent to sign in and brought back; someone else's trip is not
 * found rather than forbidden, so a trip's existence is not confirmed to a
 * stranger. Cached per request: a page and its metadata share one read.
 */
export const loadTrip = cache(async (tripId: string): Promise<LoadedTrip> => {
  // Postgres answers a malformed uuid with an error, not an empty result.
  if (!z.uuid().safeParse(tripId).success) notFound();

  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session)
    redirect(`/sign-in?next=${encodeURIComponent(`/trips/${tripId}`)}`);

  const access = await accessTrip(tripId, session.user.id);
  if (!access.ok) notFound();

  const screen = await tripScreen(tripId);
  if (!screen) notFound();

  return { screen, trip: tripModel(screen), userId: session.user.id };
});

/**
 * A day of the trip from the URL: its index ("3"), "today", or nothing for
 * the trip's current day.
 */
export function pickDay(
  trip: Trip,
  wanted: string | undefined,
): Day | undefined {
  if (!wanted || wanted === "today") return trip.days[trip.currentDay - 1];
  return trip.days.find((d) => d.id === wanted);
}
