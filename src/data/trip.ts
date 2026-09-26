/**
 * Fixtures for the screens.
 *
 * Shapes here deliberately echo `src/dal/schema/trip.ts` and `watch.ts` — a
 * checkpoint is a `trip_node`, an advisory is an `intervention` citing a
 * `world_event`, an outcome is `intervention.outcome` — so that wiring these
 * screens to the real API in Phase 2–5 is a swap of the loader, not a rewrite
 * of the components.
 */

import type { DaySegment, WeatherHour } from "@/ui/bars";
import type { Tone } from "@/ui/cx";

export type CheckpointState = "done" | "now" | "upcoming";

export type Checkpoint = {
  id: string;
  /** Wall-clock start, or "Now" for the node you are inside. */
  time: string;
  title: string;
  /** The line under the title: duration, distance, booking state. */
  detail?: string;
  state: CheckpointState;
  indoor: boolean;
  /** Set when a world event matched this node and the judge routed it. */
  conflict?: string;
  booked?: boolean;
  /** Real trips only: the node behind the row. */
  node?: {
    kind: "visit" | "meal" | "transfer" | "stay";
    placeId: string | null;
    lonLat: [number, number] | null;
    startsAt: string;
    durationMin: number;
  };
};

export type Day = {
  id: string;
  index: number;
  /** "D3 · TUE 16" */
  stamp: string;
  /** "Wednesday 16 Sep" */
  title: string;
  /** "Gudauri → Kazbegi" */
  route: string;
  summary: string;
  checkpoints: Checkpoint[];
  shape: DaySegment[];
  watch: { tone: Tone; label: string };
  state: "past" | "today" | "future";
  /** Real trips only: YYYY-MM-DD, Tbilisi. */
  date?: string;
};

export type Source = {
  name: string;
  tone: Tone;
  status: string;
};

export type Trip = {
  id: string;
  title: string;
  dates: string;
  party: string;
  budget: string;
  dayCount: number;
  currentDay: number;
  sourceCount: number;
  lastCheck: string;
  days: Day[];
  sources: Source[];
};

export type Advisory = {
  id: string;
  kind: string;
  /** How the router classified it: an interrupt, or something for the briefing. */
  route: "interrupt" | "briefing";
  receivedAt: string;
  headline: string;
  changed: string;
  affects: string;
  suggestion: string;
  evidence: string;
};

export type Opportunity = {
  id: string;
  headline: string;
  body: string;
  action: string;
};

export type AlertRecord = {
  id: string;
  time: string;
  title: string;
  detail: string;
  tone: Tone;
  outcome: "accepted" | "dismissed" | "ignored" | "saved" | "resolved";
  day: "Today" | "Yesterday";
};

export type ProposedChange = {
  from: { time: string; title: string };
  to: { time: string; title: string };
  delta: string;
  because: string;
};

const georgiaDays: Day[] = [
  {
    id: "1",
    index: 1,
    stamp: "D1 · SUN 14",
    title: "Sunday 14 Sep",
    route: "Tbilisi",
    summary: "Tbilisi · arrival and old town",
    state: "past",
    watch: { tone: "idle", label: "Done" },
    shape: [
      { weight: 2, tone: "filled" },
      { weight: 1, tone: "empty" },
      { weight: 3, tone: "filled" },
      { weight: 1, tone: "empty" },
      { weight: 2, tone: "filled" },
    ],
    checkpoints: [
      {
        id: "1a",
        time: "14:00",
        title: "Arrive, old town walk",
        state: "done",
        indoor: false,
      },
      {
        id: "1b",
        time: "18:30",
        title: "Sulphur baths",
        state: "done",
        indoor: true,
      },
    ],
  },
  {
    id: "2",
    index: 2,
    stamp: "D2 · MON 15",
    title: "Monday 15 Sep",
    route: "Mtskheta",
    summary: "Mtskheta · Jvari and Svetitskhoveli",
    state: "past",
    watch: { tone: "idle", label: "Done · 1 change" },
    shape: [
      { weight: 1, tone: "filled" },
      { weight: 3, tone: "filled" },
      { weight: 1, tone: "empty" },
      { weight: 2, tone: "filled" },
      { weight: 2, tone: "empty" },
    ],
    checkpoints: [
      {
        id: "2a",
        time: "09:30",
        title: "Jvari Monastery",
        state: "done",
        indoor: true,
      },
      {
        id: "2b",
        time: "15:00",
        title: "Drive to Gudauri",
        state: "done",
        indoor: false,
      },
    ],
  },
  {
    id: "3",
    index: 3,
    stamp: "D3 · TUE 16 · TODAY",
    title: "Wednesday 16 Sep",
    route: "Gudauri → Kazbegi",
    summary: "Kazbegi · Gergeti and the museum",
    state: "today",
    watch: { tone: "alert", label: "1 decision" },
    shape: [
      { weight: 2, tone: "agent" },
      { weight: 1, tone: "agent-soft" },
      { weight: 2, tone: "agent" },
      { weight: 1, tone: "agent-soft" },
      { weight: 3, tone: "alert" },
    ],
    checkpoints: [
      {
        id: "3a",
        time: "09:00",
        title: "Breakfast · Rooms Gudauri",
        detail: "45 min",
        state: "done",
        indoor: true,
      },
      {
        id: "3b",
        time: "10:15",
        title: "Friendship Monument viewpoint",
        detail: "40 min · 12 km",
        state: "done",
        indoor: false,
      },
      {
        id: "3c",
        time: "Now",
        title: "Driving to Kazbegi",
        detail: "Arrives 15:10 · 38 km left · route clear",
        state: "now",
        indoor: false,
      },
      {
        id: "3d",
        time: "12:30",
        title: "Lunch · Zeta Camp",
        detail: "Booked · free cancellation",
        state: "upcoming",
        indoor: false,
        booked: true,
      },
      {
        id: "3e",
        time: "16:00",
        title: "Gergeti Trinity hike",
        detail: "2h 40m · 400 m ascent",
        state: "upcoming",
        indoor: false,
        conflict: "Inside the rain window",
      },
      {
        id: "3f",
        time: "19:30",
        title: "Dinner · Cafe 5047m",
        detail: "Table for 2 · booked",
        state: "upcoming",
        indoor: true,
        booked: true,
      },
    ],
  },
  {
    id: "4",
    index: 4,
    stamp: "D4 · WED 17",
    title: "Thursday 17 Sep",
    route: "Juta valley",
    summary: "Juta valley and Sno",
    state: "future",
    watch: { tone: "ok", label: "Clear" },
    shape: [
      { weight: 1, tone: "filled" },
      { weight: 4, tone: "filled" },
      { weight: 1, tone: "empty" },
      { weight: 2, tone: "filled" },
    ],
    checkpoints: [
      {
        id: "4a",
        time: "09:30",
        title: "Breakfast · Sno guesthouse",
        state: "upcoming",
        indoor: true,
      },
      {
        id: "4b",
        time: "11:00",
        title: "Juta valley walk",
        state: "upcoming",
        indoor: false,
      },
    ],
  },
  {
    id: "5",
    index: 5,
    stamp: "D5 · THU 18",
    title: "Friday 18 Sep",
    route: "Ananuri",
    summary: "Back to Tbilisi via Ananuri",
    state: "future",
    watch: { tone: "ok", label: "Clear" },
    shape: [
      { weight: 3, tone: "filled" },
      { weight: 1, tone: "empty" },
      { weight: 2, tone: "filled" },
      { weight: 2, tone: "empty" },
    ],
    checkpoints: [
      {
        id: "5a",
        time: "09:30",
        title: "Breakfast · Sno guesthouse",
        state: "done",
        indoor: true,
      },
      {
        id: "5b",
        time: "11:00",
        title: "Juta valley walk",
        state: "done",
        indoor: false,
      },
      {
        id: "5c",
        time: "Now",
        title: "Lunch · Fifth Season",
        detail: "Until 15:00 · no rush",
        state: "now",
        indoor: true,
      },
      {
        id: "5d",
        time: "16:00",
        title: "Drive back to Stepantsminda",
        detail: "35 min · road clear",
        state: "upcoming",
        indoor: false,
      },
      {
        id: "5e",
        time: "19:00",
        title: "Dinner · Rooms Kazbegi",
        state: "upcoming",
        indoor: true,
      },
    ],
  },
  {
    id: "6",
    index: 6,
    stamp: "D6 · FRI 19",
    title: "Saturday 19 Sep",
    route: "Kakheti",
    summary: "Kakheti · Sighnaghi and Bodbe",
    state: "future",
    watch: { tone: "agent", label: "Festival found" },
    shape: [
      { weight: 2, tone: "filled" },
      { weight: 2, tone: "filled" },
      { weight: 1, tone: "empty" },
      { weight: 3, tone: "filled" },
    ],
    checkpoints: [
      {
        id: "6a",
        time: "10:00",
        title: "Sighnaghi old town",
        state: "upcoming",
        indoor: false,
      },
      {
        id: "6b",
        time: "15:00",
        title: "Bodbe Monastery",
        state: "upcoming",
        indoor: true,
      },
    ],
  },
  {
    id: "7",
    index: 7,
    stamp: "D7 · SAT 20",
    title: "Sunday 20 Sep",
    route: "Tbilisi",
    summary: "Tbilisi · slow morning, departure",
    state: "future",
    watch: { tone: "ok", label: "Clear" },
    shape: [
      { weight: 2, tone: "filled" },
      { weight: 3, tone: "empty" },
      { weight: 1, tone: "filled" },
    ],
    checkpoints: [
      {
        id: "7a",
        time: "10:30",
        title: "Dry Bridge market",
        state: "upcoming",
        indoor: false,
      },
      {
        id: "7b",
        time: "15:00",
        title: "Airport",
        state: "upcoming",
        indoor: true,
      },
    ],
  },
];

export const georgia: Trip = {
  id: "georgia",
  title: "Georgia · nature & monasteries",
  dates: "14 – 20 September",
  party: "with your father",
  budget: "€640 of €700 tracked",
  dayCount: 7,
  currentDay: 3,
  sourceCount: 12,
  lastCheck: "4 minutes ago",
  days: georgiaDays,
  sources: [
    { name: "Weather", tone: "ok", status: "Clear to 21:00 · 4 min ago" },
    {
      name: "Roads on your route",
      tone: "ok",
      status: "No incidents · 4 min ago",
    },
    { name: "Transport", tone: "ok", status: "Running normally · 12 min ago" },
    { name: "Opening hours", tone: "ok", status: "All verified · 2 h ago" },
    {
      name: "Local events & safety",
      tone: "ok",
      status: "Nothing relevant · 20 min ago",
    },
  ],
};

export const advisory: Advisory = {
  id: "rain-1530",
  kind: "Needs a decision · weather",
  route: "interrupt",
  receivedAt: "14:52",
  headline: "Rain starts 15:30 in Kazbegi",
  changed: "Rain moved four hours earlier — 12 mm, 15:30 to 19:00.",
  affects: "Gergeti hike, 16:00 — exposed ridge the whole way up.",
  suggestion: "Hike at 11:30, museum at 16:00. Dinner unchanged.",
  evidence: "Meteo.ge · 3 models agree",
};

export const opportunity: Opportunity = {
  id: "sno-festival",
  headline: "Sheep migration festival in Sno, 18:00",
  body: "Six minutes from your dinner and it fits the evening without moving anything. Free entry, ends around 21:00.",
  action: "Add at 18:00",
};

export const roadAdvisory: Advisory = {
  id: "km84",
  kind: "Road closure · Georgian Military Highway",
  route: "interrupt",
  receivedAt: "14:52",
  headline: "Your route to Kazbegi may add 1h 20m",
  changed:
    "Landslide clearing at km 84. Police report one lane, convoy control since 13:40.",
  affects:
    "You are 26 km before it. Arrival slips 15:10 → 16:30, past your hike.",
  suggestion:
    "Found the Truso valley detour (+22 min) and moved lunch to Sno so the stop fits the new timing.",
  evidence: "Road police feed + 2 driver reports · updated 14:52",
};

export const proposal: ProposedChange[] = [
  {
    from: { time: "16:00", title: "Gergeti Trinity hike" },
    to: { time: "11:30", title: "Gergeti Trinity hike" },
    delta: "moved −4h 30m",
    because:
      "Dry window 10:00–14:30, and the trail is quieter before the afternoon buses.",
  },
  {
    from: { time: "12:30", title: "Lunch · Zeta Camp" },
    to: { time: "14:45", title: "Lunch · Zeta Camp" },
    delta: "moved +2h 15m",
    because:
      "Kitchen closes 16:00 — still inside service. Your father gets a sit-down break before the museum.",
  },
];

export const unchangedNodes = [
  { time: "09:00", title: "Breakfast · Rooms Gudauri" },
  { time: "10:15", title: "Friendship Monument viewpoint" },
  { time: "16:00", title: "Museum of Kazbegi" },
  { time: "19:30", title: "Dinner · Cafe 5047m" },
];

export const alertHistory: AlertRecord[] = [
  {
    id: "a1",
    time: "14:52",
    title: "Rain starts 15:30 in Kazbegi",
    detail: "Moved your hike to 11:30 and lunch to 14:45",
    tone: "alert",
    outcome: "accepted",
    day: "Today",
  },
  {
    id: "a2",
    time: "09:12",
    title: "Sheep migration festival in Sno",
    detail: "Six minutes from your dinner, 18:00",
    tone: "agent",
    outcome: "saved",
    day: "Today",
  },
  {
    id: "a3",
    time: "06:10",
    title: "Military Highway reopened at km 84",
    detail: "Driving time back to 1h 05m — no action needed",
    tone: "ok",
    outcome: "resolved",
    day: "Today",
  },
  {
    id: "a4",
    time: "11:40",
    title: "Jvari Monastery closing early for a service",
    detail: "Suggested swapping it with Svetitskhoveli",
    tone: "alert",
    outcome: "accepted",
    day: "Yesterday",
  },
  {
    id: "a5",
    time: "08:05",
    title: "Marshrutka to Gudauri running 40 min late",
    detail: "You said you would drive instead",
    tone: "idle",
    outcome: "dismissed",
    day: "Yesterday",
  },
];

/** Midnight-to-midnight is noise; the ribbon covers the hours you are awake. */
export const todayWeather: WeatherHour[] = [
  { hour: "09", intensity: 0 },
  { hour: "10", intensity: 0 },
  { hour: "11", intensity: 0 },
  { hour: "12", intensity: 0 },
  { hour: "13", intensity: 0 },
  { hour: "14", intensity: 0 },
  { hour: "15", intensity: 0.3 },
  { hour: "16", intensity: 1 },
  { hour: "17", intensity: 0.85 },
  { hour: "18", intensity: 0.35 },
  { hour: "19", intensity: 0.12 },
  { hour: "21", intensity: 0 },
];

export const watchStrip: Array<{ name: string; tone: Tone; count: number }> = [
  { name: "Weather", tone: "alert", count: 1 },
  { name: "Transport", tone: "ok", count: 0 },
  { name: "Roads", tone: "ok", count: 0 },
  { name: "Nearby", tone: "agent", count: 2 },
];

export const calmStrip: Array<{ name: string; tone: Tone; count: number }> = [
  { name: "Weather", tone: "ok", count: 0 },
  { name: "Transport", tone: "ok", count: 0 },
  { name: "Roads", tone: "ok", count: 0 },
  { name: "Nearby", tone: "ok", count: 0 },
];

export const upcomingTrip = {
  id: "svaneti",
  title: "Svaneti · four days walking",
  dates: "12 – 15 October",
  status: "draft, 3 of 4 days planned",
  watchNote: "Watch starts 3 days before you leave",
};

export const finishedTrips = [
  {
    id: "kakheti",
    title: "Kakheti wine weekend",
    dates: "23 – 25 August · 3 days",
    changes: "4 changes handled",
  },
  {
    id: "armenia",
    title: "Armenia loop",
    dates: "2 – 9 June · 8 days",
    changes: "11 changes handled",
  },
];

export const watchLedger = [
  { value: "4,310", label: "checks run" },
  { value: "6", label: "worth telling you" },
  { value: "2", label: "replans applied" },
  { value: "1h 20m", label: "delay avoided" },
];

export function getTrip(id: string): Trip | undefined {
  return id === georgia.id ? georgia : undefined;
}

export function getDay(trip: Trip, dayId: string): Day | undefined {
  return trip.days.find((d) => d.id === dayId);
}
