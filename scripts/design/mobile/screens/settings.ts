import { basemap } from "../art.tsx";
import {
  dot,
  homeIndicator,
  ic,
  radio,
  rule,
  statusBar,
  tabBar,
  toggle,
} from "../kit.ts";
import type { Flow } from "../page.ts";
import { appBar } from "./shared.ts";

/** Signal over noise as a user control: sources, budget, quiet hours, versions, and how a push looks. */

function settingRow(
  title: string,
  sub: string | null,
  control: string,
  muted = false,
): string {
  return `<div class="row" style="padding:9px 14px;gap:12px"><div class="col grow" style="gap:1px"><div class="sm b5${muted ? " mut" : ""}">${title}</div>${sub ? `<div class="xs mut2">${sub}</div>` : ""}</div>${control}</div>`;
}

function notification({
  at,
  title,
  body,
  tone = "agent",
  actions,
  faded = false,
}: {
  at: string;
  title: string;
  body: string;
  tone?: "agent" | "alert";
  actions?: [string, string];
  faded?: boolean;
}): string {
  return `<div class="col clip" style="background:color-mix(in srgb,var(--color-surface) 90%,transparent);backdrop-filter:blur(14px);border:1px solid var(--color-hairline-strong);border-radius:16px;box-shadow:var(--shadow-notification)${faded ? ";opacity:.82" : ""}">
  <div class="row top" style="padding:12px 14px;gap:11px">
    <span class="row center" style="width:32px;height:32px;border-radius:8px;background:var(--color-${tone});color:var(--color-on-accent);flex:none">${ic(tone === "alert" ? "warning" : "signal", 16, 2)}</span>
    <div class="col grow" style="gap:2px"><div class="row"><span class="xs b6 grow">trip.io</span><span class="xs mut2">${at}</span></div><div class="sm b6">${title}</div><div class="xs mut">${body}</div></div>
  </div>
  ${actions ? `<div class="row" style="border-top:1px solid var(--color-hairline)"><div class="row center grow sm b6 t-agent" style="height:40px;border-right:1px solid var(--color-hairline)">${actions[0]}</div><div class="row center grow sm mut" style="height:40px">${actions[1]}</div></div>` : ""}
</div>`;
}

export const settings: Flow = {
  slug: "settings",
  group: "Settings",
  screens: [
    {
      slug: "what-i-watch",
      title: "What I watch",
      note: "Which sources, and how much to tell you. Safety advisories can be turned off and say when they were.",
      render: () => `
${statusBar("20:20")}
${appBar({ title: "What I watch", sub: "Georgia · 14 – 20 Sep", right: `<span class="chip chip-o">${dot("ok")}On</span>` })}
<div class="abs col" style="top:106px;left:0;right:0;bottom:82px;padding:14px 16px 0;gap:14px;overflow:hidden">
  <div class="col" style="gap:8px">
    ${rule("Sources")}
    <div class="card col clip">
      ${[
        settingRow(
          "Weather",
          "Forecast shifts that hit an outdoor plan",
          toggle(true),
        ),
        settingRow(
          "Roads and closures",
          "Only on roads you will actually drive",
          toggle(true),
        ),
        settingRow("Transport", "Marshrutkas, trains, strikes", toggle(true)),
        settingRow(
          "Opening hours",
          "Re-checked the day before you arrive",
          toggle(true),
        ),
        settingRow(
          "Local events",
          "Festivals and closures near your stops",
          toggle(true),
        ),
        settingRow(
          "Safety advisories",
          "Off — you turned these off on 15 Sep",
          toggle(false),
          true,
        ),
      ].join('<div class="hr"></div>')}
    </div>
  </div>
  <div class="col" style="gap:8px">
    ${rule("How much to tell you")}
    <div class="card col clip">
      <div class="row top tint-a" style="padding:10px 14px;gap:11px">${radio(true)}<div class="col grow" style="gap:1px"><div class="sm b6">Only what affects my plan</div><div class="xs mut">The default. Roughly one or two a day.</div></div></div>
      <div class="hr"></div>
      <div class="row top" style="padding:10px 14px;gap:11px">${radio(false)}<div class="col grow" style="gap:1px"><div class="sm b5">Anything happening nearby</div><div class="xs mut2">More findings, more noise</div></div></div>
    </div>
  </div>
  <div class="card row" style="padding:11px 14px;gap:12px"><span class="mut row">${ic("clock", 17)}</span><div class="col grow" style="gap:1px"><span class="sm b5">Quiet hours and interrupts</span><span class="xs mut2">22:00 – 07:00 · 1 of 4 interrupts used</span></div><span class="mut2 row">${ic("chevronRight", 15)}</span></div>
</div>
${tabBar("trip", "AI")}
${homeIndicator}`,
    },
    {
      slug: "quiet-hours",
      title: "Quiet hours & interrupts",
      note: "The interrupt budget made visible: a cap per trip, the two-hour rule, and a quiet window only urgent disruptions can cross.",
      render: () => {
        // 24 hours from 12:00, so the overnight quiet window is one block.
        const hours = Array.from({ length: 24 }, (_, i) => (12 + i) % 24);
        const quiet = (h: number) => h >= 22 || h < 7;
        return `
${statusBar("20:21")}
${appBar({ title: "Quiet hours &amp; interrupts", sub: "Georgia · 14 – 20 Sep" })}
<div class="abs col" style="top:106px;left:0;right:0;bottom:0;padding:14px 16px 0;gap:14px;overflow:hidden">
  <div class="col" style="gap:8px">
    ${rule("Interrupts on this trip")}
    <div class="card col" style="padding:14px;gap:12px">
      <div class="row" style="gap:12px">
        <div class="col grow" style="gap:1px"><span class="h2" style="font-size:22px">1 of 4 used</span><span class="xs mut2">Rain at Kazbegi, today 10:48</span></div>
        <div class="row" style="gap:5px">${[1, 0, 0, 0].map((u) => `<span style="width:10px;height:22px;border-radius:3px;background:var(--color-${u ? "agent" : "track"})"></span>`).join("")}</div>
      </div>
      <div class="row top canvas" style="gap:9px;padding:9px 11px;border-radius:8px"><span class="mut2 row" style="padding-top:1px">${ic("info", 14)}</span><span class="xs mut">I only interrupt for something inside the next two hours. Everything later waits for the morning briefing.</span></div>
    </div>
    <div class="card col clip">
      ${[
        ["Fewer", "3 on a 7-day trip", false],
        ["Standard", "4 on a 7-day trip · the default", true],
        ["More", "5 on a 7-day trip", false],
      ]
        .map(
          ([t, s, on]) =>
            `<div class="row${on ? " tint-a" : ""}" style="padding:10px 14px;gap:11px">${radio(on as boolean)}<span class="sm ${on ? "b6" : "b5"}" style="width:72px">${t}</span><span class="xs mut grow">${s}</span></div>`,
        )
        .join('<div class="hr"></div>')}
    </div>
  </div>
  <div class="col" style="gap:8px">
    ${rule("Quiet hours")}
    <div class="card col" style="padding:14px;gap:12px">
      <div class="col" style="gap:5px">
        <div class="row" style="gap:2px;height:20px">${hours.map((h) => `<div class="grow" style="height:100%;border-radius:2px;background:var(--color-${quiet(h) ? "ink-idle" : "track"})"></div>`).join("")}</div>
        <div class="row between"><span class="eyebrow">12</span><span class="eyebrow">18</span><span class="eyebrow">00</span><span class="eyebrow">06</span><span class="eyebrow">12</span></div>
      </div>
      <div class="row" style="gap:10px">
        <div class="col grow" style="gap:4px"><span class="xs mut2">From</span><div class="input" style="height:40px"><span class="b6">22:00</span></div></div>
        <div class="col grow" style="gap:4px"><span class="xs mut2">Until</span><div class="input" style="height:40px"><span class="b6">07:00</span></div></div>
      </div>
      <div class="row" style="gap:12px"><div class="col grow" style="gap:1px"><span class="sm b5">Let urgent disruptions through</span><span class="xs mut2">A closed road before an early start</span></div>${toggle(true)}</div>
    </div>
  </div>
  <div class="col" style="gap:8px">
    ${rule("Morning briefing")}
    <div class="card col clip">
      ${settingRow("Time", null, '<span class="sm b6">07:30</span>')}
      <div class="hr"></div>
      ${settingRow("Push", null, toggle(true))}
      <div class="hr"></div>
      ${settingRow("Email", null, toggle(true))}
    </div>
  </div>
</div>
${homeIndicator}`;
      },
    },
    {
      slug: "versions",
      title: "Versions · undo history",
      note: "The patch log as the traveller sees it. Undo and restore add a version on top — nothing is ever erased.",
      render: () => `
${statusBar("20:22")}
${appBar({ title: "Versions of your trip", sub: "Georgia · every change is kept" })}
<div class="abs col" style="top:106px;left:0;right:0;bottom:82px;padding:14px 16px 0;gap:12px;overflow:hidden">
  <div class="card col line-a" style="padding:13px 14px;gap:6px;box-shadow:var(--shadow-agent)">
    <div class="row" style="gap:8px"><span class="chip chip-a chip-sm">Current</span><span class="xs mut2 grow">Today 10:50</span></div>
    <div class="sm b6">Rain replan · 2 stops moved</div>
    <div class="xs mut">Hike 16:00 → 11:30, lunch 12:30 → 14:45. You applied it from the briefing.</div>
    <div class="row" style="gap:10px;padding-top:4px"><span class="xs mut2 grow">Undo until 10:50 tomorrow</span><span class="btn btn-s btn-sm">${ic("revert", 14)}Undo</span></div>
  </div>
  ${rule("Earlier")}
  <div class="card col clip">
    ${[
      ["Yesterday 20:12", "You moved dinner to 19:30", "By you"],
      [
        "Yesterday 11:42",
        "Swapped Jvari and Svetitskhoveli",
        "Suggested · you applied",
      ],
      ["15 Sep 09:05", "Trip saved · watch layer on", "Account created"],
      ["14 Sep 21:40", "Trip built from one sentence", "7 days · 31 places"],
    ]
      .map(
        ([at, title, by]) =>
          `<div class="row" style="padding:11px 14px;gap:12px"><span class="dot d-ring"></span><div class="col grow" style="gap:1px"><div class="sm b5">${title}</div><div class="xs mut2">${at} · ${by}</div></div><span class="btn btn-g btn-sm">Restore</span></div>`,
      )
      .join('<div class="hr"></div>')}
  </div>
  <div class="row top card" style="padding:11px 13px;gap:10px;background:var(--color-surface-subtle)"><span class="mut2 row" style="padding-top:1px">${ic("info", 14)}</span><span class="xs mut">Undo and restore never erase anything. They add a new version on top, so you can always get back to where you were.</span></div>
</div>
${tabBar("trip", "Trip")}
${homeIndicator}`,
    },
    {
      slug: "push-lock-screen",
      title: "Push · on the lock screen",
      note: "How an alert reaches you. Only disruptions and the morning briefing push; opportunities wait until you open the app.",
      render: (t) => `
<div class="map">${basemap("clear", t)}</div>
<div class="veil" style="background:color-mix(in srgb,var(--color-canvas) 68%,transparent)"></div>
${statusBar("")}
<div class="abs col" style="top:48px;left:0;right:0;bottom:0;padding:0 12px">
  <div class="col" style="align-items:center;padding:26px 0 30px;gap:2px">
    <span class="sm b5 mut">Wednesday 16 September</span>
    <span style="font-size:78px;font-weight:600;letter-spacing:-.04em;line-height:1">10:48</span>
  </div>
  <div class="col" style="gap:10px">
    ${notification({ at: "now", title: "Rain at 15:30 — move your hike?", body: "Your 16:00 Gergeti hike is inside a 12 mm window. I can put it at 11:30, lunch at 14:45.", actions: ["Apply", "Keep plan"] })}
    ${notification({ at: "07:30", title: "Good morning — day 3", body: "Dry until mid-afternoon, roads open, one change worth making. Tap for the briefing." })}
    ${notification({ at: "yesterday", tone: "alert", title: "Jvari closes early for a service", body: "I can swap it with Svetitskhoveli — they are five minutes apart.", faded: true })}
  </div>
  <div class="grow"></div>
  <div class="row top card" style="margin-bottom:34px;padding:11px 13px;gap:10px"><span class="t-agent row" style="padding-top:1px">${ic("signal", 15)}</span><span class="xs mut">Only disruptions and the morning briefing push. Opportunities wait until you open the app.</span></div>
</div>
${homeIndicator}`,
    },
  ],
};
