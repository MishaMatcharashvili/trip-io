import { basemap } from "../art.tsx";
import { dot, homeIndicator, ic, statusBar, tabBar } from "../kit.ts";
import type { Flow } from "../page.ts";
import { agendaRow, sheetHead, tripHeader } from "./shared.ts";

/** The three-part answer every intervention gives, in the same order. */
function threeQuestions(rows: Array<[string, string]>): string {
  return `<div class="col card clip" style="border-radius:12px">${rows
    .map(
      ([label, text], i) =>
        `${i ? '<div class="hr"></div>' : ""}<div class="row top${i === rows.length - 1 ? " well" : ""}" style="gap:12px;padding:11px 14px"><div class="eyebrow" style="width:66px;flex:none;padding-top:2px">${label}</div><div class="sm grow">${text}</div></div>`,
    )
    .join("")}</div>`;
}

function evidence(text: string): string {
  return `<div class="row center mut2" style="gap:6px">${ic("info", 13)}<span class="xs">${text}</span></div>`;
}

/** One stop in the whole-day diff: unchanged stops recede, moved ones say why. */
function diffRow({
  time,
  title,
  from,
  because,
  note,
}: {
  time: string;
  title: string;
  from?: string;
  because?: string;
  note?: string;
}): string {
  if (!from) {
    return `<div class="row" style="padding:9px 14px;gap:12px"><div class="xs mut2" style="width:40px;flex:none">${time}</div>${dot("idle")}<div class="sm mut grow">${title}</div>${note ? `<span class="xs mut2">${note}</span>` : ""}</div>`;
  }
  return `<div class="row top tint-a" style="padding:11px 14px;gap:12px;border-left:2px solid var(--color-agent)">
  <div class="col" style="width:40px;flex:none;gap:1px"><div class="xs b6 t-agent">${time}</div><div class="xs strike">${from}</div></div>
  <span class="dot d-agent mt"></span>
  <div class="col grow" style="gap:2px"><div class="sm b6">${title}</div><div class="xs mut">${because}</div></div>
</div>`;
}

export const briefing: Flow = {
  slug: "briefing-and-alerts",
  group: "Briefing & alerts",
  screens: [
    {
      slug: "daily-briefing",
      title: "Daily briefing",
      note: "07:30 every morning. Three things worth knowing, one change the judge already proposed, and nothing invented to fill a quiet day.",
      render: (t) => `
<div class="abs" style="top:0;left:0;right:0;height:260px;overflow:hidden"><div class="map">${basemap("route", t)}</div></div>
${statusBar("07:31")}
<div class="abs row" style="top:56px;left:16px;right:16px;gap:10px;z-index:4">
  <span class="chip float" style="height:30px;gap:7px;border-radius:99px">${dot("ok")}Watching · 12 sources</span>
  <div class="grow"></div>
  <span class="row float mut" style="width:32px;height:32px;border-radius:99px;justify-content:center">${ic("user", 16)}</span>
</div>
<div class="sheet" style="top:196px;bottom:82px;z-index:5;border-radius:20px 20px 0 0">
  <div class="col" style="padding:20px 18px 14px;gap:5px">
    <div class="eyebrow">Day 3 · Wed 16 Sep · Kazbegi</div>
    <div class="h1" style="font-size:26px">Good morning, Misha</div>
    <div class="sm mut">Dry until mid-afternoon, roads clear, and one thing worth moving.</div>
  </div>
  <div class="col" style="padding:0 18px;border-top:1px solid var(--color-hairline)">
    ${[
      [
        "alert",
        "Clear now, rain from 16:00",
        "12 mm, easing by 19:00 · 8°C on the ridge",
        "Weather",
      ],
      [
        "ok",
        "No transport issues on your route",
        "Military Highway open · marshrutka running normally",
        "Transport",
      ],
      [
        "agent",
        "Sheep migration festival in Sno, 18:00",
        "6 min from your dinner · free entry",
        "Local",
      ],
    ]
      .map(
        ([tone, title, sub, tag]) =>
          `<div class="row top" style="gap:12px;padding:12px 0">${dot(tone as "alert", "mt")}<div class="col grow" style="gap:1px"><div class="sm b5">${title}</div><div class="xs mut2">${sub}</div></div><div class="eyebrow" style="padding-top:3px">${tag}</div></div>`,
      )
      .join('<div class="hr"></div>')}
  </div>
  <div class="col card tint-a" style="margin:12px 18px 0;padding:13px 14px;gap:9px">
    <div class="row t-agent" style="gap:8px">${ic("sparkle", 15)}<span class="eyebrow t-agent">1 change recommended</span></div>
    <div class="sm">Move the <span class="b6">Gergeti hike to 11:30</span> and the museum to the afternoon. Everything else holds.</div>
    <div class="row xs" style="gap:8px"><span class="strike">16:00 hike</span><span class="t-agent row">${ic("arrowRight", 13)}</span><span class="t-agent b6">11:30 hike</span></div>
  </div>
  <div class="grow"></div>
  <div class="col" style="padding:0 18px 14px;gap:6px">
    <span class="btn btn-p btn-lg">Review the change</span>
    <div class="row center" style="gap:18px"><span class="btn btn-g btn-sm">See full day</span><span class="btn btn-g btn-sm">Ask something</span></div>
  </div>
</div>
${tabBar("trip", "Today")}
${homeIndicator}`,
    },
    {
      slug: "replan-diff",
      title: "Replan · the whole day",
      note: "Opened from the briefing. The change is shown as the day it produces, both moves together, validated as a whole day before it is offered.",
      render: () => `
<div class="fill canvas"></div>
${statusBar("07:33")}
<div class="abs col" style="top:48px;left:0;right:0;bottom:0">
  <div class="row" style="padding:8px 16px 0;gap:10px">
    <span class="mut row">${ic("close", 20)}</span>
    <div class="grow"></div>
    <span class="chip chip-a">From this morning's briefing</span>
  </div>
  <div class="col" style="padding:14px 18px 12px;gap:6px">
    <div class="row t-agent" style="gap:8px">${ic("sparkle", 15)}<span class="eyebrow t-agent">2 changes · made together</span></div>
    <div class="h1" style="font-size:25px">Hike before the rain, museum after</div>
    <div class="sm mut">Rain from 16:00 puts 12 mm on an exposed ridge. Swapping the afternoon keeps you dry and nothing else moves.</div>
  </div>
  <div class="col card clip" style="margin:0 16px">
    <div class="row between" style="padding:9px 14px"><span class="eyebrow">Your day, with the change</span><span class="eyebrow">Wed 16</span></div>
    <div class="hr"></div>
    ${diffRow({ time: "09:00", title: "Breakfast · Rooms Gudauri", note: "Done" })}
    ${diffRow({ time: "10:15", title: "Friendship Monument", note: "Done" })}
    ${diffRow({ time: "11:30", from: "16:00", title: "Gergeti Trinity hike", because: "Dry window 10:00–14:30, and the trail is quieter before the afternoon buses." })}
    ${diffRow({ time: "14:45", from: "12:30", title: "Lunch · Zeta Camp", because: "Kitchen closes 16:00 — still inside service. A sit-down break before the museum." })}
    ${diffRow({ time: "16:00", title: "Museum of Kazbegi", note: "Indoors" })}
    ${diffRow({ time: "19:30", title: "Dinner · Cafe 5047m", note: "Booked" })}
  </div>
  <div class="row top card tint-o" style="margin:12px 16px 0;padding:10px 12px;gap:10px">
    <span class="t-ok row" style="padding-top:1px">${ic("check", 15, 2.2)}</span>
    <div class="xs grow"><span class="b6">Checked as a whole day.</span> <span class="mut">No overlaps, drive times hold, everything is open when you arrive, and you are down before dark.</span></div>
  </div>
  <div class="grow"></div>
  <div class="col" style="padding:0 16px 28px;gap:9px">
    <span class="btn btn-p btn-lg">Apply both changes</span>
    <span class="btn btn-s btn-lg">Keep my day as it is</span>
    ${evidence("Meteo.ge · 3 models agree · undo for 24 hours")}
  </div>
</div>
${homeIndicator}`,
    },
    {
      slug: "proactive-alert",
      title: "Proactive alert · disruption",
      note: "An interrupt, pushed because it touches the next two hours. Changed, affects, I did — then the choice, and the evidence under it.",
      render: (t) => `
<div class="abs" style="top:0;left:0;right:0;height:400px;overflow:hidden"><div class="map">${basemap("alert", t)}</div></div>
${statusBar("10:52")}
<div class="abs row float line-w" style="top:54px;left:12px;right:12px;height:44px;padding:0 12px;gap:10px;z-index:5">
  ${dot("alert", "lg")}
  <div class="sm b6 grow">A change on your route</div>
  <span class="eyebrow">Just now</span>
  <span class="mut2 row">${ic("close", 15)}</span>
</div>
<div class="sheet" style="top:300px;bottom:0;z-index:6;border-radius:20px 20px 0 0">
  <div class="grab"></div>
  <div class="col" style="padding:8px 18px 0;gap:11px">
    <div class="row t-alert" style="gap:8px">${ic("warning", 15)}<span class="eyebrow t-alert">Road closure · Georgian Military Highway</span></div>
    <div class="h1" style="font-size:23px">Your route to Kazbegi may add 1h 20m</div>
    ${threeQuestions([
      [
        "Changed",
        "Landslide clearing at km 84. One lane, convoy control since 10:10.",
      ],
      [
        "Affects",
        'You are <span class="b6">14 km before it</span>. Arrival slips 11:20 → 12:40, past your lunch booking.',
      ],
      [
        "I suggest",
        "The Truso valley detour, +22 min. You arrive 11:42 and lunch at 12:30 holds.",
      ],
    ])}
    <div class="row" style="gap:10px">
      <div class="col grow" style="gap:1px"><div class="eyebrow">Now</div><div class="sm mut b5">12:40 arrival</div></div>
      <span class="mut2 row">${ic("arrowRight", 16)}</span>
      <div class="col grow" style="gap:1px;align-items:flex-end"><div class="eyebrow t-agent">With detour</div><div class="sm b6 t-agent">11:42 arrival</div></div>
    </div>
  </div>
  <div class="grow"></div>
  <div class="col" style="padding:0 18px 26px;gap:9px">
    <span class="btn btn-p btn-lg">Apply new route</span>
    <div class="row" style="gap:9px"><span class="btn btn-s grow" style="height:44px">View route</span><span class="btn btn-s grow" style="height:44px">Keep my plan</span></div>
    ${evidence("Road police feed + 2 driver reports · 10:52")}
  </div>
</div>
${homeIndicator}`,
    },
    {
      slug: "opportunity",
      title: "Opportunity · something better",
      note: "The same card for good news, in the agent's colour, never coral. It offers a choice rather than sounding an alarm, and it never pushes.",
      render: (t) => `
<div class="abs" style="top:0;left:0;right:0;height:400px;overflow:hidden"><div class="map">${basemap("clear", t)}</div></div>
${statusBar("12:40")}
<div class="abs row float line-a" style="top:54px;left:12px;right:12px;height:44px;padding:0 12px;gap:10px;z-index:5">
  ${dot("agent", "lg")}
  <div class="sm b6 grow">Something better came up</div>
  <span class="eyebrow">09:12</span>
  <span class="mut2 row">${ic("close", 15)}</span>
</div>
<div class="sheet" style="top:252px;bottom:0;z-index:6;border-radius:20px 20px 0 0">
  <div class="grab"></div>
  <div class="col" style="padding:8px 18px 0;gap:11px">
    <div class="row t-agent" style="gap:8px">${ic("sparkle", 15)}<span class="eyebrow t-agent">Local event · Sno</span></div>
    <div class="h1" style="font-size:23px">Sheep migration festival in Sno, 18:00</div>
    ${threeQuestions([
      [
        "Found",
        "Flocks coming down from the high pastures, through Sno. Free, until about 21:00.",
      ],
      [
        "Fits",
        "Six minutes from your 19:30 dinner. Nothing else in the evening moves.",
      ],
      ["I suggest", "Go at 18:00 for an hour, then dinner as booked."],
    ])}
    <div class="col card clip">
      <div class="row" style="padding:9px 12px;gap:10px"><span class="xs b6 t-agent" style="width:38px">18:00</span><span class="chip chip-a chip-sm">New</span><span class="sm b5 grow">Sheep migration festival</span></div>
      <div class="hr"></div>
      <div class="row" style="padding:9px 12px;gap:10px"><span class="xs mut2" style="width:38px">19:30</span><span class="sm mut grow">Dinner · Cafe 5047m</span><span class="xs mut2">Unchanged</span></div>
    </div>
  </div>
  <div class="grow"></div>
  <div class="col" style="padding:0 18px 26px;gap:9px">
    <span class="btn btn-p btn-lg">Add at 18:00</span>
    <div class="row" style="gap:9px"><span class="btn btn-s grow" style="height:44px">Save for later</span><span class="btn btn-g grow" style="height:44px">Not for me</span></div>
    ${evidence("Kazbegi municipality events page · 09:12")}
  </div>
</div>
${homeIndicator}`,
    },
    {
      slug: "change-applied",
      title: "Change applied · undo",
      note: "Closes the loop: what moved, who was told, and a visible way back for 24 hours. Undo appends a patch, it never erases one.",
      render: (t) => `
<div class="map">${basemap("route", t)}</div>
${statusBar("10:50")}
${tripHeader({ title: "Georgia · Day 3", sub: "Gudauri → Kazbegi" })}
<div class="abs float col clip line-o" style="top:112px;left:12px;right:12px;z-index:5">
  <div class="row tint-o" style="padding:10px 14px;gap:9px;border-bottom:1px solid var(--color-ok-line)">
    <span class="row" style="width:20px;height:20px;border-radius:99px;background:var(--color-ok);color:var(--color-on-accent);justify-content:center">${ic("check", 12, 2.6)}</span>
    <div class="eyebrow t-ok">Day updated · 2 changes applied</div>
  </div>
  <div class="col" style="padding:13px 14px;gap:11px">
    <div class="h2">Your afternoon is out of the rain</div>
    <div class="col xs" style="gap:7px">
      <div class="row" style="gap:10px"><span class="strike" style="width:78px">16:00 hike</span><span class="t-agent row">${ic("arrowRight", 13)}</span><span class="t-agent b6">11:30 hike</span></div>
      <div class="row" style="gap:10px"><span class="strike" style="width:78px">12:30 lunch</span><span class="t-agent row">${ic("arrowRight", 13)}</span><span class="t-agent b6">14:45 lunch</span></div>
    </div>
    <div class="row canvas" style="gap:9px;padding:9px 11px;border-radius:8px"><span class="mut2 row">${ic("info", 14)}</span><div class="xs mut grow">Zeta Camp has the new time. Nothing else moved.</div></div>
  </div>
  <div class="hr"></div>
  <div class="row" style="padding:10px 14px;gap:10px">
    <div class="col grow" style="gap:1px"><div class="sm b5">Changed your mind?</div><div class="xs mut2">Revert until 10:50 tomorrow</div></div>
    <span class="btn btn-s btn-sm">${ic("revert", 14)}Undo</span>
  </div>
</div>
<div class="sheet" style="bottom:82px;z-index:6">
  <div class="grab"></div>
  ${sheetHead({ eyebrow: "Next, in 40 min", eyebrowTone: "agent", title: "Gergeti Trinity hike", value: "11:30", valueNote: "Moved" })}
  <div class="hr" style="margin:0 16px"></div>
  ${agendaRow({ time: "14:45", title: "Lunch · Zeta Camp", detail: "Moved from 12:30", tone: "agent" })}
  <div class="hr" style="margin:0 16px"></div>
  ${agendaRow({ time: "16:00", title: "Museum of Kazbegi", detail: "Indoors · unaffected", pad: "11px 16px 16px" })}
</div>
${tabBar("trip", "Map")}
${homeIndicator}`,
    },
    {
      slug: "alert-history",
      title: "Alert history · the trust screen",
      note: "Everything the watch told you, what you did about it, and the raw check count behind it. Also the renewal argument.",
      render: () => `
${statusBar("15:10")}
<div class="appbar col" style="z-index:5">
  <div class="row" style="padding:10px 16px 12px;gap:10px">
    <div class="col grow" style="gap:2px"><div class="h3" style="font-size:16px">Everything I have told you</div><div class="eyebrow">Georgia · 3 days in</div></div>
    <span class="mut row">${ic("filter", 18)}</span>
  </div>
  <div class="row" style="padding:0 16px 12px">
    ${[
      ["6", "Told you", ""],
      ["4", "Applied", "t-agent"],
      ["2", "Kept plan", ""],
      ["4,310", "Checks run", ""],
    ]
      .map(
        ([n, l, c]) =>
          `<div class="col grow" style="gap:2px"><div class="h3 ${c}" style="font-size:17px">${n}</div><div class="eyebrow">${l}</div></div>`,
      )
      .join("")}
  </div>
</div>
<div class="abs col" style="top:210px;left:0;right:0;bottom:82px;padding:14px 16px 0;gap:14px;overflow:hidden">
  ${[
    [
      "Today",
      [
        [
          "alert",
          "Rain starts 15:30 in Kazbegi",
          "Moved your hike to 11:30 and lunch to 14:45",
          "10:48",
          "Applied",
        ],
        [
          "agent",
          "Sheep migration festival in Sno",
          "Six minutes from your dinner, 18:00",
          "09:12",
          "Saved",
        ],
        [
          "ok",
          "Military Highway reopened at km 84",
          "Driving time back to 1h 05m — no action needed",
          "06:10",
          "Resolved",
        ],
      ],
    ],
    [
      "Yesterday",
      [
        [
          "alert",
          "Jvari Monastery closing early for a service",
          "Suggested swapping it with Svetitskhoveli",
          "11:40",
          "Applied",
        ],
        [
          "idle",
          "Marshrutka to Gudauri running 40 min late",
          "You said you would drive instead",
          "08:05",
          "Kept plan",
        ],
      ],
    ],
  ]
    .map(
      ([day, rows]) =>
        `<div class="col" style="gap:8px"><div class="rule"><span class="eyebrow">${day}</span></div>${(
          rows as string[][]
        )
          .map(
            ([tone, title, sub, at, outcome]) =>
              `<div class="card row top${tone === "alert" && outcome === "Applied" && day === "Today" ? " line-w" : ""}" style="padding:11px 13px;gap:11px${tone === "idle" ? ";opacity:.7" : ""}">${dot(tone as "alert", "mt")}<div class="col grow" style="gap:2px"><div class="sm b6">${title}</div><div class="xs mut">${sub}</div></div><div class="col" style="align-items:flex-end;gap:4px"><div class="xs mut2">${at}</div><span class="chip chip-sm${outcome === "Applied" ? " chip-a" : ""}">${outcome}</span></div></div>`,
          )
          .join("")}</div>`,
    )
    .join("")}
  <div class="row center"><span class="sm link">Earlier in this trip</span></div>
</div>
${tabBar("trip", "AI")}
${homeIndicator}`,
    },
  ],
};
