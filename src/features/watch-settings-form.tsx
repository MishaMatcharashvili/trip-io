"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { apiClient } from "@/lib/hono-client";
import { Card, Divider, SectionRule } from "@/ui/card";
import { RadioRow, Toggle } from "@/ui/control";
import { Icon } from "@/ui/icon";
import { Num } from "@/ui/text";
import { ThemeSegmented } from "@/ui/theme";

// A trip's watch, as the traveller sets it. Every control saves as it changes
// — there is no Save button to forget — and the page is read again after, so
// what it shows is what the watch will do.

type Settings = {
  channels: string[];
  quietHours: { start: string; end: string } | null;
  mutedSources: string[];
  verbosity: "affecting" | "nearby";
};

const LIVE_SOURCES = [
  {
    key: "weather",
    name: "Weather",
    note: "Forecast shifts that hit an outdoor plan",
  },
  {
    key: "road",
    name: "Roads and closures",
    note: "Only on roads you will actually drive",
  },
] as const;

/** Detectors the plan has not built yet: shown, and honestly off. */
const PLANNED_SOURCES = [
  { name: "Transport", note: "Marshrutkas, trains, strikes — coming later" },
  { name: "Opening hours", note: "Re-checked the day before — coming later" },
  { name: "Safety advisories", note: "Briefing-only when it arrives" },
];

export function WatchSettingsForm({
  tripId,
  initial,
}: {
  tripId: string;
  initial: Settings;
}) {
  const router = useRouter();
  const [settings, setSettings] = useState(initial);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const save = (patch: Partial<Settings>) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    start(async () => {
      setError(null);
      const res = await apiClient.api.trips[":id"].watch.$patch({
        param: { id: tripId },
        json: patch as never,
      });
      if (!res.ok) {
        setSettings(settings);
        setError("That setting didn’t save. Try again in a moment.");
      }
      router.refresh();
    });
  };

  const channel = (name: string) => (on: boolean) =>
    save({
      channels: on
        ? [...new Set([...settings.channels, name])]
        : settings.channels.filter((c) => c !== name),
    });

  const source = (key: string) => (on: boolean) =>
    save({
      mutedSources: on
        ? settings.mutedSources.filter((s) => s !== key)
        : [...new Set([...settings.mutedSources, key])],
    });

  const quiet = settings.quietHours;

  return (
    <>
      {error ? (
        <p className="rounded-control bg-alert-tint px-3 py-2 text-small text-alert">
          {error}
        </p>
      ) : null}

      <section className="flex flex-col gap-2.5">
        <SectionRule>Sources</SectionRule>
        <Card className="overflow-hidden">
          {LIVE_SOURCES.map((s, i) => {
            const on = !settings.mutedSources.includes(s.key);
            return (
              <div key={s.key}>
                {i > 0 ? <Divider /> : null}
                <div className="flex items-center gap-3 px-3.5 py-2.5">
                  <div className="flex-1">
                    <div
                      className={`text-small font-medium ${on ? "" : "text-ink-muted"}`}
                    >
                      {s.name}
                    </div>
                    <div className="text-mini text-ink-faint">
                      {on ? s.note : "Off for this trip — nothing is checked"}
                    </div>
                  </div>
                  <Toggle
                    label={s.name}
                    on={on}
                    onChange={source(s.key)}
                    disabled={pending}
                  />
                </div>
              </div>
            );
          })}
          {PLANNED_SOURCES.map((s) => (
            <div key={s.name}>
              <Divider />
              <div className="flex items-center gap-3 px-3.5 py-2.5">
                <div className="flex-1">
                  <div className="text-small font-medium text-ink-muted">
                    {s.name}
                  </div>
                  <div className="text-mini text-ink-faint">{s.note}</div>
                </div>
                <Toggle label={s.name} on={false} disabled />
              </div>
            </div>
          ))}
        </Card>
      </section>

      <section className="flex flex-col gap-2.5">
        <SectionRule>How much to tell you</SectionRule>
        <Card className="overflow-hidden">
          <RadioRow
            name="verbosity"
            value="affecting"
            label="Only what affects my plan"
            description="The default. Roughly one or two a day."
            checked={settings.verbosity === "affecting"}
            onChange={() => save({ verbosity: "affecting" })}
          />
          <Divider />
          <RadioRow
            name="verbosity"
            value="nearby"
            label="Anything happening nearby"
            description="More findings, more noise"
            checked={settings.verbosity === "nearby"}
            onChange={() => save({ verbosity: "nearby" })}
          />
        </Card>
      </section>

      <section className="flex flex-col gap-2.5">
        <SectionRule>When and how</SectionRule>
        <Card className="overflow-hidden">
          <div className="flex items-center gap-3 px-3.5 py-2.5">
            <div className="flex-1">
              <div className="text-small font-medium">Push notifications</div>
              <div className="text-mini text-ink-faint">
                Reaches the phone app once it is installed
              </div>
            </div>
            <Toggle
              label="Push notifications"
              on={settings.channels.includes("push")}
              onChange={channel("push")}
              disabled={pending}
            />
          </div>
          <Divider />
          <div className="flex items-center gap-3 px-3.5 py-2.5">
            <span className="flex-1 text-small font-medium">Email</span>
            <Toggle
              label="Email"
              on={settings.channels.includes("email")}
              onChange={channel("email")}
              disabled={pending}
            />
          </div>
          <Divider />
          <Link
            href={`/trips/${tripId}/briefing`}
            className="flex items-center gap-3 px-3.5 py-2.5 hover:bg-canvas"
          >
            <div className="flex-1">
              <div className="text-small font-medium">Morning briefing at</div>
              <div className="text-mini text-ink-faint">
                Always on — the channel that costs you nothing
              </div>
            </div>
            <Num className="text-small font-semibold">07:30</Num>
            <Icon name="chevronRight" size={14} className="text-ink-faint" />
          </Link>
          <Divider />
          <div className="flex items-center gap-3 px-3.5 py-2.5">
            <div className="flex-1">
              <div className="text-small font-medium">Quiet hours</div>
              <div className="text-mini text-ink-faint">
                Nothing wakes you; it waits for the briefing
              </div>
            </div>
            <Toggle
              label="Quiet hours"
              on={quiet !== null}
              onChange={(on) =>
                save({
                  quietHours: on ? { start: "22:00", end: "08:00" } : null,
                })
              }
              disabled={pending}
            />
          </div>
          {quiet ? (
            <div className="flex items-center gap-2 px-3.5 pb-3">
              <input
                type="time"
                aria-label="Quiet from"
                value={quiet.start}
                onChange={(e) =>
                  e.target.value &&
                  save({ quietHours: { ...quiet, start: e.target.value } })
                }
                className="h-9 rounded-control border border-control bg-surface px-2 text-small"
              />
              <span className="text-small text-ink-faint">to</span>
              <input
                type="time"
                aria-label="Quiet until"
                value={quiet.end}
                onChange={(e) =>
                  e.target.value &&
                  save({ quietHours: { ...quiet, end: e.target.value } })
                }
                className="h-9 rounded-control border border-control bg-surface px-2 text-small"
              />
            </div>
          ) : null}
        </Card>
      </section>

      <section className="flex flex-col gap-2.5">
        <SectionRule>Appearance</SectionRule>
        <Card className="flex items-center gap-3 px-3.5 py-2.5">
          <span className="flex-1 text-small font-medium">Theme</span>
          <ThemeSegmented />
        </Card>
      </section>
    </>
  );
}
