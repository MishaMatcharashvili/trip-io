import { basemap } from "../art.tsx";
import { dot, homeIndicator, ic, statusBar, tabBar } from "../kit.ts";
import type { Flow } from "../page.ts";
import {
  agendaRow,
  askBar,
  sheetHead,
  tripHeader,
  watchStrip,
} from "./shared.ts";

/** Active trip: the map with the day over it, in its three watch states. */
export const active: Flow = {
  slug: "active-trip",
  group: "Active trip",
  screens: [
    {
      slug: "map",
      title: "Active trip · map",
      note: "The map is the canvas. The day's one disruption floats over it; the next stop and the ask bar sit in the sheet.",
      render: (t) => `
<div class="map">${basemap("route", t)}</div>
${statusBar("10:48")}
${tripHeader({ title: "Georgia · Day 3", sub: "Gudauri → Kazbegi" })}
<div class="abs float col clip line-w" style="top:112px;left:12px;right:12px;z-index:5">
  <div class="row" style="padding:12px 14px 0;gap:8px">
    <span class="t-alert row">${ic("rain", 15)}</span>
    <div class="eyebrow t-alert grow">Affects your 16:00</div>
    <span class="mut2 row">${ic("close", 15)}</span>
  </div>
  <div class="col" style="padding:6px 14px 13px;gap:10px">
    <div class="h3" style="font-size:16.5px">Rain starts 15:30 in Kazbegi</div>
    <div class="sm mut">Your Gergeti hike sits in the 12 mm window. Moving it to <span class="b5" style="color:var(--color-ink)">11:30</span> keeps it dry and shifts the museum to the afternoon.</div>
    <div class="row" style="gap:8px">
      <span class="btn btn-p grow" style="height:44px;border-radius:10px">Replan my day</span>
      <span class="btn btn-s" style="height:44px;border-radius:10px">Why?</span>
    </div>
  </div>
</div>
<div class="sheet" style="bottom:82px;z-index:6">
  <div class="grab"></div>
  ${sheetHead({ eyebrow: "Now", eyebrowTone: "agent", title: "Driving to Kazbegi", value: "11:20", valueNote: "24 km left" })}
  <div class="hr" style="margin:0 16px"></div>
  ${agendaRow({ time: "16:00", title: "Gergeti Trinity hike", detail: "1 conflict · inside the rain window", tone: "alert" })}
  <div class="row" style="padding:0 16px 10px;gap:8px">
    <span class="chip">3 done</span><span class="chip">3 left today</span>
    <div class="grow"></div><span class="xs link">Expand itinerary</span>
  </div>
  ${askBar()}
</div>
${tabBar("trip", "Map", "AI")}
${homeIndicator}`,
    },
    {
      slug: "all-clear",
      title: "Active trip · nothing to report",
      note: "The state most days show. It says what was checked and when, and promises to interrupt, so quiet reads as deliberate.",
      render: (t) => `
<div class="map">${basemap("clear", t)}</div>
${statusBar("13:52")}
${tripHeader({ title: "Georgia · Day 5", sub: "Juta valley · Sno" })}
<div class="abs float col clip line-o" style="top:112px;left:12px;right:12px;z-index:5">
  <div class="row tint-o" style="padding:10px 14px;gap:9px;border-bottom:1px solid var(--color-ok-line)">
    <span class="t-ok row">${ic("check", 15, 2.2)}</span>
    <div class="eyebrow t-ok grow">Nothing needs you</div>
    <span class="xs mut2">Checked 13:48</span>
  </div>
  <div class="col" style="padding:13px 14px 14px;gap:11px">
    <div class="h2">All clear for the rest of today</div>
    <div class="sm mut">Weather, roads, transport and local events along your route all hold. If that changes, I will tell you — you don't need to check.</div>
    ${watchStrip([
      { name: "Weather", tone: "ok", count: 0 },
      { name: "Roads", tone: "ok", count: 0 },
      { name: "Transport", tone: "ok", count: 0 },
      { name: "Nearby", tone: "ok", count: 0 },
    ])}
  </div>
</div>
<div class="sheet" style="bottom:82px;z-index:6">
  <div class="grab"></div>
  ${sheetHead({ eyebrow: "Now", eyebrowTone: "agent", title: "Lunch · Fifth Season", value: "15:00", valueNote: "No rush" })}
  <div class="hr" style="margin:0 16px"></div>
  ${agendaRow({ time: "16:00", title: "Drive back to Stepantsminda", detail: "35 min · road clear" })}
  <div class="hr" style="margin:0 16px"></div>
  ${agendaRow({ time: "19:00", title: "Dinner · Rooms Kazbegi", detail: "Indoors" })}
  ${askBar("4px 16px 14px")}
</div>
${tabBar("trip", "Map")}
${homeIndicator}`,
    },
    {
      slug: "watch-paused",
      title: "Active trip · watch paused",
      note: "Offline. It says it stopped watching, timestamps every source as last known, and never pretends the plan is still monitored.",
      render: (t) => `
<div class="map" style="opacity:.55">${basemap("route", t)}</div>
<div class="veil"></div>
${statusBar("11:21", { offline: true })}
${tripHeader({
  title: "Georgia · Day 3",
  sub: "Gudauri → Kazbegi",
  right: `<span class="chip">${dot("idle")}Paused</span>`,
})}
<div class="abs float col clip" style="top:112px;left:12px;right:12px;z-index:5">
  <div class="col" style="padding:16px 16px 14px;gap:10px">
    <div class="row mut2" style="gap:9px">${ic("offline", 16)}<span class="eyebrow">Watch layer paused</span></div>
    <div class="h2" style="font-size:20px">I stopped watching at 10:34</div>
    <div class="sm mut">No connection since you left Gudauri. Your itinerary is all here, but I can't see weather, roads or transport until you're back online — treat everything below as last known, not current.</div>
    <div class="row" style="gap:9px">
      <span class="btn btn-p grow" style="height:44px">Try again</span>
      <span class="btn btn-s" style="height:44px">Dismiss</span>
    </div>
  </div>
  <div class="hr"></div>
  <div class="col" style="padding:6px 16px 8px">
    ${[
      ["Weather", "10:34"],
      ["Roads", "10:31"],
      ["Transport", "10:18"],
      ["Local events", "09:50"],
    ]
      .map(
        ([name, at], i) =>
          `<div class="row${i ? " hr-soft" : ""}" style="gap:10px;padding:8px 0">${dot("idle")}<span class="sm mut grow">${name}</span><span class="xs mut2">Last seen ${at}</span></div>`,
      )
      .join("")}
  </div>
</div>
<div class="sheet" style="bottom:82px;z-index:6">
  <div class="grab"></div>
  ${sheetHead({ eyebrow: "Your plan, as of 10:34", title: "Driving to Kazbegi", value: "11:20", valueNote: "Estimated" })}
  <div class="hr" style="margin:0 16px"></div>
  ${agendaRow({ time: "16:00", title: "Gergeti Trinity hike", detail: "Rain was forecast from 15:30 — unverified since", trailing: "" })}
  <div class="hr" style="margin:0 16px"></div>
  ${agendaRow({ time: "19:30", title: "Dinner · Cafe 5047m", detail: "Booked", trailing: "", pad: "11px 16px 16px" })}
</div>
${tabBar("trip", "Map")}
${homeIndicator}`,
    },
  ],
};
