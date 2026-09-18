import Link from "next/link";
import type { Trip } from "@/data/trip";
import { Chip, WatchChip } from "@/ui/chip";
import { cx } from "@/ui/cx";
import { Icon } from "@/ui/icon";
import { type NavItem, PillNav } from "@/ui/nav";
import { Eyebrow, Title } from "@/ui/text";
import { ThemeToggle } from "@/ui/theme";

export function Brand({
  size = 20,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <Link href="/" className={cx("flex items-center gap-[9px]", className)}>
      <Icon name="signal" size={size} className="text-agent" />
      <span className="text-[16px] font-bold tracking-[-0.035em]">trip.io</span>
    </Link>
  );
}

/**
 * The way into your account — and, when you don't have one yet, into sign-in
 * and sign-up. It carries the person glyph so it reads as a button rather than
 * an empty placeholder waiting for a photo.
 */
export function AccountButton({
  size = 30,
  floating = false,
  className,
}: {
  size?: number;
  /** Over the map: surface fill and lift, like the other floating controls. */
  floating?: boolean;
  className?: string;
}) {
  return (
    <Link
      href="/account"
      aria-label="Your account"
      title="Your account"
      style={{ width: size, height: size }}
      className={cx(
        "flex shrink-0 items-center justify-center rounded-full border border-control text-ink-muted transition-colors hover:text-ink",
        floating ? "bg-surface shadow-chip" : "bg-fill",
        className,
      )}
    >
      <Icon name="user" size={Math.round(size * 0.53)} strokeWidth={1.7} />
    </Link>
  );
}

/**
 * The desktop bar. When a trip is open it carries the trip's identity and the
 * view switcher; everywhere else it is the product's own navigation.
 */
export function TopBar({
  trip,
  tabs,
  active,
  watch = "watching",
  transparent = false,
}: {
  trip?: Trip;
  tabs?: NavItem[];
  active?: string;
  watch?: "watching" | "paused" | "none";
  transparent?: boolean;
}) {
  return (
    <header
      className={cx(
        "relative z-30 hidden h-[58px] shrink-0 items-center gap-5 px-6 lg:flex",
        transparent ? "bg-transparent" : "border-b border-hairline bg-surface",
      )}
    >
      <Brand />

      {trip ? (
        <>
          <span className="h-5 w-px bg-hairline" />
          <div className="flex items-center gap-2.5">
            <Title>{trip.title}</Title>
            <Chip size="sm">
              Day {trip.currentDay} / {trip.dayCount}
            </Chip>
          </div>
        </>
      ) : (
        <nav className="ml-3.5 flex items-center gap-5">
          {[
            { label: "Trips", href: "/" },
            { label: "Explore", href: "/explore" },
            { label: "Saved", href: "/saved" },
          ].map((item) => (
            <Link
              key={item.label}
              href={item.href}
              className={cx(
                "text-small transition-colors hover:text-ink",
                active === item.label
                  ? "font-semibold text-ink"
                  : "text-ink-muted",
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      )}

      <div className="flex-1" />
      {tabs && active ? <PillNav items={tabs} active={active} /> : null}
      <div className="flex-1" />

      {watch === "watching" ? (
        <WatchChip
          state="watching"
          label={
            trip
              ? `Watching · ${trip.sourceCount} sources`
              : "Watch layer active"
          }
        />
      ) : null}
      {watch === "paused" ? <WatchChip state="paused" label="Paused" /> : null}
      <ThemeToggle />
      <AccountButton />
    </header>
  );
}

/** The floating mobile header that sits over the map. */
export function MobileHeader({
  trip,
  day,
  watch = "watching",
}: {
  trip: Trip;
  day: string;
  watch?: "watching" | "paused";
}) {
  return (
    <div className="absolute inset-x-3 top-13 z-20 flex h-12 items-center gap-2.5 rounded-[13px] border border-hairline-strong bg-surface px-3 shadow-panel lg:hidden">
      <Icon name="signal" size={18} className="text-agent" />
      <div className="min-w-0 flex-1">
        <div className="truncate text-small font-semibold">
          {trip.title.split(" · ")[0]} · Day {trip.currentDay}
        </div>
        <Eyebrow>{day}</Eyebrow>
      </div>
      {watch === "watching" ? (
        <div className="flex items-center gap-1.5">
          <span className="size-1.5 animate-breathe rounded-full bg-ok" />
          <span className="text-mini text-ink-faint">{trip.sourceCount}</span>
        </div>
      ) : (
        <Chip size="sm">
          <span className="size-1.5 rounded-full bg-ink-faint" />
          Paused
        </Chip>
      )}
    </div>
  );
}

/** A plain mobile screen header with a back affordance. */
export function MobileTitleBar({
  back,
  title,
  eyebrow,
  trailing,
}: {
  back: string;
  title: string;
  eyebrow: string;
  trailing?: React.ReactNode;
}) {
  return (
    <div className="sticky top-0 z-20 border-b border-hairline bg-surface lg:hidden">
      <div className="flex items-center gap-2.5 px-4 pb-2.5 pt-2">
        <Link
          href={back}
          aria-label="Back"
          className="-ml-1 p-1 text-ink-muted"
        >
          <Icon name="chevronLeft" size={20} strokeWidth={1.7} />
        </Link>
        <div className="min-w-0 flex-1">
          <Title className="truncate text-[16px]">{title}</Title>
          <Eyebrow>{eyebrow}</Eyebrow>
        </div>
        {trailing}
      </div>
    </div>
  );
}
