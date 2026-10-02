import { Chip } from "@/ui/chip";
import { Dot } from "@/ui/dot";
import { Display, Prose } from "@/ui/text";

/**
 * The plans page's column and its opening statement of the business model,
 * stated plainly and the same for everyone: what depends on who is looking is
 * below it.
 */
export function PlansColumn({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex w-full max-w-[980px] flex-1 flex-col items-center gap-7 px-4 pb-28 pt-8 lg:pb-14 lg:pt-11">
      <div className="flex flex-col items-center gap-3">
        <Chip>
          <Dot tone="agent" />
          Your plan
        </Chip>
        <Display className="text-center text-[28px] lg:text-[35px]">
          Planning is free.
          <br />
          Watching is what you pay for.
        </Display>
        <Prose className="max-w-[520px] text-center">
          Build as many trips as you like. When one becomes real, turn on the
          watch layer and I will follow it for you until you are home.
        </Prose>
      </div>
      {children}
    </main>
  );
}
