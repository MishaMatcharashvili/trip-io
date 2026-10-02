import type { Review } from "../domain/catalogue/enrichment.ts";

// What the enrichment panel says, decided apart from how it looks.

/** A review is shown in part, with the rest a link away, as the provider asks. */
export const EXCERPT_CHARS = 320;

/** The text cut at a word, with an ellipsis, when it is longer than `max`. */
export function excerpt(text: string, max: number = EXCERPT_CHARS): string {
  const flat = text.replace(/\s+/g, " ").trim();
  if (flat.length <= max) return flat;
  const cut = flat.slice(0, max);
  const word = cut.lastIndexOf(" ");
  return `${cut.slice(0, word > max * 0.6 ? word : max).trimEnd()}…`;
}

const month = new Intl.DateTimeFormat("en-GB", {
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

/** "Apr 2030": every review carries its date. */
export function reviewDate(iso: string): string {
  const at = new Date(iso);
  return Number.isNaN(at.getTime()) ? "" : month.format(at);
}

const tripWords: Record<NonNullable<Review["tripType"]>, string> = {
  business: "Business",
  couples: "Couples",
  family: "Family",
  friends: "Friends",
  solo: "Solo",
};

/** "Apr 2030 · Solo · mari". */
export function reviewLine(review: Review): string {
  return [
    reviewDate(review.publishedAt),
    review.tripType ? tripWords[review.tripType] : null,
    review.author,
  ]
    .filter(Boolean)
    .join(" · ");
}

/** What to say when there is nothing to show, and whether trying again can help. */
export function failureNote(reason: string): {
  text: string;
  canRetry: boolean;
} {
  switch (reason) {
    case "rate-limited":
      return {
        text: "Reviews are busy right now. Try again in a minute.",
        canRetry: true,
      };
    case "timeout":
    case "upstream":
    case "malformed":
      return { text: "Reviews could not be loaded.", canRetry: true };
    default:
      return { text: "Reviews aren’t available right now.", canRetry: false };
  }
}
