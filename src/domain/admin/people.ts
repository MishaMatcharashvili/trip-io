// How the operator's panel describes the people and trips behind the numbers.

/** Better Auth's `account.provider_id`, as a person reads it. */
const PROVIDERS: Record<string, string> = {
  credential: "Email",
  google: "Google",
};

export function signInMethods(providerIds: readonly string[]): string {
  const names = [...new Set(providerIds.map((p) => PROVIDERS[p] ?? p))].sort();
  return names.join(", ");
}

export type UserKind = "guest" | "account";

/**
 * A guest is a visitor who planned a trip before signing up: Better Auth gives
 * them a placeholder address, so they are recognised by `is_anonymous`, never
 * by a missing email.
 */
export const userKind = (isAnonymous: boolean | null): UserKind =>
  isAnonymous ? "guest" : "account";

export type TripPhase = "upcoming" | "live" | "past";

export function tripPhase(
  startsAt: string,
  endsAt: string,
  now: Date,
): TripPhase {
  if (Date.parse(startsAt) > +now) return "upcoming";
  if (Date.parse(endsAt) < +now) return "past";
  return "live";
}

/** Whole days a trip spans, counting both ends: a trip that starts and ends on one date is one day. */
export function tripDays(startsAt: string, endsAt: string): number {
  const day = 86_400_000;
  const start = Math.floor(Date.parse(startsAt) / day);
  const end = Math.floor(Date.parse(endsAt) / day);
  return Math.max(1, end - start + 1);
}

/** Cents as a decimal amount, for a column that sorts and sums as a number. */
export const centsToAmount = (cents: number): number => cents / 100;
