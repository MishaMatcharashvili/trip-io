import { PageColumn } from "@/features/page-column";
import { SiteFrame } from "@/features/site-frame";
import { Card, SectionRule } from "@/ui/card";
import { SavedHeading } from "./heading";

const bar = (className: string) => (
  <div className={`rounded-[3px] bg-track ${className}`} />
);

export default function Loading() {
  return (
    <SiteFrame active="Saved" tab="Saved">
      <PageColumn>
        <SavedHeading />
        <section
          className="flex animate-breathe flex-col gap-3"
          aria-busy="true"
        >
          <SectionRule>Places</SectionRule>
          <Card className="overflow-hidden lg:grid lg:grid-cols-2">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="flex items-start gap-3 px-4 py-3.5">
                <div className="flex flex-1 flex-col gap-1.5">
                  {bar("h-[8px] w-[60px]")}
                  {bar("h-[12px] w-[60%]")}
                  {bar("h-[9px] w-[40%]")}
                </div>
                <div className="size-[30px] rounded-control bg-track" />
              </div>
            ))}
          </Card>
        </section>
      </PageColumn>
    </SiteFrame>
  );
}
