"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { AuditItem } from "@/bll/audit";
import { verdict as verdictSchema } from "@/domain/watch/judge";
import { AUDIT_REASONS, type AuditReason } from "@/domain/watch/kill-criteria";
import { apiClient } from "@/lib/hono-client";
import { tbilisi } from "./format";

const api = apiClient.api.ops;

const reasonLabel: Record<AuditReason, string> = {
  "not-relevant": "Not relevant to this stop",
  "wrong-place": "Wrong place",
  "already-over": "Already over",
  alarmist: "Alarmist wording",
  other: "Other",
};

/**
 * One verdict, as the traveller would have been told it, and two buttons.
 * A wrong mark has to say why, because the reasons are what say which guard to
 * write next; a right one is a single tap, so the queue is quick to work through.
 */
export function AuditPanel({ item }: { item: AuditItem | null }) {
  const router = useRouter();
  const [wrong, setWrong] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!item) {
    return (
      <p className="text-sm text-zinc-500">
        Nothing to audit: no verdict that would have been sent is waiting.
      </p>
    );
  }
  const { subject } = item;
  const parsed = verdictSchema.safeParse(subject.verdict);

  async function mark(correct: boolean, reason?: AuditReason) {
    setBusy(true);
    setError(null);
    try {
      const res = await api.audits.$post({
        json: {
          matchId: subject.matchId,
          correct,
          reason,
          note: note.trim() || undefined,
        },
      });
      // Someone else got there first, or the trip is gone: either way the
      // queue has moved on, and the next load shows what is next.
      if (!res.ok && res.status !== 404 && res.status !== 409) {
        throw new Error(`${res.status}`);
      }
      setWrong(false);
      setNote("");
      router.refresh();
    } catch (err) {
      setError(`Could not record that (${(err as Error).message}).`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
      <p className="text-xs text-zinc-500">
        {item.remaining} waiting · {subject.kind} · routed to {subject.route} ·{" "}
        {subject.inCohort ? "cohort trip" : "not a cohort trip"}
      </p>

      <div>
        <p className="text-xs uppercase tracking-wide text-zinc-500">
          The stop
        </p>
        <p>
          {subject.stop.placeName ?? subject.stop.title ?? "A stop"} ·{" "}
          {tbilisi(subject.stop.startsAt)}{" "}
          <span className="text-zinc-500">({subject.tripTitle})</span>
        </p>
      </div>

      <div>
        <p className="text-xs uppercase tracking-wide text-zinc-500">
          What the traveller would have read
        </p>
        {parsed.success ? (
          <>
            <p className="text-lg">{parsed.data.oneLine}</p>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              {parsed.data.evidence}
            </p>
            <p className="mt-1 text-xs text-zinc-500">
              impact {parsed.data.impact} · horizon {parsed.data.horizonHrs} h ·
              the judge's confidence {parsed.data.confidence}
            </p>
          </>
        ) : (
          <pre className="overflow-x-auto text-xs">
            {JSON.stringify(subject.verdict, null, 2)}
          </pre>
        )}
      </div>

      <div>
        <p className="text-xs uppercase tracking-wide text-zinc-500">
          The event it rests on
        </p>
        <p className="text-sm">
          {subject.event.source} · {subject.event.severity} · confidence{" "}
          {subject.event.confidence} · {tbilisi(subject.event.validFrom)}
          {subject.event.validTo ? ` to ${tbilisi(subject.event.validTo)}` : ""}
        </p>
        <details className="text-xs text-zinc-500">
          <summary className="cursor-pointer">Event detail</summary>
          <pre className="overflow-x-auto">
            {JSON.stringify(subject.event.payload, null, 2)}
          </pre>
        </details>
      </div>

      {wrong ? (
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium">Why was it wrong to send?</p>
          <div className="flex flex-wrap gap-2">
            {AUDIT_REASONS.map((r) => (
              <button
                key={r}
                type="button"
                disabled={busy}
                onClick={() => mark(false, r)}
                className="rounded-full border border-zinc-300 px-3 py-1.5 text-sm disabled:opacity-50 dark:border-zinc-700"
              >
                {reasonLabel[r]}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="self-start text-sm text-zinc-500 underline"
            onClick={() => setWrong(false)}
          >
            Back
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => mark(true)}
            className="rounded-full bg-foreground px-4 py-2 font-medium text-background disabled:opacity-50"
          >
            Right to send
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => setWrong(true)}
            className="rounded-full border border-zinc-300 px-4 py-2 font-medium disabled:opacity-50 dark:border-zinc-700"
          >
            Wrong to send
          </button>
        </div>
      )}

      <label className="flex flex-col gap-1 text-sm">
        <span className="text-zinc-500">Note (optional)</span>
        <input
          value={note}
          maxLength={500}
          onChange={(e) => setNote(e.target.value)}
          className="rounded border border-zinc-300 bg-transparent px-2 py-1 dark:border-zinc-700"
        />
      </label>
      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
