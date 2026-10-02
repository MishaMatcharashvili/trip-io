import type { Metadata } from "next";
import { tbilisiToday } from "@/features/shared-reads";
import { TripComposer } from "@/features/trip-composer";
import { NewTripScreen } from "./screen";

export const metadata: Metadata = { title: "New trip" };

const examples = [
  "7 days in Georgia, €700, nature and monasteries",
  "Long weekend in Kakheti with my partner",
  "Four days walking in Svaneti, moderate pace",
];

const placeholders = {
  desktop: "7 days in Georgia, €700, nature and monasteries, with my father",
  mobile: "A week somewhere with mountains and good food",
} as const;

export default async function NewTripPage() {
  const today = await tbilisiToday();

  return (
    <NewTripScreen
      composer={(layout) => (
        <TripComposer
          today={today}
          examples={examples}
          placeholder={placeholders[layout]}
        />
      )}
    />
  );
}
