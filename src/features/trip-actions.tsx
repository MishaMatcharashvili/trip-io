"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { apiClient } from "@/lib/hono-client";
import { Button, QuietAction } from "@/ui/button";
import { Divider, Panel } from "@/ui/card";
import { cx } from "@/ui/cx";
import { Dot } from "@/ui/dot";
import { Icon } from "@/ui/icon";
import { Eyebrow, Headline, Prose } from "@/ui/text";

// The trip screens' small actions. Each is one request; the page is then read
// again from the server, because the truth is the patch log, not this
// component's memory of having been tapped.

/** Why a request failed, in words, from the API's error body. */
async function refusal(res: Response, fallback: string): Promise<string> {
  const body = (await res.json().catch(() => null)) as {
    error?: string;
    message?: string;
    violations?: { message: string }[];
  } | null;
  return (
    body?.violations?.[0]?.message ??
    body?.message ??
    (body?.error === "nothing to undo" ? "There is nothing to undo." : null) ??
    fallback
  );
}

/** Undo the latest change. An append, so the undo can itself be undone. */
export function UndoButton({
  tripId,
  label = "Undo",
  size = "sm",
}: {
  tripId: string;
  label?: string;
  size?: "sm" | "md";
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <span className="inline-flex flex-col items-end gap-1">
      <Button
        size={size}
        disabled={pending}
        onClick={() =>
          start(async () => {
            setError(null);
            const res = await apiClient.api.trips[":id"].undo.$post({
              param: { id: tripId },
            });
            if (!res.ok)
              setError(await refusal(res, "Undo didn’t go through."));
            router.refresh();
          })
        }
      >
        <Icon name="revert" size={14} />
        {pending ? "Undoing…" : label}
      </Button>
      {error ? <span className="text-mini text-alert">{error}</span> : null}
    </span>
  );
}

/** "Keep current plan": the alert is answered, and the plan stays. */
export function KeepPlanAction({ interventionId }: { interventionId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  return (
    <QuietAction
      disabled={pending}
      onClick={() =>
        start(async () => {
          await apiClient.api.interventions[":id"][":answer"].$post({
            param: { id: interventionId, answer: "dismiss" },
          });
          router.refresh();
        })
      }
    >
      {pending ? "Keeping…" : "Keep current plan"}
    </QuietAction>
  );
}

/** Whether the browser says it is online. True on the server. */
export function useOnline(): boolean {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  return online;
}

/** The watch layer, paused: what it can no longer see, and since when. */
function PausedPanel({
  since,
  sources,
  onDismiss,
  className,
}: {
  since: string;
  sources: { name: string; seen: string }[];
  onDismiss: () => void;
  className?: string;
}) {
  return (
    <Panel className={cx("overflow-hidden", className)}>
      <div className="flex flex-col gap-3 px-4 pb-3.5 pt-[18px]">
        <div className="flex items-center gap-2.5">
          <Icon name="offline" size={17} className="text-ink-faint" />
          <Eyebrow>Watch layer paused</Eyebrow>
        </div>
        <Headline className="text-[20px]">
          I stopped watching at {since}
        </Headline>
        <Prose>
          No connection. Your itinerary is all here, but I cannot see weather,
          roads or transport until you are back online — so treat everything
          below as last known, not current.
        </Prose>
        <div className="flex gap-2.5">
          <Button
            variant="primary"
            size="lg"
            className="flex-1"
            onClick={() => window.location.reload()}
          >
            Try again
          </Button>
          <Button size="lg" onClick={onDismiss}>
            Dismiss
          </Button>
        </div>
      </div>
      <Divider />
      <div className="flex flex-col px-4 pb-3.5 pt-3">
        {sources.map(({ name, seen }, i) => (
          <div
            key={name}
            className={cx(
              "flex items-center gap-2.5 py-2",
              i > 0 && "border-t border-track",
            )}
          >
            <Dot tone="idle" />
            <span className="flex-1 text-small text-ink-muted">{name}</span>
            <span className="text-mini text-ink-faint">{seen}</span>
          </div>
        ))}
      </div>
    </Panel>
  );
}

/**
 * The honest state. Offline, the page cannot see the watch at all, so it says
 * it stopped watching and shows the plan as last known; online, it renders
 * whatever the trip's own state is.
 */
export function ConnectionSwitch({
  children,
  sources,
  forceOffline = false,
  className,
}: {
  children: React.ReactNode;
  sources: { name: string; seen: string }[];
  /** The reference render's `?state=paused`, without going offline. */
  forceOffline?: boolean;
  className?: string;
}) {
  const isOnline = useOnline() && !forceOffline;
  const [since, setSince] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (isOnline) {
      setSince(null);
      setDismissed(false);
    } else {
      setSince(
        new Intl.DateTimeFormat("en-GB", {
          timeZone: "Asia/Tbilisi",
          hour: "2-digit",
          minute: "2-digit",
        }).format(new Date()),
      );
    }
  }, [isOnline]);

  if (isOnline || !since) return <>{children}</>;
  if (dismissed) return null;
  return (
    <PausedPanel
      since={since}
      sources={sources}
      onDismiss={() => setDismissed(true)}
      className={className}
    />
  );
}

/** One more day at the end of the trip: the header's end moves by 24 hours. */
export function AddDayButton({
  tripId,
  head,
  endsAt,
}: {
  tripId: string;
  head: string | null;
  endsAt: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <span className="inline-flex flex-col gap-1">
      <Button
        disabled={pending}
        onClick={() =>
          start(async () => {
            setError(null);
            const res = await apiClient.api.trips[":id"].patches.$post({
              param: { id: tripId },
              json: {
                parentId: head,
                intent: "Added a day at the end",
                ops: [
                  {
                    op: "replace",
                    path: "/trip/endsAt",
                    value: new Date(
                      Date.parse(endsAt) + 86_400_000,
                    ).toISOString(),
                  },
                ],
              },
            });
            if (!res.ok) setError(await refusal(res, "Couldn’t add a day."));
            router.refresh();
          })
        }
      >
        <Icon name="plus" size={14} />
        {pending ? "Adding…" : "Add a day"}
      </Button>
      {error ? <span className="text-mini text-alert">{error}</span> : null}
    </span>
  );
}

/** Go back to an earlier version. An append: the log is never rewritten. */
export function RestoreButton({
  tripId,
  patchId,
}: {
  tripId: string;
  patchId: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <span className="inline-flex flex-col items-end gap-1">
      <Button
        size="sm"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setError(null);
            const res = await apiClient.api.trips[":id"].restore.$post({
              param: { id: tripId },
              json: { patchId },
            });
            if (!res.ok) setError(await refusal(res, "Couldn’t restore that."));
            router.refresh();
          })
        }
      >
        {pending ? "Restoring…" : "Restore this version"}
      </Button>
      {error ? <span className="text-mini text-alert">{error}</span> : null}
    </span>
  );
}

/** Take one stop out of the plan, then go back to its day. */
export function RemoveStopButton({
  tripId,
  head,
  nodeId,
  title,
  back,
}: {
  tripId: string;
  head: string | null;
  nodeId: string;
  title: string;
  back: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <span className="inline-flex flex-col items-end gap-1">
      <Button
        variant="ghost"
        size="lg"
        className="px-3"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setError(null);
            const res = await apiClient.api.trips[":id"].patches.$post({
              param: { id: tripId },
              json: {
                parentId: head,
                intent: `Removed ${title}`,
                ops: [{ op: "remove", path: `/nodes/${nodeId}` }],
              },
            });
            if (res.ok) router.push(back);
            else setError(await refusal(res, "Couldn’t remove it."));
          })
        }
      >
        {pending ? "Removing…" : "Remove"}
      </Button>
      {error ? <span className="text-mini text-alert">{error}</span> : null}
    </span>
  );
}
