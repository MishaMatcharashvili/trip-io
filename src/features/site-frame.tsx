import { BottomNav, homeTabs } from "@/ui/nav";
import { TopBar } from "./chrome";

/**
 * The frame the site's own pages share — Trips, Explore, Saved, the account, the
 * plans: the desktop bar, the phone's tab bar, and which of their links is the
 * current one. A page and its loading state both draw it, so the bars are there
 * with the right link marked before any of the page's data is.
 */
export function SiteFrame({
  active,
  tab,
  watch,
  children,
}: {
  /** The desktop bar's link that is current, if the page is one of them. */
  active?: "Trips" | "Explore" | "Saved";
  /** The phone's tab that is current. */
  tab: "Trips" | "Explore" | "Saved" | "Profile";
  /** The watch chip: the account and plans screens show none. */
  watch?: "watching" | "paused" | "none";
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col">
      <TopBar active={active} watch={watch} />
      {children}
      <BottomNav items={homeTabs} active={tab} />
    </div>
  );
}
