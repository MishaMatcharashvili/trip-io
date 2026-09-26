"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { Constraints } from "@/domain/trip/generate/constraints";
import { authClient } from "@/lib/auth-client";
import { apiClient } from "@/lib/hono-client";
import { ButtonLink } from "@/ui/button";
import { Icon } from "@/ui/icon";

// Building a trip: one generate call, which takes tens of seconds with the
// model. The steps are what the pipeline does, in order; they advance on a
// clock while the call runs and all complete when it answers, then the page
// moves on to the trip. No session yet means the visitor plans anonymously
// (context/architecture.md) and the trip is theirs when they sign up.

export type BuildStep = { title: string; note: string };

type State =
  | { kind: "running"; step: number }
  | { kind: "failed"; message: string };

async function generate(constraints: Constraints) {
  const call = () => apiClient.api.trips.generate.$post({ json: constraints });
  let res = await call();
  if ((res.status as number) === 401) {
    const { error } = await authClient.signIn.anonymous();
    if (error) throw new Error("Couldn’t start a session to plan in.");
    res = await call();
  }
  const body = (await res.json().catch(() => null)) as {
    id?: string;
    error?: string;
    message?: string;
  } | null;
  if (res.ok && body?.id) return body.id;
  throw new Error(
    body?.message ??
      (body?.error === "insufficient-coverage"
        ? "There aren’t enough places in those areas yet to build a trip."
        : "The trip couldn’t be built. Try again, or change what you asked for."),
  );
}

export function BuildRunner({
  constraints,
  steps,
}: {
  constraints: Constraints;
  steps: BuildStep[];
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
    generate(constraints)
      .then((id) => {
        clearInterval(clock);
        setState({ kind: "running", step: steps.length });
        router.replace(`/trips/${id}`);
      })
      .catch((error: Error) => {
        clearInterval(clock);
        setState({ kind: "failed", message: error.message });
      });
    return () => clearInterval(clock);
  }, [constraints, steps.length, router]);

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
