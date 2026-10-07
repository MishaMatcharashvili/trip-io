"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { INTAKE_MAX_CHARS } from "@/domain/trip/generate/intake";
import { Card, SectionRule } from "@/ui/card";
import { Chip } from "@/ui/chip";
import { Icon } from "@/ui/icon";
import { composerExamples } from "./new-trip";

// The ask on the landing page: the first thing for a traveller with no trip,
// and below their trip for one with trips. It builds nothing and reads
// nothing: the sentence is carried to /new, where the planner answers it. One
// component for the page and for its loading state, so the prompt is where it
// will be before anything about the traveller's trips is known.

export function HomePlan({
  hasTrips,
  heading,
}: {
  hasTrips: boolean;
  /** Replaces the heading's words: the loading state does not know which it is. */
  heading?: React.ReactNode;
}) {
  const router = useRouter();
  const [text, setText] = useState("");

  const start = (said: string) => {
    const q = said.trim();
    router.push(q ? `/new?q=${encodeURIComponent(q)}` : "/new");
  };

  return (
    <section className="flex flex-col gap-3">
      <SectionRule>
        {heading ??
          (hasTrips ? "Plan another trip" : "Where do you want to go?")}
      </SectionRule>
      {/* The suggestions sit to the right of the box; a phone has no right, so they follow it. */}
      <Card className="flex w-full flex-col gap-3 rounded-[16px] p-3 shadow-lifted lg:flex-row lg:items-start lg:gap-5 lg:p-4">
        <form
          className="flex min-w-0 flex-1 items-center gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            start(text);
          }}
        >
          <Icon name="sparkle" size={17} className="shrink-0 text-agent" />
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={INTAKE_MAX_CHARS}
            placeholder={
              hasTrips
                ? "A weekend somewhere with mountains and good food"
                : "7 days in Georgia, €700, nature and monasteries"
            }
            aria-label="Describe your trip"
            className="h-[38px] min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-ink-faint lg:text-title"
          />
          <button
            type="submit"
            aria-label="Talk it through with the planner"
            className="flex size-[38px] shrink-0 items-center justify-center rounded-control bg-agent text-on-accent transition-colors hover:bg-agent-hover"
          >
            <Icon name="arrowRight" size={15} strokeWidth={1.8} />
          </button>
        </form>
        <div className="flex flex-wrap gap-2 lg:w-[300px] lg:shrink-0 lg:flex-col lg:flex-nowrap lg:items-start lg:border-l lg:border-hairline lg:pl-5">
          {composerExamples.map((example) => (
            <button key={example} type="button" onClick={() => start(example)}>
              <Chip className="h-auto min-h-7 cursor-pointer rounded-2xl py-1 text-left hover:border-control">
                {example}
              </Chip>
            </button>
          ))}
        </div>
      </Card>
    </section>
  );
}
