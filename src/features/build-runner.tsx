"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { Constraints } from "@/domain/trip/generate/constraints";
import { withGuestSession } from "@/lib/guest-session";
import { apiClient } from "@/lib/hono-client";
import { Button, ButtonLink } from "@/ui/button";
import { Icon } from "@/ui/icon";
import { forgetConversation } from "./new-trip";

// Building a trip: one generate call, which takes tens of seconds with the
// model. The steps are what the pipeline does, in order; they advance on a
// clock while the call runs and all complete when it answers, then the page
// moves on to the trip.

export type BuildStep = { title: string; note: string };

type State =
  | { kind: "running"; step: number }
  | { kind: "failed"; message: string };

/** The build was called off: not a failure, and not something to show as one. */
class Cancelled extends Error {}

const POLL_MS = 3000;

/** Waits on a build another call is running, until it has a trip or has none. */
async function awaitBuild(requestId: string, alive: () => boolean) {
  while (alive()) {
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
    const res = await apiClient.api.trips.generate[":requestId"].$get({
      param: { requestId },
    });
    const body = (await res.json().catch(() => null)) as {
      status?: string;
      tripId?: string;
    } | null;
    if (body?.status === "done" && body.tripId) return body.tripId;
    if (body?.status === "cancelled") throw new Cancelled();
    // Released: the call that held it failed.
    if (body?.status === "unknown") break;
  }
  throw new Error(FAILED);
}

const FAILED =
  "The trip couldn’t be built. Try again, or change what you asked for.";

async function generate(
  constraints: Constraints,
  requestId: string | undefined,
  alive: () => boolean,
) {
  const res = await withGuestSession(() =>
    apiClient.api.trips.generate.$post({
      json: { ...constraints, requestId },
    }),
  );
  const status = res.status as number;
  const body = (await res.json().catch(() => null)) as {
    id?: string;
    error?: string;
    message?: string;
  } | null;
  if (res.ok && body?.id) return body.id;
  // This request is already being built — by this page before a reload, or
  // by another tab. Wait for that one rather than start another.
  if (status === 202 && requestId) return awaitBuild(requestId, alive);
  if (body?.error === "cancelled") throw new Cancelled();
  throw new Error(
    body?.message ??
      (body?.error === "insufficient-coverage"
        ? "There aren’t enough places in those areas yet to build a trip."
        : FAILED),
  );
}

/**
 * Calls the build off and goes back to the conversation. A build that has
 * already finished cannot be called off: the page is about to open the trip.
 */
export function CancelBuild({ requestId }: { requestId?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      variant="ghost"
      disabled={busy}
      onClick={async () => {
        if (!requestId) return router.push("/new");
        setBusy(true);
        const res = await apiClient.api.trips.generate[
          ":requestId"
        ].cancel.$post({ param: { requestId } });
        const body = (await res.json().catch(() => null)) as {
          cancelled?: boolean;
        } | null;
        if (body?.cancelled === false) return;
        router.push("/new");
      }}
    >
      Cancel
    </Button>
  );
}

export function BuildRunner({
  constraints,
  steps,
  requestId,
}: {
  constraints: Constraints;
  steps: BuildStep[];
  /** Minted on /new when the build was asked for: the same id is the same build. */
  requestId?: string;
}) {
  const router = useRouter();
  const [state, setState] = useState<State>({ kind: "running", step: 0 });
  // Strict mode mounts twice in development; one trip, not two.
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    const clock = setInterval(
      () =>
        setState((s) =>
          s.kind === "running" && s.step < steps.length - 1
            ? { kind: "running", step: s.step + 1 }
            : s,
        ),
      9000,
    );
    let alive = true;
    generate(constraints, requestId, () => alive)
      .then((id) => {
        clearInterval(clock);
        setState({ kind: "running", step: steps.length });
        forgetConversation();
        router.replace(`/trips/${id}`);
      })
      .catch((error: Error) => {
        clearInterval(clock);
        if (error instanceof Cancelled) router.replace("/new");
        else setState({ kind: "failed", message: error.message });
      });
    return () => {
      alive = false;
      clearInterval(clock);
    };
  }, [constraints, requestId, steps.length, router]);

  const current = state.kind === "running" ? state.step : -1;
  const progress =
    state.kind === "running"
      ? Math.min(100, Math.round(((current + 0.5) / steps.length) * 100))
      : 0;

  return (
    <>
      <div className="mx-6 h-[3px] overflow-hidden rounded-sm bg-track">
        <div
          className="h-full rounded-sm bg-agent transition-[width] duration-700"
          style={{ width: `${progress}%` }}
        />
      </div>

      <div className="flex flex-col px-6 pb-5 pt-4">
        {steps.map((step, i) => {
          const status =
            state.kind === "failed"
              ? "waiting"
              : i < current
                ? "done"
                : i === current
                  ? "running"
                  : "waiting";
          return (
            <div
              key={step.title}
              className={`flex items-center gap-3 py-2.5 ${i > 0 ? "border-t border-track" : ""} ${
                status === "waiting" ? "opacity-50" : ""
              }`}
            >
              {status === "done" ? (
                <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-ok-tint text-ok">
                  <Icon name="check" size={11} strokeWidth={2.6} />
                </span>
              ) : status === "running" ? (
                <span className="size-5 shrink-0 animate-breathe rounded-full border-2 border-agent border-t-transparent" />
              ) : (
                <span className="size-5 shrink-0 rounded-full border-[1.5px] border-control" />
              )}
              <div className="flex-1">
                <div
                  className={`text-small ${status === "running" ? "font-semibold" : "font-medium"}`}
                >
                  {step.title}
                </div>
                <div
                  className={`text-mini ${status === "running" ? "text-agent" : "text-ink-faint"}`}
                >
                  {step.note}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {state.kind === "failed" ? (
        <div className="mx-6 mb-6 flex flex-col gap-3 rounded-control bg-alert-tint px-3.5 py-3">
          <span className="text-small text-alert">{state.message}</span>
          <div>
            <ButtonLink href="/new" size="sm">
              Change what I asked for
            </ButtonLink>
          </div>
        </div>
      ) : null}
    </>
  );
}
