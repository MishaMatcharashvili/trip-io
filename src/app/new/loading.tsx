import { PageColumn } from "@/features/page-column";
import { SiteFrame } from "@/features/site-frame";
import { Card } from "@/ui/card";
import { NewTripHeading } from "./heading";

export default function Loading() {
  return (
    <SiteFrame active="Trips" tab="Trips">
      <PageColumn>
        <NewTripHeading />
        <div
          className="flex w-full max-w-[820px] animate-breathe flex-col gap-4"
          aria-busy="true"
        >
          <div className="flex flex-col gap-1.5 pl-[27px]">
            <div className="h-[11px] w-[80%] rounded-[3px] bg-track" />
            <div className="h-[11px] w-[55%] rounded-[3px] bg-track" />
          </div>
          <Card className="h-[104px] rounded-[16px] shadow-lifted" />
        </div>
      </PageColumn>
    </SiteFrame>
  );
}
