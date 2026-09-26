import type { LonLat } from "../geo.ts";
import { nodeEnd, sortedNodes, type TripDoc } from "./document.ts";

// The itinerary as an iCalendar file (RFC 5545), so a trip can live in the
// calendar a traveller already looks at. One event per stop, in UTC, with the
// stop's position as GEO so a phone can route to it.

/** 20260916T120000Z */
const stamp = (ms: number) =>
  new Date(ms)
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");

/** Text values escape backslash, semicolon, comma and newline. */
const text = (s: string) =>
  s
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");

/** Lines longer than 75 octets are folded onto continuation lines. */
function fold(line: string): string {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;
  const parts: string[] = [];
  let current = "";
  let size = 0;
  for (const char of line) {
    const n = new TextEncoder().encode(char).length;
    if (size + n > (parts.length ? 74 : 75)) {
      parts.push(current);
      current = "";
      size = 0;
    }
    current += char;
    size += n;
  }
  parts.push(current);
  return parts.join("\r\n ");
}

export function toIcs(
  tripId: string,
  doc: TripDoc,
  positions: Readonly<Record<string, LonLat>>,
  now: Date,
): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//trip.io//itinerary//EN",
    "CALSCALE:GREGORIAN",
    `X-WR-CALNAME:${text(doc.trip.title)}`,
  ];
  for (const { id, node } of sortedNodes(doc.nodes)) {
    const at = positions[id];
    lines.push(
      "BEGIN:VEVENT",
      `UID:${id}@${tripId}.trip.io`,
      `DTSTAMP:${stamp(now.getTime())}`,
      `DTSTART:${stamp(Date.parse(node.startsAt))}`,
      `DTEND:${stamp(nodeEnd(node))}`,
      `SUMMARY:${text(node.meta.title)}`,
      ...(node.meta.note ? [`DESCRIPTION:${text(node.meta.note)}`] : []),
      ...(at ? [`GEO:${at[1].toFixed(5)};${at[0].toFixed(5)}`] : []),
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return `${lines.map(fold).join("\r\n")}\r\n`;
}
