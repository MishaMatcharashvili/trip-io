import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { alertsPage } from "@/bll/interventions";
import { myTrips } from "@/bll/trip-screen";
import { passesHeldBy } from "@/bll/watch-pass";
import { money, WATCH_PRICE } from "@/domain/billing/pricing";
import { dayKey } from "@/domain/trip/document";
import { TopBar } from "@/features/chrome";
import { dateRange } from "@/features/trip-model";
import { getAuth } from "@/infra/auth";
import { Button, ButtonLink } from "@/ui/button";
import { Card, Divider } from "@/ui/card";
import { Chip } from "@/ui/chip";
import { cx } from "@/ui/cx";
import { Dot } from "@/ui/dot";
import { Icon } from "@/ui/icon";
import { BottomNav, homeTabs } from "@/ui/nav";
import { Display, Eyebrow, Headline, Num, Prose } from "@/ui/text";

export const metadata: Metadata = { title: "Plans" };

const free = [
  { text: "Unlimited trips from a plain sentence", included: true },
  { text: "Map, day-by-day itinerary, budget tracking", included: true },
  { text: "Ask about your trip, any time", included: true },
  { text: "Re-plan by hand whenever you want", included: true },
  { text: "No monitoring — you find out when you get there", included: false },
];

const pro = [
  {
    lead: "Continuous monitoring",
    rest: " of the weather and roads along your exact route — transport, opening hours and events as they come online",
  },
  {
    lead: "Proactive alerts",
    rest: " — only the things that actually touch your days",
  },
  {
    lead: "Ready-made replans",
    rest: " you apply or reject in one tap, always revertible",
  },
  { lead: "Daily briefing", rest: " each morning, in the app and by email" },
];

function Tick({ included = true }: { included?: boolean }) {
  return (
    <Icon
      name={included ? "check" : "close"}
      size={15}
      strokeWidth={2}
      className={cx("mt-0.5", included ? "text-ok" : "text-ink-faint")}
    />
  );
}

export default async function PlansPage() {
  const session = await getAuth().api.getSession({ headers: await headers() });
  const [trips, passes] = session
    ? await Promise.all([
        myTrips(session.user.id),
        passesHeldBy(session.user.id),
      ])
    : [[], []];
  const watched = new Set(passes.map((p) => p.tripId));
  const today = dayKey(new Date());
  const current = trips.filter((t) => dayKey(t.endsAt) >= today);
  const unwatched = current.filter((t) => !watched.has(t.id));
  const firstFree = passes.length === 0;

  // What watching has actually done, across the trips that were watched.
  const ledgers = await Promise.all(
    trips.filter((t) => watched.has(t.id)).map((t) => alertsPage(t.id)),
  );
  const ledger = [
    { value: String(watched.size), label: "trips watched" },
    {
      value: ledgers.reduce((n, l) => n + l.checks, 0).toLocaleString("en-GB"),
      label: "checks run",
    },
    {
      value: String(ledgers.reduce((n, l) => n + l.told, 0)),
      label: "worth telling you",
    },
    {
      value: String(ledgers.reduce((n, l) => n + l.applied, 0)),
      label: "replans applied",
    },
  ];

  return (
    <div className="flex min-h-dvh flex-col">
      <TopBar watch="none" />

      <main className="mx-auto flex w-full max-w-[980px] flex-1 flex-col items-center gap-7 px-4 pb-28 pt-8 lg:pb-14 lg:pt-11">
        <div className="flex flex-col items-center gap-3">
          <Chip>
            <Dot tone="agent" />
            Your plan
          </Chip>
          {/* The business model, stated plainly. */}
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

        <div className="grid w-full gap-[18px] lg:grid-cols-2">
          <Card className="flex flex-col gap-4 p-6">
            <div className="flex flex-col gap-1">
              <Eyebrow>Free</Eyebrow>
              <div className="flex items-baseline gap-2">
                <Display className="text-[29px]">
                  {money(0, WATCH_PRICE.currency)}
                </Display>
                <span className="text-small text-ink-faint">forever</span>
              </div>
              <Prose>Everything you need to plan a trip properly.</Prose>
            </div>
            <Divider />
            <div className="flex flex-col gap-3">
              {free.map((item) => (
                <div
                  key={item.text}
                  className={cx(
                    "flex items-start gap-3",
                    !item.included && "opacity-50",
                  )}
                >
                  <Tick included={item.included} />
                  <span
                    className={cx(
                      "flex-1 text-small",
                      !item.included && "text-ink-muted",
                    )}
                  >
                    {item.text}
                  </span>
                </div>
              ))}
            </div>
            <div className="flex-1" />
            <Button block size="lg" disabled>
              Always included
            </Button>
          </Card>

          <Card accent="agent" className="flex flex-col gap-4 p-6 shadow-agent">
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2.5">
                <Eyebrow tone="agent">Pro · the watch layer</Eyebrow>
                <Dot tone="agent" breathe />
              </div>
              <div className="flex items-baseline gap-2">
                <Display className="text-[29px]">
                  {money(WATCH_PRICE.cents, WATCH_PRICE.currency)}
                </Display>
                <Num className="text-small text-ink-faint line-through">
                  {money(WATCH_PRICE.listCents, WATCH_PRICE.currency)}
                </Num>
                <span className="text-small text-ink-faint">
                  per watched trip
                </span>
              </div>
              <Prose>
                {firstFree
                  ? "Your first watched trip is free. No subscription, no trial to cancel."
                  : "One trip at a time. No subscription, nothing to cancel."}
              </Prose>
            </div>
            <Divider />
            <div className="flex flex-col gap-3">
              {pro.map((item) => (
                <div key={item.rest} className="flex items-start gap-3">
                  <Tick />
                  <span className="flex-1 text-small">
                    {item.lead ? (
                      <span className="font-semibold">{item.lead}</span>
                    ) : null}
                    {item.rest}
                  </span>
                </div>
              ))}
            </div>
            <div className="flex-1" />
            {unwatched.length ? (
              <div className="flex flex-col gap-2">
                {unwatched.slice(0, 3).map((t) => (
                  <ButtonLink
                    key={t.id}
                    href={`/trips/${t.id}/watch`}
                    variant="primary"
                    block
                    size="lg"
                  >
                    Watch {t.title} {firstFree ? "— free" : ""}
                  </ButtonLink>
                ))}
              </div>
            ) : (
              <ButtonLink href="/new" variant="primary" block size="lg">
                {session ? "Plan a trip to watch" : "Plan your first trip"}
              </ButtonLink>
            )}
          </Card>
        </div>

        {/* What watching has actually done, on the traveller's own trips. */}
        {session && trips.length ? (
          <Card className="flex w-full flex-col gap-4 px-[22px] py-[18px] lg:flex-row lg:items-center lg:gap-6">
            <div className="flex w-[200px] shrink-0 flex-col gap-1">
              <Eyebrow>Your trips so far</Eyebrow>
              <Prose>
                {trips.length} planned · {watched.size} watched
              </Prose>
            </div>
            <div className="flex flex-1 flex-wrap gap-6">
              {ledger.map((stat) => (
                <div key={stat.label} className="flex flex-col gap-0.5">
                  <Headline as="div">
                    <Num>{stat.value}</Num>
                  </Headline>
                  <span className="text-mini text-ink-faint">{stat.label}</span>
                </div>
              ))}
            </div>
            <span className="w-[154px] text-mini text-ink-faint">
              The trips you built stay yours, watched or not.
            </span>
          </Card>
        ) : null}

        {session && current.length ? (
          <Card className="w-full overflow-hidden">
            {current.map((t, i) => (
              <div key={t.id}>
                {i > 0 ? <Divider /> : null}
                <Link
                  href={`/trips/${t.id}/watch`}
                  className="flex items-center gap-3 px-[22px] py-3 hover:bg-canvas"
                >
                  <Dot tone={watched.has(t.id) ? "ok" : "idle"} />
                  <span className="flex-1 text-small font-medium">
                    {t.title}
                  </span>
                  <span className="text-mini text-ink-faint">
                    {dateRange(t.startsAt, t.endsAt)} ·{" "}
                    {watched.has(t.id) ? "watched" : "not watched"}
                  </span>
                  <Icon
                    name="chevronRight"
                    size={14}
                    className="text-ink-faint"
                  />
                </Link>
              </div>
            ))}
          </Card>
        ) : null}
      </main>

      <BottomNav items={homeTabs} active="Profile" />
    </div>
  );
}
