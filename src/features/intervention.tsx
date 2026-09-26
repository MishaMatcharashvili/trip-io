import Link from "next/link";
import type { InterventionCard } from "@/bll/interventions";
import { at } from "@/domain/watch/briefing";
import { Divider } from "@/ui/card";
import { Chip } from "@/ui/chip";
import { cx } from "@/ui/cx";
import { Icon } from "@/ui/icon";
import { BasemapMobileAlert } from "@/ui/map/basemap-mobile-alert";
import { Display, Eyebrow, Num } from "@/ui/text";
import { InterventionActions } from "./intervention-actions";

/**
 * The intervention card: one thing the watch noticed, and one decision.
 *
 * It answers the same three questions in the same order every time — what
 * changed, what it affects, what I suggest — then shows every stop the change
 * would move, because the traveller is accepting or rejecting all of it as one
 * unit. Evidence and source sit under the actions, never hidden: a proactive
 * claim you cannot check is one you learn to ignore.
 *
 * Framing follows the palette's rule. Coral is spent only on a real
 * disruption; an event that makes the day better is the agent's periwinkle,
 * and the banner offers a choice rather than sounding an alarm.
 */

const OUTCOME_LABEL = {
  accepted: "Applied",
  dismissed: "You kept your plan",
  muted: "Muted — no more interrupts on this trip",
  ignored: "No answer yet",
} as const;

export function InterventionScreen({ card }: { card: InterventionCard }) {
  const disruption = card.tone === "alert";
  const answered =
    card.outcome !== null && card.outcome !== "ignored" ? card.outcome : null;
  const canApply =
    card.canAnswer &&
    card.rows !== null &&
    card.rows.length > 0 &&
    !card.blocked;

  return (
    <div className="relative flex min-h-dvh flex-col">
      <div className="absolute inset-x-0 top-0 h-[420px] overflow-hidden">
        <BasemapMobileAlert className="absolute inset-0 size-full" />
      </div>

      <div
        className={cx(
          "absolute inset-x-3 top-13 z-20 flex h-11 items-center gap-2.5 rounded-[13px] border bg-surface/95 px-3 shadow-panel",
          disruption ? "border-alert-line" : "border-hairline-strong",
        )}
      >
        <span
          className={cx(
            "size-[7px] rounded-full",
            disruption ? "bg-alert" : "bg-agent",
          )}
        />
        <span className="flex-1 text-small font-semibold">
          {disruption ? "A change on your route" : "Something better came up"}
        </span>
        {card.sentAt ? (
          <Num className="text-mini text-ink-faint">{at(card.sentAt)}</Num>
        ) : null}
        <Link
          href={`/trips/${card.tripId}/alerts`}
          aria-label="Close"
          className="text-ink-faint"
        >
          <Icon name="close" size={16} />
        </Link>
      </div>

      <main className="relative z-10 mt-[354px] flex flex-1 flex-col rounded-t-[20px] border-t border-hairline bg-surface shadow-sheet lg:mx-auto lg:mt-[300px] lg:w-[560px] lg:rounded-[20px] lg:border">
        <div className="flex justify-center pb-0.5 pt-2.5">
          <span
            aria-hidden="true"
            className="h-1 w-9 rounded-full bg-control"
          />
        </div>

        <div className="flex flex-col gap-3 px-[18px] pt-2.5">
          <div className="flex items-center gap-2">
            <Icon
              name={disruption ? "warning" : "sparkle"}
              size={16}
              className={disruption ? "text-alert" : "text-agent"}
            />
            <Eyebrow tone={disruption ? "alert" : "agent"}>{card.kind}</Eyebrow>
            <div className="flex-1" />
            {card.outcome ? (
              <Chip
                size="sm"
                tone={card.outcome === "accepted" ? "agent" : "neutral"}
                className="h-5 text-micro"
              >
                {OUTCOME_LABEL[card.outcome]}
              </Chip>
            ) : null}
          </div>

          <Display className="text-[24px]">{card.headline}</Display>

          {/* Changed / Affects / I suggest — the same three questions, in the
              same order, every time. */}
          <div className="overflow-hidden rounded-panel border border-hairline">
            <div className="flex items-start gap-3 px-3.5 py-3">
              <Eyebrow className="w-[66px] shrink-0 pt-0.5">Changed</Eyebrow>
              <span className="flex-1 text-small">{card.changed}</span>
            </div>
            <Divider />
            <div className="flex items-start gap-3 px-3.5 py-3">
              <Eyebrow className="w-[66px] shrink-0 pt-0.5">Affects</Eyebrow>
              <span className="flex-1 text-small">{card.affects}</span>
            </div>
            <Divider />
            <div className="flex items-start gap-3 bg-surface-subtle px-3.5 py-3">
              <Eyebrow className="w-[66px] shrink-0 pt-0.5">
                {answered === "accepted" ? "I did" : "I suggest"}
              </Eyebrow>
              <span className="flex-1 text-small">
                {card.suggestion ??
                  (card.rows?.length
                    ? card.rows.length === 1
                      ? "One change to your day."
                      : `${card.rows.length} changes to your day, made together.`
                    : "Nothing needs to move — this is worth knowing.")}
              </span>
            </div>
          </div>

          {card.rows?.length ? (
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center">
                <Eyebrow className="flex-1">Now</Eyebrow>
                <Eyebrow tone="agent">
                  {answered === "accepted" ? "Applied" : "With the change"}
                </Eyebrow>
              </div>
              {card.rows.map((row) => (
                <div key={row.nodeId} className="flex items-center gap-2">
                  <Num className="flex-1 text-mini text-ink-faint line-through">
                    {row.from}
                  </Num>
                  <Icon name="arrowRight" size={14} className="text-agent" />
                  <Num className="flex-1 text-right text-mini font-medium text-agent">
                    {row.to}
                  </Num>
                </div>
              ))}
            </div>
          ) : null}

          {card.blocked && !answered ? (
            <p className="text-mini text-ink-muted">
              This can’t be applied as things stand: {card.blocked}
            </p>
          ) : null}
        </div>

        <div className="flex-1" />

        <div className="flex flex-col gap-2.5 px-[18px] pb-[22px] pt-4">
          {card.canAnswer ? (
            <InterventionActions
              id={card.id}
              canApply={canApply}
              allowMute={card.channel === "push"}
            />
          ) : null}
          <div className="flex items-center justify-center gap-1.5 pt-0.5">
            <Icon name="info" size={13} className="text-ink-faint" />
            <span className="text-mini text-ink-faint">{card.evidence}</span>
          </div>
        </div>
      </main>
    </div>
  );
}
