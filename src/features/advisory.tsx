import type { Advisory, Opportunity } from "@/data/trip";
import { Button, ButtonLink, QuietAction } from "@/ui/button";
import { Divider, EvidenceRow, Panel } from "@/ui/card";
import { Dot } from "@/ui/dot";
import { Icon } from "@/ui/icon";
import { Display, Eyebrow, Num, Prose, Title } from "@/ui/text";
import { KeepPlanAction } from "./trip-actions";

/**
 * The interrupt card — the one thing on screen asking for a decision.
 *
 * It always answers the same three questions in the same order: what changed,
 * what it affects, and what I suggest. Evidence and source sit under the
 * actions, never hidden, because a proactive claim you cannot check is one you
 * learn to ignore.
 */
export function AdvisoryCard({
  advisory,
  tripId,
  href = `/trips/${tripId}/replan`,
  interventionId,
  className,
}: {
  advisory: Advisory;
  tripId: string;
  /** Where the change is reviewed and applied. */
  href?: string;
  /** A real intervention: "Keep current plan" answers it. */
  interventionId?: string;
  className?: string;
}) {
  return (
    <Panel accent="alert" className={`overflow-hidden ${className ?? ""}`}>
      <div className="flex items-center gap-2.5 border-b border-alert-line bg-alert-tint px-4 py-[11px]">
        <Dot tone="alert" />
        <Eyebrow tone="alert">{advisory.kind}</Eyebrow>
        <div className="flex-1" />
        <Num className="text-mini text-alert">{advisory.receivedAt}</Num>
      </div>

      <div className="flex flex-col gap-3.5 p-4">
        <Display className="text-[25px]">{advisory.headline}</Display>

        <div className="flex flex-col gap-2.5">
          <EvidenceRow label="Changed" labelWidth="w-[70px]">
            {advisory.changed}
          </EvidenceRow>
          <EvidenceRow label="Affects" labelWidth="w-[70px]">
            {advisory.affects}
          </EvidenceRow>
          <EvidenceRow label="I suggest" labelWidth="w-[70px]">
            {advisory.suggestion}
          </EvidenceRow>
        </div>

        <div className="flex gap-2">
          <ButtonLink href={href} variant="primary" className="flex-1">
            Replan my day
          </ButtonLink>
          <ButtonLink href={href}>View changes</ButtonLink>
        </div>

        <div className="flex items-center gap-3">
          {interventionId ? (
            <KeepPlanAction interventionId={interventionId} />
          ) : (
            <QuietAction>Keep current plan</QuietAction>
          )}
          <div className="flex-1" />
          <Eyebrow>{advisory.evidence}</Eyebrow>
        </div>
      </div>
    </Panel>
  );
}

/**
 * The second card type: something worth knowing that needs no decision. It is
 * deliberately quieter than the advisory — neutral header, secondary actions —
 * so the two never compete for the same attention.
 */
export function OpportunityCard({
  opportunity,
  className,
}: {
  opportunity: Opportunity;
  className?: string;
}) {
  return (
    <Panel className={`overflow-hidden ${className ?? ""}`}>
      <div className="flex items-center gap-2.5 border-b border-hairline bg-canvas px-4 py-2.5">
        <Dot tone="agent" />
        <Eyebrow>Worth knowing · no action</Eyebrow>
      </div>
      <div className="flex flex-col gap-2.5 p-4">
        <Title className="text-[15px]">{opportunity.headline}</Title>
        <Prose>{opportunity.body}</Prose>
        <div className="flex gap-2">
          <Button size="sm">{opportunity.action}</Button>
          <QuietAction className="px-1.5">Not interested</QuietAction>
        </div>
      </div>
    </Panel>
  );
}

/**
 * The calm state — what most days look like. It has to read as deliberate
 * rather than broken, so it states what was checked, when, and promises to
 * interrupt if that stops being true.
 */
export function AllClearCard({
  sources,
  headline = "Today is going to plan",
  note = "I have checked everything on your route since 06:00 and found nothing that changes your day. I will interrupt you if that stops being true.",
  nextSweep,
  watchHref,
  className,
}: {
  sources: Array<{ name: string; tone: "ok" | "idle"; status: string }>;
  headline?: string;
  note?: string;
  nextSweep: string;
  watchHref: string;
  className?: string;
}) {
  return (
    <Panel className={`overflow-hidden ${className ?? ""}`}>
      <div className="flex flex-col gap-3 px-[18px] pb-4 pt-5">
        <div className="flex items-center gap-2.5">
          <span className="flex size-[26px] items-center justify-center rounded-full bg-ok-tint text-ok">
            <Icon name="check" size={14} strokeWidth={2.2} />
          </span>
          <Eyebrow tone="ok">Nothing needs your attention</Eyebrow>
        </div>
        <Display className="text-[25px]">{headline}</Display>
        <Prose>{note}</Prose>
      </div>

      <Divider />

      <div className="flex flex-col px-[18px] pb-3.5 pt-3">
        {sources.map((source, i) => (
          <div
            key={source.name}
            className={`flex items-center gap-2.5 py-2 ${i > 0 ? "border-t border-track" : ""}`}
          >
            <Dot tone={source.tone} />
            <span className="flex-1 text-small">{source.name}</span>
            <span className="text-mini text-ink-faint">{source.status}</span>
          </div>
        ))}
      </div>

      <Divider />

      <div className="flex items-center gap-2.5 px-[18px] py-3">
        <span className="flex-1 text-mini text-ink-faint">{nextSweep}</span>
        <ButtonLink href={watchHref} size="sm">
          What I watch
        </ButtonLink>
      </div>
    </Panel>
  );
}
