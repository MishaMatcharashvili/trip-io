"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
// Types only: constraints.ts hashes with node:crypto, which has no place in
// the browser bundle.
import type { Constraints } from "@/domain/trip/generate/constraints";
import { understand } from "@/domain/trip/generate/request";
import { Button, ButtonLink } from "@/ui/button";
import { Card, Divider } from "@/ui/card";
import { Chip } from "@/ui/chip";
import { Icon } from "@/ui/icon";
import { ConstraintCards } from "./constraint-cards";

// The ask. The sentence is read as it is typed (src/domain/trip/generate/
// request.ts) and shown back as cards; any card can be corrected by hand, and
// a correction wins over whatever the sentence says from then on.

/** Constraints as a URL-safe token for /new/building. */
export function encodeConstraints(c: Constraints): string {
  return btoa(unescape(encodeURIComponent(JSON.stringify(c))))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export function TripComposer({
  today,
  examples,
  placeholder,
}: {
  /** YYYY-MM-DD in Tbilisi, from the server so both sides agree. */
  today: string;
  examples: string[];
  placeholder: string;
}) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [overrides, setOverrides] = useState<Partial<Constraints>>({});
  const box = useRef<HTMLTextAreaElement>(null);

  // "New trip" anywhere in the app is /#plan: arriving on it, or tapping it
  // here, puts the cursor in the box rather than leaving it to be found.
  useEffect(() => {
    const focusIfAsked = () => {
      if (window.location.hash === "#plan") box.current?.focus();
    };
    focusIfAsked();
    window.addEventListener("hashchange", focusIfAsked);
    return () => window.removeEventListener("hashchange", focusIfAsked);
  }, []);

  const read = useMemo(() => understand(text, today), [text, today]);
  const c: Constraints = { ...read.constraints, ...overrides };
  const said = (k: keyof Constraints) =>
    k in overrides || read.said.includes(k);
  const set = (patch: Partial<Constraints>) =>
    setOverrides((o) => ({ ...o, ...patch }));

  const submit = () => router.push(`/new/building?c=${encodeConstraints(c)}`);

  return (
    <div className="flex w-full flex-col gap-4">
      <Card className="flex w-full flex-col gap-3 rounded-[16px] p-4 shadow-lifted lg:gap-4 lg:p-5 lg:pb-4">
        <textarea
          ref={box}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={placeholder}
          aria-label="Describe your trip"
          rows={2}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          className="w-full resize-none bg-transparent text-[15px] leading-[1.5] outline-none placeholder:text-ink-faint lg:text-headline lg:tracking-[-0.01em]"
        />
        <div className="flex flex-wrap gap-2">
          {examples.map((example) => (
            <button
              key={example}
              type="button"
              onClick={() => setText(example)}
            >
              <Chip className="h-auto min-h-7 cursor-pointer rounded-2xl py-1 text-left hover:border-control">
                {example}
              </Chip>
            </button>
          ))}
        </div>
        <Divider />
        <div className="flex items-center gap-3">
          <span className="hidden text-mini text-ink-faint lg:inline">
            Enter to plan · Shift+Enter for a new line
          </span>
          <div className="flex-1" />
          <ButtonLink
            href="/saved"
            variant="ghost"
            className="hidden lg:inline-flex"
          >
            Start from a saved trip
          </ButtonLink>
          <Button variant="primary" className="px-5" onClick={submit}>
            Plan my trip
          </Button>
        </div>
      </Card>

      <div className="flex w-full flex-col gap-3">
        <div className="flex items-center gap-2">
          <Icon name="sparkle" size={15} className="text-agent" />
          <span className="text-small font-medium">
            Here is what I understood — correct anything before I build it
          </span>
        </div>
        <ConstraintCards
          constraints={c}
          said={said}
          onChange={set}
          today={today}
        />
      </div>
    </div>
  );
}
