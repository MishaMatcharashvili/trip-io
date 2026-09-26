import type { IconName } from "@/ui/icon";
import { icon } from "./art.tsx";

/**
 * The phone frame and the primitives every screen is built from. They mirror
 * `src/ui/` — card, sheet, chip, button, dot, eyebrow, field, nav — and use
 * tokens only, so a screen written once renders correctly in both frames.
 * No colour literal belongs here or in a screen; if one seems needed, the
 * token is missing from globals.css.
 */
export const kitCss = `
*{box-sizing:border-box}
html,body{margin:0}
body{font-family:'DM Sans',ui-sans-serif,system-ui,sans-serif;font-size:14px;line-height:1.45;-webkit-font-smoothing:antialiased;font-variant-numeric:tabular-nums;background:var(--color-backdrop);color:var(--color-ink)}
p{margin:0}
.board{display:flex;width:max-content}
.side{padding:18px 24px 26px;background:var(--color-backdrop);color:var(--color-ink)}
.side-cap{display:flex;align-items:center;gap:8px;height:22px;margin-bottom:10px;font-size:10.5px;font-weight:600;letter-spacing:.12em;text-transform:uppercase;color:var(--color-ink-faint)}
.side-cap b{color:var(--color-ink);letter-spacing:-.01em;text-transform:none;font-size:13px}
.phone{width:390px;height:844px;position:relative;overflow:hidden;background:var(--color-canvas);color:var(--color-ink);border-radius:28px;box-shadow:0 0 0 1px var(--color-hairline-strong),var(--shadow-lifted)}
.phone.short{height:auto;min-height:0}

.status{position:absolute;top:0;left:0;right:0;height:48px;display:flex;align-items:center;justify-content:space-between;padding:4px 26px 0 34px;font-size:15px;font-weight:600;letter-spacing:-.01em;z-index:20}
.status .sig{display:flex;gap:6px;align-items:center}
.status .dim{opacity:.3}
.home-ind{position:absolute;bottom:8px;left:50%;width:134px;height:5px;margin-left:-67px;border-radius:99px;background:var(--color-ink);z-index:30}

.tabs{position:absolute;left:0;right:0;bottom:0;height:82px;background:var(--color-surface);border-top:1px solid var(--color-hairline);display:flex;padding:9px 8px 24px;z-index:15}
.tab{flex:1;display:flex;flex-direction:column;align-items:center;gap:4px;color:var(--color-ink-faint);font-size:10.5px;position:relative}
.tab.on{color:var(--color-agent);font-weight:600}
.tab .badge{position:absolute;top:-1px;left:calc(50% + 5px);width:8px;height:8px;border-radius:99px;background:var(--color-alert);box-shadow:0 0 0 2px var(--color-surface)}

.row{display:flex;flex-direction:row;align-items:center}
.col{display:flex;flex-direction:column}
.top{align-items:flex-start}
.grow{flex:1;min-width:0}
.abs{position:absolute}
.fill{position:absolute;inset:0}
.wrap{flex-wrap:wrap}
.between{justify-content:space-between}
.center{justify-content:center}
.shrink-0{flex-shrink:0}

.eyebrow{font-size:10px;font-weight:600;letter-spacing:.12em;text-transform:uppercase;color:var(--color-ink-faint)}
.h1{font-size:28px;font-weight:600;letter-spacing:-.03em;line-height:1.14}
.h2{font-size:19px;font-weight:600;letter-spacing:-.024em;line-height:1.22}
.h3{font-size:14.5px;font-weight:600;letter-spacing:-.014em;line-height:1.35}
.body{font-size:14px}
.sm{font-size:12.5px}
.xs{font-size:11.5px}
.b5{font-weight:500}
.b6{font-weight:600}
.mut{color:var(--color-ink-muted)}
.mut2{color:var(--color-ink-faint)}
.t-agent{color:var(--color-agent)}
.t-alert{color:var(--color-alert)}
.t-ok{color:var(--color-ok)}
.strike{text-decoration:line-through;color:var(--color-ink-faint)}
.link{color:var(--color-agent);font-weight:500}
.brand{font-size:16px;font-weight:700;letter-spacing:-.035em}

.card{background:var(--color-surface);border:1px solid var(--color-hairline);border-radius:10px}
.float{background:var(--color-surface);border:1px solid var(--color-hairline-strong);border-radius:13px;box-shadow:var(--shadow-panel)}
.clip{overflow:hidden}
.sheet{position:absolute;left:0;right:0;background:var(--color-surface);border-top:1px solid var(--color-hairline);border-radius:18px 18px 0 0;box-shadow:var(--shadow-sheet);display:flex;flex-direction:column;overflow:hidden}
.grab{display:flex;justify-content:center;padding:8px 0 4px}
.grab::after{content:"";width:36px;height:4px;border-radius:99px;background:var(--color-control)}
.appbar{position:absolute;top:48px;left:0;right:0;background:var(--color-surface);border-bottom:1px solid var(--color-hairline);z-index:5}
.hr{height:1px;background:var(--color-hairline);flex:none}
.hr-soft{border-top:1px solid var(--color-track)}
.well{background:var(--color-surface-subtle)}
.tint-a{background:var(--color-agent-tint);border-color:var(--color-agent-line)}
.tint-w{background:var(--color-alert-tint);border-color:var(--color-alert-line)}
.tint-o{background:var(--color-ok-tint);border-color:var(--color-ok-line)}
.line-a{border-color:var(--color-agent-line)}
.line-w{border-color:var(--color-alert-line)}
.line-o{border-color:var(--color-ok-line)}
.canvas{background:var(--color-canvas)}
.wash{position:absolute;inset:0;background:linear-gradient(180deg,color-mix(in srgb,var(--color-canvas) 20%,transparent),color-mix(in srgb,var(--color-canvas) 92%,transparent) 70%)}
.veil{position:absolute;inset:0;background:color-mix(in srgb,var(--color-canvas) 45%,transparent)}
.map{position:absolute;inset:0;overflow:hidden}
.map svg{width:100%;height:100%;display:block}

.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;height:40px;padding:0 15px;border-radius:9px;font-size:13px;font-weight:500;border:1px solid transparent;white-space:nowrap}
.btn-p{background:var(--color-agent);color:var(--color-on-accent)}
.btn-s{background:var(--color-surface);border-color:var(--color-control);color:var(--color-ink)}
.btn-g{background:transparent;color:var(--color-ink-muted)}
.btn-lg{height:48px;font-size:14.5px;border-radius:11px;width:100%}
.btn-sm{height:32px;font-size:12px;padding:0 11px;border-radius:8px}
.btn-icon{width:38px;height:38px;padding:0;border-radius:10px}

.chip{display:inline-flex;align-items:center;gap:6px;height:26px;padding:0 10px;border-radius:99px;border:1px solid var(--color-hairline);background:var(--color-surface);font-size:11.5px;color:var(--color-ink-muted);white-space:nowrap}
.chip-sm{height:20px;font-size:10px;padding:0 8px}
.chip-a{background:var(--color-agent-tint);border-color:var(--color-agent-line);color:var(--color-agent)}
.chip-w{background:var(--color-alert-tint);border-color:var(--color-alert-line);color:var(--color-alert)}
.chip-o{background:var(--color-ok-tint);border-color:var(--color-ok-line);color:var(--color-ok)}
.chip-on{background:var(--color-ink);border-color:var(--color-ink);color:var(--color-canvas)}

.dot{width:6px;height:6px;border-radius:99px;flex:none;background:var(--color-ink-idle)}
.dot.lg{width:8px;height:8px}
.d-agent{background:var(--color-agent)}
.d-alert{background:var(--color-alert)}
.d-ok{background:var(--color-ok)}
.d-ring{background:var(--color-surface);border:1.5px solid var(--color-ink-idle)}
.d-ring-w{background:var(--color-surface);border:1.5px solid var(--color-alert-bright)}
.mt{margin-top:6px}

.tg{width:34px;height:20px;border-radius:99px;background:var(--color-fill-strong);padding:2px;display:flex;flex:none}
.tg::after{content:"";width:16px;height:16px;border-radius:99px;background:var(--color-knob);box-shadow:0 1px 2px rgba(0,0,0,.12)}
.tg.on{background:var(--color-agent);justify-content:flex-end}
.rd{width:17px;height:17px;border-radius:99px;border:1.5px solid var(--color-control);flex:none}
.rd.on{border:5px solid var(--color-agent);background:var(--color-surface)}
.seg{display:flex;gap:2px;padding:3px;background:var(--color-track-pill);border-radius:10px}
.seg>div{flex:1;height:30px;display:flex;align-items:center;justify-content:center;gap:6px;border-radius:8px;font-size:12.5px;color:var(--color-ink-muted)}
.seg>.on{background:var(--color-surface);color:var(--color-ink);font-weight:500;box-shadow:var(--shadow-card)}

.field{display:flex;flex-direction:column;gap:6px}
.label{font-size:12.5px;font-weight:500}
.input{height:46px;border:1px solid var(--color-control);border-radius:10px;background:var(--color-surface);padding:0 13px;display:flex;align-items:center;gap:8px;font-size:14px}
.input.ph{color:var(--color-ink-faint)}
.input.focus{border-color:var(--color-agent);box-shadow:0 0 0 3px var(--color-agent-tint)}
.caret{display:inline-block;width:1.5px;height:17px;background:var(--color-agent);margin-left:2px;vertical-align:-3px}

.rule{display:flex;align-items:center;gap:10px}
.rule::after{content:"";flex:1;height:1px;background:var(--color-hairline)}
.skel{height:8px;border-radius:4px;background:var(--color-fill)}
.icon-tile{width:38px;height:38px;border-radius:10px;display:flex;align-items:center;justify-content:center;flex:none;background:var(--color-canvas);border:1px solid var(--color-hairline);color:var(--color-ink-muted)}
.icon-tile.a{background:var(--color-agent-tint);border-color:var(--color-agent-line);color:var(--color-agent)}
.bars{display:flex;gap:3px;align-items:flex-end}
.bars>div{flex:1;border-radius:2px;background:var(--color-fill-strong)}
.bars>.w1{background:var(--color-alert-soft)}
.bars>.w2{background:var(--color-alert-bright)}
.shape{display:flex;gap:2px;height:8px}
.shape>div{border-radius:2px;background:var(--color-fill-strong)}
.shape>.empty{background:var(--color-track)}
.shape>.agent{background:var(--color-agent)}
.shape>.agent-soft{background:var(--color-agent-soft)}
.shape>.alert{background:var(--color-alert-bright)}
.pad{padding:0 16px}
`;

export const ic = icon;

/** The iOS status bar. Offline dims the signal and drops the wifi glyph. */
export function statusBar(time = "14:52", { offline = false } = {}): string {
  const signal = `<svg width="17" height="11" viewBox="0 0 17 11" fill="currentColor"${offline ? ' class="dim"' : ""}><rect x="0" y="7" width="3" height="4" rx="1"/><rect x="4.5" y="5" width="3" height="6" rx="1"/><rect x="9" y="2.5" width="3" height="8.5" rx="1"/><rect x="13.5" y="0" width="3" height="11" rx="1"/></svg>`;
  const wifi = offline
    ? ""
    : `<svg width="15" height="11" viewBox="0 0 15 11" fill="currentColor"><path d="M7.5 2.2c2.2 0 4.2.8 5.7 2.2l1.1-1.2A10 10 0 0 0 7.5.5 10 10 0 0 0 .7 3.2l1.1 1.2a8.3 8.3 0 0 1 5.7-2.2z"/><path d="M7.5 5.4c1.3 0 2.5.5 3.4 1.3l1.1-1.2a6.6 6.6 0 0 0-9 0l1.1 1.2c.9-.8 2.1-1.3 3.4-1.3z"/><path d="M9.5 8 7.5 10.4 5.5 8a3 3 0 0 1 4 0z"/></svg>`;
  const battery = `<svg width="25" height="12" viewBox="0 0 25 12"><rect x=".5" y=".5" width="21" height="11" rx="3.2" fill="none" stroke="currentColor" opacity=".4"/><rect x="2" y="2" width="15" height="8" rx="2" fill="currentColor"/><path d="M23 4v4a2 2 0 0 0 0-4z" fill="currentColor" opacity=".45"/></svg>`;
  return `<div class="status"><span>${time}</span><span class="sig">${signal}${wifi}${battery}</span></div>`;
}

export const homeIndicator = `<div class="home-ind"></div>`;

type Tab = { label: string; icon: IconName };

const tabSets = {
  // `src/ui/nav.tsx` — tripTabs and homeTabs.
  trip: [
    { label: "Today", icon: "calendar" },
    { label: "Map", icon: "map" },
    { label: "Trip", icon: "list" },
    { label: "AI", icon: "sparkle" },
  ],
  home: [
    { label: "Trips", icon: "route" },
    { label: "Explore", icon: "explore" },
    { label: "Saved", icon: "bookmark" },
    { label: "Profile", icon: "user" },
  ],
} satisfies Record<string, Tab[]>;

export function tabBar(
  set: keyof typeof tabSets,
  active: string,
  badge?: string,
): string {
  const tabs = tabSets[set]
    .map(
      (t) =>
        `<div class="tab${t.label === active ? " on" : ""}">${icon(t.icon, 22, t.label === active ? 1.8 : 1.6)}<span>${t.label}</span>${t.label === badge ? '<span class="badge"></span>' : ""}</div>`,
    )
    .join("");
  return `<nav class="tabs">${tabs}</nav>`;
}

export type Tone = "agent" | "alert" | "ok" | "idle";

export function dot(tone: Tone, extra = ""): string {
  return `<span class="dot${tone === "idle" ? "" : ` d-${tone}`}${extra ? ` ${extra}` : ""}"></span>`;
}

export function rule(label: string, tone?: Tone): string {
  return `<div class="rule"><span class="eyebrow${tone && tone !== "idle" ? ` t-${tone}` : ""}">${label}</span></div>`;
}

export function toggle(on: boolean): string {
  return `<span class="tg${on ? " on" : ""}"></span>`;
}

export function radio(on: boolean): string {
  return `<span class="rd${on ? " on" : ""}"></span>`;
}

/** The word mark from `src/features/chrome.tsx`. */
export function brand(size = 20): string {
  return `<div class="row" style="gap:9px"><span class="t-agent row">${icon("signal", size)}</span><span class="brand">trip.io</span></div>`;
}

/** Join rows with hairlines between them, the way every list card does. */
export function divided(rows: string[], hr = '<div class="hr"></div>'): string {
  return rows.join(hr);
}
