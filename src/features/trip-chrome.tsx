import { Suspense } from "react";
import type { Trip } from "@/data/trip";
import { Chip, WatchChip } from "@/ui/chip";
import { cx } from "@/ui/cx";
import { BottomNav, PillNav, tripTabsShell } from "@/ui/nav";
import { Title } from "@/ui/text";
import { ThemeToggle } from "@/ui/theme";
import { AccountTabFace } from "./account-menu";
import { AccountButton, BarShell, Brand } from "./chrome";
import { TripTabs } from "./trip-tabs";

// What every screen of a trip shares: the desktop bar with the trip's name and
// its two tabs, and the phone's tab bar. It is a layout, so it is drawn once and
// stays put while the screens inside it change, and a screen's own loading
// state fills only the space below it.
//
// The trip's name and its links need the trip, which needs the database, so
// they cannot be in the page's first, static paint. Each bar is therefore one
// component with two states, loaded and not yet, drawn by the same markup: the
// "not yet" one has the same frame, the same tabs as plain text and a grey bar
// where the name goes, so when the real one arrives nothing moves.

/** The trip's tab bar on a phone, and its desktop bar; `trip` is null until known. */
function BarBody({ trip }: { trip: Trip | null }) {
  return (
    <>
      <span className="h-5 w-px bg-hairline" />
      <div className="flex items-center gap-2.5">
        {trip ? (
          <>
            <Title>{trip.title}</Title>
            <Chip size="sm">
              Day {trip.currentDay} / {trip.dayCount}
            </Chip>
          </>
        ) : (
          <>
            <div className="h-[15px] w-[190px] animate-breathe rounded-[4px] bg-track" />
            <div className="h-[22px] w-[74px] animate-breathe rounded-full bg-track" />
          </>
        )}
      </div>

      <div className="flex-1" />
      {trip ? (
        <TripTabs tripId={trip.id} variant="pill" />
      ) : (
        <PillNav items={tripTabsShell} active="" />
      )}
      <div className="flex-1" />

      {trip ? (
        <WatchChip
          state="watching"
          label={`Watching · ${trip.sourceCount} sources`}
        />
      ) : (
        <div className="h-[26px] w-[150px] animate-breathe rounded-full bg-track" />
      )}
      <ThemeToggle />
      <AccountButton tripId={trip?.id} />
    </>
  );
}

function TabBar({ tripId }: { tripId: string | null }) {
  return tripId ? (
    <TripTabs tripId={tripId} variant="bottom" />
  ) : (
    <BottomNav
      items={tripTabsShell}
      active=""
      menu={
        <div className="flex h-full w-full flex-col items-center gap-1 pt-2.5 text-ink-faint">
          <AccountTabFace />
        </div>
      }
    />
  );
}

/** Reads the trip once for both bars: the same read, cached for the request. */
async function Bars({
  load,
  part,
}: {
  load: () => Promise<Trip>;
  part: "top" | "bottom";
}) {
  const trip = await load();
  return part === "top" ? <BarBody trip={trip} /> : <TabBar tripId={trip.id} />;
}

export function TripChrome({
  load,
  children,
  className,
}: {
  /** The trip, as the header shows it: read inside the bars' own boundary. */
  load: () => Promise<Trip>;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cx("flex min-h-dvh flex-col", className)}>
      <BarShell>
        <Brand />
        <Suspense fallback={<BarBody trip={null} />}>
          <Bars load={load} part="top" />
        </Suspense>
      </BarShell>

      <div className="flex min-h-0 flex-1 flex-col">{children}</div>

      <Suspense fallback={<TabBar tripId={null} />}>
        <Bars load={load} part="bottom" />
      </Suspense>
    </div>
  );
}
