import { Display, Prose } from "@/ui/text";

/**
 * The column a list page sits in: a heading and then sections, 1080 wide with
 * the same gutters whatever the screen. Home and Saved are both this, and so
 * are their loading states.
 */
export function PageColumn({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex-1 pb-24 lg:pb-0">
      <div className="mx-auto flex w-full max-w-[1080px] flex-col gap-6 px-4 py-6 lg:py-10">
        {children}
      </div>
    </main>
  );
}

/** A list page's heading: a title, a line under it, and the one action. */
export function PageHeading({
  title,
  lead,
  leadOnPhone = true,
  action,
}: {
  title: string;
  lead?: React.ReactNode;
  /** Whether the line under the title shows on a phone. */
  leadOnPhone?: boolean;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-4">
      <div className="flex flex-1 flex-col gap-1.5">
        <Display className="text-[25px] lg:text-[31px]">{title}</Display>
        {lead ? (
          <Prose className={leadOnPhone ? undefined : "hidden lg:block"}>
            {lead}
          </Prose>
        ) : null}
      </div>
      {action}
    </div>
  );
}
