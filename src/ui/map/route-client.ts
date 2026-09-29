import type {
  RouteAnswer,
  RouteFailure,
  RouteMode,
  RouteRequestInput,
  RouteStop,
} from "../../domain/route/contract.ts";
import {
  chunkStops,
  joinAnswers,
  routeSignature,
} from "../../domain/route/plan.ts";

// Asking the server for a trip's road, without asking twice. Framework-free so
// its behaviour can be tested: the hook in use-trip-route.ts only wires it to
// React.
//
// What it will not do is as deliberate as what it does. The same question
// already on its way is joined, not repeated. An answer is remembered in
// memory for a few minutes, so leaving a page and coming back does not buy the
// same road again; it is never written to storage, and a failure is never
// remembered. Traffic ages, so past the window the question is asked afresh.

/** The server's failures, and the two only the client can have. */
export type ClientFailure = RouteFailure | "signed-out" | "offline";

export type ClientOutcome =
  | { ok: true; answer: RouteAnswer }
  | { ok: false; reason: ClientFailure };

export type Fetcher = (request: RouteRequestInput) => Promise<ClientOutcome>;

/** How long a "leave now" estimate is still worth showing as it was. */
export const FRESH_MS = 10 * 60_000;

export type RouteAsk = {
  stops: readonly RouteStop[];
  mode?: RouteMode;
  /** Only honoured between two stops. */
  alternatives?: boolean;
  /** Ask again even if a fresh answer is held: the traveller pressed refresh. */
  refresh?: boolean;
};

export function createRouteClient(
  fetcher: Fetcher,
  clock: () => number = Date.now,
) {
  const kept = new Map<string, { at: number; answer: RouteAnswer }>();
  const inflight = new Map<string, Promise<ClientOutcome>>();

  const one = (request: RouteRequestInput, refresh: boolean) => {
    const key = routeSignature(request);
    const held = kept.get(key);
    if (held && !refresh && clock() - held.at < FRESH_MS) {
      return Promise.resolve<ClientOutcome>({ ok: true, answer: held.answer });
    }
    const pending = inflight.get(key);
    if (pending) return pending;

    const call = fetcher(request)
      .then((outcome) => {
        if (outcome.ok) kept.set(key, { at: clock(), answer: outcome.answer });
        return outcome;
      })
      .finally(() => inflight.delete(key));
    inflight.set(key, call);
    return call;
  };

  return {
    async route(ask: RouteAsk): Promise<ClientOutcome> {
      const chunks = chunkStops(ask.stops);
      if (chunks.length === 0) return { ok: false, reason: "invalid" };
      const outcomes = await Promise.all(
        chunks.map((stops) =>
          one(
            {
              stops,
              mode: ask.mode,
              alternatives: ask.alternatives && stops.length === 2,
            },
            ask.refresh ?? false,
          ),
        ),
      );
      const failed = outcomes.find((o) => !o.ok);
      if (failed) return failed;
      const answers = outcomes.flatMap((o) => (o.ok ? [o.answer] : []));
      return { ok: true, answer: joinAnswers(answers) };
    },
  };
}
