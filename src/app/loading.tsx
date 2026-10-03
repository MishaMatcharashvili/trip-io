import { HomePlan } from "@/features/home-plan";
import { PageColumn } from "@/features/page-column";
import { tbilisiToday } from "@/features/shared-reads";
import { SiteFrame } from "@/features/site-frame";
import { Card } from "@/ui/card";
import { HomeHeading } from "./home-heading";

const bar = (className: string) => (
  <div className={`rounded-[3px] bg-track ${className}`} />
);

// The landing page's loading state, and the fallback for any route without its
// own (a test says none is left to use it). The frame and the heading are the
// page's components, the card is where the trip will be, and the composer is the
// page's own — it is the one part that does not depend on whose trips there are.
export default async function Loading() {
  const today = await tbilisiToday();
  return (
    <SiteFrame active="Trips" tab="Trips">
      <PageColumn>
        <HomeHeading
          lead={
            <span className="inline-block h-[10px] w-[180px] animate-breathe rounded-[3px] bg-track align-middle" />
          }
        />
        <Card
          className="flex animate-breathe flex-col overflow-hidden lg:flex-row lg:items-stretch"
          aria-busy="true"
        >
          <div className="h-[140px] shrink-0 bg-map-ground lg:h-auto lg:min-h-[200px] lg:w-[296px]" />
          <div className="flex flex-1 flex-col gap-3 p-3.5 lg:gap-3.5 lg:px-[22px] lg:py-5">
            <div className="flex flex-col gap-2">
              {bar("h-[18px] w-[55%]")}
              {bar("h-[10px] w-[40%]")}
            </div>
            <div className="h-[44px] rounded-[9px] bg-track" />
            <div className="h-[38px] w-[200px] rounded-control bg-track" />
          </div>
        </Card>
        <HomePlan today={today} hasTrips heading={bar("h-[9px] w-[120px]")} />
      </PageColumn>
    </SiteFrame>
  );
}
