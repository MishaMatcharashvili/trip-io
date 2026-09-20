// Shared by the trip tests. The day is the canonical Kazbegi day from
// src/data/trip.ts (and concept.md's rain example), with real coordinates so the
// travel and daylight rules are exercised on real distances: Gudauri to
// Stepantsminda is ~24 km in a straight line, the drive about 45 minutes.

import type { OpeningHours } from "../catalogue/opening-hours.ts";
import type { LonLat } from "../geo.ts";
import type { TripDoc, TripNode } from "./document.ts";
import type { Candidate } from "./generate/plan.ts";
import type { PlaceInfo } from "./validate.ts";

/** An instant from a Tbilisi wall-clock time (UTC+4, no DST). */
export const at = (day: string, hhmm: string) =>
  new Date(`${day}T${hhmm}:00+04:00`).toISOString();

export const DAY = "2026-09-16"; // a Wednesday
export const PREV = "2026-09-15";

const uuid = (prefix: string, n: number) =>
  `${prefix}-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;
export const placeId = (n: number) => uuid("10000000", n);
export const nodeId = (n: number) => uuid("20000000", n);

const weekly = (
  open: string,
  close: string,
  closedOn: string[] = [],
): OpeningHours => ({
  kind: "weekly",
  days: Object.fromEntries(
    ["mon", "tue", "wed", "thu", "fri", "sat", "sun"].map((d) => [
      d,
      closedOn.includes(d) ? [] : [{ open, close }],
    ]),
  ) as Extract<OpeningHours, { kind: "weekly" }>["days"],
});

const place = (
  lonLat: LonLat,
  openingHours: OpeningHours | null,
  tier: PlaceInfo["tier"] = "curated",
): PlaceInfo => ({ lonLat, openingHours, tier });

export const P = {
  roomsGudauri: placeId(1),
  friendship: placeId(2),
  zetaCamp: placeId(3),
  roomsKazbegi: placeId(4),
  gergeti: placeId(5),
  cafe5047: placeId(6),
  tbilisiHotel: placeId(7),
  museum: placeId(8),
  verifiedCafe: placeId(9),
  rawBar: placeId(10),
  noHours: placeId(11),
};

export const places = new Map<string, PlaceInfo>([
  [P.roomsGudauri, place([44.478, 42.4769], weekly("07:00", "23:00"))],
  [P.friendship, place([44.4535, 42.4937], { kind: "always" })],
  [P.zetaCamp, place([44.6455, 42.658], weekly("11:00", "22:00"))],
  [P.roomsKazbegi, place([44.642, 42.6605], weekly("07:00", "23:00"))],
  [P.gergeti, place([44.6205, 42.6621], { kind: "always" })],
  [P.cafe5047, place([44.643, 42.66], weekly("12:00", "23:00"))],
  [P.tbilisiHotel, place([44.8015, 41.6938], weekly("00:00", "24:00"))],
  // Closed on Wednesdays, which is DAY.
  [P.museum, place([44.6445, 42.6575], weekly("10:00", "18:00", ["wed"]))],
  [
    P.verifiedCafe,
    place([44.644, 42.659], weekly("09:00", "21:00"), "verified"),
  ],
  [P.rawBar, place([44.6435, 42.6585], weekly("18:00", "02:00"), "raw")],
  [P.noHours, place([44.6438, 42.6588], null)],
]);

const node = (
  kind: TripNode["kind"],
  where: string | LonLat,
  startsAt: string,
  durationMin: number,
  title: string,
  opts: Partial<Pick<TripNode, "indoor">> & Partial<TripNode["meta"]> = {},
): TripNode => {
  const { indoor = kind !== "visit" && kind !== "transfer", ...meta } = opts;
  return {
    kind,
    placeId: typeof where === "string" ? where : null,
    lonLat: typeof where === "string" ? null : where,
    startsAt,
    durationMin,
    indoor,
    meta: { title, urban: false, ...meta },
  };
};

export const N = {
  stayGudauri: nodeId(1),
  breakfast: nodeId(2),
  friendship: nodeId(3),
  drive: nodeId(4),
  lunch: nodeId(5),
  stayKazbegi: nodeId(6),
  hike: nodeId(7),
  dinner: nodeId(8),
};

const STEPANTSMINDA: LonLat = [44.6436, 42.6568];

/** A coherent day: no errors and no warnings under any author. */
export function kazbegiDoc(): TripDoc {
  return {
    trip: {
      title: "Georgia in September",
      startsAt: at("2026-09-14", "00:00"),
      endsAt: at("2026-09-20", "23:59"),
      party: { adults: 2 },
      pace: "moderate",
      budget: "€700",
      prefs: {},
    },
    nodes: {
      [N.stayGudauri]: node(
        "stay",
        P.roomsGudauri,
        at(PREV, "18:00"),
        15,
        "Check in · Rooms Gudauri",
      ),
      [N.breakfast]: node(
        "meal",
        P.roomsGudauri,
        at(DAY, "09:00"),
        45,
        "Breakfast · Rooms Gudauri",
      ),
      [N.friendship]: node(
        "visit",
        P.friendship,
        at(DAY, "10:15"),
        40,
        "Friendship Monument viewpoint",
      ),
      [N.drive]: node(
        "transfer",
        STEPANTSMINDA,
        at(DAY, "11:05"),
        55,
        "Drive to Kazbegi",
        {
          corridorSlug: "military-road",
        },
      ),
      [N.lunch]: node(
        "meal",
        P.zetaCamp,
        at(DAY, "12:30"),
        75,
        "Lunch · Zeta Camp",
        { indoor: false },
      ),
      [N.stayKazbegi]: node(
        "stay",
        P.roomsKazbegi,
        at(DAY, "14:15"),
        30,
        "Check in · Rooms Kazbegi",
      ),
      [N.hike]: node(
        "visit",
        P.gergeti,
        at(DAY, "16:00"),
        160,
        "Gergeti Trinity hike",
      ),
      [N.dinner]: node(
        "meal",
        P.cafe5047,
        at(DAY, "19:30"),
        90,
        "Dinner · Cafe 5047m",
      ),
    },
  };
}

const names: Record<string, [string, Candidate["group"], boolean]> = {
  [P.roomsGudauri]: ["Rooms Gudauri", "lodging", false],
  [P.friendship]: ["Friendship Monument viewpoint", "heritage", true],
  [P.zetaCamp]: ["Zeta Camp", "food", false],
  [P.roomsKazbegi]: ["Rooms Kazbegi", "lodging", false],
  [P.gergeti]: ["Gergeti Trinity Church", "heritage", true],
  [P.cafe5047]: ["Cafe 5047m", "food", false],
  [P.tbilisiHotel]: ["Tbilisi hotel", "lodging", false],
  [P.museum]: ["Kazbegi museum", "culture", false],
  [P.verifiedCafe]: ["Verified café", "food", false],
  [P.rawBar]: ["Raw bar", "food", false],
  [P.noHours]: ["No-hours place", "culture", false],
};

/** The fixture places as generation candidates. */
export const candidates = new Map<string, Candidate>(
  [...places].map(([id, info]) => {
    const [name, group, outdoor] = names[id];
    return [
      id,
      {
        ...info,
        id,
        name,
        category: group,
        group,
        outdoor,
        area: "kazbegi-corridor" as const,
      },
    ];
  }),
);

/** Deterministic node ids for generated nodes. */
export function idSequence(start = 0x100) {
  let n = start;
  return () => nodeId(n++);
}
