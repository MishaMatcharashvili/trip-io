import {
  auditStats,
  briefingOpens,
  cohortTrips,
  familyFirstSeen,
  funnelByFamily,
  generationMix,
  interventionOutcomes,
  muteCounts,
  pipelinePulse,
  radiusBuckets,
  rejectionMix,
  routeReasonMix,
  spend,
  surveyCounts,
  worthSending,
} from "../dal/metrics.ts";
import {
  type Band,
  bandCount,
  bandProportion,
  type CountCriterion,
  CRITERIA,
  type ProportionCriterion,
  perSevenDays,
  priceFor,
  readyToGraduate,
  spendUsd,
  wilson,
} from "../domain/watch/kill-criteria.ts";

// The one page the Phase 10 cohort is judged on (docs/implementation-plan.md
// §10): six numbers, each with the sample behind it, and the machinery that
// produced them. Everything here is arithmetic over what the pipeline already
// wrote; nothing on this page changes what the pipeline does.

export type KillRow = {
  key: string;
  label: string;
  unit: "percent" | "perTrip";
  /** A proportion (0..1), or findings per seven-day trip. Null with no sample. */
  value: number | null;
  /** What `value` is a share of, or the trips a mean is over. */
  n: number;
  successes?: number;
  interval: { low: number; high: number } | null;
  band: Band;
  continueText: string;
  stopText: string;
  /** What this number cannot tell you, or is waiting for. */
  notes: string[];
  /** Figures that belong beside it. */
  alongside: { label: string; value: string }[];
};

const pct = (x: number) => `${Math.round(x * 100)}%`;

const proportionRow = (input: {
  key: string;
  label: string;
  successes: number;
  n: number;
  criterion: ProportionCriterion;
  continueText: string;
  stopText: string;
  notes?: string[];
  alongside?: { label: string; value: string }[];
}): KillRow => ({
  key: input.key,
  label: input.label,
  unit: "percent",
  value: input.n > 0 ? input.successes / input.n : null,
  n: input.n,
  successes: input.successes,
  interval: input.n > 0 ? wilson(input.successes, input.n) : null,
  band: bandProportion(input.successes, input.n, input.criterion),
  continueText: input.continueText,
  stopText: input.stopText,
  notes: input.notes ?? [],
  alongside: input.alongside ?? [],
});

export type SpendView = {
  windowDays: number;
  purposes: {
    purpose: string;
    calls: number;
    failed: number;
    inputTokens: number;
    outputTokens: number;
    /** Null while the model has no price (src/domain/watch/kill-criteria.ts). */
    usd: number | null;
  }[];
  totalCalls: number;
  totalUsd: number | null;
  /** Spend attributed to cohort trips, over their elapsed trip-days. Null without a price or a trip-day. */
  usdPerCohortTripDay: number | null;
  /** Models seen in the window that have no price. */
  unpriced: string[];
};

export type FamilyAudit = {
  family: string;
  audited: number;
  wrong: number;
  rate: number | null;
  interval: { low: number; high: number } | null;
  daysLive: number | null;
  ready: boolean;
  reasons: { label: string; n: number }[];
};

export type Dashboard = {
  generatedAt: string;
  cohort: {
    trips: number;
    started: number;
    tripDays: number;
    from: string | null;
    to: string | null;
  };
  /** Stages that have not done anything recently, as sentences. Empty when the machine looks alive. */
  stale: string[];
  kill: KillRow[];
  health: {
    funnel: Awaited<ReturnType<typeof funnelByFamily>>;
    pairsPerTripDay: { family: string; value: number }[];
    routeReasons: { label: string; n: number }[];
    rejections: { label: string; n: number }[];
    generation: { label: string; n: number }[];
  };
  spend: SpendView;
  radius: Awaited<ReturnType<typeof radiusBuckets>>;
  audit: FamilyAudit[];
};

/** More than this without sense, and nothing the page says about the cohort can be trusted. */
const STALE_AFTER_HOURS = 3;
const SPEND_WINDOW_DAYS = 30;

const hoursSince = (iso: string | null, now: Date) =>
  iso === null
    ? Number.POSITIVE_INFINITY
    : (+now - Date.parse(iso)) / 3_600_000;

export async function loadDashboard(
  operators: readonly string[],
  now: Date = new Date(),
): Promise<Dashboard> {
  const since = new Date(+now - SPEND_WINDOW_DAYS * 86_400_000);
  const [
    trips,
    outcomes,
    mutes,
    opens,
    worth,
    funnel,
    reasons,
    rejections,
    generation,
    radius,
    spendRows,
    survey,
    pulse,
    audits,
    firstSeen,
  ] = await Promise.all([
    cohortTrips(operators, now),
    interventionOutcomes(operators),
    muteCounts(operators),
    briefingOpens(operators),
    worthSending(operators),
    funnelByFamily(operators),
    routeReasonMix(operators),
    rejectionMix(operators),
    generationMix(operators),
    radiusBuckets(operators),
    spend(operators, since),
    surveyCounts(operators, now),
    pipelinePulse(),
    auditStats(),
    familyFirstSeen(),
  ]);

  const started = trips.filter((t) => t.elapsedDays > 0);
  const tripDays = trips.reduce((n, t) => n + t.elapsedDays, 0);

  // --- the six rows ---------------------------------------------------------

  const resolved = (o: typeof outcomes.all) =>
    o.accepted + o.dismissed + o.ignored + o.muted;
  const worthTotal = worth.reduce((n, w) => n + w.worth, 0);
  const interruptTotal = worth.reduce((n, w) => n + w.interrupt, 0);
  const per7 = perSevenDays(worthTotal, tripDays);

  const fp = audits.reduce(
    (a, f) => ({
      n: a.n + f.auditedInCohort,
      wrong: a.wrong + f.wrongInCohort,
    }),
    { n: 0, wrong: 0 },
  );

  const kill: KillRow[] = [
    proportionRow({
      key: "actedOn",
      label: "Interventions acted on",
      successes: outcomes.all.accepted,
      n: resolved(outcomes.all),
      criterion: CRITERIA.actedOn,
      continueText: "≥ 40%",
      stopText: "< 15%",
      notes: [
        "`ignored` is silence, not rejection — see the figure beside it.",
      ],
      alongside: [
        {
          label: "of those in a briefing that was opened, or pushed",
          value:
            resolved(outcomes.seen) > 0
              ? `${pct(outcomes.seen.accepted / resolved(outcomes.seen))} of ${resolved(outcomes.seen)}`
              : "—",
        },
        {
          label: "dismissed outright",
          value:
            resolved(outcomes.all) > 0
              ? pct(outcomes.all.dismissed / resolved(outcomes.all))
              : "—",
        },
        { label: "still pending", value: String(outcomes.all.pending) },
      ],
    }),
    proportionRow({
      key: "muted",
      label: "Notifications disabled during trip",
      successes: mutes.muted,
      n: mutes.withDevice,
      criterion: CRITERIA.muted,
      continueText: "< 10%",
      stopText: "> 25%",
      notes: [
        "Counted over trips whose owner has a registered device: nobody can mute a channel they never had.",
      ],
    }),
    proportionRow({
      key: "opened",
      label: "Briefing opened per trip-day",
      successes: opens.opened,
      n: opens.composed,
      criterion: CRITERIA.briefingOpened,
      continueText: "≥ 50%",
      stopText: "< 20%",
      notes: [
        "Email opens overstate: Apple Mail Privacy Protection fetches the pixel for its reader. The in-app figure beside it cannot be pre-fetched.",
      ],
      alongside: [
        {
          label: "opened in the app",
          value:
            opens.composed > 0
              ? `${pct(opens.openedInApp / opens.composed)} of ${opens.composed}`
              : "—",
        },
        { label: "quiet days among them", value: String(opens.quiet) },
      ],
    }),
    {
      key: "perTrip",
      label: "Interventions per trip worth sending",
      unit: "perTrip",
      value: tripDays > 0 ? per7 : null,
      n: started.length,
      interval: null,
      band: bandCount(per7, started.length, CRITERIA.perTrip as CountCriterion),
      continueText: "4–8",
      stopText: "< 2",
      notes: [
        "Per seven-day trip, over trip-days that have happened. Counts everything the judge found worth telling, one per trip and event.",
      ],
      alongside: [
        {
          label: "of which interrupts",
          value:
            worthTotal > 0
              ? `${interruptTotal} of ${worthTotal} (${pct(interruptTotal / worthTotal)})`
              : "—",
        },
        ...worth.map((w) => ({ label: w.family, value: String(w.worth) })),
      ],
    },
    proportionRow({
      key: "falsePositive",
      label: "False-positive rate, hand-audited",
      successes: fp.wrong,
      n: fp.n,
      criterion: CRITERIA.falsePositive,
      continueText: "< 15%",
      stopText: "> 35%",
      notes: [
        "One auditor, who built the thing. The dismissed rate above is the independent cross-check.",
      ],
    }),
    proportionRow({
      key: "wouldPay",
      label: "Would pay $5 per watched trip",
      successes: survey.yes,
      n: survey.answered,
      criterion: CRITERIA.wouldPay,
      continueText: "≥ 25%",
      stopText: "< 8%",
      notes: [
        `${survey.answered} of ${survey.eligible} finished trips have answered.`,
      ],
    }),
  ];

  // --- the machine ------------------------------------------------------------

  const stale: string[] = [];
  const stageAge: [string, string | null][] = [
    ["Sensing", pulse.senseAt],
    ["Judging", pulse.judgedAt],
  ];
  for (const [stage, at] of stageAge) {
    const h = hoursSince(at, now);
    if (h > STALE_AFTER_HOURS) {
      stale.push(
        at === null
          ? `${stage} has never run.`
          : `${stage} last ran ${Math.floor(h)} hours ago.`,
      );
    }
  }

  // --- spend ------------------------------------------------------------------

  const byPurpose = new Map<string, SpendView["purposes"][number]>();
  const unpriced = new Set<string>();
  let totalUsd: number | null = 0;
  let cohortUsd: number | null = 0;
  for (const row of spendRows) {
    const price = priceFor(row.model);
    const usd = spendUsd(row, price);
    if (usd === null) {
      unpriced.add(row.model);
      totalUsd = null;
      if (row.cohort) cohortUsd = null;
    } else {
      if (totalUsd !== null) totalUsd += usd;
      if (row.cohort && cohortUsd !== null) cohortUsd += usd;
    }
    const prior = byPurpose.get(row.purpose) ?? {
      purpose: row.purpose,
      calls: 0,
      failed: 0,
      inputTokens: 0,
      outputTokens: 0,
      usd: 0 as number | null,
    };
    prior.calls += row.calls;
    prior.failed += row.failed;
    prior.inputTokens += row.inputTokens;
    prior.outputTokens += row.outputTokens;
    prior.usd = usd === null || prior.usd === null ? null : prior.usd + usd;
    byPurpose.set(row.purpose, prior);
  }

  // --- the audit --------------------------------------------------------------

  const families = new Set([
    ...audits.map((a) => a.family),
    ...funnel.map((f) => f.family),
    ...firstSeen.keys(),
  ]);
  const audit: FamilyAudit[] = [...families].sort().map((family) => {
    const stats = audits.find((a) => a.family === family);
    const audited = stats?.audited ?? 0;
    const wrong = stats?.wrong ?? 0;
    const first = firstSeen.get(family) ?? null;
    const daysLive =
      first === null ? null : Math.floor(hoursSince(first, now) / 24);
    return {
      family,
      audited,
      wrong,
      rate: audited > 0 ? wrong / audited : null,
      interval: audited > 0 ? wilson(wrong, audited) : null,
      daysLive,
      ready: readyToGraduate({
        family,
        daysLive: daysLive ?? 0,
        audited,
        wrong,
      }),
      reasons: stats?.reasons ?? [],
    };
  });

  return {
    generatedAt: now.toISOString(),
    cohort: {
      trips: trips.length,
      started: started.length,
      tripDays,
      from: trips[0]?.startsAt ?? null,
      to: trips.at(-1)?.endsAt ?? null,
    },
    stale,
    kill,
    health: {
      funnel,
      pairsPerTripDay: funnel.map((f) => ({
        family: f.family,
        value: tripDays > 0 ? f.pairs / tripDays : 0,
      })),
      routeReasons: reasons,
      rejections,
      generation,
    },
    spend: {
      windowDays: SPEND_WINDOW_DAYS,
      purposes: [...byPurpose.values()],
      totalCalls: spendRows.reduce((n, r) => n + r.calls, 0),
      totalUsd,
      usdPerCohortTripDay:
        cohortUsd !== null && tripDays > 0 ? cohortUsd / tripDays : null,
      unpriced: [...unpriced],
    },
    radius,
    audit,
  };
}
