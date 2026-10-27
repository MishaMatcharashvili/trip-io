import Link from "next/link";
import { notFound } from "next/navigation";
import { userDetail } from "@/bll/admin";
import { signInMethods, userKind } from "@/domain/admin/people.ts";
import { DataTable } from "../../data-table";
import { when } from "../../format";
import { keepOut } from "../../gate";
import { PageHead } from "../../page-head";

export default async function UserPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const { userId } = await params;
  const out = await keepOut(`/admin/users/${userId}`);
  if (out) return out;
  const detail = await userDetail(userId);
  if (!detail) notFound();
  const { user, sessions, devices, trips } = detail;
  const guest = userKind(user.isAnonymous) === "guest";

  const facts: [string, string][] = [
    ["Type", guest ? "Guest (no account yet)" : "Account"],
    [
      "Email",
      guest
        ? "—"
        : `${user.email}${user.emailVerified ? "" : " (not verified)"}`,
    ],
    ["Signs in with", guest ? "—" : signInMethods(user.providers) || "—"],
    ["Joined", when(user.joinedAt)],
    ["Last active", user.lastActiveAt ? when(user.lastActiveAt) : "—"],
    ["Trips", String(user.trips)],
    ["Watched trips", String(user.watchedTrips)],
    ["Paid", user.paidCents ? `$${(user.paidCents / 100).toFixed(2)}` : "—"],
    ["Saved places", String(user.savedPlaces)],
    ["Alerts (accepted)", `${user.alerts} (${user.alertsAccepted})`],
  ];

  return (
    <>
      <Link
        href="/admin/users"
        className="text-sm text-zinc-600 underline dark:text-zinc-400"
      >
        ← All users
      </Link>
      <PageHead title={user.name || (guest ? "Guest" : user.email)} />
      <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-2 lg:grid-cols-5">
        {facts.map(([k, v]) => (
          <div key={k}>
            <dt className="text-xs font-medium text-zinc-500">{k}</dt>
            <dd className="break-words">{v}</dd>
          </div>
        ))}
      </dl>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">Trips</h2>
        <DataTable
          table={trips}
          initialSort={{ key: "created", dir: "desc" }}
          empty="No trips."
        />
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">Sessions</h2>
        {sessions.length === 0 ? (
          <p className="text-sm text-zinc-500">No sessions.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-zinc-100 text-sm dark:divide-zinc-900">
            {sessions.map((s) => (
              <li key={s.id} className="flex flex-col gap-0.5 py-2">
                <span>
                  Started {when(s.createdAt)}, last seen {when(s.lastSeenAt)}
                  {Date.parse(s.expiresAt) < Date.now() && " (expired)"}
                </span>
                <span className="break-words text-xs text-zinc-500">
                  {[s.ipAddress, s.userAgent].filter(Boolean).join(" · ") ||
                    "no client recorded"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">Devices</h2>
        {devices.length === 0 ? (
          <p className="text-sm text-zinc-500">
            No devices registered for push.
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-zinc-100 text-sm dark:divide-zinc-900">
            {devices.map((d) => (
              <li key={d.id} className="py-2">
                {d.platform}, added {when(d.createdAt)}, last seen{" "}
                {when(d.lastSeenAt)}
                {d.disabledAt &&
                  `. Disabled ${when(d.disabledAt)}${d.disabledReason ? `: ${d.disabledReason}` : ""}`}
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
