import { basemap } from "../art.tsx";
import {
  dot,
  homeIndicator,
  ic,
  rule,
  statusBar,
  type Tone,
  tabBar,
} from "../kit.ts";
import type { Flow } from "../page.ts";
import { appBar } from "./shared.ts";

type Segment = {
  weight: number;
  tone: "filled" | "empty" | "agent" | "agent-soft" | "alert";
};

/** The shape of a day: blocks of time sized by weight, coloured by what the watch sees. */
function shape(segments: Segment[]): string {
  return `<div class="shape">${segments.map((s) => `<div class="${s.tone === "filled" ? "" : s.tone}" style="flex:${s.weight}"></div>`).join("")}</div>`;
}

// `src/data/trip.ts` — georgiaDays, trimmed to what a row shows.
const days: Array<{
  stamp: string;
  summary: string;
  shape: Segment[];
  watch: [Tone, string];
  today?: boolean;
  past?: boolean;
}> = [
  {
    stamp: "D1 · Sun 14",
    summary: "Tbilisi · arrival and old town",
    past: true,
    watch: ["idle", "Done"],
    shape: [
      { weight: 2, tone: "filled" },
      { weight: 1, tone: "empty" },
      { weight: 3, tone: "filled" },
      { weight: 1, tone: "empty" },
      { weight: 2, tone: "filled" },
    ],
  },
  {
    stamp: "D2 · Mon 15",
    summary: "Mtskheta · Jvari and Svetitskhoveli",
    past: true,
    watch: ["idle", "1 change"],
    shape: [
      { weight: 1, tone: "filled" },
      { weight: 3, tone: "filled" },
      { weight: 1, tone: "empty" },
      { weight: 2, tone: "filled" },
      { weight: 2, tone: "empty" },
    ],
  },
  {
    stamp: "D3 · Tue 16 · Today",
    summary: "Kazbegi · Gergeti and the museum",
    today: true,
    watch: ["alert", "1 decision"],
    shape: [
      { weight: 2, tone: "agent" },
      { weight: 1, tone: "agent-soft" },
      { weight: 2, tone: "agent" },
      { weight: 1, tone: "agent-soft" },
      { weight: 3, tone: "alert" },
    ],
  },
  {
    stamp: "D4 · Wed 17",
    summary: "Juta valley and Sno",
    watch: ["ok", "Clear"],
    shape: [
      { weight: 1, tone: "filled" },
      { weight: 4, tone: "filled" },
      { weight: 1, tone: "empty" },
      { weight: 2, tone: "filled" },
    ],
  },
  {
    stamp: "D5 · Thu 18",
    summary: "Back to Tbilisi via Ananuri",
    watch: ["ok", "Clear"],
    shape: [
      { weight: 3, tone: "filled" },
      { weight: 1, tone: "empty" },
      { weight: 2, tone: "filled" },
      { weight: 2, tone: "empty" },
    ],
  },
  {
    stamp: "D6 · Fri 19",
    summary: "Kakheti · Sighnaghi and Bodbe",
    watch: ["agent", "Festival found"],
    shape: [
      { weight: 2, tone: "filled" },
      { weight: 2, tone: "filled" },
      { weight: 1, tone: "empty" },
      { weight: 3, tone: "filled" },
    ],
  },
  {
    stamp: "D7 · Sat 20",
    summary: "Tbilisi · slow morning, departure",
    watch: ["ok", "Clear"],
    shape: [
      { weight: 2, tone: "filled" },
      { weight: 3, tone: "empty" },
      { weight: 1, tone: "filled" },
    ],
  },
];

/** A catalogue place, as Explore and Saved list it. */
function placeRow({
  name,
  summary,
  detail,
  verified,
  note,
  saved = false,
}: {
  name: string;
  summary: string;
  detail: string;
  verified: string;
  note?: [Tone, string];
  saved?: boolean;
}): string {
  return `<div class="row top" style="padding:11px 14px;gap:12px">
  <div class="col grow" style="gap:3px">
    <div class="sm b6">${name}</div>
    <div class="xs mut">${summary}</div>
    <div class="xs mut2">${detail} · ${verified}</div>
    ${note ? `<div class="row xs t-${note[0]}" style="gap:6px;margin-top:2px">${dot(note[0])}${note[1]}</div>` : ""}
  </div>
  <span class="row ${saved ? "t-agent" : "mut2"}" style="padding-top:2px">${ic("bookmark", 17)}</span>
</div>`;
}

export const trips: Flow = {
  slug: "trips",
  group: "Trips",
  screens: [
    {
      slug: "trips-list",
      title: "Trips",
      note: "Home. The live trip carries its watch status and any pending decision, so the state of the product shows before you open anything.",
      render: (t) => `
${statusBar("10:48")}
<div class="abs col" style="top:48px;left:0;right:0;bottom:82px;padding:0 16px;overflow:hidden">
  <div class="row" style="padding:10px 0 16px;gap:10px"><div class="h1 grow" style="font-size:25px">Your trips</div><span class="btn btn-p btn-sm">${ic("plus", 14)}New</span></div>
  <div style="padding-bottom:9px">${rule("Travelling now", "agent")}</div>
  <div class="card col clip line-a">
    <div style="position:relative;height:118px;overflow:hidden"><div class="map">${basemap("route", t)}</div></div>
    <div class="col" style="padding:13px 14px;gap:11px">
      <div class="row top" style="gap:10px"><div class="col grow" style="gap:3px"><div class="h3" style="font-size:16px">Georgia · nature &amp; monasteries</div><div class="xs mut2">14 – 20 Sep · with your father</div></div><span class="chip chip-a chip-sm" style="height:22px;font-size:11px">Day 3/7</span></div>
      <div class="row top card tint-w" style="padding:10px 12px;gap:9px;border-radius:8px">${dot("alert", "mt")}<div class="col grow" style="gap:1px"><div class="sm b6">1 change needs your decision</div><div class="xs mut">Rain at 15:30 conflicts with your 16:00 hike</div></div></div>
      <div class="row" style="gap:8px"><span class="btn btn-p grow" style="height:42px">Open today</span><span class="btn btn-s" style="height:42px">Trip</span></div>
      <div class="row" style="gap:7px">${dot("ok")}<div class="xs mut2">Watching 12 sources · last check 4 min ago</div></div>
    </div>
  </div>
  <div style="padding:18px 0 9px">${rule("Coming up")}</div>
  <div class="card row" style="padding:12px 14px;gap:12px">
    <span class="icon-tile">${ic("calendar", 18)}</span>
    <div class="col grow" style="gap:2px"><div class="sm b6">Svaneti · four days walking</div><div class="xs mut2">12 – 15 Oct · draft, 3 of 4 days planned</div><div class="xs mut2">Watch starts 3 days before you leave</div></div>
    <span class="mut2 row">${ic("chevronRight", 15)}</span>
  </div>
  <div style="padding:18px 0 9px">${rule("Finished")}</div>
  <div class="card col clip">
    <div class="row" style="padding:11px 14px;gap:12px"><div class="col grow" style="gap:2px"><div class="sm b6">Kakheti wine weekend</div><div class="xs mut2">23 – 25 Aug · 4 changes handled</div></div><span class="mut2 row">${ic("chevronRight", 15)}</span></div>
    <div class="hr"></div>
    <div class="row" style="padding:11px 14px;gap:12px"><div class="col grow" style="gap:2px"><div class="sm b6">Armenia loop</div><div class="xs mut2">2 – 9 Jun · 11 changes handled</div></div><span class="mut2 row">${ic("chevronRight", 15)}</span></div>
  </div>
</div>
${tabBar("home", "Trips")}
${homeIndicator}`,
    },
    {
      slug: "full-trip",
      title: "Full trip · seven days",
      note: "All seven days with a watch status each — where the product stops being a planner. Every row says whether anything moved under it.",
      render: () => `
${statusBar("10:48")}
${appBar({ title: "Georgia · nature &amp; monasteries", sub: "14 – 20 Sep · 7 days · with your father" })}
<div class="abs col" style="top:106px;left:0;right:0;bottom:82px;padding:14px 16px 0;gap:12px;overflow:hidden">
  <div class="row card" style="padding:10px 0">
    ${[
      ["Budget", "€640 / 700"],
      ["Places", "31"],
      ["Changes", "6 handled"],
    ]
      .map(
        ([l, v], i) =>
          `<div class="col grow" style="gap:2px;padding:0 14px${i ? ";border-left:1px solid var(--color-hairline)" : ""}"><div class="eyebrow">${l}</div><div class="sm b6">${v}</div></div>`,
      )
      .join("")}
  </div>
  <div class="card col clip">
    ${days
      .map(
        (
          d,
        ) => `<div class="row${d.today ? " tint-a" : ""}" style="padding:8px 14px;gap:12px${d.past ? ";opacity:.6" : ""}">
      <div class="col grow" style="gap:4px">
        <div class="row" style="gap:8px"><span class="eyebrow${d.today ? " t-agent" : ""}">${d.stamp}</span></div>
        <div class="sm b5">${d.summary}</div>
        ${shape(d.shape)}
      </div>
      <div class="row" style="gap:6px;width:96px;justify-content:flex-end">${dot(d.watch[0])}<span class="xs ${d.watch[0] === "alert" ? "t-alert b5" : d.watch[0] === "agent" ? "t-agent b5" : "mut"}">${d.watch[1]}</span></div>
    </div>`,
      )
      .join('<div class="hr"></div>')}
  </div>
  <div class="col card" style="padding:4px 14px">
    ${[
      ["Driving", "7h 40m total"],
      ["Changes I proposed", "8 · 6 applied"],
    ]
      .map(
        ([l, v], i) =>
          `<div class="row between${i ? " hr-soft" : ""}" style="padding:8px 0"><span class="sm mut">${l}</span><span class="sm b5">${v}</span></div>`,
      )
      .join("")}
  </div>
</div>
${tabBar("trip", "Trip", "AI")}
${homeIndicator}`,
    },
    {
      slug: "day-detail",
      title: "Day detail",
      note: "One day, expanded: the rain ribbon over the hours you are awake, every stop with its state, and the one conflict marked in coral.",
      render: () => {
        const ribbon = [0, 0, 0, 0, 0, 0, 0.3, 1, 0.85, 0.35, 0.12, 0]
          .map((v) => {
            const h = 8 + Math.round(v * 13);
            return `<div class="${v >= 0.6 ? "w2" : v >= 0.25 ? "w1" : ""}" style="height:${h}px"></div>`;
          })
          .join("");
        const stop = ({
          time,
          title,
          sub,
          state,
          tail = "",
        }: {
          time: string;
          title: string;
          sub: string;
          state: "done" | "now" | "next" | "conflict";
          tail?: string;
        }) => {
          const marker = {
            done: dot("idle", "mt"),
            now: dot("agent", "mt"),
            next: '<span class="dot d-ring mt"></span>',
            conflict: '<span class="dot d-ring-w mt"></span>',
          }[state];
          const style = {
            done: "opacity:.55",
            now: "",
            next: "",
            conflict: "border-left:2px solid var(--color-alert-bright)",
          }[state];
          return `<div class="row top${state === "now" ? " tint-a" : ""}" style="padding:11px 14px;gap:12px;${style}">
  <div class="xs ${state === "now" ? "t-agent b6" : "mut2"}" style="width:38px;flex:none;padding-top:2px">${time}</div>${marker}
  <div class="col grow" style="gap:1px"><div class="sm ${state === "now" ? "b6" : "b5"}">${title}</div><div class="xs ${state === "now" ? "t-agent" : state === "conflict" ? "t-alert" : "mut2"}">${sub}</div></div>${tail}
</div>`;
        };
        return `
${statusBar("10:48")}
<div class="appbar col">
  <div class="row" style="padding:8px 16px 10px;gap:10px">
    <span class="mut row">${ic("chevronLeft", 20)}</span>
    <div class="col grow" style="gap:1px"><div class="h3" style="font-size:16px">Wednesday 16 Sep</div><div class="eyebrow">Day 3 of 7 · Gudauri → Kazbegi</div></div>
    <span class="chip">2/6 done</span>
  </div>
  <div class="col" style="padding:0 16px 12px;gap:6px">
    <div class="bars" style="height:22px">${ribbon}</div>
    <div class="row between"><span class="eyebrow">09</span><span class="eyebrow t-alert">Rain 15:30–19:00</span><span class="eyebrow">21</span></div>
  </div>
</div>
<div class="abs col" style="top:160px;left:0;right:0;bottom:150px;padding:12px 16px 0;overflow:hidden">
  <div class="card col clip">
    ${[
      stop({
        time: "09:00",
        title: "Breakfast · Rooms Gudauri",
        sub: "45 min",
        state: "done",
      }),
      stop({
        time: "10:15",
        title: "Friendship Monument viewpoint",
        sub: "40 min · 12 km from Gudauri",
        state: "done",
      }),
      stop({
        time: "Now",
        title: "Driving to Kazbegi",
        sub: "Arrives 11:20 · 24 km left · route clear",
        state: "now",
      }),
      stop({
        time: "12:30",
        title: "Lunch · Zeta Camp",
        sub: "Booked · free cancellation",
        state: "next",
        tail: `<span class="mut2 row">${ic("check", 14)}</span>`,
      }),
      stop({
        time: "16:00",
        title: "Gergeti Trinity hike",
        sub: "2h 40m · 400 m ascent · inside the rain window",
        state: "conflict",
        tail: `<span class="t-alert row">${ic("rain", 15)}</span>`,
      }),
      stop({
        time: "19:30",
        title: "Dinner · Cafe 5047m",
        sub: "Table for 2 · booked",
        state: "next",
        tail: `<span class="mut2 row">${ic("check", 14)}</span>`,
      }),
    ].join('<div class="hr"></div>')}
  </div>
  <div class="row" style="padding:12px 0 0;gap:9px"><span class="btn btn-s grow" style="height:40px">${ic("plus", 14)}Add a stop</span><span class="btn btn-s grow" style="height:40px">Reorder</span></div>
</div>
<div class="abs card row tint-a" style="left:16px;right:16px;bottom:96px;z-index:6;padding:10px 12px;gap:11px;box-shadow:var(--shadow-agent)">
  <span class="t-agent row">${ic("sparkle", 17)}</span>
  <div class="sm b5 grow">1 change recommended for today</div>
  <span class="btn btn-p btn-sm">Review</span>
</div>
${tabBar("trip", "Today", "AI")}
${homeIndicator}`;
      },
    },
    {
      slug: "checkpoint",
      title: "Checkpoint detail",
      note: "One stop: what it is, when, the conflict and its fix, what the watch keeps an eye on here specifically, and why it is in the trip at all.",
      render: (t) => `
<div class="abs" style="top:0;left:0;right:0;height:240px;overflow:hidden"><div class="map">${basemap("clear", t)}</div></div>
${statusBar("10:48")}
<div class="abs row" style="top:54px;left:16px;right:16px;gap:10px;z-index:5">
  <span class="row float btn-icon center">${ic("chevronLeft", 18)}</span>
  <div class="grow"></div>
  <span class="row float btn-icon center t-agent">${ic("bookmark", 17)}</span>
</div>
<div class="sheet" style="top:180px;bottom:0;z-index:6">
  <div class="col" style="padding:18px 18px 14px;gap:6px">
    <div class="eyebrow t-agent">Checkpoint 5 of 6 · Wednesday</div>
    <div class="h1" style="font-size:26px">Gergeti Trinity Church</div>
    <div class="sm mut">14th-century church above Stepantsminda, at 2,170 m.</div>
  </div>
  <div class="row" style="padding:0 18px 14px;border-bottom:1px solid var(--color-hairline)">
    ${[
      ["Scheduled", "16:00"],
      ["Return", "2h 40m"],
      ["Ascent", "400 m"],
      ["Grade", "Moderate"],
    ]
      .map(
        ([l, v]) =>
          `<div class="col grow" style="gap:2px"><div class="eyebrow">${l}</div><div class="sm b6">${v}</div></div>`,
      )
      .join("")}
  </div>
  <div class="col" style="padding:14px 18px;gap:11px;border-bottom:1px solid var(--color-hairline)">
    <div class="row top card tint-w" style="gap:11px;padding:11px 13px;border-radius:9px">${dot("alert", "mt")}<div class="col grow" style="gap:2px"><div class="sm b6">Scheduled inside the rain window</div><div class="xs mut">12 mm from 15:30. The ridge is exposed the whole way up and the track gets slick above the treeline.</div></div></div>
    <div class="row" style="gap:9px"><span class="btn btn-p grow" style="height:44px">Move to 11:30</span><span class="btn btn-s" style="height:44px">Other times</span></div>
  </div>
  <div class="col" style="padding:13px 18px;gap:6px;border-bottom:1px solid var(--color-hairline)">
    <div class="eyebrow">What I keep an eye on here</div>
    <div class="col">
      ${[
        ["alert", "Weather on the ridge", "1 change today"],
        ["ok", "Trail condition reports", "Clear · 3 h ago"],
        ["ok", "Church opening hours", "Verified · 2 h ago"],
      ]
        .map(
          ([tone, l, v], i) =>
            `<div class="row${i ? " hr-soft" : ""}" style="gap:11px;padding:7px 0">${dot(tone as Tone)}<span class="sm mut grow">${l}</span><span class="xs mut2">${v}</span></div>`,
        )
        .join("")}
    </div>
  </div>
  <div class="col" style="padding:13px 18px;gap:6px">
    <div class="eyebrow">Why it is in your trip</div>
    <div class="sm mut">The one place in your week that is both nature and a monastery, on the day you are most rested.</div>
  </div>
  <div class="grow"></div>
  <div class="row" style="padding:12px 18px 26px;gap:9px;border-top:1px solid var(--color-hairline)">
    <span class="btn btn-s grow" style="height:44px">${ic("route", 15)}Directions</span>
    <span class="btn btn-s grow" style="height:44px">${ic("sparkle", 15)}Ask about it</span>
    <span class="btn btn-g" style="height:44px;padding:0 10px">Remove</span>
  </div>
</div>
${homeIndicator}`,
    },
    {
      slug: "explore",
      title: "Explore",
      note: "The catalogue before you plan: places checked by hand, each saying what was last verified, and the roads as the watch sees them this season.",
      render: (t) => `
<div class="abs" style="top:0;left:0;right:0;height:230px;overflow:hidden"><div class="map">${basemap("clear", t)}</div></div>
${statusBar("20:14")}
<div class="abs row float" style="top:56px;left:16px;right:16px;height:44px;padding:0 13px;gap:10px;z-index:5"><span class="mut2 row">${ic("search", 17)}</span><span class="sm mut2 grow">Search places, regions, roads</span><span class="mut row">${ic("filter", 17)}</span></div>
<div class="sheet" style="top:172px;bottom:82px;z-index:6">
  <div class="grab"></div>
  <div class="col" style="padding:6px 16px 12px;gap:3px">
    <div class="eyebrow">Explore Georgia</div>
    <div class="h2">Places I have checked by hand</div>
  </div>
  <div class="row" style="padding:0 16px 10px;gap:6px">
    <span class="chip chip-on">Kazbegi · 88</span><span class="chip">Tbilisi · 214</span><span class="chip">Kakheti · 97</span><span class="chip">Svaneti · 61</span>
  </div>
  <div class="row" style="padding:0 16px 12px;gap:14px;border-bottom:1px solid var(--color-hairline)">
    ${["All", "Heritage", "Nature", "Food &amp; wine", "Culture", "Stay"].map((g, i) => `<span class="sm${i === 0 ? " b6" : " mut"}" style="white-space:nowrap${i === 0 ? ";box-shadow:inset 0 -2px 0 var(--color-ink);padding-bottom:4px" : ";padding-bottom:4px"}">${g}</span>`).join("")}
  </div>
  <div class="col">
    ${[
      placeRow({
        name: "Juta valley walk",
        summary: "Flat meadow trail under the Chaukhi massif.",
        detail: "3h · easy · 11 km",
        verified: "Trail clear · 1 d ago",
        note: ["ok", "Best month for it — dry and clear"],
        saved: true,
      }),
      placeRow({
        name: "Gergeti Trinity Church",
        summary: "14th-century church on a spur above Stepantsminda.",
        detail: "2h 40m round trip",
        verified: "Hours verified 2 h ago",
      }),
      placeRow({
        name: "Truso valley",
        summary: "Mineral springs and abandoned villages off the main road.",
        detail: "5h · moderate",
        verified: "Road reports · 6 h ago",
      }),
    ].join('<div class="hr" style="margin:0 14px"></div>')}
  </div>
  <div class="col" style="padding:6px 16px 0;gap:8px">
    ${rule("Before you plan · roads this season")}
    <div class="card col" style="padding:2px 12px">
      <div class="row" style="gap:10px;padding:8px 0">${dot("ok")}<span class="sm b5 grow">Georgian Military Road</span><span class="xs mut2">Open · mudflow season ended</span></div>
      <div class="row hr-soft" style="gap:10px;padding:8px 0">${dot("alert")}<span class="sm b5 grow">Zagari Pass</span><span class="xs mut2">Unpaved · closes with first snow</span></div>
    </div>
  </div>
</div>
${tabBar("home", "Explore")}
${homeIndicator}`,
    },
    {
      slug: "saved",
      title: "Saved",
      note: "Routes, places and finds you kept. Any of them can start a trip, and each is re-checked before it goes into a plan.",
      render: () => `
${statusBar("20:14")}
<div class="abs col" style="top:48px;left:0;right:0;bottom:82px;padding:10px 16px 0;gap:14px;overflow:hidden">
  <div class="col" style="gap:4px">
    <div class="row"><div class="h1 grow" style="font-size:25px">Saved</div><span class="btn btn-s btn-sm">${ic("explore", 14)}Explore</span></div>
    <div class="sm mut">Anything here can start a trip — I re-check each one before it goes into a plan.</div>
  </div>
  <div class="col" style="gap:8px">
    ${rule("Routes · 2")}
    ${[
      [
        "Kazbegi in three days",
        "Saved from your Georgia trip",
        "3 days · 9 stops",
        "Gergeti, Juta and Truso, with the drive split at Ananuri",
      ],
      [
        "Kakheti wine loop",
        "Saved from Kakheti wine weekend",
        "2 days · 7 stops",
        "Sighnaghi, Bodbe and four qvevri cellars",
      ],
    ]
      .map(
        ([
          title,
          from,
          chip,
          note,
        ]) => `<div class="card col" style="padding:12px 14px;gap:9px">
      <div class="row" style="gap:11px"><span class="icon-tile a" style="width:34px;height:34px">${ic("route", 17)}</span><div class="col grow" style="gap:1px"><div class="sm b6">${title}</div><div class="xs mut2">${from}</div></div><span class="chip chip-sm">${chip}</span></div>
      <div class="xs mut">${note}</div>
      <div class="row" style="gap:6px"><span class="btn btn-s btn-sm">Start a trip from this</span><span class="btn btn-g btn-sm">Change it first</span></div>
    </div>`,
      )
      .join("")}
  </div>
  <div class="col" style="gap:8px">
    ${rule("Places · 4")}
    <div class="card col clip">
      ${[
        placeRow({
          name: "Pheasant's Tears",
          summary: "Qvevri wines and a kitchen that cooks from the market.",
          detail: "Lunch · book ahead",
          verified: "Open today",
          note: ["agent", "Rtveli — harvest season until mid-October"],
          saved: true,
        }),
        placeRow({
          name: "Ushguli towers",
          summary:
            "Medieval towers under Shkhara, among Europe's highest villages.",
          detail: "Full day · 4×4",
          verified: "Road reports · 1 d ago",
          note: ["alert", "Zagari Pass unpaved — watch after rain"],
          saved: true,
        }),
      ].join('<div class="hr"></div>')}
    </div>
  </div>
  <div class="col" style="gap:8px">
    ${rule("Kept from your trips")}
    <div class="card row" style="padding:11px 14px;gap:11px">${dot("agent")}<div class="col grow" style="gap:1px"><div class="sm b6">Sheep migration festival in Sno</div><div class="xs mut2">Every September · found on day 3 of Georgia</div></div><span class="btn btn-s btn-sm">Plan around it</span></div>
  </div>
</div>
${tabBar("home", "Saved")}
${homeIndicator}`,
    },
  ],
};
