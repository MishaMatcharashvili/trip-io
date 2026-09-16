import { cx, type Tone } from "@/ui/cx";
import { Dot } from "@/ui/dot";
import { Num } from "@/ui/text";

/**
 * The detector ledger, always in the same corner of the map: what each family
 * of sources is currently saying about this trip. Zeroes are the point — they
 * are the evidence that silence is a result, not a failure.
 */
export function WatchStrip({
  detectors,
  className,
}: {
  detectors: Array<{ name: string; tone: Tone; count: number }>;
  className?: string;
}) {
  return (
    <div
      className={cx(
        "flex h-[42px] items-center rounded-panel border border-hairline-strong bg-surface shadow-panel",
        className,
      )}
    >
      {detectors.map((detector, i) => (
        <div key={detector.name} className="flex items-center">
          {i > 0 ? <span className="h-5 w-px bg-hairline" /> : null}
          <div className="flex items-center gap-2 px-3.5">
            <Dot tone={detector.tone} />
            <span className="text-small text-ink-muted">{detector.name}</span>
            <Num
              className={cx(
                "text-mini",
                detector.count === 0
                  ? "text-ink-faint"
                  : detector.tone === "alert"
                    ? "font-semibold text-alert"
                    : "font-semibold text-agent",
              )}
            >
              {detector.count}
            </Num>
          </div>
        </div>
      ))}
    </div>
  );
}
