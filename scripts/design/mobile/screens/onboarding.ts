import { basemap } from "../art.tsx";
import { brand, homeIndicator, ic, rule, statusBar, tabBar } from "../kit.ts";
import type { Flow } from "../page.ts";

/**
 * Google's sign-in mark keeps its own four colours in both themes — it is the
 * one place the bundle uses colours that are not tokens, because the brand
 * guidelines require it. Same exception as `src/features/auth-form.tsx`.
 */
const googleMark = `<svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C36.9 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>`;

function orRule(): string {
  return `<div class="row" style="gap:12px"><div class="grow" style="height:1px;background:var(--color-hairline)"></div><span class="xs mut2">or</span><div class="grow" style="height:1px;background:var(--color-hairline)"></div></div>`;
}

function field(
  label: string,
  value: string,
  opts: { ph?: boolean; focus?: boolean; hint?: string } = {},
): string {
  return `<div class="field"><span class="label">${label}</span><div class="input${opts.ph ? " ph" : ""}${opts.focus ? " focus" : ""}">${opts.focus && opts.ph ? '<span class="caret" style="margin:0 -6px 0 0"></span>' : ""}${value}${opts.focus && !opts.ph ? '<span class="caret"></span>' : ""}</div>${opts.hint ? `<span class="xs mut2">${opts.hint}</span>` : ""}</div>`;
}

/** The washed-out map behind the auth screens: you are about to go somewhere. */
function authBackdrop(theme: "light" | "dark"): string {
  return `<div class="abs" style="top:0;left:0;right:0;height:300px;overflow:hidden"><div class="map">${basemap("calm", theme)}</div><div class="wash"></div></div>`;
}

export const onboarding: Flow = {
  slug: "onboarding-and-account",
  group: "Onboarding & account",
  screens: [
    {
      slug: "first-run",
      title: "First run · no trips yet",
      note: "The only ask is a sentence. Planning works without an account; the watch layer is explained, not sold.",
      render: () => `
${statusBar("09:41")}
<div class="abs col" style="top:48px;left:0;right:0;bottom:82px;padding:0 20px">
  <div class="row" style="padding:10px 0 0;gap:9px">${brand(19)}<div class="grow"></div><span class="row mut center" style="width:30px;height:30px;border-radius:99px;background:var(--color-fill);border:1px solid var(--color-control)">${ic("user", 15)}</span></div>
  <div class="col" style="padding:40px 0 0;gap:12px">
    <div class="h1" style="font-size:30px">Where do you want<br>to go?</div>
    <div class="sm mut">Describe it the way you would to a friend. I build the itinerary, then watch it for you while you travel.</div>
  </div>
  <div class="card col" style="margin-top:20px;padding:15px;gap:13px">
    <div class="mut2" style="font-size:15px;line-height:1.5">A week somewhere with mountains and good food, not too expensive<span class="caret"></span></div>
    <div class="hr"></div>
    <div class="row" style="gap:10px"><span class="mut2 row">${ic("mic", 16)}</span><div class="xs mut2 grow">Or say it out loud</div><span class="btn btn-p">Start</span></div>
  </div>
  <div class="col" style="padding-top:20px;gap:9px">
    <div class="eyebrow">Or try one of these</div>
    ${[
      "7 days in Georgia, €700, nature and monasteries",
      "Long weekend in Kakheti with my partner",
      "Four days walking in Svaneti, moderate pace",
    ]
      .map(
        (e) =>
          `<div class="card row" style="padding:12px 14px;gap:10px"><div class="sm grow">${e}</div><span class="mut2 row">${ic("chevronRight", 14)}</span></div>`,
      )
      .join("")}
  </div>
  <div class="grow"></div>
  <div class="card row top tint-a" style="padding:13px 14px;gap:12px;margin-bottom:16px"><span class="t-agent row">${ic("signal", 18)}</span><div class="xs grow">Once a trip is live I watch weather, roads, transport and local events along it — and only tell you what actually affects your days.</div></div>
</div>
${tabBar("home", "Trips")}
${homeIndicator}`,
    },
    {
      slug: "sign-in",
      title: "Sign in",
      note: "One card over the washed-out map. Google first, email second, and a way to keep planning as a guest.",
      render: (t) => `
${authBackdrop(t)}
${statusBar("09:41")}
<div class="abs col" style="top:48px;left:0;right:0;bottom:0;padding:0 20px">
  <div class="row" style="padding:10px 0 0">${brand(19)}<div class="grow"></div><span class="mut row">${ic(t === "dark" ? "moon" : "sun", 18)}</span></div>
  <div class="col" style="padding:36px 0 22px;gap:8px">
    <span class="icon-tile a">${ic("user", 19, 1.7)}</span>
    <div class="eyebrow t-agent" style="margin-top:6px">Welcome back</div>
    <div class="h1">Sign in to trip.io</div>
    <div class="sm mut">Your trips, and everything I am watching on them, are waiting where you left them.</div>
  </div>
  <div class="col" style="gap:14px">
    <span class="btn btn-s btn-lg">${googleMark}Continue with Google</span>
    ${orRule()}
    ${field("Email", "misha@example.com")}
    ${field("Password", "••••••••••", { focus: true })}
    <span class="btn btn-p btn-lg">Sign in</span>
    <div class="sm mut" style="text-align:center">New to trip.io? <span class="link">Create an account</span></div>
  </div>
  <div class="grow"></div>
  <div class="col" style="gap:4px;padding:14px 0 30px;border-top:1px solid var(--color-hairline);align-items:center;text-align:center">
    <span class="sm b5">Keep planning as a guest</span>
    <span class="xs mut2">Planning works without an account. You only need one to save a trip and turn on watching.</span>
  </div>
</div>
${homeIndicator}`,
    },
    {
      slug: "sign-up",
      title: "Sign up · claim the trip",
      note: "Creating an account claims the trip already planned as a guest — the reason to sign up is shown, not asserted.",
      render: () => `
${statusBar("09:52")}
<div class="abs col" style="top:48px;left:0;right:0;bottom:0;padding:0 20px">
  <div class="row" style="padding:10px 0 0;gap:10px"><span class="mut row">${ic("chevronLeft", 20)}</span><div class="grow"></div>${brand(17)}</div>
  <div class="col" style="padding:22px 0 16px;gap:7px">
    <div class="eyebrow t-agent">Create an account</div>
    <div class="h1" style="font-size:26px">Keep your trips, and let me watch them</div>
  </div>
  <div class="card row top tint-a" style="padding:12px 13px;gap:11px">
    <span class="t-agent row" style="padding-top:1px">${ic("route", 17)}</span>
    <div class="col grow" style="gap:2px"><div class="sm b6">Georgia · nature &amp; monasteries</div><div class="xs mut">The trip you planned as a guest comes with you — 7 days, 31 places. Nothing is lost.</div></div>
  </div>
  <div class="col" style="gap:13px;padding-top:16px">
    <span class="btn btn-s btn-lg">${googleMark}Continue with Google</span>
    ${orRule()}
    ${field("Your name", "Misha")}
    ${field("Email", "you@example.com", { ph: true, focus: true })}
    ${field("Password", "", { hint: "At least 8 characters." })}
    <span class="btn btn-p btn-lg">Create account</span>
    <div class="sm mut" style="text-align:center">Already have an account? <span class="link">Sign in</span></div>
  </div>
</div>
${homeIndicator}`,
    },
    {
      slug: "push-permission",
      title: "Push permission",
      note: "Asked once, when a trip goes live — before the system prompt. It shows exactly what will push and what will wait.",
      render: () => `
${statusBar("10:02")}
<div class="abs col" style="top:48px;left:0;right:0;bottom:0;padding:0 20px">
  <div class="row" style="padding:10px 0 0"><span class="mut row">${ic("close", 20)}</span></div>
  <div class="col" style="padding:18px 0 18px;gap:8px">
    <div class="eyebrow t-agent">Your Georgia trip is live</div>
    <div class="h1">Let me reach you when it matters</div>
    <div class="sm mut">I'm watching 12 sources along your route. Most days I'll have nothing to say — when I do, it's worth a notification.</div>
  </div>
  <div class="card col" style="padding:14px;gap:10px;background:var(--color-backdrop);border-color:var(--color-hairline-strong)">
    <div class="float col clip" style="border-radius:14px">
      <div class="row top" style="padding:11px 12px;gap:10px">
        <span class="row center" style="width:30px;height:30px;border-radius:8px;background:var(--color-agent);color:var(--color-on-accent);flex:none">${ic("signal", 16, 2)}</span>
        <div class="col grow" style="gap:2px"><div class="row"><span class="xs b6 grow">trip.io</span><span class="xs mut2">now</span></div><div class="sm b6">Rain at 15:30 — move your hike?</div><div class="xs mut">Your 16:00 Gergeti hike is inside a 12 mm window. I can put it at 11:30.</div></div>
      </div>
      <div class="row" style="border-top:1px solid var(--color-hairline)"><div class="row center grow sm b6 t-agent" style="height:38px;border-right:1px solid var(--color-hairline)">Apply</div><div class="row center grow sm mut" style="height:38px">Keep plan</div></div>
    </div>
  </div>
  <div class="col" style="gap:0;padding-top:14px">
    ${[
      [
        "check",
        "t-agent",
        "Disruptions in the next two hours",
        "Weather, roads, transport, closures that touch a stop",
      ],
      [
        "check",
        "t-agent",
        "The morning briefing, at 07:30",
        "One notification a day, even when all is clear",
      ],
      [
        "clock",
        "mut2",
        "Everything else waits for you",
        "Opportunities and later changes, in the app and the briefing",
      ],
    ]
      .map(
        ([i, c, title, sub], n) =>
          `<div class="row top${n ? " hr-soft" : ""}" style="gap:12px;padding:10px 0"><span class="${c} row" style="padding-top:1px">${ic(i as "check", 16, 2)}</span><div class="col grow" style="gap:1px"><div class="sm b5">${title}</div><div class="xs mut2">${sub}</div></div></div>`,
      )
      .join("")}
  </div>
  <div class="xs mut" style="padding-top:4px">At most 4 interrupts on this trip, and none between 22:00 and 07:00.</div>
  <div class="grow"></div>
  <div class="col" style="gap:6px;padding-bottom:26px">
    <span class="btn btn-p btn-lg">Turn on notifications</span>
    <span class="btn btn-g btn-lg" style="height:40px">Not now — email the briefing instead</span>
  </div>
</div>
${homeIndicator}`,
    },
    {
      slug: "account",
      title: "Account",
      note: "Who you are, which plan you are on, the theme, and the way into watch settings. Nothing to configure that the trip does not need.",
      render: (t) => `
${statusBar("20:14")}
<div class="abs col" style="top:48px;left:0;right:0;bottom:82px;padding:10px 16px 0;gap:16px;overflow:hidden">
  <div class="h1" style="font-size:25px">Account</div>
  <div class="col" style="gap:8px">
    ${rule("You")}
    <div class="card row" style="padding:13px 14px;gap:12px">
      <span class="icon-tile a" style="border-radius:99px">${ic("user", 18)}</span>
      <div class="col grow" style="gap:1px"><div class="sm b6">Misha</div><div class="xs mut2">misha@example.com</div></div>
      <span class="btn btn-s btn-sm">Sign out</span>
    </div>
  </div>
  <div class="col" style="gap:8px">
    ${rule("Plan")}
    <div class="card row" style="padding:13px 14px;gap:12px">
      <div class="col grow" style="gap:1px"><div class="sm b6">Free</div><div class="xs mut">Planning is free. Watching is the upgrade.</div></div>
      <span class="btn btn-p btn-sm">See plans</span>
    </div>
  </div>
  <div class="col" style="gap:8px">
    ${rule("Appearance")}
    <div class="card col" style="padding:12px 14px;gap:10px">
      <span class="sm b5">Theme</span>
      <div class="seg">
        <div>${ic("display", 14)}System</div>
        <div${t === "light" ? ' class="on"' : ""}>${ic("sun", 14)}Light</div>
        <div${t === "dark" ? ' class="on"' : ""}>${ic("moon", 14)}Dark</div>
      </div>
    </div>
  </div>
  <div class="col" style="gap:8px">
    ${rule("Watch settings")}
    <div class="card col clip">
      ${[
        ["signal", "What I watch on your Georgia trip"],
        ["clock", "Quiet hours and interrupts"],
        ["revert", "Versions of your trip"],
      ]
        .map(
          ([i, l]) =>
            `<div class="row" style="padding:12px 14px;gap:12px"><span class="mut row">${ic(i as "signal", 17)}</span><span class="sm b5 grow">${l}</span><span class="mut2 row">${ic("chevronRight", 15)}</span></div>`,
        )
        .join('<div class="hr"></div>')}
    </div>
  </div>
</div>
${tabBar("home", "Profile")}
${homeIndicator}`,
    },
  ],
};
