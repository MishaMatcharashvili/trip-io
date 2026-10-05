import type { Metadata } from "next";
import { headers } from "next/headers";
import { nextToAudit } from "@/bll/audit";
import { type Dashboard, loadDashboard } from "@/bll/ops-dashboard";
import { getAuth } from "@/infra/auth.ts";
import { curatorEmails, isCurator } from "@/lib/curator";
import { SignIn } from "../curate/sign-in";
import { AuditPanel } from "./audit-panel";
import {
  bandClass,
  bandLabel,
  interval,
  number,
  percent,
  tbilisi,
  usd,
} from "./format";

export const metadata: Metadata = {
  title: "Kill criteria",
  robots: { index: false },
};

// The page the hundred-traveller cohort is judged on (context/phase-9-design.md).
// Server-rendered and read-only apart from the audit buttons: it is read once a
// day by one person, so there is nothing here to keep live.

export default async function OpsPage() {
  const session = await getAuth().api.getSession({ headers: await headers() });

  if (!session || session.user.isAnonymous) {
    return (
      <Centered>
        <h1 className="text-xl font-semibold">Kill criteria</h1>
        <p className="text-zinc-600 dark:text-zinc-400">
          Sign in with an operator account.
        </p>
        <SignIn callbackURL="/ops" />
      </Centered>
    );
  }
  if (!isCurator(session.user)) {
    return (
      <Centered>
        <h1 className="text-xl font-semibold">Not an operator</h1>
        <p className="text-zinc-600 dark:text-zinc-400">
          {session.user.email} isn&apos;t in <code>CURATOR_EMAILS</code>.
        </p>
      </Centered>
    );
  }

  const operators = curatorEmails();
  const [dash, next] = await Promise.all([
    loadDashboard(operators),
    nextToAudit(operators),
  ]);

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-10 px-4 py-6">
      <Header dash={dash} />
      <KillRows dash={dash} />
      <Health dash={dash} />
      <Spend dash={dash} />
      <Radius dash={dash} />
      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold">Hand audit</h2>
        <AuditPanel item={next} />
        <AuditFamilies dash={dash} />
      </section>
    </main>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 px-4 text-center">
      {children}
    </main>
  );
}

const th = "py-1.5 pr-4 text-left text-xs font-medium text-zinc-500";
const td = "py-1.5 pr-4 align-top";

function Header({ dash }: { dash: Dashboard }) {
  const { cohort } = dash;
  return (
    <header className="flex flex-col gap-3">
      <h1 className="text-2xl font-semibold">Kill criteria</h1>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        {cohort.trips === 0
          ? "No trips in the cohort yet: an owner who is not an operator, holding a pass."
          : `${cohort.trips} trips (${cohort.started} started), ${cohort.tripDays} trip-days so far.`}{" "}
        Every rate is over that cohort and shows how many it rests on.
      </p>
      {dash.stale.length > 0 && (
        <div
          role="alert"
          className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-200"
        >
          <p className="font-medium">
            The pipeline looks stopped. Nothing below can be trusted until it
            runs.
          </p>
          <ul className="list-disc pl-5">
            {dash.stale.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        </div>
      )}
      <p className="text-xs text-zinc-500">
        As of {tbilisi(dash.generatedAt)} Tbilisi time.
      </p>
    </header>
  );
}

function KillRows({ dash }: { dash: Dashboard }) {
  return (
    <section className="flex flex-col gap-3" aria-label="The six criteria">
      {dash.kill.map((row) => (
        <article
          key={row.key}
          className="flex flex-col gap-2 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-medium">{row.label}</h2>
            <span
              className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${bandClass[row.band]}`}
            >
              {bandLabel[row.band]}
            </span>
          </div>
          <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="text-3xl font-semibold tabular-nums">
              {row.value === null
                ? "—"
                : row.unit === "percent"
                  ? percent(row.value)
                  : row.value.toFixed(1)}
            </span>
            <span className="text-sm text-zinc-500">
              {row.unit === "percent"
                ? `${row.successes ?? 0} of ${row.n}`
                : `per 7-day trip, over ${row.n} trips`}
              {row.interval && ` · 90% interval ${interval(row.interval)}`}
            </span>
          </p>
          <p className="text-xs text-zinc-500">
            Continue {row.continueText} · stop {row.stopText}
          </p>
          {row.alongside.length > 0 && (
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-0.5 text-sm">
              {row.alongside.map((a) => (
                <div key={a.label} className="contents">
                  <dt className="text-zinc-500">{a.label}</dt>
                  <dd className="tabular-nums">{a.value}</dd>
                </div>
              ))}
            </dl>
          )}
          {row.notes.map((n) => (
            <p key={n} className="text-xs text-zinc-500">
              {n}
            </p>
          ))}
        </article>
      ))}
    </section>
  );
}

function Tally({
  title,
  rows,
}: {
  title: string;
  rows: { label: string; n: number }[];
}) {
  return (
    <div>
      <h3 className="mb-1 text-sm font-medium">{title}</h3>
      {rows.length === 0 ? (
        <p className="text-sm text-zinc-500">Nothing yet.</p>
      ) : (
        <table className="text-sm">
          <tbody>
            {rows.map((r) => (
              <tr key={r.label}>
                <td className={td}>{r.label}</td>
                <td className={`${td} tabular-nums`}>{number(r.n)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function Health({ dash }: { dash: Dashboard }) {
  const { health } = dash;
  const perDay = new Map(
    health.pairsPerTripDay.map((p) => [p.family, p.value]),
  );
  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold">The pipeline</h2>
      <div className="overflow-x-auto">
        <table className="text-sm">
          <thead>
            <tr>
              {[
                "Family",
                "Pairs",
                "Per trip-day",
                "Judged",
                "Worth sending",
                "Dropped",
                "Waiting",
              ].map((h) => (
                <th key={h} className={th}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {health.funnel.map((f) => (
              <tr key={f.family}>
                <td className={td}>{f.family}</td>
                <td className={`${td} tabular-nums`}>{number(f.pairs)}</td>
                <td className={`${td} tabular-nums`}>
                  {(perDay.get(f.family) ?? 0).toFixed(1)}
                </td>
                <td className={`${td} tabular-nums`}>{number(f.judged)}</td>
                <td className={`${td} tabular-nums`}>{number(f.worth)}</td>
                <td className={`${td} tabular-nums`}>{number(f.dropped)}</td>
                <td className={`${td} tabular-nums`}>{number(f.unjudged)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {health.funnel.length === 0 && (
          <p className="text-sm text-zinc-500">No matched pairs yet.</p>
        )}
        <p className="mt-1 text-xs text-zinc-500">
          Budget: at most about 12 pairs per trip-day. Over it, the radius is
          too wide, not the prompt too long.
        </p>
      </div>
      <div className="grid gap-6 sm:grid-cols-3">
        <Tally title="Why verdicts were routed" rows={health.routeReasons} />
        <Tally title="Why verdicts were refused" rows={health.rejections} />
        <Tally title="How trips were generated" rows={health.generation} />
      </div>
    </section>
  );
}

function Spend({ dash }: { dash: Dashboard }) {
  const { spend } = dash;
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">
        Model spend, last {spend.windowDays} days
      </h2>
      <p className="text-sm">
        {number(spend.totalCalls)} calls · {usd(spend.totalUsd)} in all ·{" "}
        {spend.usdPerCohortTripDay === null
          ? "per cohort trip-day: not available"
          : `${usd(spend.usdPerCohortTripDay)} per cohort trip-day`}
      </p>
      {spend.unpriced.length > 0 && (
        <p className="text-xs text-zinc-500">
          No price is set for {spend.unpriced.join(", ")}
          (src/domain/watch/kill-criteria.ts), so only tokens are shown.
        </p>
      )}
      <div className="overflow-x-auto">
        <table className="text-sm">
          <thead>
            <tr>
              {[
                "Purpose",
                "Calls",
                "Failed",
                "Input tokens",
                "Output tokens",
                "Cost",
              ].map((h) => (
                <th key={h} className={th}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {spend.purposes.map((p) => (
              <tr key={p.purpose}>
                <td className={td}>{p.purpose}</td>
                <td className={`${td} tabular-nums`}>{number(p.calls)}</td>
                <td className={`${td} tabular-nums`}>{number(p.failed)}</td>
                <td className={`${td} tabular-nums`}>
                  {number(p.inputTokens)}
                </td>
                <td className={`${td} tabular-nums`}>
                  {number(p.outputTokens)}
                </td>
                <td className={`${td} tabular-nums`}>{usd(p.usd)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {spend.purposes.length === 0 && (
          <p className="text-sm text-zinc-500">No model calls recorded yet.</p>
        )}
      </div>
    </section>
  );
}

function Radius({ dash }: { dash: Dashboard }) {
  const families = [...new Set(dash.radius.map((r) => r.family))];
  const label = (km: number | null) => (km === null ? "beyond" : `≤ ${km} km`);
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">Match radius</h2>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        Distance from the event to the stop, for pairs worth sending against
        pairs dropped. If everything worth sending is in the first rows, the
        radius past them buys only junk.
      </p>
      {families.length === 0 && (
        <p className="text-sm text-zinc-500">No matched pairs yet.</p>
      )}
      {families.map((family) => (
        <div key={family} className="overflow-x-auto">
          <table className="text-sm">
            <caption className="pb-1 text-left text-sm font-medium">
              {family}
            </caption>
            <thead>
              <tr>
                {["Distance", "Worth sending", "Dropped", "Waiting"].map(
                  (h) => (
                    <th key={h} className={th}>
                      {h}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {dash.radius
                .filter((r) => r.family === family)
                .map((r) => (
                  <tr key={String(r.upToKm)}>
                    <td className={td}>{label(r.upToKm)}</td>
                    <td className={`${td} tabular-nums`}>{r.worth}</td>
                    <td className={`${td} tabular-nums`}>{r.dropped}</td>
                    <td className={`${td} tabular-nums`}>{r.unjudged}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      ))}
    </section>
  );
}

function AuditFamilies({ dash }: { dash: Dashboard }) {
  return (
    <div className="overflow-x-auto">
      <table className="text-sm">
        <thead>
          <tr>
            {[
              "Family",
              "Audited",
              "Wrong",
              "Rate (90% interval)",
              "Days live",
              "May graduate",
            ].map((h) => (
              <th key={h} className={th}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {dash.audit.map((f) => (
            <tr key={f.family}>
              <td className={td}>{f.family}</td>
              <td className={`${td} tabular-nums`}>{f.audited}</td>
              <td className={`${td} tabular-nums`}>
                {f.wrong}
                {f.reasons.length > 0 &&
                  ` (${f.reasons.map((r) => `${r.label} ${r.n}`).join(", ")})`}
              </td>
              <td className={`${td} tabular-nums`}>
                {f.rate === null
                  ? "—"
                  : `${percent(f.rate)} (${interval(f.interval)})`}
              </td>
              <td className={`${td} tabular-nums`}>{f.daysLive ?? "—"}</td>
              <td className={td}>
                {f.family === "safety" ? "never" : f.ready ? "yes" : "not yet"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-1 text-xs text-zinc-500">
        &ldquo;May graduate&rdquo; is a hint, not a switch: a week live and a
        rate whose whole interval is under 15%. A detector enters
        INTERRUPT_ELIGIBLE by an edit, in review. All audits are counted here;
        only cohort audits count in the false-positive row above. One auditor.
      </p>
    </div>
  );
}
