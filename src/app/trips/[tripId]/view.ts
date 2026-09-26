import type { Advisory, Day, Opportunity, Trip } from "@/data/trip";
import type { ChangeRow } from "@/features/trip-model";
import type { WeatherHour } from "@/ui/bars";
import type { Tone } from "@/ui/cx";

/**
 * Everything the active-trip screen shows, whichever trip it is. The fixture
 * trip builds one from the canvas's constants so `/design` keeps its reference
 * render; a real trip builds one from the database. The desktop and mobile
 * halves render nothing that is not in here.
 */
export type OverviewView = {
  trip: Trip;
  day: Day;
  /** What the right-hand column is doing. Offline is detected in the browser. */
  state: "advisory" | "calm" | "applied";
  /** The fixture's `?state=paused`: the paused panel without going offline. */
  forcePaused: boolean;
  advisory:
    | (Advisory & {
        /** Where the decision is made. */
        href: string;
        /** Set for a real intervention: "Keep current plan" answers it. */
        interventionId?: string;
      })
    | null;
  opportunity: Opportunity | null;
  applied: {
    eyebrow: string;
    headline: string;
    rows: ChangeRow[];
    note: string;
    /** Real trips undo through the API; the fixture's button is decorative. */
    undoTripId: string | null;
    until: string;
  } | null;
  weather: {
    hours: WeatherHour[];
    caption: string;
    captionTone?: "alert" | "neutral";
  } | null;
  strip: ReadonlyArray<{ name: string; tone: Tone; count: number }>;
  suggestions: string[];
  nextSweep: string;
  calmHeadline: string;
  calmNote: string;
  pausedSources: { name: string; seen: string }[];
  /** Neighbouring days of the itinerary panel, as links. */
  dayNav: { previous: string | null; next: string | null };
  addStopHref: string;
  /** The sheet's right-hand figure on a phone: the next stop's time. */
  next: { time: string; label: string } | null;
};
