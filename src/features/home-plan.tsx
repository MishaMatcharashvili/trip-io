import { SectionRule } from "@/ui/card";
import { TripComposer } from "./trip-composer";

// The ask on the landing page: the first thing for a traveller with no trip,
// and below their trip for one with trips. One component for the page and for
// its loading state, so the composer is where it will be before anything about
// the traveller's trips is known.

export const composerExamples = [
  "7 days in Georgia, €700, nature and monasteries",
  "Long weekend in Kakheti with my partner",
  "Four days walking in Svaneti, moderate pace",
];

export function HomePlan({
  today,
  hasTrips,
  heading,
}: {
  /** YYYY-MM-DD in Tbilisi. */
  today: string;
  hasTrips: boolean;
  /** Replaces the heading's words: the loading state does not know which it is. */
  heading?: React.ReactNode;
}) {
  return (
    <section id="plan" className="flex scroll-mt-6 flex-col gap-3">
      <SectionRule>
        {heading ??
          (hasTrips ? "Plan another trip" : "Where do you want to go?")}
      </SectionRule>
      <TripComposer
        today={today}
        examples={composerExamples}
        placeholder={
          hasTrips
            ? "A weekend somewhere with mountains and good food"
            : "7 days in Georgia, €700, nature and monasteries, with my father"
        }
      />
    </section>
  );
}
