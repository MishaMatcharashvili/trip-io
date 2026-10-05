import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";
import { corridors } from "../domain/catalogue/corridors.ts";
import type { NoticeStatus } from "../domain/watch/road-notice.ts";
import { generateJson } from "./openai.ts";

// The road spike's model call. It reads a Georgian notice from the Roads
// Department and says which of the twelve corridors it concerns and how bad it
// is. The department's own status is given to it and re-checked afterwards by
// `vetRoadClaim`; the model is only doing the part a person does by eye.

const SYSTEM = `You read one official notice from Georgia's Roads Department, in Georgian, and say
which of a fixed list of main roads it is about and what it does to traffic.

- corridor: the slug of the road the notice is about, from the list, or null if it is
  about a different road or about something that is not a road (a water-supply notice).
  Match by the road's name and the places it passes through. Do not guess: if the notice
  names a road or village you cannot place on one of the listed roads, answer null.
- condition: "closed" if traffic is prohibited or stopped; "restricted" if some traffic is
  allowed (one lane, chains, high-clearance vehicles only, trailers banned, night hours);
  "delays" if traffic is slowed or diverted; "reopened" if the notice says traffic has been
  restored or lifted; "none" if the notice is not about traffic on a road. Read the text of
  the notice for this. The department's status code is given too, and is sometimes wrong:
  do not copy it, answer what the notice says.
- quote: the sentence that says it, copied exactly from the notice, character for
  character. Empty only when condition is "none".

Never use knowledge beyond the notice.`;

const schema = z.object({
  corridor: z.string().nullable(),
  condition: z.enum(["closed", "restricted", "delays", "reopened", "none"]),
  quote: z.string(),
});
const FORMAT = zodTextFormat(schema, "road_claim");

// The waypoints are the corridors' own (they pin the routing), and are the
// places a notice is likely to name.
const roads = corridors.map((c) => ({
  slug: c.slug,
  name: c.name,
  via: c.waypoints.map((w) => w[0]),
}));

export const readRoadNotice = (input: {
  text: string;
  status: NoticeStatus;
  publishedAt: string;
}): Promise<unknown> =>
  generateJson({
    instructions: SYSTEM,
    input: [
      {
        role: "user",
        content: JSON.stringify({
          roads,
          departmentStatus: input.status,
          publishedAt: input.publishedAt,
          notice: input.text,
        }),
      },
    ],
    format: FORMAT,
    effort: "low",
  });
