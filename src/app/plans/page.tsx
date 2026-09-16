import type { Metadata } from "next";
import { watchLedger } from "@/data/trip";
import { TopBar } from "@/features/chrome";
import { Button } from "@/ui/button";
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
  { text: "Ask the assistant anything, any time", included: true },
  { text: "Re-plan by hand whenever you want", included: true },
  { text: "No monitoring — you find out when you get there", included: false },
];

const pro = [
  {
    lead: "Continuous monitoring",
    rest: " of weather, roads, transport, opening hours, events and safety along your exact route",
  },
  {
    lead: "Proactive alerts",
    rest: " — only the things that actually touch your days",
  },
  {
    lead: "Ready-made replans",
    rest: " you apply or reject in one tap, always revertible",
  },
  { lead: "Daily briefing", rest: " each morning, by push and email" },
  {
    lead: "",
    rest: "Opportunities nearby — festivals, better weather windows",
  },
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

export default function PlansPage() {
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
                <Display className="text-[29px]">€0</Display>
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
            <Button block size="lg">
              Your current plan
            </Button>
          </Card>

          <Card accent="agent" className="flex flex-col gap-4 p-6 shadow-agent">
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2.5">
                <Eyebrow tone="agent">Pro · the watch layer</Eyebrow>
                <Dot tone="agent" breathe />
              </div>
              <div className="flex items-baseline gap-2">
                <Display className="text-[29px]">[YOUR PRICE]</Display>
                <span className="text-small text-ink-faint">per month</span>
              </div>
              <Prose>Turn it on per trip, or leave it on all year.</Prose>
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
            <Button variant="primary" block size="lg">
              Turn on the watch layer
            </Button>
          </Card>
        </div>

        {/* What the subscription has actually done, on the trip you are on. */}
        <Card className="flex w-full flex-col gap-4 px-[22px] py-[18px] lg:flex-row lg:items-center lg:gap-6">
          <div className="flex w-[200px] shrink-0 flex-col gap-1">
            <Eyebrow>On your Georgia trip so far</Eyebrow>
            <Prose>Three days in</Prose>
          </div>
          <div className="flex flex-1 flex-wrap gap-6">
            {watchLedger.map((stat) => (
              <div key={stat.label} className="flex flex-col gap-0.5">
                <Headline as="div">
                  <Num>{stat.value}</Num>
                </Headline>
                <span className="text-mini text-ink-faint">{stat.label}</span>
              </div>
            ))}
          </div>
          <span className="w-[154px] text-mini text-ink-faint">
            Cancel any time. The trips you built stay yours.
          </span>
        </Card>
      </main>

      <BottomNav items={homeTabs} active="Profile" />
    </div>
  );
}
