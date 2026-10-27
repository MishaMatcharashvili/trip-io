import { overview } from "@/bll/admin";
import type { Table } from "@/domain/admin/table.ts";
import { number } from "../ops/format";
import { DataTable } from "./data-table";
import { keepOut } from "./gate";
import { PageHead } from "./page-head";

export default async function AdminHome() {
  const out = await keepOut("/admin");
  if (out) return out;
  const { totals: t, daily, funnel: f, mixes: m } = await overview();

  const tiles: [string, number, string?][] = [
    ["Accounts", t.accounts, `${t.verifiedAccounts} verified`],
    ["Guests", t.guests, "planned a trip, no account"],
    ["Trips", t.trips, `${t.tripsLive} live · ${t.tripsUpcoming} upcoming`],
    [
      "Watch passes",
      t.passesFree + t.passesPaid,
      `${t.passesPaid} paid · ${t.passesFree} free`,
    ],
    ["Revenue", t.revenueCents / 100, "all passes, as recorded"],
    ["Saved places", t.savedPlaces],
    ["Devices", t.devices, "registered for push"],
    ["Articles fetched", t.articles],
    ["World events", t.events, `${t.eventsActive} active now`],
    ["Regions with trips", t.regionsWithTrips, "of 64"],
    ["Briefings", t.briefings, `${t.briefingsOpened} opened`],
    ["Alerts", t.interventions, `${t.interventionsAccepted} accepted`],
  ];

  const steps: [string, number][] = [
    ["Arrived", f.visitors],
    ["Planned a trip", f.withTrip],
    ["Made an account", f.accounts],
    ["Account with a trip", f.accountsWithTrip],
    ["Watched a trip", f.watched],
    ["Paid", f.paid],
  ];

  const dailyTable: Table = {
    columns: [
      { key: "day", kind: "date", label: "Day", format: "text" },
      { key: "visitors", kind: "number", label: "Visitors", format: "number" },
      { key: "guests", kind: "number", label: "New guests", format: "number" },
      {
        key: "accounts",
        kind: "number",
        label: "New accounts",
        format: "number",
      },
      { key: "trips", kind: "number", label: "Trips made", format: "number" },
      { key: "passes", kind: "number", label: "Passes", format: "number" },
      { key: "articles", kind: "number", label: "Articles", format: "number" },
      { key: "events", kind: "number", label: "Events", format: "number" },
    ],
    rows: [...daily].reverse().map((d) => ({ ...d })),
    total: daily.length,
  };

  return (
    <>
      <PageHead title="Overview">
        The whole product, operators and guests included. Days are Tbilisi days.
      </PageHead>

      <section
        aria-label="Totals"
        className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6"
      >
        {tiles.map(([label, value, note]) => (
          <div
            key={label}
            className="flex flex-col gap-0.5 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800"
          >
            <span className="text-xs font-medium text-zinc-500">{label}</span>
            <span className="text-2xl font-semibold tabular-nums">
              {label === "Revenue" ? `$${value.toFixed(2)}` : number(value)}
            </span>
            {note && <span className="text-xs text-zinc-500">{note}</span>}
          </div>
        ))}
      </section>

      <section className="flex max-w-3xl flex-col gap-2">
        <h2 className="text-lg font-semibold">Where people drop out</h2>
        <ol className="flex flex-col gap-1.5">
          {steps.map(([label, n]) => (
            <li
              key={label}
              className="grid grid-cols-[11rem_1fr_3rem] items-center gap-3 text-sm"
            >
              <span>{label}</span>
              <span className="h-3 rounded-sm bg-zinc-100 dark:bg-zinc-900">
                <span
                  className="block h-3 rounded-sm bg-foreground"
                  style={{
                    width: `${f.visitors ? (n / f.visitors) * 100 : 0}%`,
                  }}
                />
              </span>
              <span className="text-right tabular-nums">{number(n)}</span>
            </li>
          ))}
        </ol>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">Last 30 days</h2>
        <DataTable
          table={dailyTable}
          initialSort={{ key: "day", dir: "desc" }}
        />
      </section>

      <section className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        <Mix title="Sign-in methods" rows={m.providers} />
        <Mix title="Trip pace" rows={m.pace} />
        <Mix title="Watch passes" rows={m.passProviders} />
        <Mix title="Alert outcomes" rows={m.outcomes} />
        <Mix title="Event kinds" rows={m.eventKinds} />
        <Mix title="Article status" rows={m.articleStatus} />
      </section>
    </>
  );
}

function Mix({
  title,
  rows,
}: {
  title: string;
  rows: { label: string; n: number }[];
}) {
  return (
    <div className="flex flex-col gap-1">
      <h2 className="text-sm font-semibold">{title}</h2>
      {rows.length === 0 ? (
        <p className="text-sm text-zinc-500">Nothing yet.</p>
      ) : (
        <ul className="text-sm">
          {rows.map((r) => (
            <li
              key={r.label}
              className="flex justify-between border-b border-zinc-100 py-1 dark:border-zinc-900"
            >
              <span>{r.label}</span>
              <span className="tabular-nums">{number(r.n)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
