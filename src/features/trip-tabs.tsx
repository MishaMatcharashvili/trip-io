"use client";

import { useSelectedLayoutSegment } from "next/navigation";
import { BottomNav, PillNav, tripTabs } from "@/ui/nav";
import { AccountMenu } from "./account-menu";
import { activeTab } from "./trip-tabs-model";

// A trip's two tabs, in the top bar and on the phone, with the one the traveller
// is on marked. Which that is depends on the URL below the trip, which only the
// browser's router knows once the layout is drawn, so this is the one part of
// the chrome that is a client component.

export function TripTabs({
  tripId,
  variant,
}: {
  tripId: string;
  variant: "pill" | "bottom";
}) {
  const active = activeTab(useSelectedLayoutSegment());
  return variant === "pill" ? (
    <PillNav items={tripTabs(tripId)} active={active} />
  ) : (
    <BottomNav
      items={tripTabs(tripId)}
      active={active}
      menu={<AccountMenu variant="tab" tripId={tripId} />}
    />
  );
}
