import { Panel } from "@/ui/card";

// Only the reference trip reaches the replan screen (a real trip is sent to its
// alert or its day), so this draws that screen's own frame — the washed map and
// the one wide panel — and nothing about a trip.
export default function Loading() {
  return (
    <div className="relative flex flex-1 flex-col" aria-busy="true">
      <span className="sr-only">Loading</span>
      <div className="pointer-events-none absolute inset-0 overflow-hidden bg-map-ground" />
      <main className="relative z-10 mx-auto w-full max-w-[1000px] px-4 pb-28 pt-5 lg:pb-10 lg:pt-11">
        <Panel className="flex animate-breathe flex-col gap-3 rounded-[16px] px-[22px] py-4">
          <div className="h-[9px] w-[200px] rounded-[3px] bg-track" />
          <div className="h-[21px] w-[260px] rounded-[3px] bg-track" />
          <div className="h-[9px] w-[80%] rounded-[3px] bg-track" />
          <div className="h-[9px] w-[60%] rounded-[3px] bg-track" />
        </Panel>
      </main>
    </div>
  );
}
