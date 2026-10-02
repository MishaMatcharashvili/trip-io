import { SiteFrame } from "@/features/site-frame";
import { Card } from "@/ui/card";
import { PlansColumn } from "./column";

const bar = (className: string) => (
  <div className={`rounded-[3px] bg-track ${className}`} />
);

// The plans page's own column and opening statement, then the two plans as
// cards of grey: what each includes is what depends on who is looking.
export default function Loading() {
  return (
    <SiteFrame tab="Profile" watch="none">
      <PlansColumn>
        <div
          className="grid w-full animate-breathe gap-[18px] lg:grid-cols-2"
          aria-busy="true"
        >
          {[0, 1].map((i) => (
            <Card key={i} className="flex flex-col gap-4 p-6">
              <div className="flex flex-col gap-2">
                {bar("h-[9px] w-[50px]")}
                {bar("h-[29px] w-[110px]")}
                {bar("h-[10px] w-[70%]")}
              </div>
              <div className="h-px bg-hairline" />
              <div className="flex flex-col gap-3">
                {[0, 1, 2, 3, 4].map((j) => (
                  <div key={j} className="flex items-center gap-3">
                    <span className="size-[18px] shrink-0 rounded-full bg-track" />
                    {bar("h-[10px] flex-1")}
                  </div>
                ))}
              </div>
              <div className="h-11 rounded-[10px] bg-track" />
            </Card>
          ))}
        </div>
      </PlansColumn>
    </SiteFrame>
  );
}
