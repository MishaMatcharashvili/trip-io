import Link from "next/link";
import { cx } from "./cx";
import { Dot } from "./dot";
import { Icon, type IconName } from "./icon";

export type NavItem = {
  label: string;
  /** Without one the tab is drawn but is not a link: the shell before it is known. */
  href?: string;
  icon?: IconName;
  /** A coral pip on the tab, for something waiting on a decision. */
  badge?: boolean;
};

/** The desktop view switcher: a trip's views. */
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
        const className = cx(
          "flex h-[30px] items-center rounded-control px-3.5 text-[13px] transition-colors",
          on
            ? "bg-surface font-medium text-ink shadow-card"
            : "text-ink-muted hover:text-ink",
        );
        return item.href ? (
          <Link
            key={item.label}
            href={item.href}
            aria-current={on ? "page" : undefined}
            className={className}
          >
            {item.label}
          </Link>
        ) : (
          <span key={item.label} className={className}>
            {item.label}
          </span>
        );
      })}
    </nav>
  );
}

/** The mobile tab bar, with the home-indicator gutter built in. */
export function BottomNav({
  items,
  active,
  menu,
}: {
  items: NavItem[];
  active: string;
  /** A last slot that is not a page: the account menu, which opens in place. */
  menu?: React.ReactNode;
}) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 flex h-20 justify-center border-t border-hairline bg-surface px-2 pb-[22px] lg:hidden">
      {items.map((item) => {
        const on = item.label === active;
        const className = cx(
          // Capped, so on a wide or landscape screen the tabs stay a thumb apart.
          "relative flex max-w-[120px] flex-1 flex-col items-center gap-1 pt-2.5",
          on ? "text-agent" : "text-ink-faint",
        );
        const body = (
          <>
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
          </>
        );
        return item.href ? (
          <Link
            key={item.label}
            href={item.href}
            aria-current={on ? "page" : undefined}
            className={className}
          >
            {body}
          </Link>
        ) : (
          <span key={item.label} className={className}>
            {body}
          </span>
        );
      })}
      {menu ? <div className="flex flex-1">{menu}</div> : null}
    </nav>
  );
}

/**
 * The tabs a trip is read through: its plan, and its map. The AI's record and
 * the watch's settings are in the account menu, not here, because they are
 * about the traveller and the watch, not the trip's days.
 */
export const tripTabs = (tripId: string): NavItem[] => [
  { label: "Trip", href: `/trips/${tripId}/trip`, icon: "list" },
  { label: "Map", href: `/trips/${tripId}`, icon: "map" },
];

/** The same two tabs before the trip is known: drawn, not yet links. */
export const tripTabsShell: NavItem[] = [
  { label: "Trip", icon: "list" },
  { label: "Map", icon: "map" },
];

/** The tabs outside a trip. */
export const homeTabs: NavItem[] = [
  { label: "Trips", href: "/", icon: "route" },
  { label: "Explore", href: "/explore", icon: "explore" },
  { label: "Saved", href: "/saved", icon: "bookmark" },
  { label: "Profile", href: "/account", icon: "user" },
];
