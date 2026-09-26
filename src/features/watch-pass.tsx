"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { WatchOffer } from "@/bll/watch-pass";
import { money } from "@/domain/billing/pricing";
import { apiClient } from "@/lib/hono-client";
import { Button } from "@/ui/button";
import { Card } from "@/ui/card";
import { Dot } from "@/ui/dot";
import { Eyebrow, Num, Prose, Title } from "@/ui/text";

/**
 * Whether this trip is watched, and the one action that makes it so: the free
 * first watch, or the price. Payment is a stand-in until Flitt is wired — the
 * card says so rather than pretend a card was charged.
 */
export function WatchPassCard({
  tripId,
  offer,
  className,
}: {
  tripId: string;
  offer: WatchOffer;
  className?: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const act = (kind: "free" | "paid") =>
    start(async () => {
      setError(null);
      const res =
        kind === "free"
          ? await apiClient.api.trips[":id"].pass.$post({
              param: { id: tripId },
            })
          : await apiClient.api.trips[":id"].pass.checkout.$post({
              param: { id: tripId },
            });
      if (!res.ok) setError("That didn’t go through. Try again in a moment.");
      router.refresh();
    });

  if (offer.kind === "watched") {
    return (
      <Card
        className={`flex items-center gap-3 px-3.5 py-3 ${className ?? ""}`}
      >
        <Dot tone="ok" />
        <span className="flex-1 text-small font-medium">
          This trip is watched
        </span>
        <Eyebrow tone="ok">
          {offer.pass === "free" ? "Your free trip" : "Paid"}
        </Eyebrow>
      </Card>
    );
  }

  return (
    <Card
      tint
      accent="agent"
      className={`flex flex-col gap-3 p-4 ${className ?? ""}`}
    >
      <div className="flex flex-col gap-1">
        <Eyebrow tone="agent">Not watched yet</Eyebrow>
        <Title className="text-[16px]">
          {offer.kind === "free"
            ? "Your first watched trip is free"
            : "Watch this trip"}
        </Title>
        <Prose>
          Planning is free. Watching means I check the weather and roads around
          every stop, brief you each morning, and interrupt you only when your
          plan should change.
        </Prose>
      </div>
      {offer.kind === "paid" ? (
        <div className="flex items-baseline gap-2">
          <Num className="text-[20px] font-semibold">
            {money(offer.cents, offer.currency)}
          </Num>
          <Num className="text-small text-ink-faint line-through">
            {money(offer.listCents, offer.currency)}
          </Num>
          <span className="text-mini text-ink-faint">for this trip</span>
        </div>
      ) : null}
      <Button
        variant="primary"
        disabled={pending}
        onClick={() => act(offer.kind === "free" ? "free" : "paid")}
      >
        {pending
          ? "Starting…"
          : offer.kind === "free"
            ? "Start watching — free"
            : `Watch for ${money(offer.cents, offer.currency)}`}
      </Button>
      {offer.kind === "paid" ? (
        <span className="text-mini text-ink-faint">
          Demo checkout: payments aren’t live yet, so nothing is charged.
        </span>
      ) : null}
      {error ? <span className="text-mini text-alert">{error}</span> : null}
    </Card>
  );
}
