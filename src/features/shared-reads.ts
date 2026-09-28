import { cacheLife } from "next/cache";
import { dayKey } from "@/domain/trip/document";

// Reads that are the same for every visitor, cached across requests with
// "use cache". Under Cache Components they can also be prerendered, so a page
// built from them alone is served from the CDN.
//
// They wrap use cases rather than living in src/bll: the use cases also run
// under plain Node (the tests, the Trigger.dev tasks), where cacheLife()
// throws, and a use case should not know which framework is calling it.
//
// Nothing here belongs to one traveller. A trip is never cached: the watch
// changes it from cron, and a stale trip is the one thing this product must
// not show.

/**
 * Today in Tbilisi, as YYYY-MM-DD. Up to an hour late just after midnight,
 * which is fine for what uses it: a date picker's lower bound, and the month
 * Explore's road notes are written for.
 */
export async function tbilisiToday(): Promise<string> {
  "use cache";
  cacheLife("hours");
  return dayKey(new Date());
}
