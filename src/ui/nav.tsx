import Link from "next/link";
import { cx } from "./cx";
import { Dot } from "./dot";
import { Icon, type IconName } from "./icon";

export type NavItem = {
  label: string;
  href: string;
  icon?: IconName;
  /** A coral pip on the tab, for something waiting on a decision. */
  badge?: boolean;
};

/** The desktop view switcher: Today · Map · Trip · AI. */
export function PillNav({
  items,
  active,
}: {
  items: NavItem[];
  active: string;
}) {
  return (
    <nav className="flex gap-0.5 rounded-[10px] bg-track-pill p-[3px]">
      {items.map((item) => {
        const on = item.label === active;
        return (
          <Link
            key={item.label}
            href={item.href}
            aria-current={on ? "page" : undefined}
            className={cx(
              "flex h-[30px] items-center rounded-control px-3.5 text-[13px] transition-colors",
              on
                ? "bg-surface font-medium text-ink shadow-card"
                : "text-ink-muted hover:text-ink",
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

/** The mobile tab bar, with the home-indicator gutter built in. */
export function BottomNav({
  items,
  active,
}: {
  items: NavItem[];
  active: string;
}) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 flex h-20 border-t border-hairline bg-surface px-2 pb-[22px] lg:hidden">
      {items.map((item) => {
        const on = item.label === active;
        return (
          <Link
            key={item.label}
            href={item.href}
            aria-current={on ? "page" : undefined}
            className={cx(
              "relative flex flex-1 flex-col items-center gap-1 pt-2.5",
              on ? "text-agent" : "text-ink-faint",
            )}
          >
            {item.icon ? (
              <Icon name={item.icon} size={21} strokeWidth={1.7} />
            ) : null}
            <span className={cx("text-[10.5px]", on && "font-semibold")}>
              {item.label}
            </span>
            {item.badge ? (
              <Dot
                tone="alert"
                size={7}
                className="absolute right-[30px] top-1.5"
              />
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}

/** The tabs a trip is read through. */
export const tripTabs = (tripId: string): NavItem[] => [
  { label: "Today", href: `/trips/${tripId}/day/today`, icon: "calendar" },
  { label: "Map", href: `/trips/${tripId}`, icon: "map" },
  { label: "Trip", href: `/trips/${tripId}/trip`, icon: "list" },
  { label: "AI", href: `/trips/${tripId}/alerts`, icon: "sparkle" },
];

/** The tabs outside a trip. */
export const homeTabs: NavItem[] = [
  { label: "Trips", href: "/", icon: "route" },
  { label: "Explore", href: "/explore", icon: "explore" },
  { label: "Saved", href: "/saved", icon: "bookmark" },
  { label: "Profile", href: "/account", icon: "user" },
];
