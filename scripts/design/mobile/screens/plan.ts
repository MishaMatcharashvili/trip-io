import { basemap } from "../art.tsx";
import { brand, dot, homeIndicator, ic, rule, statusBar } from "../kit.ts";
import type { Flow } from "../page.ts";

/** From a sentence to a trip, and what it costs to have it watched. */

// `src/app/new/page.tsx` — what the agent understood from the sentence.
const understood = [
  ["Region", "Georgia", "Kazbegi · Kakheti · Tbilisi"],
  ["Length", "7 days", "Dates not set yet"],
  ["Budget", "€700", "Excl. flights"],
  ["Interests", "Nature, monasteries", "Moderate hiking"],
  ["Travellers", "You + father", "Relaxed pace assumed"],
];

export const plan: Flow = {
  slug: "plan-a-trip",
  group: "Plan a trip",
  screens: [
    {
      slug: "trip-creation",
      title: "Trip creation",
      note: "The sentence, and what the agent understood from it, laid out to correct before anything is built.",
      render: (t) => `
<div class="abs" style="top:0;left:0;right:0;height:260px;overflow:hidden"><div class="map">${basemap("weather", t)}</div><div class="wash"></div></div>
${statusBar("09:44")}
<div class="abs col" style="top:48px;left:0;right:0;bottom:0;padding:0 16px">
  <div class="row" style="padding:8px 0 0;gap:10px"><span class="mut row">${ic("close", 20)}</span><div class="grow"></div><span class="chip">${dot("agent")}New trip</span></div>
  <div class="h1" style="padding:18px 0 12px;font-size:26px">Where do you want to go?</div>
  <div class="card col" style="padding:14px;gap:11px;box-shadow:var(--shadow-panel)">
    <div style="font-size:15px;line-height:1.5">7 days in Georgia, €700 budget, nature + monasteries, travelling with my father.<span class="caret"></span></div>
    <div class="row wrap" style="gap:6px">${["+ Dates", "+ Arriving by", "+ Pace", "+ Mobility needs"].map((c) => `<span class="chip">${c}</span>`).join("")}</div>
    <div class="hr"></div>
    <div class="row" style="gap:9px"><span class="mut2 row">${ic("mic", 16)}</span><span class="xs mut2 grow">Or say it out loud</span></div>
  </div>
  <div class="row top" style="gap:8px;padding:16px 2px 10px"><span class="t-agent row">${ic("sparkle", 15)}</span><span class="sm b5">Here is what I understood — correct anything before I build it</span></div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
    ${understood
      .map(
        ([label, value, note], i) =>
          `<div class="card col" style="padding:10px 12px;gap:2px${i === understood.length - 1 ? ";grid-column:span 2" : ""}"><span class="eyebrow">${label}</span><span class="sm b6">${value}</span><span class="xs mut2">${note}</span></div>`,
      )
      .join("")}
  </div>
  <div class="grow"></div>
  <div class="col" style="gap:4px;padding-bottom:24px">
    <span class="btn btn-p btn-lg">${ic("sparkle", 16)}Plan my trip</span>
    <span class="btn btn-g" style="height:36px">Start from a saved route</span>
  </div>
</div>
${homeIndicator}`,
    },
    {
      slug: "building",
      title: "Building your trip",
      note: "About a minute. It names what it is doing rather than spinning, and lands days as they finish.",
      render: (t) => {
        const steps = [
          [
            "done",
            "Shaped seven days around Kazbegi and Kakheti",
            "Driving days kept under 2 hours",
          ],
          [
            "done",
            "Picked 31 places against your €700 budget",
            "Tracking at €640 including food",
          ],
          [
            "running",
            "Checking opening hours and seasonal closures",
            "19 of 31 verified",
          ],
          [
            "waiting",
            "Setting up the watch layer for your route",
            "Weather, roads, transport, events",
          ],
        ];
        const marker = (state: string) =>
          state === "done"
            ? `<span class="row center" style="width:18px;height:18px;border-radius:99px;background:var(--color-agent);color:var(--color-on-accent);flex:none">${ic("check", 11, 2.6)}</span>`
            : state === "running"
              ? `<span style="width:18px;height:18px;border-radius:99px;border:2px solid var(--color-agent-soft);border-top-color:var(--color-agent);flex:none"></span>`
              : `<span style="width:18px;height:18px;border-radius:99px;border:1.5px solid var(--color-control);flex:none"></span>`;
        const dayCard = (day: string, place: string, nodes: string[][]) =>
          `<div class="card col" style="padding:11px 13px;gap:7px"><div class="row" style="gap:8px"><span class="eyebrow">${day}</span><span class="sm b6">${place}</span></div>${nodes.map(([time, title]) => `<div class="row" style="gap:10px"><span class="xs mut2" style="width:36px">${time}</span><span class="sm">${title}</span></div>`).join("")}</div>`;
        return `
<div class="abs" style="top:0;left:0;right:0;height:300px;overflow:hidden;opacity:.7"><div class="map">${basemap("calm", t)}</div><div class="wash"></div></div>
${statusBar("09:45")}
<div class="abs col" style="top:48px;left:0;right:0;bottom:0;padding:0 16px;gap:12px">
  <div class="row" style="padding:8px 0 0">${brand(17)}<div class="grow"></div><span class="btn btn-g btn-sm">Cancel</span></div>
  <div class="float col" style="padding:16px;gap:12px;border-radius:14px">
    <div class="row t-agent" style="gap:8px">${ic("sparkle", 15)}<span class="eyebrow t-agent">Building your trip</span></div>
    <div class="h2" style="font-size:22px">Seven days in Georgia, nature and monasteries</div>
    <div class="xs mut">About a minute. You can leave — I will finish and email you.</div>
    <div style="height:4px;border-radius:99px;background:var(--color-track);overflow:hidden"><div style="width:62%;height:100%;background:var(--color-agent);border-radius:99px"></div></div>
    <div class="col" style="gap:10px">
      ${steps
        .map(
          ([state, title, note]) =>
            `<div class="row top" style="gap:11px${state === "waiting" ? ";opacity:.55" : ""}">${marker(state)}<div class="col grow" style="gap:1px"><div class="sm ${state === "running" ? "b6" : "b5"}">${title}</div><div class="xs ${state === "running" ? "t-agent" : "mut2"}">${note}</div></div></div>`,
        )
        .join("")}
    </div>
  </div>
  ${rule("Days as they land")}
  ${dayCard("Day 1 · Sun", "Tbilisi", [
    ["14:00", "Arrive, old town walk"],
    ["18:30", "Sulphur baths"],
  ])}
  ${dayCard("Day 2 · Mon", "Mtskheta", [
    ["09:30", "Jvari Monastery"],
    ["15:00", "Drive to Gudauri"],
  ])}
  <div class="card col line-a" style="padding:11px 13px;gap:8px;box-shadow:var(--shadow-agent)">
    <div class="row" style="gap:8px"><span class="eyebrow t-agent">Day 3 · Tue</span><span class="sm b6 grow">Kazbegi</span>${dot("agent")}</div>
    <div class="row" style="gap:10px"><span class="xs mut2" style="width:36px">10:15</span><span class="sm">Friendship Monument</span></div>
    <div class="row" style="gap:10px"><span style="width:36px"></span><div class="skel" style="width:62%"></div></div>
  </div>
  <div class="card col" style="padding:11px 13px;gap:8px;background:var(--color-surface-subtle)"><span class="eyebrow">Day 4 · Wed</span><div class="skel" style="width:78%"></div></div>
</div>
${homeIndicator}`;
      },
    },
    {
      slug: "plans",
      title: "Plans · the watch layer",
      note: "The business model stated plainly: planning is free, watching is the subscription. The price is still an open decision.",
      render: () => `
${statusBar("20:16")}
<div class="abs col" style="top:48px;left:0;right:0;bottom:0;padding:0 16px">
  <div class="row" style="padding:8px 0 0"><span class="mut row">${ic("close", 20)}</span></div>
  <div class="col" style="padding:14px 0 14px;gap:7px">
    <div class="h1" style="font-size:26px">Planning is free. Watching is what you pay for.</div>
    <div class="sm mut">Build as many trips as you like. When one becomes real, turn on the watch layer and I follow it until you are home.</div>
  </div>
  <div class="card col line-a" style="padding:15px;gap:11px;box-shadow:var(--shadow-agent)">
    <div class="row" style="gap:8px"><span class="eyebrow t-agent grow">Pro · the watch layer</span>${dot("agent")}</div>
    <div class="row" style="gap:8px;align-items:baseline"><span class="h1 mut2">[price]</span><span class="sm mut">per month</span></div>
    <div class="col" style="gap:7px">
      ${[
        [
          "Continuous monitoring",
          "of weather, roads, transport, hours and events on your route",
        ],
        ["Proactive alerts", "— only what touches your days"],
        ["Ready-made replans", "you apply in one tap, always revertible"],
        ["Daily briefing", "each morning, by push and email"],
      ]
        .map(
          ([lead, rest]) =>
            `<div class="row top" style="gap:9px"><span class="t-agent row" style="padding-top:2px">${ic("check", 14, 2)}</span><span class="sm"><span class="b6">${lead}</span> <span class="mut">${rest}</span></span></div>`,
        )
        .join("")}
    </div>
    <span class="btn btn-p btn-lg">Turn on the watch layer</span>
  </div>
  <div class="card row" style="margin-top:10px;padding:12px 14px;gap:12px">
    <div class="col grow" style="gap:1px"><div class="row" style="gap:8px"><span class="sm b6">Free</span><span class="sm mut">€0 forever</span></div><div class="xs mut2">Unlimited trips, map, itinerary, budget. No monitoring.</div></div>
    <span class="chip chip-sm">Current plan</span>
  </div>
  <div class="col" style="padding-top:14px;gap:8px">
    ${rule("On your Georgia trip so far")}
    <div class="row">
      ${[
        ["4,310", "checks run"],
        ["6", "worth telling"],
        ["2", "replans"],
        ["1h 20m", "delay avoided"],
      ]
        .map(
          ([v, l]) =>
            `<div class="col grow" style="gap:1px"><span class="h3" style="font-size:16px">${v}</span><span class="xs mut2">${l}</span></div>`,
        )
        .join("")}
    </div>
  </div>
  <div class="grow"></div>
  <div class="xs mut2" style="text-align:center;padding-bottom:28px">Cancel any time. The trips you built stay yours.</div>
</div>
${homeIndicator}`,
    },
  ],
};
