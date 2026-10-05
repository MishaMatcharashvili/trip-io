"use client";

import { useState } from "react";
import { money, WATCH_PRICE } from "@/domain/billing/pricing";
import { apiClient } from "@/lib/hono-client";
import { Button } from "@/ui/button";
import { Card } from "@/ui/card";
import { Eyebrow, Headline, Prose } from "@/ui/text";

type Phase = "asking" | "sending" | "thanks" | "failed";

/**
 * The one question after a trip: would you pay to have it watched. One tap
 * either way, a line of free text if they want to say why, and nothing else —
 * a survey that is a chore is answered only by the people it flatters.
 */
export function SurveyCard({
  tripId,
  title,
}: {
  tripId: string;
  title: string;
}) {
  const [phase, setPhase] = useState<Phase>("asking");
  const [note, setNote] = useState("");

  async function answer(wouldPay: boolean) {
    setPhase("sending");
    try {
      const res = await apiClient.api.trips[":id"].survey.$post({
        param: { id: tripId },
        json: { wouldPay, note: note.trim() || undefined },
      });
      // 409 is "already answered", from another device: the same as done.
      setPhase(res.ok || res.status === 409 ? "thanks" : "failed");
    } catch {
      setPhase("failed");
    }
  }

  if (phase === "thanks") {
    return (
      <Card className="p-5">
        <Prose>Thank you — that helps more than it looks like it should.</Prose>
      </Card>
    );
  }

  const price = money(WATCH_PRICE.cents, WATCH_PRICE.currency);
  return (
    <Card className="flex flex-col gap-3 p-5">
      <Eyebrow>{title}</Eyebrow>
      <Headline className="text-[18px]">
        Would you pay {price} to have a trip like that watched?
      </Headline>
      <label className="flex flex-col gap-1">
        <span className="text-small text-ink-muted">
          Anything to add (optional)
        </span>
        <input
          value={note}
          maxLength={500}
          onChange={(e) => setNote(e.target.value)}
          className="h-[38px] rounded-control border-control bg-surface px-3 text-[13px] text-ink"
        />
      </label>
      <div className="flex gap-2">
        <Button
          variant="primary"
          disabled={phase === "sending"}
          onClick={() => answer(true)}
        >
          Yes
        </Button>
        <Button disabled={phase === "sending"} onClick={() => answer(false)}>
          No
        </Button>
      </div>
      {phase === "failed" && (
        <p role="alert" className="text-small text-alert">
          That did not go through. Try again.
        </p>
      )}
    </Card>
  );
}
