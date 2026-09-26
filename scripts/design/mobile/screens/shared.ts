import type { IconName } from "@/ui/icon";
import { dot, ic, type Tone } from "../kit.ts";

/** Pieces more than one flow draws: the trip header, agenda rows, the ask bar. */

/** The floating header over the map on every in-trip screen. */
export function tripHeader({
  title,
  sub,
  right,
  top = 54,
  tone,
}: {
  title: string;
  sub: string;
  right?: string;
  top?: number;
  tone?: "alert" | "ok";
}): string {
  return `<div class="abs row float${tone === "alert" ? " line-w" : tone === "ok" ? " line-o" : ""}" style="top:${top}px;left:12px;right:12px;height:48px;padding:0 12px;gap:10px;z-index:5">
  <span class="mut row">${ic("chevronLeft", 18)}</span>
  <div class="col grow"><div class="sm b6">${title}</div><div class="eyebrow">${sub}</div></div>
  ${right ?? `<div class="row" style="gap:6px">${dot("ok")}<span class="xs mut2">12</span></div>`}
</div>`;
}

export function agendaRow({
  time,
  title,
  detail,
  tone,
  trailing,
  pad = "11px 16px",
}: {
  time: string;
  title: string;
  detail?: string;
  tone?: Tone;
  trailing?: IconName | "";
  pad?: string;
}): string {
  const detailClass = tone && tone !== "idle" ? `t-${tone}` : "mut2";
  const tail =
    trailing === ""
      ? ""
      : `<span class="mut2 row">${ic(trailing ?? "chevronRight", 15)}</span>`;
  return `<div class="row" style="padding:${pad};gap:11px">
  <div class="xs mut2" style="width:40px;flex:none">${time}</div>
  <div class="col grow" style="gap:1px"><div class="sm b5">${title}</div>${detail ? `<div class="xs ${detailClass}">${detail}</div>` : ""}</div>
  ${tail}
</div>`;
}

export function askBar(margin = "0 16px 14px"): string {
  return `<div class="row well" style="margin:${margin};height:46px;border:1px solid var(--color-hairline);border-radius:12px;padding:0 6px 0 13px;gap:10px">
  <span class="t-agent row">${ic("sparkle", 16)}</span>
  <div class="sm mut2 grow">Ask about your trip</div>
  <span class="btn btn-p" style="height:34px;width:34px;padding:0;border-radius:9px">${ic("mic", 16)}</span>
</div>`;
}

/** Sheet header: an eyebrow over a title, with a time on the right. */
export function sheetHead({
  eyebrow,
  eyebrowTone,
  title,
  value,
  valueNote,
}: {
  eyebrow: string;
  eyebrowTone?: Tone;
  title: string;
  value: string;
  valueNote: string;
}): string {
  return `<div class="row" style="padding:4px 16px 11px;gap:12px">
  <div class="col grow" style="gap:1px"><div class="eyebrow${eyebrowTone && eyebrowTone !== "idle" ? ` t-${eyebrowTone}` : ""}">${eyebrow}</div><div class="h2">${title}</div></div>
  <div class="col" style="align-items:flex-end;gap:1px"><div class="sm b6">${value}</div><div class="eyebrow">${valueNote}</div></div>
</div>`;
}

/** A plain in-app header bar under the status bar, for screens without a map. */
export function appBar({
  title,
  sub,
  back = true,
  right = "",
}: {
  title: string;
  sub?: string;
  back?: boolean;
  right?: string;
}): string {
  return `<div class="appbar row" style="height:56px;padding:0 16px;gap:10px">
  ${back ? `<span class="mut row">${ic("chevronLeft", 20)}</span>` : ""}
  <div class="col grow" style="gap:1px"><div class="h3" style="font-size:16px">${title}</div>${sub ? `<div class="eyebrow">${sub}</div>` : ""}</div>
  ${right}
</div>`;
}

/** Four sources in a row, each a dot and a count — the watch strip. */
export function watchStrip(
  cells: Array<{ name: string; tone: Tone; count: number }>,
): string {
  return `<div class="row" style="gap:6px">${cells
    .map(
      (c) =>
        `<div class="col grow card" style="padding:8px 10px;gap:3px"><div class="row" style="gap:6px">${dot(c.tone)}<span class="xs b5">${c.name}</span></div><span class="xs mut2">${c.count === 0 ? "Clear" : `${c.count} new`}</span></div>`,
    )
    .join("")}</div>`;
}
