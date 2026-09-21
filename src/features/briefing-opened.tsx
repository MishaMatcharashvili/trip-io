"use client";

import { useEffect } from "react";

/**
 * Says the briefing was read, once, and shows nothing.
 *
 * It is a client effect rather than a write during render because a server
 * component renders on prefetch and on retry, and an "opened" that counts a
 * prefetch is not measuring what the kill criterion asks (briefings opened per
 * trip-day, continue above 50%). A failed ping is swallowed: a metric is not
 * worth an error boundary.
 */
export function BriefingOpened({ id }: { id: string }) {
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/briefings/${id}/opened`, {
      method: "POST",
      signal: controller.signal,
      keepalive: true,
    }).catch(() => {});
    return () => controller.abort();
  }, [id]);

  return null;
}
