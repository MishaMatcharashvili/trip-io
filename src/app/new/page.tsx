import type { Metadata } from "next";
import { INTAKE_MAX_CHARS } from "@/domain/trip/generate/intake";
import { composerExamples } from "@/features/new-trip";
import { PageColumn } from "@/features/page-column";
import { tbilisiToday } from "@/features/shared-reads";
import { SiteFrame } from "@/features/site-frame";
import { TripPlanner } from "@/features/trip-planner";
import { NewTripHeading } from "./heading";

export const metadata: Metadata = { title: "New trip" };

/**
 * Where a trip starts: a conversation with the planner, then the build. `?q=`
 * is a first message carried from the landing page's prompt.
 */
export default async function NewTripPage({ searchParams }: PageProps<"/new">) {
  const [{ q }, today] = await Promise.all([searchParams, tbilisiToday()]);
  return (
    <SiteFrame active="Trips" tab="Trips">
      <PageColumn>
        <NewTripHeading />
        <TripPlanner
          today={today}
          initial={
            typeof q === "string" ? q.slice(0, INTAKE_MAX_CHARS) : undefined
          }
          examples={composerExamples}
        />
      </PageColumn>
    </SiteFrame>
  );
}
