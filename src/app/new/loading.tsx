import { Card } from "@/ui/card";
import { NewTripScreen } from "./screen";

// The same screen with a card of grey where the composer goes. The composer is
// the one part that needs the day's date, so it is the one part that waits.
export default function Loading() {
  return (
    <NewTripScreen
      composer={() => (
        <Card
          className="flex h-[168px] w-full animate-breathe flex-col gap-3 p-4"
          aria-busy="true"
        >
          <div className="h-[14px] w-[60%] rounded-[3px] bg-track" />
          <div className="h-[10px] w-[85%] rounded-[3px] bg-track" />
          <div className="flex-1" />
          <div className="h-[38px] w-[120px] self-end rounded-control bg-track" />
        </Card>
      )}
    />
  );
}
