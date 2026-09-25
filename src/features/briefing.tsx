import type { ChangeRow } from "@/domain/watch/briefing";
import { AccountButton } from "@/features/chrome";
import { ButtonLink } from "@/ui/button";
import { Card } from "@/ui/card";
import { Chip } from "@/ui/chip";
import { cx, type Tone } from "@/ui/cx";
import { Dot } from "@/ui/dot";
import { Icon } from "@/ui/icon";
import { BasemapMobileRoute } from "@/ui/map/basemap-mobile-route";
import { BottomNav, tripTabs } from "@/ui/nav";
import { Display, Eyebrow, Num, Prose } from "@/ui/text";

/**
 * The briefing screen, as one component over one view model.
 *
 * It renders the same way whether the data came from `briefing.document` or
 * from the fixtures behind `/design` — which is the point: the screen is the
 * contract, and there is exactly one of it to keep honest.
 */

export type BriefingLineView = {
  key: string;
  tone: Tone;
  kind: string;
  title: string;
  detail: string;
  /** Source and timestamp. Shown wherever a claim is (context/architecture.md). */
  evidence?: string[];
};

export type BriefingView = {
  tripId: string;
  /** "Day 3 · TUE 16 · Kazbegi" */
  eyebrow: string;
  heading: string;
  prose: string;
  lines: BriefingLineView[];
  change: {
    sentence: string;
    rows: ChangeRow[];
    /** The intervention card, where the change is accepted or dismissed. */
    href?: string;
  } | null;
  dayHref: string;
  sourceCount: number;
  watchTone: Tone;
};

export function BriefingScreen({ view }: { view: BriefingView }) {
  return (
    <div className="relative flex min-h-dvh flex-col">
      <div className="absolute inset-x-0 top-0 h-[270px] overflow-hidden">
        <BasemapMobileRoute className="absolute inset-0 size-full" />
        <div className="absolute inset-0 bg-linear-to-b from-canvas/55 to-transparent" />
      </div>

      <div className="absolute inset-x-4 top-14 z-20 flex items-center gap-2.5">
        <Chip tone={view.watchTone} floating>
          <Dot tone={view.watchTone} breathe />
          Watching · {view.sourceCount}{" "}
          {view.sourceCount === 1 ? "source" : "sources"}
        </Chip>
        <div className="flex-1" />
        <AccountButton floating />
      </div>

      <main className="relative z-10 mt-[214px] flex flex-1 flex-col rounded-t-[20px] border-t border-hairline bg-surface shadow-sheet lg:mx-auto lg:mt-[240px] lg:w-[560px] lg:rounded-[20px] lg:border">
        <div className="flex flex-col gap-1.5 px-[18px] pb-3.5 pt-5">
          <Eyebrow>{view.eyebrow}</Eyebrow>
          <Display className="text-[26px]">{view.heading}</Display>
          <Prose>{view.prose}</Prose>
        </div>

        <div className="flex flex-col border-t border-hairline px-[18px]">
          {view.lines.map((line, i) => (
            <div
              key={line.key}
              className={cx(
                "flex items-start gap-3 py-3.5",
                i > 0 && "border-t border-hairline",
              )}
            >
              <Dot tone={line.tone} className="mt-1.5" />
              <div className="flex-1">
                <div className="text-small font-medium">{line.title}</div>
                <div className="text-mini text-ink-faint">{line.detail}</div>
                {line.evidence?.length ? (
                  <div className="pt-1 text-mini text-ink-idle">
                    {line.evidence.join(" · ")}
                  </div>
                ) : null}
              </div>
              <Eyebrow className="pt-0.5">{line.kind}</Eyebrow>
            </div>
          ))}
        </div>

        {view.change ? (
          <Card
            tint
            accent="agent"
            className="mx-[18px] mt-4 flex flex-col gap-3 p-3.5"
          >
            <div className="flex items-center gap-2">
              <Icon name="sparkle" size={15} className="text-agent" />
              <Eyebrow tone="agent">1 change recommended</Eyebrow>
            </div>
            <p className="text-small">{view.change.sentence}</p>
            {view.change.rows.map((row) => (
              <div
                key={`${row.from}→${row.to}`}
                className="flex items-center gap-2"
              >
                <Num className="text-mini text-ink-faint line-through">
                  {row.from}
                </Num>
                <Icon name="arrowRight" size={14} className="text-agent" />
                <Num className="text-mini font-medium text-agent">{row.to}</Num>
              </div>
            ))}
            {view.change.href ? (
              <ButtonLink
                href={view.change.href}
                size="sm"
                className="self-start"
              >
                Review the change
              </ButtonLink>
            ) : null}
          </Card>
        ) : null}

        <div className="flex-1" />

        <div className="flex flex-col gap-2.5 px-[18px] pb-[18px] pt-4">
          <ButtonLink
            href={`/trips/${view.tripId}/replan`}
            variant="primary"
            size="lg"
            block
          >
            Optimise my day
          </ButtonLink>
          <div className="flex justify-center gap-4">
            <ButtonLink href={view.dayHref} variant="ghost" size="sm">
              See full day
            </ButtonLink>
            <ButtonLink
              href={`/trips/${view.tripId}`}
              variant="ghost"
              size="sm"
            >
              Ask something
            </ButtonLink>
          </div>
        </div>
      </main>

      <div className="h-20 lg:hidden" />
      <BottomNav items={tripTabs(view.tripId)} active="Today" />
    </div>
  );
}
