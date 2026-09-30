import { cx } from "@/ui/cx";
import { Icon } from "@/ui/icon";
import { Num } from "@/ui/text";
import type { RouteView } from "./route-model";

/**
 * What the map's route says about itself: the time on the road, what kind of
 * estimate it is, the ways offered, and the ways to act on it (ask again, open
 * it in Google Maps' navigation). Every state has words; none is a bare spinner or a
 * silent absence.
 */
export function RouteSection({
  view,
  onRefresh,
  onPick,
  mapsUrl,
  className,
}: {
  view: RouteView;
  onRefresh: () => void;
  onPick: (index: number) => void;
  mapsUrl: string | null;
  className?: string;
}) {
  return (
    <div className={cx("flex flex-col gap-2", className)} aria-live="polite">
      {view.kind === "ready" ? (
        <>
          <div className="flex items-baseline gap-2">
            <Num className="text-[17px] font-semibold">{view.time}</Num>
            <Num className="text-small text-ink-muted">{view.distance}</Num>
            {view.typical ? (
              <span className="text-mini text-ink-faint">{view.typical}</span>
            ) : null}
            {view.updating ? (
              <span className="text-mini text-ink-faint">Updating…</span>
            ) : null}
          </div>
          {view.via ? (
            <div className="line-clamp-2 text-mini text-ink-muted">
              {view.via}
            </div>
          ) : null}
          <div className="text-mini text-ink-faint">{view.basis}</div>
          <div className="text-mini text-ink-faint">{view.scope}</div>
          {view.warnings.map((w) => (
            <div key={w} className="text-mini text-ink-muted">
              {w}
            </div>
          ))}
          {view.legs.length ? (
            <ul className="flex flex-col gap-0.5 text-mini text-ink-muted">
              {view.legs.map((l) => (
                <li key={l.key} className="flex items-baseline gap-2">
                  <span className="min-w-0 flex-1 truncate">{l.label}</span>
                  <Num>{l.time}</Num>
                  <Num className="text-ink-faint">{l.distance}</Num>
                </li>
              ))}
            </ul>
          ) : null}
          {view.choices.length ? (
            <div
              className="flex flex-col gap-1"
              role="radiogroup"
              aria-label="Route"
            >
              {view.choices.map((c) => (
                <button
                  key={c.index}
                  type="button"
                  aria-pressed={c.selected}
                  onClick={() => onPick(c.index)}
                  className={cx(
                    "rounded-control border px-2 py-1 text-left text-mini",
                    c.selected
                      ? "border-agent bg-canvas font-medium text-ink"
                      : "border-hairline text-ink-muted hover:bg-canvas",
                  )}
                >
                  {c.label}
                </button>
              ))}
            </div>
          ) : null}
        </>
      ) : (
        <div className="text-small text-ink-muted">{view.text}</div>
      )}

      <div className="flex items-center gap-3 text-mini">
        {view.kind === "ready" || (view.kind === "failed" && view.canRetry) ? (
          <button
            type="button"
            onClick={onRefresh}
            className="text-agent hover:underline"
          >
            {view.kind === "ready" ? "Refresh" : "Try again"}
          </button>
        ) : null}
        {mapsUrl ? (
          <a
            href={mapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-agent hover:underline"
          >
            Open in Google Maps
            <Icon name="chevronRight" size={12} />
          </a>
        ) : null}
      </div>
    </div>
  );
}
