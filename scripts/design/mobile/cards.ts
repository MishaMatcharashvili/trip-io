import type { Theme } from "./art.tsx";
import { dot, ic, radio, toggle } from "./kit.ts";
import { document, type Flow } from "./page.ts";

/**
 * The two cards that are not screens: the foundations every screen is built
 * from, and an index of the flows.
 */

const swatches: Array<[string, string[]]> = [
  ["Surfaces", ["canvas", "surface", "surface-subtle", "fill", "track"]],
  ["Lines", ["hairline", "hairline-strong", "control"]],
  ["Ink", ["ink", "ink-muted", "ink-faint", "ink-idle"]],
  ["Agent", ["agent", "agent-soft", "agent-line", "agent-tint"]],
  ["Disruption", ["alert", "alert-bright", "alert-soft", "alert-tint"]],
  ["All clear", ["ok", "ok-line", "ok-tint"]],
];

function foundationsSide(theme: Theme): string {
  const colours = swatches
    .map(
      ([role, names]) => `
<div class="col" style="gap:8px">
  <div class="eyebrow">${role}</div>
  <div class="row top" style="gap:8px">${names
    .map(
      (n) => `
    <div class="col" style="gap:5px;width:74px">
      <div style="height:40px;border-radius:8px;background:var(--color-${n});border:1px solid var(--color-hairline)"></div>
      <div class="xs mut">${n}</div>
    </div>`,
    )
    .join("")}</div>
</div>`,
    )
    .join("");

  return `
<section class="side" data-theme="${theme}" style="width:520px">
  <div class="side-cap"><b>Foundations</b><span>· ${theme}</span></div>
  <div class="card col" style="padding:20px;gap:22px">
    <div class="col" style="gap:6px">
      <div class="eyebrow">Mist · DM Sans</div>
      <div class="sm mut">Colour does three jobs. Periwinkle is the agent, coral is a real disruption, green is all clear. Everything else is neutral.</div>
    </div>
    ${colours}
    <div class="hr"></div>
    <div class="col" style="gap:8px">
      <div class="eyebrow">Type</div>
      <div class="h1">Display 28 · Where to?</div>
      <div class="h2">Headline 19 · Rain starts 15:30</div>
      <div class="h3">Title 14.5 · Gergeti Trinity hike</div>
      <div class="body">Body 14 · Moving it keeps the hike dry.</div>
      <div class="sm mut">Small 12.5 · 2h 40m · 400 m ascent</div>
      <div class="xs mut2">Mini 11.5 · Meteo.ge · 3 models agree</div>
      <div class="eyebrow">Micro 10 · eyebrow</div>
    </div>
    <div class="hr"></div>
    <div class="col" style="gap:12px">
      <div class="eyebrow">Controls</div>
      <div class="row" style="gap:8px">
        <span class="btn btn-p">Replan my day</span>
        <span class="btn btn-s">Why?</span>
        <span class="btn btn-g">Not now</span>
      </div>
      <div class="row wrap" style="gap:6px">
        <span class="chip">${dot("ok")}Clear</span>
        <span class="chip chip-a">Day 3/7</span>
        <span class="chip chip-w">1 conflict</span>
        <span class="chip chip-o">${dot("ok")}On</span>
        <span class="chip chip-on">Kazbegi</span>
      </div>
      <div class="row" style="gap:14px">
        ${toggle(true)}${toggle(false)}${radio(true)}${radio(false)}
        ${dot("agent")}${dot("alert")}${dot("ok")}${dot("idle")}
        <span class="t-agent row" style="gap:10px">${ic("sparkle", 18)}${ic("signal", 18)}</span>
        <span class="t-alert row">${ic("warning", 18)}</span>
        <span class="t-ok row">${ic("check", 18)}</span>
      </div>
      <div class="input focus">you@example.com<span class="caret"></span></div>
    </div>
  </div>
</section>`;
}

export function foundationsPage(): string {
  return document(
    "Foundations",
    "Foundations",
    `<div class="board">${foundationsSide("light")}${foundationsSide("dark")}</div>`,
  );
}

export function indexPage(flows: Flow[]): string {
  const count = flows.reduce((n, f) => n + f.screens.length, 0);
  const groups = flows
    .map(
      (flow) => `
<div class="card col clip">
  <div class="row" style="padding:12px 16px;gap:10px"><div class="h3 grow">${flow.group}</div><span class="xs mut2">${flow.screens.length}</span></div>
  <div class="hr"></div>
  ${flow.screens
    .map(
      (s) => `
  <div class="row top" style="padding:9px 16px;gap:12px">
    <div class="sm b5" style="width:170px;flex:none">${s.title}</div>
    <div class="xs mut grow">${s.note}</div>
  </div>`,
    )
    .join('<div class="hr-soft" style="margin:0 16px"></div>')}
</div>`,
    )
    .join("");

  return document(
    "Overview",
    "trip.io mobile",
    `<section class="side" data-theme="light" style="width:880px;padding:32px">
  <div class="col" style="gap:10px;margin-bottom:24px">
    <div class="row" style="gap:9px"><span class="t-agent row">${ic("signal", 22)}</span><span class="brand" style="font-size:18px">trip.io</span><span class="chip chip-a" style="margin-left:6px">Mobile · ${count} screens · light + dark</span></div>
    <div class="h1">Every mobile screen, in Mist</div>
    <div class="sm mut" style="max-width:640px">Concept A, map-first. Each card draws the screen twice: light, then dark. The dark frame overrides the same tokens, with no one-off colours. Copy and data come from the app's fixtures, so every screen is the same Georgia trip on day 3.</div>
  </div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;align-items:start">${groups}</div>
</section>`,
  );
}
