import { Brand } from "@/features/chrome";
import { ButtonLink } from "@/ui/button";
import { Panel } from "@/ui/card";
import { TripMap } from "@/ui/map/trip-map";

// The building screen's own backdrop and header, and a card where the steps go:
// it is the screen that says what is happening, so it must not borrow one that
// says nothing.
export default function Loading() {
  return (
    <div className="relative flex min-h-dvh flex-col" aria-busy="true">
      <div className="pointer-events-none absolute inset-0 overflow-hidden opacity-80">
        <TripMap
          stops={[]}
          interactive={false}
          className="absolute inset-0 size-full"
        />
      </div>
      <div className="pointer-events-none absolute inset-0 bg-canvas/70" />
      <header className="relative z-10 flex h-[58px] shrink-0 items-center gap-2.5 px-6">
        <Brand />
        <div className="flex-1" />
        <ButtonLink href="/new" variant="ghost">
          Cancel
        </ButtonLink>
      </header>
      <main className="relative z-10 mx-auto flex w-full max-w-[1100px] animate-breathe flex-col items-start gap-7 px-4 py-8 lg:flex-row lg:py-12">
        <Panel className="flex w-full shrink-0 flex-col gap-4 p-6 lg:w-[520px]">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="flex items-start gap-3">
              <span className="mt-1 size-[18px] shrink-0 rounded-full bg-track" />
              <div className="flex flex-1 flex-col gap-1.5">
                <div className="h-[12px] w-[70%] rounded-[3px] bg-track" />
                <div className="h-[9px] w-[45%] rounded-[3px] bg-track" />
              </div>
            </div>
          ))}
        </Panel>
      </main>
    </div>
  );
}
