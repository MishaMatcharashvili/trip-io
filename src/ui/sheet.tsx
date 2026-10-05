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
        "pointer-events-auto z-20 flex shrink-0 flex-col rounded-t-sheet border-t border-hairline bg-surface shadow-sheet",
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

/**
 * The layer above a map screen: a floating card at the top and the sheet at
 * the bottom, in one column so they can never sit on top of each other. When
 * the screen is too short for both, the card scrolls rather than hiding behind
 * the sheet — it is the thing that needs an answer.
 */
export function SheetStage({
  floating,
  children,
}: {
  floating?: React.ReactNode;
  /** The `Sheet`. */
  children: React.ReactNode;
}) {
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-20 top-[112px] z-20 flex flex-col justify-between gap-3">
      {floating ? (
        <div className="pointer-events-auto min-h-0 px-3 short:overflow-y-auto">
          {floating}
        </div>
      ) : (
        <span />
      )}
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
