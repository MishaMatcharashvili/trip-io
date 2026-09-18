import { cx } from "./cx";

/**
 * The mobile bottom sheet. It sits above the tab bar, keeps the map visible
 * behind it, and always carries the grab handle so it reads as draggable.
 */
export function Sheet({
  children,
  className,
  /** Sheets that own the rest of the screen rather than resting on the tab bar. */
  fill = false,
}: {
  children: React.ReactNode;
  className?: string;
  fill?: boolean;
}) {
  return (
    <div
      className={cx(
        "z-20 flex flex-col rounded-t-sheet border-t border-hairline bg-surface shadow-sheet",
        fill ? "flex-1" : "",
        className,
      )}
    >
      <div className="flex justify-center pb-1 pt-2">
        <span aria-hidden="true" className="h-1 w-9 rounded-full bg-control" />
      </div>
      {children}
    </div>
  );
}

/** A map behind a screen: full-bleed, never interactive on its own. */
export function MapCanvas({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cx("absolute inset-0 overflow-hidden", className)}>
      <div className="absolute inset-0 [&>svg]:absolute [&>svg]:inset-0 [&>svg]:size-full [&>svg]:block">
        {children}
      </div>
    </div>
  );
}
