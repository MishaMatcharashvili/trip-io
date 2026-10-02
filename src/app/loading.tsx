import { PageColumn } from "@/features/page-column";
import { SiteFrame } from "@/features/site-frame";
import { Card } from "@/ui/card";
import { HomeHeading } from "./home-heading";

// Home's loading state, and the fallback for any route without its own: the
// frame and the heading are the page's own components, and the body is a card
// where the trip will be. Every other route has its own (a test says so).
export default function Loading() {
  return (
    <SiteFrame active="Trips" tab="Trips">
      <PageColumn>
        <HomeHeading
          lead={
            <span className="inline-block h-[10px] w-[180px] animate-breathe rounded-[3px] bg-track align-middle" />
          }
        />
        <Card className="flex animate-breathe flex-col overflow-hidden lg:flex-row lg:items-stretch">
          <div className="h-[140px] shrink-0 bg-map-ground lg:h-auto lg:min-h-[200px] lg:w-[296px]" />
          <div className="flex flex-1 flex-col gap-3 p-3.5 lg:gap-3.5 lg:px-[22px] lg:py-5">
            <div className="flex flex-col gap-2">
              <div className="h-[18px] w-[55%] rounded-[4px] bg-track" />
              <div className="h-[10px] w-[40%] rounded-[3px] bg-track" />
            </div>
            <div className="h-[44px] rounded-[9px] bg-track" />
            <div className="h-[38px] w-[200px] rounded-control bg-track" />
          </div>
        </Card>
      </PageColumn>
    </SiteFrame>
  );
}
