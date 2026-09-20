import {
  type Category,
  isAllowedCategory,
} from "../../domain/catalogue/categories.ts";
import type { QueuePlace } from "../../domain/catalogue/curation.ts";
import {
  type OpeningHours,
  parseDayText,
  type Weekday,
  weekdays,
} from "../../domain/catalogue/opening-hours.ts";
import {
  type PlaceInput,
  placeInput,
} from "../../domain/catalogue/review-input.ts";
import { parseLatLon } from "../../domain/geo.ts";

// The curation form's editable state and its conversion to an API payload.
// Everything is a string while editing; nothing is guessed on submit — a blank
// day or unset hours is an error, not "closed".

export type HoursDraft = {
  kind: "weekly" | "always" | null;
  days: Record<Weekday, string>;
  // Empty = open all year.
  months: number[];
  note: string;
};

export type PlaceDraft = {
  name: string;
  nameKa: string;
  category: Category | "";
  position: string;
  hours: HoursDraft;
  note: string;
};

export type DraftErrors = Partial<
  Record<"name" | "category" | "position" | "hours" | Weekday, string>
>;

const blankDays = () =>
  Object.fromEntries(weekdays.map((d) => [d, ""])) as Record<Weekday, string>;

export function emptyDraft(): PlaceDraft {
  return {
    name: "",
    nameKa: "",
    category: "",
    position: "",
    hours: { kind: null, days: blankDays(), months: [], note: "" },
    note: "",
  };
}

export function draftFromPlace(place: QueuePlace): PlaceDraft {
  return {
    ...emptyDraft(),
    name: place.name,
    nameKa: place.nameKa ?? "",
    category: isAllowedCategory(place.category) ? place.category : "",
    position: `${place.lat.toFixed(6)}, ${place.lon.toFixed(6)}`,
  };
}

export function buildPlaceInput(
  draft: PlaceDraft,
): { ok: true; value: PlaceInput } | { ok: false; errors: DraftErrors } {
  const errors: DraftErrors = {};

  if (draft.name.trim() === "") errors.name = "required";
  if (draft.category === "") errors.category = "pick a category";

  const position = parseLatLon(draft.position);
  if (!position) errors.position = 'expected "lat, lon" inside Georgia';

  let hours: OpeningHours | undefined;
  const months =
    draft.hours.months.length > 0
      ? [...draft.hours.months].sort((a, b) => a - b)
      : undefined;
  const note = draft.hours.note.trim() || undefined;

  if (draft.hours.kind === null) {
    errors.hours =
      "set opening hours (or skip the place if you can't find them)";
  } else if (draft.hours.kind === "always") {
    hours = { kind: "always", months, note };
  } else {
    const days = {} as Record<Weekday, { open: string; close: string }[]>;
    for (const day of weekdays) {
      const text = draft.hours.days[day];
      if (text.trim() === "") {
        errors[day] = 'enter hours or "closed"';
        continue;
      }
      const parsed = parseDayText(text);
      if (parsed.ok) days[day] = parsed.intervals;
      else errors[day] = parsed.error;
    }
    hours = { kind: "weekly", days, months, note };
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  const [lon, lat] = position as [number, number];
  const result = placeInput.safeParse({
    name: draft.name,
    nameKa: draft.nameKa.trim() || null,
    category: draft.category,
    lon,
    lat,
    openingHours: hours,
    note: draft.note.trim() || undefined,
  });
  if (!result.success) {
    return { ok: false, errors: { hours: result.error.issues[0].message } };
  }
  return { ok: true, value: result.data };
}
