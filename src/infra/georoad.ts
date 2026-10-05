import { parseNotices, type RoadNotice } from "../domain/watch/road-notice.ts";

// The Roads Department's notices. api.georoad.gov.ge is the API behind the
// department's own site (georoad.ge/restrictions): public, unauthenticated, no
// key, and what the page itself calls. It is the department speaking, in
// Georgian, and carries a status — restricted, restored, partial — that is
// authoritative where a model's reading of the prose is not.
//
// Nine notices a page, newest first, 4,594 and counting. One page covers a few
// weeks, so the hourly loop reads one and a backfill reads more.

const BASE = "https://api.georoad.gov.ge/api/restrictions";
const USER_AGENT = "trip-io-watch/1.0 (+road notices for travel alerts)";

export async function fetchNotices(pages = 1): Promise<RoadNotice[]> {
  const out: RoadNotice[] = [];
  for (let page = 1; page <= pages; page++) {
    const response = await fetch(`${BASE}?page=${page}`, {
      headers: { "user-agent": USER_AGENT, accept: "application/json" },
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) throw new Error(`georoad answered ${response.status}`);
    out.push(...parseNotices(await response.json()));
  }
  return out;
}
