import { Card, Divider } from "@/ui/card";
import { HistoryFrame } from "./frame";

const bar = (className: string) => (
  <div className={`rounded-[3px] bg-track ${className}`} />
);

export default function Loading() {
  return (
    <HistoryFrame eyebrow={bar("h-[9px] w-[200px]")}>
      <Card className="animate-breathe overflow-hidden" aria-busy="true">
        {[0, 1, 2, 3].map((i) => (
          <div key={i}>
            {i > 0 ? <Divider /> : null}
            <div className="flex items-center gap-3 px-4 py-3">
              <span className="size-[9px] shrink-0 rounded-full bg-track" />
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                {bar("h-[11px] w-[55%]")}
                {bar("h-[9px] w-[35%]")}
              </div>
              <div className="h-[30px] w-[64px] rounded-control bg-track" />
            </div>
          </div>
        ))}
      </Card>
    </HistoryFrame>
  );
}
