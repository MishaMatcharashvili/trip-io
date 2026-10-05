import type { WatchOffer } from "@/bll/watch-pass";
import type { Advisory, Day, Opportunity, Trip } from "@/data/trip";
import type { DayChip } from "@/features/day-strip-model";
import type { ChangeRow } from "@/features/trip-model";
import type { WeatherHour, WeatherSummary } from "@/ui/bars";
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
    summary?: WeatherSummary;
  } | null;
  strip: ReadonlyArray<{ name: string; tone: Tone; count: number }>;
  suggestions: string[];
  /** A real trip's id makes the command bar answer; the fixture's is inert. */
  askTripId: string | null;
  /** Asked as the page opens: "Ask about it" from a stop. */
  initialQuestion?: string;
  /** Not watched yet: what the traveller is offered to start. */
  offer: WatchOffer | null;
  nextSweep: string;
  calmHeadline: string;
  calmNote: string;
  pausedSources: { name: string; seen: string }[];
  /** The strip of days along the map, and which is chosen ("all" or a day's id). */
  days: DayChip[];
  selected: string;
  /** One day on the map and in the panel, or every day at once. */
  mode: "day" | "all";
  addStopHref: string;
  /** The sheet's right-hand figure on a phone: the next stop's time. */
  next: { time: string; label: string } | null;
};
