import type { Briefing, BriefingTone } from "../domain/watch/briefing.ts";
import { at } from "../domain/watch/briefing.ts";

// The briefing as an email, in the same grammar as the screen it mirrors.
//
// It lives beside the Resend adapter rather than in the domain because it is
// presentation, and beside it rather than in `src/app` because the cron has no
// React renderer and an email client would not run one anyway. It names no
// provider, takes no IO and is a pure function of the stored briefing, which is
// what lets it be tested without a key and read without sending one.
//
// Written as tables and inline styles on purpose. Gmail strips <style> blocks
// in some clients, Outlook's renderer is Word's, and a layout that needs flex
// is a layout that arrives as a column of unstyled text on half the devices a
// traveller reads it on.

/** Mist, inlined. The same three jobs colour does everywhere else. */
const C = {
  canvas: "#f7f9fb",
  surface: "#ffffff",
  hairline: "#e7ecf0",
  ink: "#1d232a",
  inkMuted: "#616c77",
  inkFaint: "#939da6",
  agent: "#4a63e7",
  agentTint: "#eef0fe",
  agentLine: "#d8ddfb",
  alert: "#c8492c",
  ok: "#1d7a57",
} as const;

const DOT: Record<BriefingTone, string> = {
  alert: C.alert,
  ok: C.ok,
  agent: C.agent,
};

const FONT =
  "'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

const esc = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const longDate = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Tbilisi",
  weekday: "long",
  day: "numeric",
  month: "long",
});

export type EmailLinks = {
  /** The in-app briefing, which is where every link in the email goes. */
  briefing: string;
  /** Watch settings — the one-click way to stop receiving these. */
  settings: string;
  /** The open pixel. Absent in a preview render. */
  pixel?: string;
};

export type RenderedEmail = { subject: string; html: string; text: string };

/**
 * A subject line that is the news, not a label. "Day 3 · Rain from 16:00" is
 * worth opening; "Your daily briefing" is what every unread email says.
 */
export function subjectFor(briefing: Briefing): string {
  const day = `Day ${briefing.day.index}`;
  if (briefing.quiet) return `${day} · all clear`;
  const first = briefing.lines[0]?.title ?? "your briefing";
  return `${day} · ${first.length > 60 ? `${first.slice(0, 57)}…` : first}`;
}

const lineRow = (line: Briefing["lines"][number], first: boolean) => {
  const border = first ? "none" : `1px solid ${C.hairline}`;
  return `
  <tr>
    <td width="18" valign="top" style="border-top:${border};padding:16px 0 0 0;">
      <div style="width:8px;height:8px;border-radius:8px;background:${DOT[line.tone]};"></div>
    </td>
    <td valign="top" style="border-top:${border};padding:11px 0 13px 0;font-family:${FONT};">
      <div style="font-size:11px;letter-spacing:0.06em;text-transform:uppercase;color:${C.inkFaint};padding-bottom:3px;">
        ${esc(line.kind)}
      </div>
      <div style="font-size:15px;font-weight:500;color:${C.ink};line-height:1.35;">
        ${esc(line.title)}
      </div>
      <div style="font-size:13px;color:${C.inkMuted};line-height:1.45;padding-top:2px;">
        ${esc(line.detail)}
      </div>
      ${
        line.evidence.length > 0
          ? `<div style="font-size:11px;color:${C.inkFaint};padding-top:6px;">${line.evidence
              .map(esc)
              .join(" · ")}</div>`
          : ""
      }
    </td>
  </tr>`;
};

const changeBlock = (briefing: Briefing, links: EmailLinks) => {
  const change = briefing.change;
  if (!change) return "";
  return `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
         style="margin-top:18px;background:${C.agentTint};border:1px solid ${C.agentLine};border-radius:12px;">
    <tr>
      <td style="padding:16px 16px 14px 16px;font-family:${FONT};">
        <div style="font-size:11px;letter-spacing:0.06em;text-transform:uppercase;color:${C.agent};font-weight:600;padding-bottom:6px;">
          1 change recommended
        </div>
        <div style="font-size:15px;color:${C.ink};line-height:1.45;">
          ${esc(change.sentence)}
        </div>
        <div style="font-size:11px;color:${C.inkFaint};padding-top:8px;">
          ${esc(change.evidence)}
        </div>
        <div style="padding-top:14px;">
          <a href="${esc(links.briefing)}"
             style="display:inline-block;background:${C.agent};color:#ffffff;font-family:${FONT};font-size:14px;font-weight:500;text-decoration:none;padding:10px 18px;border-radius:9px;">
            See the change
          </a>
        </div>
        <div style="font-size:11px;color:${C.inkFaint};padding-top:10px;">
          Nothing is applied until you accept it.
        </div>
      </td>
    </tr>
  </table>`;
};

const stopsBlock = (briefing: Briefing) => {
  const stops = briefing.day.stops;
  if (stops.length === 0) return "";
  return `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
         style="margin-top:18px;border-top:1px solid ${C.hairline};">
    <tr>
      <td style="padding:12px 0 0 0;font-family:${FONT};font-size:11px;letter-spacing:0.06em;text-transform:uppercase;color:${C.inkFaint};">
        Your day
      </td>
    </tr>
    ${stops
      .map(
        (
          s,
        ) => `<tr><td style="padding:5px 0;font-family:${FONT};font-size:13px;color:${C.inkMuted};">
          <span style="color:${C.ink};font-variant-numeric:tabular-nums;">${at(s.startsAt)}</span>
          &nbsp;&nbsp;${esc(s.title)}
        </td></tr>`,
      )
      .join("")}
  </table>`;
};

export function renderBriefingEmail(
  briefing: Briefing,
  links: EmailLinks,
): RenderedEmail {
  const date = longDate.format(new Date(`${briefing.day.date}T09:00:00+04:00`));
  const sources =
    briefing.sources === 1 ? "1 source" : `${briefing.sources} sources`;

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<title>${esc(subjectFor(briefing))}</title>
</head>
<body style="margin:0;padding:0;background:${C.canvas};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(briefing.greeting)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.canvas};">
  <tr>
    <td align="center" style="padding:28px 16px;">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0"
             style="width:100%;max-width:560px;background:${C.surface};border:1px solid ${C.hairline};border-radius:16px;">
        <tr>
          <td style="padding:22px 20px 16px 20px;font-family:${FONT};">
            <div style="font-size:11px;letter-spacing:0.06em;text-transform:uppercase;color:${C.inkFaint};">
              Day ${briefing.day.index} · ${esc(date)}
            </div>
            <div style="font-size:24px;font-weight:600;color:${C.ink};padding-top:6px;letter-spacing:-0.01em;">
              Good morning
            </div>
            <div style="font-size:15px;color:${C.inkMuted};line-height:1.5;padding-top:6px;">
              ${esc(briefing.greeting)}
            </div>
          </td>
        </tr>
        <tr>
          <td style="padding:0 20px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
                   style="border-top:1px solid ${C.hairline};">
              ${briefing.lines.map((l, i) => lineRow(l, i === 0)).join("")}
            </table>
            ${changeBlock(briefing, links)}
            ${stopsBlock(briefing)}
          </td>
        </tr>
        <tr>
          <td style="padding:18px 20px 22px 20px;font-family:${FONT};">
            <a href="${esc(links.briefing)}"
               style="display:inline-block;border:1px solid ${C.hairline};color:${C.ink};font-size:14px;text-decoration:none;padding:10px 18px;border-radius:9px;">
              Open your day
            </a>
          </td>
        </tr>
      </table>
      <div style="font-family:${FONT};font-size:11px;color:${C.inkFaint};padding-top:14px;line-height:1.6;">
        Watching · ${sources} · <a href="${esc(links.settings)}" style="color:${C.inkFaint};">change what you hear about</a>
      </div>
    </td>
  </tr>
</table>
${links.pixel ? `<img src="${esc(links.pixel)}" width="1" height="1" alt="" style="display:block;border:0;">` : ""}
</body>
</html>`;

  return {
    subject: subjectFor(briefing),
    html,
    text: renderText(briefing, links),
  };
}

/**
 * The plain-text part, which is not a courtesy: a client that shows it is a
 * client that refused the HTML, and a traveller on a mountain connection is
 * exactly the reader this product has.
 */
export function renderText(briefing: Briefing, links: EmailLinks): string {
  const parts = [
    `Day ${briefing.day.index} — ${longDate.format(new Date(`${briefing.day.date}T09:00:00+04:00`))}`,
    "",
    briefing.greeting,
    "",
  ];

  for (const line of briefing.lines) {
    parts.push(`${line.kind.toUpperCase()}: ${line.title}`);
    parts.push(`  ${line.detail}`);
    for (const evidence of line.evidence) parts.push(`  (${evidence})`);
    parts.push("");
  }

  if (briefing.change) {
    parts.push("ONE CHANGE RECOMMENDED");
    parts.push(`  ${briefing.change.sentence}`);
    parts.push(`  (${briefing.change.evidence})`);
    parts.push("  Nothing is applied until you accept it.");
    parts.push("");
  }

  if (briefing.day.stops.length > 0) {
    parts.push("YOUR DAY");
    for (const stop of briefing.day.stops) {
      parts.push(`  ${at(stop.startsAt)}  ${stop.title}`);
    }
    parts.push("");
  }

  parts.push(links.briefing);
  parts.push(
    `Watching · ${briefing.sources === 1 ? "1 source" : `${briefing.sources} sources`} · ${links.settings}`,
  );
  return parts.join("\n");
}
