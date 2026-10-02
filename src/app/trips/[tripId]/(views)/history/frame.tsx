import { MobileTitleBar } from "@/features/chrome";
import { Display, Eyebrow, Prose } from "@/ui/text";

// The change history's frame: its heading and what it says about itself, which
// are the same for every trip. Drawn by the page with the trip's name, and by
// the loading state with a bar in its place.
export function HistoryFrame({
  backHref,
  eyebrow,
  children,
}: {
  backHref?: string;
  eyebrow: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-1 flex-col">
      <MobileTitleBar
        back={backHref}
        title="Change history"
        eyebrow={eyebrow}
      />

      <main className="mx-auto flex w-full max-w-[720px] flex-1 flex-col gap-3.5 px-4 pb-28 pt-3 lg:pb-12 lg:pt-8">
        <div className="hidden flex-col gap-1.5 lg:flex">
          <Eyebrow>{eyebrow}</Eyebrow>
          <Display className="text-[26px]">Change history</Display>
        </div>
        <Prose>
          Every change to your plan — yours, the planner’s and the watch’s —
          kept in order. Going back is itself a change, so you can always step
          forward again.
        </Prose>

        {children}
      </main>
    </div>
  );
}
