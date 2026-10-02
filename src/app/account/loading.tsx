import { SiteFrame } from "@/features/site-frame";
import { Card, SectionRule } from "@/ui/card";
import { AccountColumn } from "./column";

// The account's own column and heading, and a card for each section it has.
export default function Loading() {
  return (
    <SiteFrame tab="Profile" watch="none">
      <AccountColumn>
        {["You", "Plan", "Appearance"].map((label) => (
          <section
            key={label}
            className="flex animate-breathe flex-col gap-2.5"
            aria-busy="true"
          >
            <SectionRule>{label}</SectionRule>
            <Card className="flex items-center gap-3 px-4 py-3.5">
              <div className="flex flex-1 flex-col gap-1.5">
                <div className="h-[12px] w-[40%] rounded-[3px] bg-track" />
                <div className="h-[9px] w-[60%] rounded-[3px] bg-track" />
              </div>
              <div className="h-[30px] w-[84px] rounded-control bg-track" />
            </Card>
          </section>
        ))}
      </AccountColumn>
    </SiteFrame>
  );
}
