"use client";

import { useState } from "react";
import { categoryGroups } from "@/core/catalogue/categories";
import type { PlaceInput } from "@/core/catalogue/review-input";
import { buildPlaceInput, type DraftErrors, type PlaceDraft } from "./draft";
import { humanise } from "./evidence";
import { HoursEditor } from "./hours-editor";

const rejectReasons = [
  "Closed permanently",
  "Not a real place",
  "Duplicate",
  "Not for travellers",
];

const inputClass = (error?: string) =>
  `rounded-md border bg-transparent px-2 py-1.5 ${
    error ? "border-red-500" : "border-zinc-300"
  }`;

/**
 * The curate form. With `onSkip`/`onReject` it reviews a queue candidate;
 * without, it adds a place Overture doesn't have.
 */
export function PlaceForm({
  initial,
  busy,
  submitLabel,
  onCurate,
  onSkip,
  onReject,
}: {
  initial: PlaceDraft;
  busy: boolean;
  submitLabel: string;
  onCurate: (input: PlaceInput) => void;
  onSkip?: (note?: string) => void;
  onReject?: (note?: string) => void;
}) {
  const [draft, setDraft] = useState(initial);
  const [errors, setErrors] = useState<DraftErrors>({});
  const set = (patch: Partial<PlaceDraft>) => setDraft({ ...draft, ...patch });

  function curate() {
    // The shortcut bypasses the disabled submit button.
    if (busy) return;
    const result = buildPlaceInput(draft);
    if (result.ok) {
      setErrors({});
      onCurate(result.value);
    } else {
      setErrors(result.errors);
    }
  }

  const note = () => draft.note.trim() || undefined;

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        curate();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
          e.preventDefault();
          curate();
        }
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          Name (as a traveller would search it)
          <input
            value={draft.name}
            onChange={(e) => set({ name: e.target.value })}
            className={inputClass(errors.name)}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Georgian name
          <input
            value={draft.nameKa}
            onChange={(e) => set({ nameKa: e.target.value })}
            lang="ka"
            className={inputClass()}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Category
          <select
            value={draft.category}
            onChange={(e) =>
              set({ category: e.target.value as PlaceDraft["category"] })
            }
            className={inputClass(errors.category)}
          >
            <option value="">—</option>
            {Object.entries(categoryGroups).map(([group, categories]) => (
              <optgroup key={group} label={humanise(group)}>
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {humanise(c)}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Position (lat, lon — paste from Google Maps)
          <input
            value={draft.position}
            onChange={(e) => set({ position: e.target.value })}
            placeholder="41.6938, 44.8015"
            className={`font-mono ${inputClass(errors.position)}`}
          />
          {errors.position && (
            <span className="text-xs text-red-600">{errors.position}</span>
          )}
        </label>
      </div>

      <HoursEditor
        value={draft.hours}
        errors={errors}
        onChange={(hours) => set({ hours })}
      />

      <label className="flex flex-col gap-1 text-sm">
        Note
        <input
          value={draft.note}
          onChange={(e) => set({ note: e.target.value })}
          placeholder="What you checked, anything odd"
          className={inputClass()}
        />
      </label>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="submit"
          disabled={busy}
          className="rounded-md bg-foreground px-4 py-2 font-medium text-background disabled:opacity-50"
        >
          {submitLabel} <span className="text-xs opacity-60">⌘↵</span>
        </button>
        {onSkip && (
          <button
            type="button"
            disabled={busy}
            onClick={() => onSkip(note())}
            className="rounded-md border border-zinc-300 px-4 py-2 disabled:opacity-50"
          >
            Skip for now
          </button>
        )}
        {onReject && (
          <details className="relative">
            <summary className="cursor-pointer list-none rounded-md border border-red-300 px-4 py-2 text-red-700">
              Reject…
            </summary>
            <div className="absolute z-10 mt-1 flex w-56 flex-col rounded-md border border-zinc-200 bg-background p-1 shadow-lg">
              {rejectReasons.map((reason) => (
                <button
                  key={reason}
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    onReject([reason, note()].filter(Boolean).join(" — "))
                  }
                  className="rounded px-2 py-1.5 text-left text-sm hover:bg-zinc-100:bg-zinc-900"
                >
                  {reason}
                </button>
              ))}
            </div>
          </details>
        )}
      </div>
    </form>
  );
}
