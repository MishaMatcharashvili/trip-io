import { cx } from "@/ui/cx";
import { Icon } from "@/ui/icon";

/** The always-visible row of an accordion card; the chevron turns when it opens. */
export function Summary({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <summary
      className={cx(
        "flex cursor-pointer list-none items-center gap-2.5 marker:hidden hover:bg-canvas [&::-webkit-details-marker]:hidden",
        className,
      )}
    >
      {children}
      <Icon
        name="chevronDown"
        size={14}
        className="shrink-0 text-ink-faint transition-transform group-open:rotate-180"
      />
    </summary>
  );
}
