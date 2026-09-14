"use client";

import { useEffect, useState } from "react";
import { apiClient } from "@/lib/hono-client";

type Status =
  | { state: "loading" }
  | { state: "ok"; time: string }
  | { state: "error"; message: string };

/** Proves the Hono RPC wire end-to-end (Phase 0). Remove once real UI lands. */
export function HealthCheck() {
  const [status, setStatus] = useState<Status>({ state: "loading" });

  useEffect(() => {
    const controller = new AbortController();
    apiClient.api.health
      .$get(undefined, { init: { signal: controller.signal } })
      .then(async (res) => {
        if (!res.ok) throw new Error(`${res.status}`);
        const data = await res.json();
        setStatus({ state: "ok", time: data.time });
      })
      .catch((err: Error) => {
        if (controller.signal.aborted) return;
        setStatus({ state: "error", message: err.message });
      });
    return () => controller.abort();
  }, []);

  return (
    <p className="font-mono text-sm text-zinc-500 dark:text-zinc-500">
      {status.state === "loading" && "checking /api/health…"}
      {status.state === "ok" && `/api/health -> ok (${status.time})`}
      {status.state === "error" && `/api/health -> error (${status.message})`}
    </p>
  );
}
