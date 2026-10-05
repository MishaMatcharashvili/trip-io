import type { Band } from "@/domain/watch/kill-criteria.ts";

export const percent = (x: number): string => `${Math.round(x * 100)}%`;

export const interval = (i: { low: number; high: number } | null): string =>
  i ? `${percent(i.low)}–${percent(i.high)}` : "";

/** The trip's clock, not the server's. */
export const tbilisi = (iso: string): string =>
  new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Tbilisi",
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(iso));

export const bandLabel: Record<Band, string> = {
  continue: "Continue",
  watch: "Watch",
  stop: "Stop",
  insufficient: "Not enough data",
};

/** Colour is the band and only the band; text carries it too, so it never rests on colour alone. */
export const bandClass: Record<Band, string> = {
  continue:
    "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200",
  watch: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
  stop: "bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-200",
  insufficient: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
};

export const number = (n: number): string => n.toLocaleString("en-GB");

export const usd = (x: number | null): string =>
  x === null ? "price not set" : `$${x.toFixed(x < 1 ? 3 : 2)}`;
